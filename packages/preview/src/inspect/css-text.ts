/** Reading CSS values: the URLs, font families and inline data they hold. */

/** Families that are not a font of their own: the browser picks one. */
export const GENERIC = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'emoji',
  'math',
  'fangsong',
  '-apple-system',
  'blinkmacsystemfont',
]);

export function dataBytes(url: string): number {
  const comma = url.indexOf(',');
  const payload = url.slice(comma + 1);
  if (/;base64$/i.test(url.slice(0, comma))) {
    const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
    return Math.floor((payload.length * 3) / 4) - padding;
  }
  try {
    return new Blob([decodeURIComponent(payload)]).size;
  } catch {
    return payload.length;
  }
}

/** `url(x)`, `url('x')` or `url("x")`; a quoted URL may hold a parenthesis. */
export const URL_PATTERN = /url\(\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^)\s]*))\s*\)/g;

/** The URLs in a CSS value, as written. */
export function urlsIn(value: string): string[] {
  return [...value.matchAll(URL_PATTERN)].map(unescaped);
}

export function unescaped(match: RegExpMatchArray): string {
  return (match[1] ?? match[2] ?? match[3] ?? '').replace(/\\(.)/g, '$1');
}

/** URLs in a `<style>` resolve against the page; in a linked sheet, against the sheet. */
export function resolve(url: string, sheet: CSSStyleSheet): string {
  if (url.startsWith('data:')) return url;
  const base = sheet.href ?? (sheet.ownerNode as Node | null)?.baseURI ?? undefined;
  try {
    return new URL(url, base).href;
  } catch {
    return url;
  }
}

export function parseStack(stack: string): string[] {
  const families: string[] = [];
  for (const match of stack.matchAll(
    /\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|([^,]+))\s*(?:,|$)/g,
  )) {
    const family = (match[1] ?? match[2] ?? match[3] ?? '').trim();
    if (family) families.push(family);
  }
  return families;
}

export function normalizeStack(stack: string): string {
  return parseStack(stack)
    .map((family) => (GENERIC.has(family.toLowerCase()) ? family.toLowerCase() : `"${family}"`))
    .join(', ');
}

export function normalizeFamily(family: string): string {
  return unquote(family).toLowerCase();
}

export function unquote(family: string): string {
  return family.trim().replace(/^(["'])(.*)\1$/, '$2');
}

export function quoteFamily(family: string): string {
  return `"${family.replace(/["\\]/g, '\\$&')}"`;
}
