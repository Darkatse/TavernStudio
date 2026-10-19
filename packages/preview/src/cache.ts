/** Cache Storage holding the open Session's data subresources (docs/Architecture.md §7). */
export const SESSION_CACHE = 'studio-session';

/** A synthetic entry in the same cache telling the Preview SW which vendor image is open. */
export const SESSION_STATE_URL = '/_studio/session-state';

export interface SessionState {
  vendor: string;
}
