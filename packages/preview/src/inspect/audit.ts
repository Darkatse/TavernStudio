import { elementPath } from './element-path';
import {
  backdrop,
  frameInPage,
  frameOrigin,
  hex,
  pageReader,
  textContrast,
  type PageReader,
  type Point,
} from './paint';

/**
 * Only what is in view is checked: elements whose box shows inside the
 * viewport of their document and the overflow clips of their ancestors, and
 * that `checkVisibility` counts as visible.
 *
 * A positioned element is taken to be clipped by every ancestor's overflow,
 * though one whose containing block lies outside a clipping ancestor escapes
 * it. Clip paths other than those hiding text for screen readers, masks and
 * transforms are not modelled. Shadow trees are not entered, nor the
 * documents of frames in the region: the report names those frames, and each
 * can be audited on its own.
 */

/** Findings listed per check, the worst first; the counts cover all of them. */
const SHOWN = 10;
/**
 * The descendants of elements out of view are visited last, so the cap leaves
 * those unchecked first.
 */
const MAX_ELEMENTS = 10_000;
const WIDEST_SHOWN = 5;
const SAMPLE_LENGTH = 40;
/** Overflow below a pixel is layout rounding. */
const TOLERANCE = 1;
/** WCAG 2 success criterion 1.4.3: the minimum contrast, and that for large text. */
const MINIMUM = 4.5;
const MINIMUM_LARGE = 3;
/** Large text: 18pt, or 14pt bold, in CSS pixels. */
const LARGE_PX = 24;
const LARGE_BOLD_PX = 18.66;
/** Two controls overlap when they share more than this part of the smaller one. */
const OVERLAP_SHARE = 0.25;

const INTERACTIVE = [
  'a[href]',
  'button',
  'input:not([type=hidden])',
  'select',
  'textarea',
  'summary',
  '[role=button]',
  '[role=link]',
  '[role=checkbox]',
  '[role=tab]',
  '[role=menuitem]',
  '[contenteditable]:not([contenteditable=false])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * Elements whose children are not laid out as content of the page: graphics,
 * a control's options and text, fallback content, and frames (audited on their
 * own). Their overflow is their own too, as a field scrolls its text.
 */
const LEAVES = new Set([
  'svg',
  'input',
  'select',
  'textarea',
  'canvas',
  'video',
  'audio',
  'object',
  'iframe',
]);

const VISIBLE: CheckVisibilityOptions = { checkOpacity: true, checkVisibilityCSS: true };
const UNBOUNDED: Box = { left: -Infinity, top: -Infinity, right: Infinity, bottom: Infinity };

/** Plain JSON, so a type literal: it converts to the Agent's JSON types. */
export type AuditReport = {
  /** The region audited: `page` for a whole document, else a selector. */
  region: string;
  /** The frame inside the vendor page whose document was audited. */
  frame?: string;
  /** The viewport of the document audited, scrollbars excluded. */
  viewport: string;
  /** The region had more elements than are visited: some, out of view first, went unchecked. */
  truncated?: true;
  contrast: { checked: number; failing: number; uncertain: number; findings: Finding[] };
  clipping: Check;
  overlap: Check;
  zeroSize: Check;
  pageOverflow?: {
    scrollWidth: number;
    viewportWidth: number;
    /** The viewport hides what passes its edge: the page cannot be scrolled to it. */
    cutOff?: true;
    widest: Finding[];
  };
  /** Frames in view whose documents this audit did not enter. */
  unauditedFrames?: string[];
};

type Finding = Record<string, string | number | boolean | (string | number)[]>;

type Check = {
  checked: number;
  found: number;
  findings: Finding[];
};

/** A finding before it is listed: naming its elements queries the page, so only those listed are named. */
interface Found {
  /** Lower is worse. */
  severity: number;
  finding: () => Finding;
}

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface Context {
  /** The area its ancestors' overflow leaves visible. */
  clip: Box;
  /** Whether the nearest ancestor with a size shows in view. */
  shownAbove: boolean;
}

interface Shown {
  element: Element;
  style: CSSStyleDeclaration;
  /** The part of its box in view. */
  shown: Box;
  /** The part of the viewport its content can show in, its own overflow included. */
  contentClip: Box;
  /** The text nodes it holds directly, whitespace aside. */
  nodes: Text[];
  control: boolean;
}

/** A control or text holder with no size, inside a part of the page in view. */
interface Empty {
  element: Element;
  rect: DOMRect;
  style: CSSStyleDeclaration;
  nodes: Text[];
}

interface Collected {
  shown: Shown[];
  empty: Empty[];
  /** Elements whose right edge passes the viewport and that no ancestor clips. */
  wide: { element: Element; right: number }[];
  frames: Element[];
  /** Controls and text holders whose size was checked. */
  sized: number;
  truncated: boolean;
}

/**
 * Audits `target` in the vendor page `page`: the page's `<html>`, an element
 * of it or of a frame in it, or an `<iframe>`, whose document is then audited.
 */
export function auditRegion(page: Window, target: Element): AuditReport {
  const root = target.localName === 'iframe' ? frameRoot(target) : target;
  const document = root.ownerDocument;
  const reader = pageReader(page);
  const viewport = viewportOf(document);
  const seen = collect(root, reader, viewport, shownPart(document, reader));
  const frame = frameInPage(document, page);
  const overflow = pageOverflow(document, seen.wide, reader);
  return {
    region: root === document.documentElement ? 'page' : elementPath(root),
    ...(frame ? { frame: elementPath(frame) } : {}),
    viewport: `${viewport.right}×${viewport.bottom}`,
    ...(seen.truncated ? { truncated: true } : {}),
    contrast: checkContrast(seen.shown, reader),
    clipping: checkClipping(seen.shown, reader),
    overlap: checkOverlap(seen.shown),
    zeroSize: checkZeroSize(seen),
    ...(overflow ? { pageOverflow: overflow } : {}),
    ...(seen.frames.length > 0 ? { unauditedFrames: seen.frames.map(elementPath) } : {}),
  };
}

function frameRoot(frame: Element): Element {
  const root = (frame as HTMLIFrameElement).contentDocument?.documentElement;
  if (!root) {
    throw new Error(
      `${elementPath(frame)} shows no document Studio can read: it is cross-origin or empty`,
    );
  }
  return root;
}

function viewportOf(document: Document): Box {
  const scroller = document.scrollingElement ?? document.documentElement;
  return { left: 0, top: 0, right: scroller.clientWidth, bottom: scroller.clientHeight };
}

/**
 * The part of a document's viewport that shows. For a frame inside the page,
 * that is what the page around it leaves visible: a chat message scrolled
 * half out of view hides half of a card in it.
 */
function shownPart(document: Document, reader: PageReader): Box {
  const viewport = viewportOf(document);
  const frame = frameInPage(document, reader.page);
  if (!frame) return viewport;
  const outer = shownPart(frame.ownerDocument, reader);
  const { clip } = contextAbove(frame, reader, outer);
  const shown = intersect(intersect(frame.getBoundingClientRect(), clip), outer);
  const origin = frameOrigin(frame, reader);
  return intersect(viewport, {
    left: shown.left - origin.x,
    top: shown.top - origin.y,
    right: shown.right - origin.x,
    bottom: shown.bottom - origin.y,
  });
}

/**
 * Walks the region once, reading every box in a single pass since nothing is
 * written to the page, and sorts what each check needs. Elements count as in
 * view where they show in `visible`; content passing the right edge of
 * `viewport` widens the page.
 */
function collect(root: Element, reader: PageReader, viewport: Box, visible: Box): Collected {
  const controls = new Set(root.querySelectorAll(INTERACTIVE));
  if (root.matches(INTERACTIVE)) controls.add(root);
  const seen: Collected = {
    shown: [],
    empty: [],
    wide: [],
    frames: [],
    sized: 0,
    truncated: false,
  };
  const stack = [{ element: root, context: contextAbove(root, reader, visible) }];
  // The descendants of an element out of view rarely show; they wait until the rest is done.
  const later: typeof stack = [];
  let visited = 0;

  for (let next = stack.pop() ?? later.pop(); next; next = stack.pop() ?? later.pop()) {
    if (visited === MAX_ELEMENTS) {
      seen.truncated = true;
      break;
    }
    visited++;
    const { element, context } = next;
    const style = reader.style(element);
    if (style.display === 'none' || clippedAway(style)) continue;
    let inner = context;
    // Where the children go: on, later, or nowhere when none of them can show.
    let children: typeof stack | undefined = LEAVES.has(element.localName) ? undefined : stack;
    // A `display: contents` element has no box; its children are laid out in its place.
    if (style.display !== 'contents') {
      const placed = place(element, style, context, visible, reader);
      inner = placed.inner;
      const { rect, shown } = placed;
      if (hidesDescendants(style, shown)) children = undefined;
      else if (children && placed.sized && !shown) children = later;
      const control = controls.has(element);
      const nodes = textNodes(element);

      if (
        rect.right > viewport.right + TOLERANCE &&
        placed.clip.right > viewport.right + TOLERANCE
      ) {
        seen.wide.push({ element, right: rect.right });
      }
      if (shown && element.checkVisibility(VISIBLE)) {
        if (nodes.length > 0 && parseFloat(style.fontSize) === 0) {
          seen.empty.push({ element, rect, style, nodes });
        }
        const contentClip = intersect(inner.clip, visible);
        seen.shown.push({ element, style, shown, contentClip, nodes, control });
        if (element.localName === 'iframe') seen.frames.push(element);
        if (control || nodes.length > 0) seen.sized++;
      } else if (
        (control || nodes.length > 0) &&
        !placed.sized &&
        context.shownAbove &&
        element.checkVisibility(VISIBLE)
      ) {
        seen.empty.push({ element, rect, style, nodes });
        seen.sized++;
      }
    }
    if (!children) continue;
    for (let index = element.children.length - 1; index >= 0; index--) {
      const child = element.children.item(index);
      if (child) children.push({ element: child, context: inner });
    }
  }
  return seen;
}

/**
 * Whether an element clips all of its painting away, as text kept for screen
 * readers does (`.sr-only`): a `clip` rectangle with no area on a positioned
 * element, or `clip-path: inset(50%)`. axe-core counts the same as hidden.
 */
function clippedAway(style: CSSStyleDeclaration): boolean {
  if (style.clipPath === 'inset(50%)') return true;
  const rect = /^rect\((.*)\)$/.exec(style.clip)?.[1];
  if (!rect || (style.position !== 'absolute' && style.position !== 'fixed')) return false;
  // `auto` sides parse as NaN, which leaves the rectangle open on them.
  const [top = NaN, right = NaN, bottom = NaN, left = NaN] = rect.split(/,\s*|\s+/).map(parseFloat);
  return right - left <= 0 || bottom - top <= 0;
}

/**
 * Whether nothing below an element can show: `content-visibility: hidden`
 * skips its contents, and paint containment, which `content-visibility: auto`
 * implies, keeps them inside its box, out of view with it. Reading the boxes
 * of skipped contents would also force the layout the page saved.
 */
function hidesDescendants(style: CSSStyleDeclaration, shown: Box | undefined): boolean {
  if (style.contentVisibility === 'hidden') return true;
  if (shown) return false;
  return style.contentVisibility === 'auto' || /\b(?:paint|strict|content)\b/.test(style.contain);
}

/** The context an element's ancestors pass down to it, as the walk would have. */
function contextAbove(element: Element, reader: PageReader, visible: Box): Context {
  const ancestors: Element[] = [];
  for (let node = element.parentElement; node; node = node.parentElement) ancestors.unshift(node);
  let context: Context = { clip: UNBOUNDED, shownAbove: true };
  for (const ancestor of ancestors) {
    const style = reader.style(ancestor);
    if (style.display !== 'contents') {
      context = place(ancestor, style, context, visible, reader).inner;
    }
  }
  return context;
}

function place(
  element: Element,
  style: CSSStyleDeclaration,
  context: Context,
  visible: Box,
  reader: PageReader,
) {
  // The viewport clips a fixed element, not its ancestors.
  const clip = style.position === 'fixed' ? visible : context.clip;
  const rect = element.getBoundingClientRect();
  const sized = rect.width > 0 && rect.height > 0;
  const inView = intersect(intersect(rect, clip), visible);
  const shown = sized && hasArea(inView) ? inView : undefined;
  const inner: Context = {
    clip: clipsContent(element, style, reader)
      ? intersect(clip, overflowClip(element, style, rect))
      : clip,
    shownAbove: sized ? shown !== undefined : context.shownAbove,
  };
  return { rect, clip, shown, sized, inner };
}

/** Overflow does not apply to inline boxes. */
function clipsContent(element: Element, style: CSSStyleDeclaration, reader: PageReader): boolean {
  if (style.overflowX === 'visible' && style.overflowY === 'visible') return false;
  if (style.display === 'inline') return false;
  return viewportOverflow(element.ownerDocument, reader) !== style;
}

/**
 * The style whose overflow applies to the viewport instead of its element:
 * the root's, or the body's when the root's is visible (CSS Overflow 3 §3.3).
 */
function viewportOverflow(document: Document, reader: PageReader): CSSStyleDeclaration {
  const root = reader.style(document.documentElement);
  const visible = root.overflowX === 'visible' && root.overflowY === 'visible';
  return visible && document.body ? reader.style(document.body) : root;
}

/** The padding box of an element, on the axes its overflow clips. */
function overflowClip(element: Element, style: CSSStyleDeclaration, rect: DOMRect): Box {
  const left = rect.left + element.clientLeft;
  const top = rect.top + element.clientTop;
  const clipsX = style.overflowX !== 'visible';
  const clipsY = style.overflowY !== 'visible';
  return {
    left: clipsX ? left : -Infinity,
    right: clipsX ? left + element.clientWidth : Infinity,
    top: clipsY ? top : -Infinity,
    bottom: clipsY ? top + element.clientHeight : Infinity,
  };
}

function textNodes(element: Element): Text[] {
  const nodes: Text[] = [];
  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE && /\S/.test((node as Text).data)) {
      nodes.push(node as Text);
    }
  }
  return nodes;
}

function checkContrast(shown: readonly Shown[], reader: PageReader) {
  let checked = 0;
  let failing = 0;
  let uncertain = 0;
  const found: Found[] = [];

  for (const box of shown) {
    const { element, style, nodes } = box;
    if (nodes.length === 0 || parseFloat(style.fontSize) === 0) continue;
    const fill = reader.color(style.webkitTextFillColor);
    // Transparent text is invisible, unless it shows a background clipped to its glyphs.
    const clipsBackground = fill.a === 0;
    if (clipsBackground && !style.backgroundClip.includes('text')) continue;
    const point = textPoint(box);
    if (!point) continue;
    const behind = backdrop(element, point, reader);
    if (!behind) continue;
    checked++;
    if (clipsBackground) {
      uncertain++;
      found.push({
        severity: Infinity,
        finding: () => ({
          element: elementPath(element),
          text: sample(nodes),
          uncertain: true,
          color: 'background-clip: text',
        }),
      });
      continue;
    }
    const text = { ...fill, a: fill.a * reader.opacity(element) };
    const { min, max, backgrounds } = textContrast(text, behind);
    const required = isLarge(style) ? MINIMUM_LARGE : MINIMUM;
    if (min >= required) continue;
    const fails = max < required;
    if (fails) failing++;
    else uncertain++;
    const { varies } = behind;
    // One background, or the two bounds of a range.
    const background = backgrounds.map(hex);
    found.push({
      // Failing first, the lowest ratio first; then the uncertain, by their worst case.
      severity: fails ? max / required : 1 + min / required,
      finding: () => ({
        element: elementPath(element),
        text: sample(nodes),
        ratio: varies ? [round(min, 2), round(max, 2)] : round(min, 2),
        required,
        color: hex(text),
        background: varies ? background : background.join(),
        ...(varies ? { rangeBecause: `${varies.cause} on ${elementPath(varies.element)}` } : {}),
        ...(fails ? {} : { uncertain: true }),
      }),
    });
  }
  return { checked, failing, uncertain, findings: worstFirst(found) };
}

function textPoint({ element, nodes, contentClip }: Shown): Point | undefined {
  const range = element.ownerDocument.createRange();
  for (const node of nodes) {
    range.selectNodeContents(node);
    for (const rect of range.getClientRects()) {
      const part = intersect(rect, contentClip);
      if (hasArea(part)) {
        return { x: (part.left + part.right) / 2, y: (part.top + part.bottom) / 2 };
      }
    }
  }
  return undefined;
}

function isLarge(style: CSSStyleDeclaration): boolean {
  const size = parseFloat(style.fontSize);
  return size >= LARGE_PX || (size >= LARGE_BOLD_PX && Number(style.fontWeight) >= 700);
}

function checkClipping(shown: readonly Shown[], reader: PageReader): Check {
  let checked = 0;
  const found: Found[] = [];
  for (const { element, style, nodes } of shown) {
    if (LEAVES.has(element.localName) || style.display === 'inline') continue;
    checked++;
    const extraX = element.scrollWidth - element.clientWidth;
    const extraY = element.scrollHeight - element.clientHeight;
    // Overflow within a quarter of the font size is leading, overhang or rounding, not content.
    const tolerance = Math.max(TOLERANCE, parseFloat(style.fontSize) / 4);
    const cuts = clipsContent(element, style, reader);
    const holds = nodes.length > 0;
    const pixels = {
      cutX: cuts && hides(style.overflowX) && !hasEllipsis(style) ? extraX : 0,
      cutY: cuts && hides(style.overflowY) && style.webkitLineClamp === 'none' ? extraY : 0,
      spillsX: holds && style.overflowX === 'visible' ? extraX : 0,
      spillsY: holds && style.overflowY === 'visible' ? extraY : 0,
    };
    const worst = Math.max(...Object.values(pixels));
    if (worst <= tolerance) continue;
    found.push({
      severity: -worst,
      finding: () => ({
        element: elementPath(element),
        ...Object.fromEntries(
          Object.entries(pixels)
            .filter(([, value]) => value > tolerance)
            .map(([key, value]) => [key, Math.round(value)]),
        ),
        text: sampleOf(element.textContent ?? ''),
      }),
    });
  }
  return { checked, found: found.length, findings: worstFirst(found) };
}

/** Overflow that cuts content off; `auto` and `scroll` let it be scrolled to. */
function hides(overflow: string): boolean {
  return overflow === 'hidden' || overflow === 'clip';
}

/** A single line meant to end in an ellipsis where it is cut. */
function hasEllipsis(style: CSSStyleDeclaration): boolean {
  return style.textOverflow === 'ellipsis' && style.getPropertyValue('text-wrap-mode') === 'nowrap';
}

/** A label of the control is not a cover: clicking it reaches the control. */
function checkOverlap(shown: readonly Shown[]): Check {
  const controls = shown.filter(({ control }) => control);
  let checked = 0;
  const found: Found[] = [];
  for (const { element, style, shown: box } of controls) {
    if (style.pointerEvents === 'none') continue;
    checked++;
    const hit = element.ownerDocument.elementFromPoint(
      (box.left + box.right) / 2,
      (box.top + box.bottom) / 2,
    );
    if (!hit || element.contains(hit) || hit.contains(element)) continue;
    if (labelsOf(element).some((label) => label.contains(hit))) continue;
    found.push({
      severity: -Infinity,
      finding: () => ({ element: elementPath(element), coveredBy: elementPath(hit) }),
    });
  }
  for (const [index, first] of controls.entries()) {
    for (const second of controls.slice(index + 1)) {
      if (first.element.contains(second.element) || second.element.contains(first.element)) {
        continue;
      }
      const common = intersect(first.shown, second.shown);
      if (!hasArea(common)) continue;
      const share = area(common) / Math.min(area(first.shown), area(second.shown));
      if (share <= OVERLAP_SHARE) continue;
      found.push({
        severity: -share,
        finding: () => ({
          elements: [elementPath(first.element), elementPath(second.element)],
          share: round(share, 2),
        }),
      });
    }
  }
  return { checked, found: found.length, findings: worstFirst(found) };
}

function labelsOf(element: Element): Element[] {
  const labels = (element as Partial<HTMLInputElement>).labels;
  return labels ? [...labels] : [];
}

function checkZeroSize(seen: Collected): Check {
  return {
    checked: seen.sized,
    found: seen.empty.length,
    findings: seen.empty.slice(0, SHOWN).map(({ element, rect, style, nodes }) => ({
      element: elementPath(element),
      ...(parseFloat(style.fontSize) === 0
        ? { fontSize: 0 }
        : { width: round(rect.width, 1), height: round(rect.height, 1) }),
      ...(nodes.length > 0 ? { text: sample(nodes) } : {}),
    })),
  };
}

function pageOverflow(document: Document, wide: Collected['wide'], reader: PageReader) {
  const scroller = document.scrollingElement ?? document.documentElement;
  if (scroller.scrollWidth <= scroller.clientWidth + TOLERANCE) return undefined;
  const cutOff = hides(viewportOverflow(document, reader).overflowX);
  return {
    scrollWidth: scroller.scrollWidth,
    viewportWidth: scroller.clientWidth,
    ...(cutOff ? { cutOff: true as const } : {}),
    widest: wide
      .toSorted((a, b) => b.right - a.right)
      .slice(0, WIDEST_SHOWN)
      .map(({ element, right }) => ({ element: elementPath(element), right: Math.round(right) })),
  };
}

function worstFirst(found: readonly Found[]): Finding[] {
  return found
    .toSorted((a, b) => a.severity - b.severity)
    .slice(0, SHOWN)
    .map(({ finding }) => finding());
}

function intersect(a: Box, b: Box): Box {
  return {
    left: Math.max(a.left, b.left),
    top: Math.max(a.top, b.top),
    right: Math.min(a.right, b.right),
    bottom: Math.min(a.bottom, b.bottom),
  };
}

function hasArea(box: Box): boolean {
  return box.right > box.left && box.bottom > box.top;
}

function area(box: Box): number {
  return (box.right - box.left) * (box.bottom - box.top);
}

function sample(nodes: readonly Text[]): string {
  return sampleOf(nodes.map((node) => node.data).join(' '));
}

function sampleOf(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length > SAMPLE_LENGTH ? `${collapsed.slice(0, SAMPLE_LENGTH - 1)}…` : collapsed;
}

function round(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}
