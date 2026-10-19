import {
  compareSpecificity,
  specificity,
  splitSelectorList,
  ZERO,
  type Specificity,
} from './specificity';

/**
 * Not modelled: `@container` and `@scope` rules, pseudo-elements, the order
 * of named cascade layers among themselves, animations and user-agent styles.
 */

export interface Declaration {
  property: string;
  value: string;
  important: boolean;
}

export interface MatchedRule {
  /** Null for the style attribute. */
  rule: CSSRule | null;
  /** Null for the style attribute. */
  sheet: CSSStyleSheet | null;
  /** The rule's selectors as written, or `style attribute`. */
  selector: string;
  /** That of its most specific selector that matches. */
  specificity: Specificity;
  /** The at-rules around it, outermost first, such as `@media (max-width: 1000px)`. */
  conditions: readonly string[];
  layered: boolean;
  /** Its place in the document's order of rules; the style attribute comes last. */
  order: number;
  declarations: readonly Declaration[];
}

/** The declaration may set the property through a shorthand. */
export interface Candidate extends Declaration {
  rule: MatchedRule;
}

export interface Explanation {
  computed: string;
  /** The declarations on the element setting it, the one that applies first. */
  declared: readonly Candidate[];
  /** For an inherited property the element does not declare: the nearest ancestor that does. */
  inherited?: { element: Element; declared: readonly Candidate[] };
}

export interface Styles {
  /** The rules matching an element, the one that applies first. */
  rules(element: Element): readonly MatchedRule[];
  explain(element: Element, property: string): Explanation;
  /** A property's longhands; a longhand or custom property is its own. */
  longhands(property: string): readonly string[];
}

/** A rule carrying declarations: a style rule, or the declarations nested in one. */
type StyleCarrier = CSSRule & { readonly style: CSSStyleDeclaration };

interface IndexedRule {
  rule: StyleCarrier;
  sheet: CSSStyleSheet;
  /** Complex selectors, nesting resolved. */
  selectors: readonly string[];
  conditions: readonly string[];
  layered: boolean;
  order: number;
}

const STYLE_ATTRIBUTE = 'style attribute';

/** Properties a child takes from its parent unless it declares them (CSS specs); custom properties too. */
const INHERITED = new Set([
  'border-collapse',
  'border-spacing',
  'caption-side',
  'caret-color',
  'color',
  'color-scheme',
  'cursor',
  'direction',
  'empty-cells',
  'font-family',
  'font-feature-settings',
  'font-kerning',
  'font-size',
  'font-size-adjust',
  'font-stretch',
  'font-style',
  'font-synthesis-weight',
  'font-synthesis-style',
  'font-variant-caps',
  'font-variant-ligatures',
  'font-variant-numeric',
  'font-variation-settings',
  'font-weight',
  'hyphens',
  'letter-spacing',
  'line-height',
  'list-style-image',
  'list-style-position',
  'list-style-type',
  'orphans',
  'overflow-wrap',
  'paint-order',
  'pointer-events',
  'quotes',
  'tab-size',
  'text-align',
  'text-align-last',
  'text-indent',
  'text-rendering',
  'text-shadow',
  'text-transform',
  'text-underline-position',
  'visibility',
  'white-space-collapse',
  'text-wrap-mode',
  'widows',
  'word-break',
  'word-spacing',
  'writing-mode',
  '-webkit-text-fill-color',
  '-webkit-text-stroke-color',
  '-webkit-text-stroke-width',
]);

/**
 * The rules are indexed once, so make one reader per inspection: a page
 * changes its sheets as it runs.
 */
export function readStyles(document: Document): Styles {
  const view = document.defaultView;
  if (!view) throw new Error('The document has no window to evaluate its styles in');
  const index = indexRules(document, view);
  const matched = new Map<Element, MatchedRule[]>();
  const expansions = new Map<string, readonly string[]>();

  const longhands = (property: string): readonly string[] => {
    if (property.startsWith('--')) return [property];
    let list = expansions.get(property);
    if (!list) {
      // A shorthand set to `initial` lists every longhand it stands for.
      const probe = document.createElement('div').style;
      probe.setProperty(property, 'initial');
      list = probe.length > 0 ? Array.from(probe) : [property];
      expansions.set(property, list);
    }
    return list;
  };

  const rules = (element: Element): MatchedRule[] => {
    let found = matched.get(element);
    if (!found) {
      found = matchRules(element, index);
      matched.set(element, found);
    }
    return found;
  };

  const candidates = (element: Element, property: string): Candidate[] => {
    const found: Candidate[] = [];
    for (const rule of rules(element)) {
      // Within a rule, the last declaration setting the property applies.
      const declaration = rule.declarations.findLast(
        (each) => each.property === property || longhands(each.property).includes(property),
      );
      if (declaration) found.push({ ...declaration, rule });
    }
    return found.toSorted(byCascade);
  };

  return {
    rules,
    longhands,
    explain(element, property) {
      const computed = view.getComputedStyle(element).getPropertyValue(property).trim();
      const declared = candidates(element, property);
      if (declared.length > 0 || !(property.startsWith('--') || INHERITED.has(property))) {
        return { computed, declared };
      }
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        const from = candidates(parent, property);
        if (from.length > 0)
          return { computed, declared, inherited: { element: parent, declared: from } };
      }
      return { computed, declared };
    },
  };
}

function indexRules(document: Document, view: Window & typeof globalThis): IndexedRule[] {
  const indexed: IndexedRule[] = [];
  const matchesMedia = (media: string) => media === '' || view.matchMedia(media).matches;

  const visitSheet = (sheet: CSSStyleSheet, conditions: readonly string[], layered: boolean) => {
    if (sheet.disabled || !matchesMedia(sheet.media.mediaText)) return;
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      // A cross-origin sheet without CORS keeps its rules to itself.
      return;
    }
    const media = sheet.media.mediaText;
    visitRules(rules, sheet, media ? [...conditions, `@media ${media}`] : conditions, layered);
  };

  const visitRules = (
    rules: CSSRuleList,
    sheet: CSSStyleSheet,
    conditions: readonly string[],
    layered: boolean,
    parent?: readonly string[],
  ) => {
    for (const rule of rules) {
      if (rule instanceof view.CSSStyleRule) {
        const selectors = splitSelectorList(rule.selectorText).map((selector) =>
          nest(selector, parent),
        );
        indexed.push({ rule, sheet, selectors, conditions, layered, order: indexed.length });
        if (rule.cssRules.length > 0)
          visitRules(rule.cssRules, sheet, conditions, layered, selectors);
      } else if (parent && 'style' in rule) {
        // Declarations after a nested rule belong to the rule around them.
        const carrier = rule as StyleCarrier;
        indexed.push({
          rule: carrier,
          sheet,
          selectors: parent,
          conditions,
          layered,
          order: indexed.length,
        });
      } else if (rule instanceof view.CSSMediaRule) {
        const media = rule.media.mediaText;
        if (matchesMedia(media)) {
          visitRules(rule.cssRules, sheet, [...conditions, `@media ${media}`], layered, parent);
        }
      } else if (rule instanceof view.CSSSupportsRule) {
        if (view.CSS.supports(rule.conditionText)) {
          visitRules(
            rule.cssRules,
            sheet,
            [...conditions, `@supports ${rule.conditionText}`],
            layered,
            parent,
          );
        }
      } else if (rule instanceof view.CSSLayerBlockRule) {
        const layer = rule.name ? `@layer ${rule.name}` : '@layer';
        visitRules(rule.cssRules, sheet, [...conditions, layer], true, parent);
      } else if (rule instanceof view.CSSImportRule && rule.styleSheet) {
        if (matchesMedia(rule.media.mediaText)) {
          visitSheet(rule.styleSheet, conditions, layered || rule.layerName !== null);
        }
      }
    }
  };

  for (const sheet of document.styleSheets) visitSheet(sheet, [], false);
  for (const sheet of document.adoptedStyleSheets) visitSheet(sheet, [], false);
  return indexed;
}

/** A nested selector as a complete one: `&` stands for the parent, else it is a descendant. */
function nest(selector: string, parent: readonly string[] | undefined): string {
  if (!parent) return selector;
  const outer = `:is(${parent.join(', ')})`;
  return selector.includes('&') ? selector.replaceAll('&', outer) : `${outer} ${selector}`;
}

function matchRules(element: Element, index: readonly IndexedRule[]): MatchedRule[] {
  const found: MatchedRule[] = [];
  for (const entry of index) {
    let best: Specificity | undefined;
    for (const selector of entry.selectors) {
      if (!matches(element, selector)) continue;
      const own = specificity(selector);
      if (!best || compareSpecificity(own, best) > 0) best = own;
    }
    // A rule holding only nested rules declares nothing itself.
    if (!best || entry.rule.style.length === 0) continue;
    found.push({
      rule: entry.rule,
      sheet: entry.sheet,
      selector:
        'selectorText' in entry.rule
          ? (entry.rule as CSSStyleRule).selectorText
          : entry.selectors.join(', '),
      specificity: best,
      conditions: entry.conditions,
      layered: entry.layered,
      order: entry.order,
      declarations: parseDeclarations(entry.rule.style.cssText),
    });
  }
  const inline = element.getAttribute('style');
  if (inline !== null && 'style' in element) {
    found.push({
      rule: null,
      sheet: null,
      selector: STYLE_ATTRIBUTE,
      specificity: ZERO,
      conditions: [],
      layered: false,
      order: index.length,
      declarations: parseDeclarations((element as HTMLElement).style.cssText),
    });
  }
  // As they apply, setting importance aside: the style attribute, then specificity, then order.
  return found.toSorted(
    (a, b) =>
      Number(b.rule === null) - Number(a.rule === null) ||
      compareSpecificity(b.specificity, a.specificity) ||
      b.order - a.order,
  );
}

function matches(element: Element, selector: string): boolean {
  try {
    return element.matches(selector);
  } catch {
    // A selector this browser parses in a sheet but not here, such as one with a pseudo-element.
    return false;
  }
}

/**
 * The cascade's order for declarations of one property (CSS Cascade 5 §6):
 * importance, then the style attribute, then layers (unlayered wins among
 * normal declarations, layered among important ones), then specificity, then
 * order of appearance.
 */
function byCascade(a: Candidate, b: Candidate): number {
  const layerRank = (candidate: Candidate) =>
    candidate.rule.layered === candidate.important ? 1 : 0;
  return (
    Number(b.important) - Number(a.important) ||
    Number(b.rule.rule === null) - Number(a.rule.rule === null) ||
    layerRank(b) - layerRank(a) ||
    compareSpecificity(b.rule.specificity, a.rule.specificity) ||
    b.rule.order - a.rule.order
  );
}

function parseDeclarations(text: string): Declaration[] {
  const declarations: Declaration[] = [];
  let depth = 0;
  let quote = '';
  let start = 0;
  const take = (end: number) => {
    const part = text.slice(start, end).trim();
    start = end + 1;
    const colon = part.indexOf(':');
    if (colon <= 0) return;
    let value = part.slice(colon + 1).trim();
    const important = /!\s*important$/i.test(value);
    if (important) value = value.replace(/!\s*important$/i, '').trim();
    declarations.push({ property: part.slice(0, colon).trim(), value, important });
  };
  for (let at = 0; at < text.length; at++) {
    const char = text[at];
    if (char === '\\') at++;
    else if (quote) {
      if (char === quote) quote = '';
    } else if (char === '"' || char === "'") quote = char;
    else if (char === '(') depth++;
    else if (char === ')') depth--;
    else if (char === ';' && depth === 0) take(at);
  }
  take(text.length);
  return declarations;
}
