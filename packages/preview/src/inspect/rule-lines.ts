/**
 * The line each rule of a sheet starts on in the text it was parsed from.
 * CSSOM keeps no source positions, so the text's rule preludes, read in
 * order, are paired with the sheet's rules in order: CSSOM drops rules it
 * cannot parse and reserializes the rest, so preludes compare without
 * whitespace, quotes or case, and a rule with no partner has no line.
 */
export function ruleLines(sheet: CSSStyleSheet, text: string): Map<CSSRule, number> {
  const preludes = readPreludes(text);
  const lines = new Map<CSSRule, number>();
  let next = 0;
  const visit = (rules: CSSRuleList) => {
    for (const rule of rules) {
      const prelude = preludeOf(rule);
      if (prelude === undefined) continue;
      const key = normalize(prelude);
      const found = preludes.findIndex((entry, index) => index >= next && entry.key === key);
      if (found !== -1) {
        lines.set(rule, preludes[found]?.line ?? 0);
        next = found + 1;
      }
      if ('cssRules' in rule) visit((rule as CSSGroupingRule).cssRules);
    }
  };
  visit(sheet.cssRules);
  return lines;
}

/**
 * What a rule says before its `{`, as CSSOM serializes it: a style rule's
 * selectors, or the at-rule and its condition. An `@import`, which has no
 * block, by the URL it names, which CSSOM keeps as written.
 */
function preludeOf(rule: CSSRule): string | undefined {
  if ('selectorText' in rule) return (rule as CSSStyleRule).selectorText;
  if ('href' in rule && 'styleSheet' in rule) return importPrelude((rule as CSSImportRule).href);
  const brace = rule.cssText.indexOf('{');
  return brace === -1 ? undefined : rule.cssText.slice(0, brace);
}

/** `@import url("x")` and `@import "x"` name the same sheet. */
function importPrelude(url: string): string {
  return `@import ${url}`;
}

const normalize = (prelude: string) =>
  prelude
    .replace(/[\s'"]/g, '')
    .replaceAll('::', ':')
    .toLowerCase();

/** Every `prelude {` in the text, in order, with the line its first character is on. */
function readPreludes(text: string): { key: string; line: number }[] {
  const preludes: { key: string; line: number }[] = [];
  let line = 1;
  let prelude = '';
  let startLine = 0;
  for (let at = 0; at < text.length; at++) {
    const char = text[at] ?? '';
    if (char === '/' && text[at + 1] === '*') {
      const end = text.indexOf('*/', at + 2);
      const stop = end === -1 ? text.length : end + 2;
      line += countLines(text, at, stop);
      at = stop - 1;
      continue;
    }
    if (char === '"' || char === "'") {
      let end = at + 1;
      while (end < text.length && text[end] !== char) end += text[end] === '\\' ? 2 : 1;
      if (prelude.trim() === '') startLine = line;
      prelude += text.slice(at, end + 1);
      line += countLines(text, at, end + 1);
      at = end;
      continue;
    }
    if (char === '{') {
      if (prelude.trim()) preludes.push({ key: normalize(prelude), line: startLine });
      prelude = '';
    } else if (char === '}' || char === ';') {
      const imported =
        char === ';' && /^\s*@import\s+(?:url\(\s*)?(["']?)([^"')\s]+)\1/i.exec(prelude);
      if (imported)
        preludes.push({ key: normalize(importPrelude(imported[2] ?? '')), line: startLine });
      prelude = '';
    } else {
      if (prelude.trim() === '' && !/\s/.test(char)) startLine = line;
      prelude += char;
    }
    if (char === '\n') line++;
  }
  return preludes;
}

function countLines(text: string, from: number, to: number): number {
  let lines = 0;
  for (let at = from; at < to; at++) if (text[at] === '\n') lines++;
  return lines;
}
