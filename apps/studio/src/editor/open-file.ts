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

const SAVE_DELAY_MS = 300;

const encoder = new TextEncoder();
const utf8 = new TextDecoder('utf-8', { fatal: true });
const lenient = new TextDecoder();

export type Conflict = { kind: 'changed'; content: string; sha: string } | { kind: 'removed' };

export interface OpenFileHost {
  viewOf(file: OpenFile): EditorView | undefined;
  changed(): void;
  gone(file: OpenFile): void;
}

const fileSlot = new Compartment();

async function fileExtensions(path: string): Promise<Extension> {
  return [await languageOf(path), EditorView.contentAttributes.of({ 'aria-label': path })];
}

/**
 * Saves compare and swap against the content the buffer was based on. When
 * the file changes elsewhere, a buffer without unsaved edits takes the new
 * content in; one with unsaved edits, or whose save was refused, holds a
 * conflict until the author chooses. Nothing is overwritten silently.
 */
export class OpenFile {
  path: string;
  /** Undefined for a file that is not UTF-8 text, which is shown but not edited. */
  state: EditorState | undefined;
  dirty = false;
  slow = false;
  conflict: Conflict | undefined;
  error: string | undefined;
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

  updated(state: EditorState, docChanged: boolean): void {
    this.state = state;
    if (docChanged) this.#edited();
  }

  /**
   * `expected` is the SHA-256 of the content the write may replace, null for
   * none; `force` writes even a buffer that matches what it was based on.
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

  /** Undo brings the author's edits back. */
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

  keepMine(): Promise<void> {
    const conflict = this.conflict;
    if (!conflict) return Promise.resolve();
    this.conflict = undefined;
    this.#host.changed();
    return this.save(conflict.kind === 'changed' ? conflict.sha : null, true);
  }

  async moveTo(path: string): Promise<void> {
    this.path = path;
    const perPath = await fileExtensions(path);
    if (this.path === path) this.#apply({ effects: fileSlot.reconfigure(perPath) });
  }

  /** Only the buffer changes; the editors put it into the view. */
  rephrase(): void {
    if (this.state) this.state = this.state.update({ effects: phrasesNow() }).state;
  }

  discard(): void {
    clearTimeout(this.#timer);
  }

  /**
   * The store runs one operation at a time and announces each as it ends, so
   * a change announced while the buffer writes is that write; a change from
   * elsewhere before it makes the write's compare-and-swap fail instead.
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

  async #refused(): Promise<void> {
    try {
      this.#hold(await this.#readDisk());
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
    }
  }

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

/** Only what differs changes, so the cursor stays where it can. */
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
