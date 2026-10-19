/** Selectors Level 4 specificity: ids, then classes, attributes and pseudo-classes, then types. */
export type Specificity = readonly [ids: number, classes: number, types: number];

export const ZERO: Specificity = [0, 0, 0];

/** Legacy pseudo-elements, written with one colon. */
const LEGACY_PSEUDO_ELEMENTS = new Set(['before', 'after', 'first-line', 'first-letter']);
/** Pseudo-classes whose specificity is that of their most specific argument. */
const TAKES_ARGUMENT = new Set(['is', 'not', 'has', 'matches', '-webkit-any', '-moz-any']);

export function compareSpecificity(a: Specificity, b: Specificity): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

/** The specificity of a selector list: that of its most specific complex selector. */
export function listSpecificity(selectors: string): Specificity {
  return splitSelectorList(selectors)
    .map(specificity)
    .reduce((max, next) => (compareSpecificity(next, max) > 0 ? next : max), ZERO);
}

/** The complex selectors of a list, split at its top-level commas. */
export function splitSelectorList(selectors: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote = '';
  let start = 0;
  for (let at = 0; at < selectors.length; at++) {
    const char = selectors[at];
    if (char === '\\') at++;
    else if (quote) {
      if (char === quote) quote = '';
    } else if (char === '"' || char === "'") quote = char;
    else if (char === '(' || char === '[') depth++;
    else if (char === ')' || char === ']') depth--;
    else if (char === ',' && depth === 0) {
      parts.push(selectors.slice(start, at).trim());
      start = at + 1;
    }
  }
  parts.push(selectors.slice(start).trim());
  return parts.filter(Boolean);
}

/** The specificity of one complex selector. */
export function specificity(selector: string): Specificity {
  let ids = 0;
  let classes = 0;
  let types = 0;
  let at = 0;
  const name = () => {
    const start = at;
    while (at < selector.length && /[\w\-\\\u0080-￿]/.test(selector[at] ?? '')) {
      at += selector[at] === '\\' ? 2 : 1;
    }
    return selector.slice(start, at);
  };
  /** The text inside the parentheses that start at `at`, leaving `at` after them. */
  const argument = () => {
    let depth = 0;
    const start = at + 1;
    for (; at < selector.length; at++) {
      if (selector[at] === '\\') at++;
      else if (selector[at] === '(') depth++;
      else if (selector[at] === ')' && --depth === 0) break;
    }
    at++;
    return selector.slice(start, at - 1);
  };

  while (at < selector.length) {
    const char = selector[at];
    if (char === '#') {
      at++;
      name();
      ids++;
    } else if (char === '.') {
      at++;
      name();
      classes++;
    } else if (char === '[') {
      while (at < selector.length && selector[at] !== ']') at += selector[at] === '\\' ? 2 : 1;
      at++;
      classes++;
    } else if (char === ':') {
      const element = selector[at + 1] === ':';
      at += element ? 2 : 1;
      const pseudo = name().toLowerCase();
      const inner = selector[at] === '(' ? argument() : undefined;
      if (element || LEGACY_PSEUDO_ELEMENTS.has(pseudo)) types++;
      else if (pseudo === 'where') continue;
      else if (TAKES_ARGUMENT.has(pseudo) && inner !== undefined) {
        const [a, b, c] = listSpecificity(inner);
        ids += a;
        classes += b;
        types += c;
      } else if (/^nth-(last-)?child$/.test(pseudo) && inner !== undefined && / of /i.test(inner)) {
        // `:nth-child(An+B of S)` counts as a pseudo-class plus its most specific S.
        const [a, b, c] = listSpecificity(inner.slice(inner.search(/ of /i) + 4));
        ids += a;
        classes += b + 1;
        types += c;
      } else classes++;
    } else if (/[\w\-\\\u0080-￿]/.test(char ?? '')) {
      name();
      types++;
    } else at++;
  }
  return [ids, classes, types];
}
