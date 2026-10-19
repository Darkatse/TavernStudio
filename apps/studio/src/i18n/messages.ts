import { locale, useLocale, type Locale } from './locale';

/**
 * The text of one part of the interface in every language Studio speaks
 * (docs/UI.md §6). Each feature keeps its own beside its code, so its text
 * loads with it; both languages sit side by side, and English must have
 * exactly the keys of Chinese, a function where Chinese has one, taking the
 * same arguments.
 */
export type Messages<T> = { readonly [L in Locale]: T };

export function defineMessages<T>(messages: { zh: T; en: NoInfer<T> }): Messages<T> {
  return messages;
}

/** A feature's text in the language Studio speaks, re-rendering when it changes. */
export function useMessages<T>(messages: Messages<T>): T {
  return messages[useLocale()];
}

/**
 * A feature's text in the language Studio speaks now, for code outside
 * rendering, such as a toast raised when an export ends.
 */
export function messagesNow<T>(messages: Messages<T>): T {
  return messages[locale()];
}
