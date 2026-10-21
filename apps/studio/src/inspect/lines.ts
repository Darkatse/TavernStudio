import { ruleLines } from '@tavern-studio/preview/inspect';

/** A rule and its sheet; both are null for a style attribute. */
export interface SheetRule {
  sheet: CSSStyleSheet | null;
  rule: CSSRule | null;
}

/** A <link>'s file is fetched by the page, so that it reads what the page read. */
export async function lineFinder(
  view: Window,
  rules: readonly SheetRule[],
): Promise<(rule: SheetRule) => number | undefined> {
  const sheets = new Set(rules.flatMap((rule) => (rule.sheet ? [rule.sheet] : [])));
  const bySheet = new Map<CSSStyleSheet, Map<CSSRule, number>>();
  await Promise.all(
    [...sheets].map(async (sheet) => {
      const text = await sheetText(view, sheet);
      if (text !== undefined) bySheet.set(sheet, ruleLines(sheet, text));
    }),
  );
  return (rule) => (rule.sheet && rule.rule ? bySheet.get(rule.sheet)?.get(rule.rule) : undefined);
}

async function sheetText(view: Window, sheet: CSSStyleSheet): Promise<string | undefined> {
  const owner = sheet.ownerNode as Element | null;
  if (owner?.localName === 'style') return owner.textContent ?? '';
  if (!sheet.href) return undefined;
  try {
    const response = await view.fetch(sheet.href);
    return response.ok ? await response.text() : undefined;
  } catch {
    return undefined;
  }
}
