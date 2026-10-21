import {
  dataBytes,
  normalizeFamily,
  normalizeStack,
  resolve,
  unescaped,
  unquote,
  URL_PATTERN,
  urlsIn,
} from './css-text';
import {
  countLoaded,
  faceStatus,
  readImports,
  registered,
  scanStacks,
  type FaceScan,
  type FamilyDeclaration,
  type ImportScan,
  type ShownText,
  type StackScan,
} from './fonts';

/**
 * What a theme pulls into the page besides its CSS: the images its rules
 * name, the font stylesheets it imports, the faces it declares, and how the
 * font stacks it sets fare with the text on screen. Only the sheets given are
 * read, so a vendor's own images and fonts stay out of it.
 */

/** Properties whose computed values carry the images an element paints. */
const IMAGE_PROPERTIES = [
  'background-image',
  'mask-image',
  '-webkit-mask-image',
  'border-image-source',
  'list-style-image',
];

const PSEUDOS = ['::before', '::after'] as const;

/** As in the audit: the cap leaves what is deepest in the page unchecked. */
const MAX_ELEMENTS = 10_000;

/** Text taken from each stack to probe, enough to meet every script on screen. */
const SAMPLE_LENGTH = 400;

const LOAD_TIMEOUT_MS = 8000;

/** A rule of a given sheet, with which the caller names where it is. */
export interface RuleRef {
  sheet: CSSStyleSheet;
  rule: CSSRule;
}

export interface ImageScan {
  /** Absolute, as the page resolves it; `data:` URLs whole. */
  url: string;
  /** The MIME type, when the URL or the response names it. */
  type?: string;
  declared: (RuleRef & { selector: string; property: string })[];
  status: 'loaded' | 'failed';
  natural?: { width: number; height: number };
  /** Elements and pseudo-elements that paint it now. */
  shown: number;
  /** The largest box it paints in now, in CSS pixels. */
  largest?: { width: number; height: number };
  bytes?: number;
  /** The status of a same-origin URL that failed. */
  httpStatus?: number;
}

export interface InlineScan {
  sheet: CSSStyleSheet;
  /** 1-based, in the sheet's text. */
  line: number;
  type: string;
  bytes: number;
}

export interface ResourceScan {
  images: ImageScan[];
  imports: ImportScan[];
  faces: FaceScan[];
  stacks: StackScan[];
  inline: InlineScan[];
  /** Imported families no rule in the sheets names. */
  unused: string[];
  /** Of the sheets' text. */
  cssBytes: number;
  truncated: boolean;
}

interface Collected {
  urls: Map<string, ImageScan['declared']>;
  imports: (RuleRef & { url: string })[];
  faces: (RuleRef & { family: string; sources: string[] })[];
  families: FamilyDeclaration[];
  /** Every value the sheets declare, lowercased, to find a family named anywhere. */
  values: string[];
}

export async function scanResources(
  page: Window,
  sheets: readonly CSSStyleSheet[],
): Promise<ResourceScan> {
  const view = page as Window & typeof globalThis;
  const { document } = view;
  const collected = collect(view, sheets);
  const texts = new Map(sheets.map((sheet) => [sheet, sheetText(sheet)]));
  const walked = walk(view, document);

  const imagesScanned = scanImages(view, collected.urls, walked.images);
  // Fetching each import, here and in the page, comes before reading the fonts it declares.
  const read = await readImports(view, collected.imports);
  await registered(
    document,
    read.flatMap((each) => each.scan.families),
  );
  const stacks = await scanStacks(view, collected.families, walked.text);
  // After the probe, which loads what the text on screen needs, as the page does.
  const imports = await countLoaded(view, read);
  const images = await imagesScanned;
  const imported = new Set(imports.flatMap((each) => each.families.map(normalizeFamily)));
  const named = collected.values.join('\n');
  return {
    images,
    imports,
    faces: collected.faces.map((face) => ({ ...face, status: faceStatus(document, face.family) })),
    stacks,
    inline: [...texts].flatMap(([sheet, text]) => inlineData(sheet, text)),
    unused: [...imported].filter((family) => !named.includes(family)),
    cssBytes: [...texts.values()].reduce((sum, text) => sum + new Blob([text]).size, 0),
    truncated: walked.truncated,
  };
}

/** The sheets' rules, nested ones and those under at-rules included, whatever their conditions. */
function collect(view: Window & typeof globalThis, sheets: readonly CSSStyleSheet[]): Collected {
  const found: Collected = { urls: new Map(), imports: [], faces: [], families: [], values: [] };
  const visit = (rules: CSSRuleList, sheet: CSSStyleSheet, parent: string | undefined) => {
    for (const rule of rules) {
      if (rule instanceof view.CSSImportRule) {
        found.imports.push({ sheet, rule, url: rule.href ? resolve(rule.href, sheet) : '' });
      } else if (rule instanceof view.CSSFontFaceRule) {
        const family = unquote(rule.style.getPropertyValue('font-family'));
        const src = rule.style.getPropertyValue('src');
        found.faces.push({
          sheet,
          rule,
          family,
          sources: urlsIn(src).map((url) => resolve(url, sheet)),
        });
      } else if (rule instanceof view.CSSStyleRule) {
        const selector = parent ? nested(rule.selectorText, parent) : rule.selectorText;
        declarations(rule.style, sheet, rule, selector, found);
        visit(rule.cssRules, sheet, selector);
      } else if ('cssRules' in rule) {
        visit((rule as CSSGroupingRule).cssRules, sheet, parent);
      }
    }
  };
  for (const sheet of sheets) {
    try {
      visit(sheet.cssRules, sheet, undefined);
    } catch {
      // A cross-origin sheet without CORS keeps its rules to itself.
    }
  }
  return found;
}

function declarations(
  style: CSSStyleDeclaration,
  sheet: CSSStyleSheet,
  rule: CSSRule,
  selector: string,
  found: Collected,
): void {
  for (let index = 0; index < style.length; index++) {
    const property = style.item(index);
    const value = style.getPropertyValue(property);
    found.values.push(value.toLowerCase());
    for (const url of urlsIn(value)) {
      const absolute = resolve(url, sheet);
      const uses = found.urls.get(absolute) ?? [];
      uses.push({ sheet, rule, selector, property });
      found.urls.set(absolute, uses);
    }
  }
  const family = style.getPropertyValue('font-family');
  if (family) found.families.push({ sheet, rule, selector, value: family });
}

interface Walked {
  /** Image URL → the boxes painting it. */
  images: Map<string, { width: number; height: number }[]>;
  /** Text holders in view, by the font they compute. */
  text: Map<string, ShownText>;
  truncated: boolean;
}

/** One pass over the page's elements in their pseudo-elements, skipping what is not rendered. */
function walk(view: Window & typeof globalThis, document: Document): Walked {
  const walked: Walked = { images: new Map(), text: new Map(), truncated: false };
  const { innerWidth, innerHeight } = view;
  const walker = document.createTreeWalker(document.documentElement, view.NodeFilter.SHOW_ELEMENT, {
    acceptNode: (node) =>
      view.getComputedStyle(node as Element).display === 'none'
        ? view.NodeFilter.FILTER_REJECT
        : view.NodeFilter.FILTER_ACCEPT,
  });
  let visited = 0;
  for (let node: Node | null = walker.currentNode; node; node = walker.nextNode()) {
    if (visited++ === MAX_ELEMENTS) {
      walked.truncated = true;
      break;
    }
    const element = node as Element;
    const style = view.getComputedStyle(element);
    let rect: DOMRect | undefined;
    const box = () => (rect ??= element.getBoundingClientRect());
    paints(style, walked.images, () => box());
    for (const pseudo of PSEUDOS) {
      const own = view.getComputedStyle(element, pseudo);
      if (own.content === 'none' || own.content === 'normal') continue;
      paints(own, walked.images, () => pseudoBox(own, box()));
      const text = contentText(own.content);
      if (text) addText(walked.text, own, element, text);
    }
    const own = ownText(element);
    if (!own) continue;
    const shown = box();
    if (
      shown.width === 0 ||
      shown.bottom < 0 ||
      shown.top > innerHeight ||
      shown.right < 0 ||
      shown.left > innerWidth ||
      !element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
    ) {
      continue;
    }
    addText(walked.text, style, element, own);
  }
  return walked;
}

function paints(
  style: CSSStyleDeclaration,
  images: Walked['images'],
  box: () => { width: number; height: number },
): void {
  // `content: url()` replaces an element's content too, as themes swap avatars.
  const values = [
    ...IMAGE_PROPERTIES.map((property) => style.getPropertyValue(property)),
    style.content,
  ];
  for (const value of values) {
    if (!value.includes('url(')) continue;
    for (const url of urlsIn(value)) {
      const boxes = images.get(url) ?? [];
      boxes.push(box());
      images.set(url, boxes);
    }
  }
}

/** A pseudo-element has no box of its own to read: its sizes when set, else its element's. */
function pseudoBox(
  style: CSSStyleDeclaration,
  element: DOMRect,
): { width: number; height: number } {
  const width = parseFloat(style.width);
  const height = parseFloat(style.height);
  return {
    width: Number.isFinite(width) ? width : element.width,
    height: Number.isFinite(height) ? height : element.height,
  };
}

function addText(
  text: Walked['text'],
  style: CSSStyleDeclaration,
  element: Element,
  sample: string,
): void {
  const stack = normalizeStack(style.fontFamily);
  const key = `${stack}|${style.fontWeight}|${style.fontStyle}`;
  const entry = text.get(key) ?? {
    stack,
    weight: style.fontWeight,
    style: style.fontStyle,
    sample: '',
    elements: [],
  };
  entry.elements.push(element);
  if (entry.sample.length < SAMPLE_LENGTH) entry.sample += sample.slice(0, SAMPLE_LENGTH);
  text.set(key, entry);
}

/** The text an element holds itself, not that of its children. */
function ownText(element: Element): string {
  let text = '';
  for (const child of element.childNodes) {
    if (child.nodeType === 3) text += child.textContent ?? '';
  }
  return text.trim();
}

/** The strings of a computed `content`, which is how a pseudo-element shows text. */
function contentText(content: string): string {
  return [...content.matchAll(/"((?:[^"\\]|\\.)*)"/g)]
    .map((match) => (match[1] ?? '').replace(/\\(.)/g, '$1'))
    .join('')
    .trim();
}

async function scanImages(
  view: Window & typeof globalThis,
  urls: Collected['urls'],
  painted: Walked['images'],
): Promise<ImageScan[]> {
  return Promise.all(
    [...urls].map(async ([url, declared]): Promise<ImageScan> => {
      const boxes = painted.get(url) ?? [];
      const largest = boxes.reduce<{ width: number; height: number } | undefined>(
        (most, each) =>
          !most || each.width * each.height > most.width * most.height ? each : most,
        undefined,
      );
      const [loaded, size] = await Promise.all([loadImage(view, url), imageBytes(view, url)]);
      return {
        url,
        ...(size.type ? { type: size.type } : {}),
        declared,
        status: loaded ? 'loaded' : 'failed',
        ...(loaded ? { natural: loaded } : {}),
        shown: boxes.length,
        ...(largest ? { largest } : {}),
        ...(size.bytes === undefined ? {} : { bytes: size.bytes }),
        ...(size.status === undefined || size.status < 400 ? {} : { httpStatus: size.status }),
      };
    }),
  );
}

function loadImage(
  view: Window & typeof globalThis,
  url: string,
): Promise<{ width: number; height: number } | undefined> {
  return new Promise((done) => {
    const image = new view.Image();
    const timer = setTimeout(() => done(undefined), LOAD_TIMEOUT_MS);
    image.addEventListener('load', () => {
      clearTimeout(timer);
      done({ width: image.naturalWidth, height: image.naturalHeight });
    });
    image.addEventListener('error', () => {
      clearTimeout(timer);
      done(undefined);
    });
    image.src = url;
  });
}

/** A `data:` URL's decoded size; another's from its headers, when the page may read them. */
async function imageBytes(
  view: Window & typeof globalThis,
  url: string,
): Promise<{ bytes?: number; status?: number; type?: string }> {
  if (url.startsWith('data:')) {
    const type = /^data:([^;,]*)/i.exec(url)?.[1];
    return { bytes: dataBytes(url), ...(type ? { type: type.toLowerCase() } : {}) };
  }
  try {
    const response = await view.fetch(url, { method: 'HEAD' });
    const length = Number(response.headers.get('content-length'));
    const type = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
    return {
      status: response.status,
      ...(length > 0 ? { bytes: length } : {}),
      ...(type ? { type } : {}),
    };
  } catch {
    return /\.svg(?:[?#]|$)/i.test(url) ? { type: 'image/svg+xml' } : {};
  }
}

function inlineData(sheet: CSSStyleSheet, text: string): InlineScan[] {
  return [...text.matchAll(URL_PATTERN)].flatMap((match) => {
    const url = unescaped(match);
    if (!url.startsWith('data:')) return [];
    return [
      {
        sheet,
        line: text.slice(0, match.index).split('\n').length,
        type: /^data:([^;,]*)/i.exec(url)?.[1] || 'text/plain',
        bytes: dataBytes(url),
      },
    ];
  });
}

/** The text of a sheet in the page: a `<style>`'s own. */
function sheetText(sheet: CSSStyleSheet): string {
  const owner = sheet.ownerNode as Element | null;
  if (owner?.localName === 'style') return owner.textContent ?? '';
  try {
    return [...sheet.cssRules].map((rule) => rule.cssText).join('\n');
  } catch {
    return '';
  }
}

function nested(selector: string, parent: string): string {
  return selector.includes('&')
    ? selector.replaceAll('&', `:is(${parent})`)
    : `:is(${parent}) ${selector}`;
}
