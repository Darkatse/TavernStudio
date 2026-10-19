import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { sha256, type ProjectStore } from '@tavern-studio/workspace';
import { useSyncExternalStore } from 'react';
import { locale, subscribeLocale } from '../i18n/locale';
import { foldersWithin, isWithin } from '../project/paths';
import { editing } from './extensions';
import { OpenFile, type Conflict, type OpenFileHost } from './open-file';

export type { Conflict } from './open-file';

/** Nothing was created or moved: `path` is taken. */
export class PathTakenError extends Error {
  override name = 'PathTakenError';
  readonly path: string;

  constructor(path: string) {
    super(`${path} already exists`);
    this.path = path;
  }
}

/** Nothing was moved: the open file at `path` has edits that could not be saved. */
export class UnsavedEditsError extends Error {
  override name = 'UnsavedEditsError';
  readonly path: string;

  constructor(path: string) {
    super(`${path} has edits that are not saved yet, so nothing was moved`);
    this.path = path;
  }
}

/** What a tab shows of an open file. */
export interface Tab {
  path: string;
  /** The buffer has edits the file does not have yet. */
  dirty: boolean;
  /** A save has run long enough to show. */
  saving: boolean;
  /** The file changed elsewhere while the buffer had unsaved edits; saving waits for a choice. */
  conflict: Conflict | undefined;
  /** Why the last save failed, in the store's words. */
  error: string | undefined;
  /** False for a file that is not UTF-8 text, which has no buffer. */
  text: boolean;
}

export interface EditorsSnapshot {
  tabs: readonly Tab[];
  active: string | undefined;
}

/**
 * A project's open files and the one editor view that shows them. Each
 * buffer is a CodeMirror `EditorState` kept here, outside React, so switching
 * tabs swaps states without rebuilding them (docs/Architecture.md §8).
 *
 * The code view's file operations (create, rename, remove) go through here
 * too: they have to save, move or close the buffers they touch.
 */
export class Editors implements OpenFileHost {
  readonly #store: ProjectStore;
  /** In tab order. */
  #files: OpenFile[] = [];
  #active: OpenFile | undefined;
  #view: EditorView | undefined;
  readonly #opening = new Map<string, Promise<void>>();
  #snapshot: EditorsSnapshot = { tabs: [], active: undefined };
  readonly #listeners = new Set<() => void>();
  readonly #extensions: Extension;
  /** The language the buffers speak CodeMirror's own words in. */
  #locale = locale();
  readonly #stop: () => void;
  readonly #stopLocale: () => void;

  constructor(store: ProjectStore) {
    this.#store = store;
    this.#extensions = [
      editing,
      EditorView.updateListener.of((update) => {
        if (this.#active && update.startState === this.#active.state) {
          this.#active.updated(update.state, update.docChanged);
        }
      }),
      keymap.of([
        {
          key: 'Mod-s',
          run: () => {
            void this.#active?.save();
            return true;
          },
        },
      ]),
    ];
    this.#stop = store.subscribe((paths) => {
      for (const path of paths) void this.#file(path)?.changedInStore();
    });
    this.#stopLocale = subscribeLocale(this.#relocalize);
    addEventListener('beforeunload', this.#guard);
  }

  get snapshot(): EditorsSnapshot {
    return this.#snapshot;
  }

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  /** Opens a file in a tab beside the active one, or shows its tab if it is open. */
  async open(path: string): Promise<void> {
    if (!this.#file(path)) {
      let opening = this.#opening.get(path);
      if (!opening) {
        opening = OpenFile.read(this.#store, this, path, this.#extensions)
          .then((file) => {
            const at = this.#active ? this.#files.indexOf(this.#active) + 1 : this.#files.length;
            this.#files = this.#files.toSpliced(at, 0, file);
          })
          .finally(() => this.#opening.delete(path));
        this.#opening.set(path, opening);
      }
      await opening;
    }
    this.activate(path);
  }

  activate(path: string): void {
    const file = this.#file(path);
    if (!file || file === this.#active) return;
    this.#keepScroll();
    this.#active = file;
    this.#show();
    this.changed();
  }

  /** Saves the file first; one that could not be saved stays open and shown. */
  async close(path: string): Promise<boolean> {
    const file = this.#file(path);
    if (!file) return true;
    await file.save();
    if (file.dirty || file.conflict) {
      this.activate(path);
      return false;
    }
    this.gone(file);
    return true;
  }

  /** Saves now instead of after the typing pause. */
  save(path: string): Promise<void> {
    return this.#file(path)?.save() ?? Promise.resolve();
  }

  retry(path: string): Promise<void> {
    return this.#file(path)?.retry() ?? Promise.resolve();
  }

  takeTheirs(path: string): void {
    this.#file(path)?.takeTheirs();
  }

  keepMine(path: string): Promise<void> {
    return this.#file(path)?.keepMine() ?? Promise.resolve();
  }

  /** Shows the active buffer in `host`; returns the function that takes it out again. */
  attach(host: HTMLElement): () => void {
    this.#view ??= new EditorView({ state: EditorState.create({ extensions: this.#extensions }) });
    host.append(this.#view.dom);
    this.#show();
    this.#view.requestMeasure();
    return () => this.#view?.dom.remove();
  }

  focus(): void {
    this.#view?.focus();
  }

  /** Creates an empty file and opens it. */
  async create(path: string): Promise<void> {
    if (await this.#store.kind(path)) throw new PathTakenError(path);
    await this.#store.write(path, new Uint8Array(), null);
    await this.open(path);
  }

  /** Renames a file or a folder. Open buffers are saved first and move along. */
  async rename(from: string, to: string): Promise<void> {
    if (await this.#store.kind(to)) throw new PathTakenError(to);
    const sources = (await this.#store.files('')).filter((path) => isWithin(path, from));
    for (const source of sources) {
      const file = this.#file(source);
      if (!file) continue;
      await file.save();
      if (file.dirty || file.conflict) throw new UnsavedEditsError(source);
    }
    for (const source of sources) {
      const target = `${to}${source.slice(from.length)}`;
      const content = await this.#store.read(source);
      await this.#store.write(target, content, null);
      // The buffer moves before the old file goes, so the removal is no news to it.
      const moving = this.#file(source)?.moveTo(target);
      this.changed();
      await moving;
      // Only the content that was copied goes; a change meanwhile stops the move.
      await this.#store.remove(source, await sha256(content));
    }
    for (const folder of foldersWithin(sources, [from])) await this.#store.remove(folder);
  }

  /** Removes files and folders. Their tabs close, unsaved edits included. */
  async remove(paths: readonly string[]): Promise<void> {
    const files = (await this.#store.files('')).filter((file) =>
      paths.some((path) => isWithin(file, path)),
    );
    for (const path of files) {
      const file = this.#file(path);
      if (file) this.gone(file);
    }
    for (const path of files) await this.#store.remove(path);
    for (const folder of foldersWithin(files, paths)) await this.#store.remove(folder);
  }

  /** Stops following the project; unsaved edits get one last save. */
  dispose(): void {
    this.#stop();
    this.#stopLocale();
    removeEventListener('beforeunload', this.#guard);
    for (const file of this.#files) void file.save();
    this.#view?.destroy();
    this.#view = undefined;
  }

  viewOf(file: OpenFile): EditorView | undefined {
    return this.#view && this.#view.state === file.state ? this.#view : undefined;
  }

  /** Closes a tab without saving; the tab beside it becomes active. */
  gone(file: OpenFile): void {
    file.discard();
    const index = this.#files.indexOf(file);
    this.#files = this.#files.filter((open) => open !== file);
    if (this.#active === file) {
      this.#active = this.#files[Math.min(index, this.#files.length - 1)];
      this.#show();
    }
    this.changed();
  }

  changed(): void {
    this.#snapshot = {
      active: this.#active?.path,
      tabs: this.#files.map((file) => ({
        path: file.path,
        dirty: file.dirty,
        saving: file.slow,
        conflict: file.conflict,
        error: file.error,
        text: file.state !== undefined,
      })),
    };
    for (const listener of this.#listeners) listener();
  }

  #file(path: string): OpenFile | undefined {
    return this.#files.find((file) => file.path === path);
  }

  /** Puts the active buffer, and where it was scrolled, into the view. */
  #show(): void {
    const file = this.#active;
    const view = this.#view;
    if (!view || !file?.state || view.state === file.state) return;
    view.setState(file.state);
    if (file.scroll) view.dispatch({ effects: file.scroll });
  }

  /** Remembers where the view is scrolled in the active buffer, before it shows another state. */
  #keepScroll(): void {
    const view = this.#active && this.viewOf(this.#active);
    if (this.#active && view) this.#active.scroll = view.scrollSnapshot();
  }

  /**
   * Studio speaks another language: every buffer takes CodeMirror's words in
   * it, and the view shows the active one again, as a tab switch does. A
   * dispatch would not do: CodeMirror redraws a view whose phrases change
   * without telling update listeners, so the buffer would miss the new state.
   *
   * Showing the state again remounts an open search panel, which selects its
   * field; focus goes back to where the language was chosen.
   */
  #relocalize = () => {
    if (locale() === this.#locale) return;
    this.#locale = locale();
    const focused = document.activeElement;
    this.#keepScroll();
    for (const file of this.#files) file.rephrase();
    this.#show();
    if (
      focused instanceof HTMLElement &&
      focused.isConnected &&
      focused !== document.activeElement
    ) {
      focused.focus({ preventScroll: true });
    }
  };

  /** Leaving the page with unsaved edits asks first. */
  #guard = (event: BeforeUnloadEvent) => {
    if (this.#files.some((file) => file.dirty)) event.preventDefault();
  };
}

let current: { store: ProjectStore; editors: Editors } | undefined;

/** The editors of the open project. Another project's store replaces them. */
export function editorsOf(store: ProjectStore): Editors {
  if (current?.store !== store) {
    current?.editors.dispose();
    current = { store, editors: new Editors(store) };
  }
  return current.editors;
}

export function useEditors(editors: Editors): EditorsSnapshot {
  return useSyncExternalStore(editors.subscribe, () => editors.snapshot);
}
