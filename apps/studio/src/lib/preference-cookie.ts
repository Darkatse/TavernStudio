/**
 * Preferences Studio must know before its first render live in cookies.
 * IndexedDB answers too late, and Studio never uses localStorage, which the
 * vendor page shares and may clear. A lost cookie only means following the
 * system again.
 */

const ATTRIBUTES = '; Path=/; SameSite=Strict';
/** A year; each choice renews it. */
const MAX_AGE = 31536000;

export function readPreference<T extends string>(
  name: string,
  allowed: readonly T[],
): T | undefined {
  const value = new RegExp(`(?:^|; )${name}=([^;]*)`).exec(document.cookie)?.[1];
  return allowed.find((each) => each === value);
}

export function writePreference(name: string, value: string | undefined): void {
  document.cookie =
    value === undefined
      ? `${name}=${ATTRIBUTES}; Max-Age=0`
      : `${name}=${value}${ATTRIBUTES}; Max-Age=${MAX_AGE}`;
}
