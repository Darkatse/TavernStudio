/** Follows TauriTavern's workspace session (`agent_tools/session.rs`). */
export interface FileReadState {
  /** SHA-256 (hex) of the content the Run last read or wrote. */
  sha256: string;
  fullRead: boolean;
  /** Texts the Run has seen of a partially read file; edits must quote them. */
  observedTexts: string[];
  /** Set after a failed edit of a partially read file: read it all before editing again. */
  patchRequiresFullRead: boolean;
}

/** Keyed by workspace path. Each Run starts with a new, empty one. */
export type ReadState = Map<string, FileReadState>;

export function rememberFile(reads: ReadState, path: string, sha256: string): void {
  reads.set(path, { sha256, fullRead: true, observedTexts: [], patchRequiresFullRead: false });
}

/**
 * A partial read adds to what the Run has seen of the same content, and
 * starts over when the content changed; it never clears a pending full-read
 * requirement.
 */
export function rememberFileRead(
  reads: ReadState,
  path: string,
  sha256: string,
  fullRead: boolean,
  text: string,
): void {
  if (fullRead) {
    rememberFile(reads, path, sha256);
    return;
  }
  const previous = reads.get(path);
  const state: FileReadState =
    previous?.sha256 === sha256
      ? previous
      : {
          sha256,
          fullRead: false,
          observedTexts: [],
          patchRequiresFullRead: previous?.patchRequiresFullRead ?? false,
        };
  reads.set(path, {
    ...state,
    observedTexts:
      state.fullRead || text === '' ? state.observedTexts : [...state.observedTexts, text],
  });
}

export function rememberPartialPatch(
  reads: ReadState,
  path: string,
  sha256: string,
  oldString: string,
  newString: string,
): void {
  reads.set(path, {
    sha256,
    fullRead: false,
    observedTexts: (reads.get(path)?.observedTexts ?? []).map((text) =>
      text.replace(oldString, () => newString),
    ),
    patchRequiresFullRead: false,
  });
}

export function requireFullReadBeforePatch(reads: ReadState, path: string): void {
  const state = reads.get(path);
  if (state) reads.set(path, { ...state, patchRequiresFullRead: true });
}

export function oldStringWasObserved(state: FileReadState, oldString: string): boolean {
  return state.fullRead || state.observedTexts.some((text) => text.includes(oldString));
}
