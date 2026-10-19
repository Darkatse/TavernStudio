import {
  Compartment,
  EditorState,
  Transaction,
  type Extension,
  type StateEffect,
  type Text,
  type TransactionSpec,
} from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { sha256, StaleFileError, type ProjectStore } from '@tavern-studio/workspace';
import { QUIET_WAIT_MS } from '../ui/loading';
import { languageOf, phrasesNow } from './extensions';

/** Typing pauses this long before the buffer is saved. */
const SAVE_DELAY_MS = 300;

const encoder = new TextEncoder();
const utf8 = new TextDecoder('utf-8', { fatal: true });
const lenient = new TextDecoder();

/** What the file holds now, when it no longer matches what the buffer was based on. */
export type Conflict = { kind: 'changed'; content: string; sha: string } | { kind: 'removed' };

/** What an open file needs from the editors that hold it. */
export interface OpenFileHost {
  /** The view, when it is showing this file. */
  viewOf(file: OpenFile): EditorView | undefined;
  /** Something a tab shows has changed. */
  changed(): void;
  /** The file went away and its buffer had nothing unsaved: the tab closes. */
  gone(file: OpenFile): void;
}

/** The parts of a buffer's setup that depend on its path. */
const fileSlot = new Compartment();

async function fileExtensions(path: string): Promise<Extension> {
  return [await languageOf(path), EditorView.contentAttributes.of({ 'aria-label': path })];
}

/**
 * A file open in a tab: its buffer, a CodeMirror `EditorState`, and how that
 * buffer stands against the file in the project store.
 *
 * The buffer saves itself a moment after typing stops, with compare-and-swap
 * against the content it was based on. When the file changes elsewhere, for
 * example by the Agent, a buffer without unsaved edits takes the new content
 * in; one with unsaved edits, or whose save was refused, holds a conflict
 * until the author chooses. Nothing is overwritten silently.
 */
export class OpenFile {
  path: string;
  /** Undefined for a file that is not UTF-8 text, which is shown but not edited. */
  state: EditorState | undefined;
  /** The buffer has edits the file does not have yet. */
  dirty = false;
  /** A save has run longer than a quiet wait, so it shows. */
  slow = false;
  conflict: Conflict | undefined;
  /** Why the last save or check failed, in the store's words. */
  error: string | undefined;
  /** Where the view was scrolled when it last showed this file. */
  scroll: StateEffect<unknown> | undefined;

  /** The file's content as the buffer last knew it: loaded, saved or taken in. */
  #saved: Text;
  /** Its SHA-256: the content the next write expects to replace. */
  #sha: string;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #saving: Promise<void> | undefined;
  #writing = false;
  readonly #store: ProjectStore;
  readonly #host: OpenFileHost;

  private constructor(
    store: ProjectStore,
    host: OpenFileHost,
    path: string,
    state: EditorState | undefined,
    sha: string,
  ) {
    this.#store = store;
    this.#host = host;
    this.path = path;
    this.state = state;
    this.#saved = state?.doc ?? EditorState.create().doc;
    this.#sha = sha;
  }

  /** Reads a file into a buffer; `extensions` is the setup every buffer shares. */
  static async read(
    store: ProjectStore,
    host: OpenFileHost,
    path: string,
    extensions: Extension,
  ): Promise<OpenFile> {
    const [bytes, perPath] = await Promise.all([store.read(path), fileExtensions(path)]);
    let text: string | undefined;
    try {
      text = utf8.decode(bytes);
    } catch {
      text = undefined;
    }
    const state =
      text === undefined
        ? undefined
        : EditorState.create({
            doc: text,
            extensions: [
              extensions,
              fileSlot.of(perPath),
              text.includes('\r\n') ? EditorState.lineSeparator.of('\r\n') : [],
            ],
          });
    return new OpenFile(store, host, path, state, await sha256(bytes));
  }

  /** The view applied a transaction to this buffer. */
  updated(state: EditorState, docChanged: boolean): void {
    this.state = state;
    if (docChanged) this.#edited();
  }

  /**
   * Saves when there are edits, after any save already running. `expected`
   * is the content the write may replace, null for none; `force` writes even
   * a buffer that matches what it was based on.
   */
  save(expected: string | null = this.#sha, force = false): Promise<void> {
    clearTimeout(this.#timer);
    this.#timer = undefined;
    if (this.#saving) return this.#saving.then(() => this.save(expected, force));
    if (!this.state || this.conflict || !(this.dirty || force)) return Promise.resolve();
    this.#saving = this.#write(this.state, expected).finally(() => {
      this.#saving = undefined;
      this.#host.changed();
    });
    return this.#saving;
  }

  retry(): Promise<void> {
    this.error = undefined;
    this.#host.changed();
    return this.save();
  }

  /** Settles a conflict with the version from elsewhere. Undo brings the author's edits back. */
  takeTheirs(): void {
    const conflict = this.conflict;
    if (!this.state || !conflict) return;
    this.conflict = undefined;
    if (conflict.kind === 'removed') {
      this.#host.gone(this);
      return;
    }
    const next = this.state.toText(conflict.content);
    this.#saved = next;
    this.#sha = conflict.sha;
    this.#apply({ changes: smallestChange(this.state.doc, next) });
    this.#host.changed();
  }

  /** Settles a conflict with the buffer: it replaces the version from elsewhere. */
  keepMine(): Promise<void> {
    const conflict = this.conflict;
    if (!conflict) return Promise.resolve();
    this.conflict = undefined;
    this.#host.changed();
    return this.save(conflict.kind === 'changed' ? conflict.sha : null, true);
  }

  /** The file moved, and the buffer with it; its language follows the new name. */
  async moveTo(path: string): Promise<void> {
    this.path = path;
    const perPath = await fileExtensions(path);
    if (this.path === path) this.#apply({ effects: fileSlot.reconfigure(perPath) });
  }

  /**
   * Takes CodeMirror's own words in the language Studio speaks now. Only the
   * buffer changes; the editors put it into the view.
   */
  rephrase(): void {
    if (this.state) this.state = this.state.update({ effects: phrasesNow() }).state;
  }

  /** Closes without saving. */
  discard(): void {
    clearTimeout(this.#timer);
  }

  /**
   * The store announced a change to the file. The store runs one operation
   * at a time and announces each as it ends, so a change announced while the
   * buffer writes is that write; a change from elsewhere before it makes the
   * write's compare-and-swap fail instead.
   */
  async changedInStore(): Promise<void> {
    if (this.#writing || !this.state) return;
    let disk: Disk | undefined;
    try {
      disk = await this.#readDisk();
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
      this.#host.changed();
      return;
    }
    // A save started meanwhile compares and swaps, so a change shows up as its refusal.
    if (this.#saving || disk?.sha === this.#sha) return;
    if (this.dirty || this.conflict) this.#hold(disk);
    else if (disk) this.#take(disk);
    else this.#host.gone(this);
  }

  #edited(): void {
    clearTimeout(this.#timer);
    const dirty = this.state ? !this.state.doc.eq(this.#saved) : false;
    if (dirty && !this.conflict) {
      this.#timer = setTimeout(() => void this.save(), SAVE_DELAY_MS);
    }
    if (dirty === this.dirty) return;
    this.dirty = dirty;
    this.#host.changed();
  }

  async #write(state: EditorState, expected: string | null): Promise<void> {
    const bytes = encoder.encode(state.sliceDoc());
    const sha = await sha256(bytes);
    const slow = setTimeout(() => {
      this.slow = true;
      this.#host.changed();
    }, QUIET_WAIT_MS);
    try {
      this.#writing = true;
      await this.#store.write(this.path, bytes, expected).finally(() => {
        this.#writing = false;
      });
      this.#saved = state.doc;
      this.#sha = sha;
      this.error = undefined;
    } catch (error) {
      if (error instanceof StaleFileError) await this.#refused();
      else this.error = error instanceof Error ? error.message : String(error);
    } finally {
      clearTimeout(slow);
      this.slow = false;
      this.#edited();
    }
  }

  /** The store refused a save: the file is no longer what the buffer was based on. */
  async #refused(): Promise<void> {
    try {
      this.#hold(await this.#readDisk());
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
    }
  }

  /** Holds the file's content against the buffer as a conflict, unless they agree. */
  #hold(disk: Disk | undefined): void {
    clearTimeout(this.#timer);
    if (disk && this.state && disk.text === this.state.sliceDoc()) {
      this.#saved = this.state.doc;
      this.#sha = disk.sha;
      this.conflict = undefined;
    } else {
      this.conflict = disk
        ? { kind: 'changed', content: disk.text, sha: disk.sha }
        : { kind: 'removed' };
    }
    this.#edited();
    this.#host.changed();
  }

  /** Takes new content into a buffer without unsaved edits, keeping the cursor where it can. */
  #take(disk: Disk): void {
    if (!this.state) return;
    const next = this.state.toText(disk.text);
    this.#saved = next;
    this.#sha = disk.sha;
    this.error = undefined;
    this.#apply({
      changes: smallestChange(this.state.doc, next),
      annotations: Transaction.addToHistory.of(false),
    });
  }

  async #readDisk(): Promise<Disk | undefined> {
    let bytes: Uint8Array;
    try {
      bytes = await this.#store.read(this.path);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotFoundError') return undefined;
      throw error;
    }
    return { text: lenient.decode(bytes), sha: await sha256(bytes) };
  }

  /** Applies a change, through the view when the view shows this buffer. */
  #apply(spec: TransactionSpec): void {
    if (!this.state) return;
    const view = this.#host.viewOf(this);
    if (view) {
      view.dispatch(spec);
      return;
    }
    this.state = this.state.update(spec).state;
    this.#edited();
  }
}

interface Disk {
  text: string;
  sha: string;
}

/** The one change that turns `from` into `to`: everything between their common start and end. */
function smallestChange(from: Text, to: Text) {
  const a = from.toString();
  const b = to.toString();
  const limit = Math.min(a.length, b.length);
  let start = 0;
  while (start < limit && a.charCodeAt(start) === b.charCodeAt(start)) start += 1;
  let end = 0;
  while (
    end < limit - start &&
    a.charCodeAt(a.length - 1 - end) === b.charCodeAt(b.length - 1 - end)
  ) {
    end += 1;
  }
  return { from: start, to: a.length - end, insert: to.slice(start, b.length - end) };
}
