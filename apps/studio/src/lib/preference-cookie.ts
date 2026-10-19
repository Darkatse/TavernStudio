/**
 * Preferences Studio must know before its first render live in cookies: the
 * color scheme before the first frame, the language before any text.
 * IndexedDB answers too late for either, and Studio never uses localStorage,
 * which the vendor page shares and may clear (docs/Architecture.md §7). A
 * lost cookie only means following the system again.
 */

const ATTRIBUTES = '; Path=/; SameSite=Strict';
/** A year; each choice renews it. */
const MAX_AGE = 31536000;

/** The value of a preference cookie when it is one of `allowed`. */
export function readPreference<T extends string>(
  name: string,
  allowed: readonly T[],
): T | undefined {
  const value = new RegExp(`(?:^|; )${name}=([^;]*)`).exec(document.cookie)?.[1];
  return allowed.find((each) => each === value);
}

/** Keeps a preference, or forgets it with undefined. */
export function writePreference(name: string, value: string | undefined): void {
  document.cookie =
    value === undefined
      ? `${name}=${ATTRIBUTES}; Max-Age=0`
      : `${name}=${value}${ATTRIBUTES}; Max-Age=${MAX_AGE}`;
}
