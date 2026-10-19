import { locale, useLocale, type Locale } from './locale';

/**
 * English must have exactly the keys of Chinese, a function where Chinese has
 * one, taking the same arguments.
 */
export type Messages<T> = { readonly [L in Locale]: T };

export function defineMessages<T>(messages: { zh: T; en: NoInfer<T> }): Messages<T> {
  return messages;
}

export function useMessages<T>(messages: Messages<T>): T {
  return messages[useLocale()];
}

export function messagesNow<T>(messages: Messages<T>): T {
  return messages[locale()];
}
