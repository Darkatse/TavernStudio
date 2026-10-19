import { useSyncExternalStore } from 'react';
import { readPreference, writePreference } from '../lib/preference-cookie';

export type Locale = 'zh' | 'en';
export const LOCALES = ['zh', 'en'] as const satisfies readonly Locale[];

export type LocaleChoice = Locale | 'system';

/** Each language by its own name, as a language picker shows it whatever the interface speaks. */
export const LANGUAGE_NAMES: Record<Locale, string> = { zh: '中文', en: 'English' };

/** The language tag <html lang> takes, which also picks CJK glyphs for Chinese. */
const LANGUAGE_TAGS: Record<Locale, string> = { zh: 'zh-CN', en: 'en' };

const COOKIE = 'studio-locale';
const listeners = new Set<() => void>();

let choice: LocaleChoice = readPreference(COOKIE, LOCALES) ?? 'system';
let current: Locale = resolve(choice);
// Nothing shows text before React renders, so <html lang> set here is in time for it.
document.documentElement.lang = LANGUAGE_TAGS[current];

export function locale(): Locale {
  return current;
}

export function localeChoice(): LocaleChoice {
  return choice;
}

export function setLocaleChoice(next: LocaleChoice): void {
  choice = next;
  writePreference(COOKIE, next === 'system' ? undefined : next);
  apply(resolve(next));
}

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useLocale(): Locale {
  return useSyncExternalStore(subscribeLocale, locale);
}

export function useLocaleChoice(): LocaleChoice {
  return useSyncExternalStore(subscribeLocale, localeChoice);
}

export function languageTag(of: Locale = current): string {
  return LANGUAGE_TAGS[of];
}

addEventListener('languagechange', () => {
  if (choice === 'system') apply(resolve('system'));
});

/** Listeners hear of the choice even when the language stays. */
function apply(next: Locale): void {
  current = next;
  document.documentElement.lang = LANGUAGE_TAGS[next];
  for (const listener of listeners) listener();
}

function resolve(of: LocaleChoice): Locale {
  if (of !== 'system') return of;
  for (const tag of navigator.languages) {
    const language = tag.toLowerCase().split('-')[0];
    if (language === 'zh' || language === 'en') return language;
  }
  return 'en';
}
