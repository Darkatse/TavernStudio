import {
  elementPath,
  frameInPage,
  readStyles,
  ruleLines,
  type Candidate,
  type Explanation,
  type MatchedRule,
} from '@tavern-studio/preview/inspect';
import type { JsonObject } from '@tavern-studio/agent';
import type { JsonValue } from '@tavern-studio/workspace';
import type { SourceNamer } from './sources';

const RULES_SHOWN = 20;
const OVERRIDES_SHOWN = 4;
const VARIABLE_DEPTH = 3;
const DECLARATIONS_SHOWN = 400;

export async function inspectStyles(
  page: Window,
  element: Element,
  properties: readonly string[],
  namer: SourceNamer,
): Promise<JsonValue> {
  const styles = readStyles(element.ownerDocument);
  const view = element.ownerDocument.defaultView;
  if (!view) throw new Error('The element is no longer in a page');

  const longhands = [...new Set(properties.flatMap((property) => styles.longhands(property)))];
  const explained = new Map(
    longhands.map((property) => [property, styles.explain(element, property)]),
  );
  const variables = new Map<string, Explanation>();
  let frontier = [...explained.values()];
  for (let depth = 0; depth < VARIABLE_DEPTH && frontier.length > 0; depth++) {
    const next: Explanation[] = [];
    for (const explanation of frontier) {
      for (const name of variablesIn(winner(explanation)?.value ?? '')) {
        if (variables.has(name) || explained.has(name)) continue;
        const found = styles.explain(element, name);
        variables.set(name, found);
        next.push(found);
      }
    }
    frontier = next;
  }

  const rules = styles.rules(element);
  const shown = rules.slice(0, RULES_SHOWN);
  const lines = await lineFinder(view, [
    ...shown,
    ...[...explained.values(), ...variables.values()].flatMap(rulesOf),
  ]);
  const source = (rule: MatchedRule, of: Element, property?: string) =>
    rule.sheet ? namer.sheet(rule.sheet, lines(rule)) : namer.attribute(of, property ?? '');

  const declaration = (candidate: Candidate, of: Element, property: string): JsonObject => ({
    selector: candidate.rule.selector,
    ...(candidate.property === property ? {} : { property: candidate.property }),
    value: candidate.important ? `${candidate.value} !important` : candidate.value,
    source: source(candidate.rule, of, candidate.property),
    ...(candidate.rule.conditions.length > 0 ? { conditions: [...candidate.rule.conditions] } : {}),
  });
  const explain = (property: string, explanation: Explanation): JsonObject => {
    const holder = explanation.inherited?.element ?? element;
    const [applied, ...overridden] = explanation.inherited?.declared ?? explanation.declared;
    return {
      computed: explanation.computed,
      ...(explanation.inherited ? { inheritedFrom: elementPath(holder) } : {}),
      from: applied
        ? declaration(applied, holder, property)
        : 'no rule sets it: the initial value or the browser default',
      ...(overridden.length > 0
        ? {
            overrides: overridden
              .slice(0, OVERRIDES_SHOWN)
              .map((each) => declaration(each, holder, property)),
          }
        : {}),
    };
  };
  const explainAll = (explanations: Map<string, Explanation>) =>
    Object.fromEntries([...explanations].map(([name, each]) => [name, explain(name, each)]));

  const frame = frameInPage(element.ownerDocument, page);
  return {
    element: elementPath(element),
    ...(frame ? { frame: elementPath(frame) } : {}),
    properties: explainAll(explained),
    ...(variables.size > 0 ? { variables: explainAll(variables) } : {}),
    rules: shown.map((rule) => ({
      selector: rule.selector,
      source: source(rule, element),
      ...(rule.conditions.length > 0 ? { conditions: [...rule.conditions] } : {}),
      declarations: shorten(
        rule.declarations
          .map((each) => `${each.property}: ${each.value}${each.important ? ' !important' : ''}`)
          .join('; '),
      ),
    })),
    ...(rules.length > shown.length ? { rulesNotShown: rules.length - shown.length } : {}),
  };
}

function winner(explanation: Explanation): Candidate | undefined {
  return (explanation.inherited?.declared ?? explanation.declared)[0];
}

function rulesOf(explanation: Explanation): MatchedRule[] {
  return (explanation.inherited?.declared ?? explanation.declared).map((each) => each.rule);
}

function variablesIn(value: string): string[] {
  return [...value.matchAll(/var\(\s*(--[\w-]+)/g)].flatMap((match) =>
    match[1] ? [match[1]] : [],
  );
}

function shorten(text: string): string {
  return text.length > DECLARATIONS_SHOWN ? `${text.slice(0, DECLARATIONS_SHOWN)}…` : text;
}

/** A <link>'s file is fetched by the page, so that it reads what the page read. */
async function lineFinder(
  view: Window,
  rules: readonly MatchedRule[],
): Promise<(rule: MatchedRule) => number | undefined> {
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
