/**
 * Matches only this element in its own document, so that a finding names
 * something the Agent can pass on as a selector.
 */
export function elementPath(element: Element): string {
  const document = element.ownerDocument;
  const unique = (selector: string) => document.querySelectorAll(selector).length === 1;

  const steps: string[] = [];
  let anchor: string | undefined;
  for (let node: Element | null = element; node; node = node.parentElement) {
    const id = uniqueId(node, unique);
    if (id) {
      anchor = id;
      break;
    }
    steps.unshift(step(node));
  }
  if (steps.length === 0 && anchor) return anchor;

  const self = steps.at(-1) ?? element.localName;
  const candidates = [
    self,
    ...(anchor ? [`${anchor} ${self}`] : []),
    [anchor, ...steps].filter(Boolean).join(' > '),
  ];
  for (const candidate of candidates) if (unique(candidate)) return candidate;
  return candidates.at(-1) ?? self;
}

function uniqueId(element: Element, unique: (selector: string) => boolean): string | undefined {
  if (!element.id) return undefined;
  const selector = `#${CSS.escape(element.id)}`;
  return unique(selector) ? selector : undefined;
}

function step(element: Element): string {
  const classes = [...element.classList]
    .slice(0, 2)
    .map((name) => `.${CSS.escape(name)}`)
    .join('');
  const own = `${element.localName}${classes}`;
  const parent = element.parentElement;
  if (!parent) return own;
  const alike = [...parent.children].filter((sibling) => sibling.localName === element.localName);
  if (alike.filter((sibling) => sibling.matches(own)).length < 2) return own;
  return `${own}:nth-of-type(${alike.indexOf(element) + 1})`;
}
