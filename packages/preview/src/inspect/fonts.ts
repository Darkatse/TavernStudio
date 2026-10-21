import { BLANK_FONT_WOFF } from './blank-font';
import {
  GENERIC,
  normalizeFamily,
  normalizeStack,
  parseStack,
  quoteFamily,
  unquote,
  urlsIn,
} from './css-text';
import type { RuleRef } from './resources';

/**
 * The fonts a theme brings: the stylesheets it imports, the faces it
 * declares, and how the stacks it sets fare with the text on screen.
 */

/** Waiting for an import's faces to appear in the page's font set. */
const REGISTER_TIMEOUT_MS = 8000;

/** A font-family declaration of the theme's. */
export type FamilyDeclaration = RuleRef & { selector: string; value: string };

/** Text in view that computes one font. */
export interface ShownText {
  stack: string;
  weight: string;
  style: string;
  sample: string;
  elements: Element[];
}

/** Size requests for font files, so one heavy theme cannot fire hundreds. */
const MAX_SIZE_REQUESTS = 60;

const PROBE_SIZE = 32;

const BLANK_FAMILY = 'Studio Probe Blank';

export interface ImportScan extends RuleRef {
  url: string;
  /** Unknown when the host's answer cannot be read: no CORS, or unreachable. */
  status: 'loaded' | 'failed' | 'unknown';
  httpStatus?: number;
  cssBytes?: number;
  families: string[];
  faces: number;
  facesLoaded: number;
  /** Of the faces loaded, when every size could be read. */
  bytesLoaded?: number;
  /** The licence the stylesheet's first comment states. */
  licence?: string;
}

export interface FaceScan extends RuleRef {
  family: string;
  sources: string[];
  status: 'loaded' | 'loading' | 'unloaded' | 'error' | 'missing';
}

export interface StackScan {
  /** Normalized, as the elements compute it. */
  stack: string;
  declared: (RuleRef & { selector: string })[];
  elements: number;
  first: string;
  /**
   * How the first family is found: a generic family; a web font the page
   * loads; a web font that did not load; one only this computer has; or none.
   */
  provided: 'generic' | 'webfont' | 'failed' | 'installed' | 'missing';
  /** Characters on screen no family the stack names has a glyph for. */
  lacks: string;
  generic: boolean;
  /** Its text is all private-use code points: an icon font, which nothing else could stand in for. */
  icons: boolean;
}

export interface ReadImport {
  scan: ImportScan;
  faces: CSSFontFaceRule[];
}

export async function readImports(
  view: Window & typeof globalThis,
  imports: readonly (RuleRef & { url: string })[],
): Promise<ReadImport[]> {
  return Promise.all(
    imports.map(async (entry): Promise<ReadImport> => {
      const base = { ...entry, families: [], faces: 0, facesLoaded: 0 };
      let response: Response;
      try {
        response = await view.fetch(entry.url);
      } catch {
        return { scan: { ...base, status: 'unknown' }, faces: [] };
      }
      if (!response.ok) {
        return { scan: { ...base, status: 'failed', httpStatus: response.status }, faces: [] };
      }
      const text = await response.text();
      const parsed = new view.CSSStyleSheet();
      parsed.replaceSync(text.replace(/@import[^;]*;/g, ''));
      const faces = [...parsed.cssRules].filter(
        (rule): rule is CSSFontFaceRule => rule instanceof view.CSSFontFaceRule,
      );
      const licence = licenceIn(text);
      return {
        scan: {
          ...base,
          status: 'loaded',
          cssBytes: new Blob([text]).size,
          families: [
            ...new Set(faces.map((face) => unquote(face.style.getPropertyValue('font-family')))),
          ],
          faces: faces.length,
          ...(licence ? { licence } : {}),
        },
        faces,
      };
    }),
  );
}

/**
 * Waits, within a bound, for the page to have faces of every family: an
 * import the page fetched later than Studio declares them a little later.
 */
export async function registered(document: Document, families: readonly string[]): Promise<void> {
  const wanted = new Set(families.map(normalizeFamily));
  const deadline = Date.now() + REGISTER_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const present = new Set([...document.fonts].map((face) => normalizeFamily(face.family)));
    if ([...wanted].every((family) => present.has(family))) break;
    await new Promise((settle) => setTimeout(settle, 50));
  }
  await document.fonts.ready;
}

/** The faces of each import the page has loaded, and the size of their files. */
export async function countLoaded(
  view: Window & typeof globalThis,
  read: readonly ReadImport[],
): Promise<ImportScan[]> {
  let sizeRequests = 0;
  return Promise.all(
    read.map(async ({ scan, faces }): Promise<ImportScan> => {
      if (scan.status !== 'loaded') return scan;
      const loaded = faces.filter((face) => faceLoaded(view.document, face));
      const sources = loaded.flatMap((face) => {
        const url = urlsIn(face.style.getPropertyValue('src'))[0];
        return url ? [new URL(url, scan.url).href] : [];
      });
      let bytesLoaded: number | undefined = 0;
      if (sources.length > 0 && sizeRequests + sources.length <= MAX_SIZE_REQUESTS) {
        sizeRequests += sources.length;
        const sizes = await Promise.all(sources.map((url) => headLength(view, url)));
        bytesLoaded = sizes.every((each) => each !== undefined)
          ? sizes.reduce<number>((sum, each) => sum + (each ?? 0), 0)
          : undefined;
      } else if (sources.length > 0) {
        bytesLoaded = undefined;
      }
      return {
        ...scan,
        facesLoaded: loaded.length,
        ...(bytesLoaded === undefined ? {} : { bytesLoaded }),
      };
    }),
  );
}

async function headLength(
  view: Window & typeof globalThis,
  url: string,
): Promise<number | undefined> {
  try {
    const response = await view.fetch(url, { method: 'HEAD' });
    const length = Number(response.headers.get('content-length'));
    return response.ok && length > 0 ? length : undefined;
  } catch {
    return undefined;
  }
}

/** Whether the page's font set holds this face, loaded: matched by family, weight, style and range. */
function faceLoaded(document: Document, rule: CSSFontFaceRule): boolean {
  const family = normalizeFamily(rule.style.getPropertyValue('font-family'));
  const range = rule.style.getPropertyValue('unicode-range').replace(/\s+/g, '').toLowerCase();
  const weight = rule.style.getPropertyValue('font-weight') || 'normal';
  const style = rule.style.getPropertyValue('font-style') || 'normal';
  for (const face of document.fonts) {
    if (face.status !== 'loaded' || normalizeFamily(face.family) !== family) continue;
    const faceRange = face.unicodeRange.replace(/\s+/g, '').toLowerCase();
    if (range && faceRange !== range) continue;
    if (sameWeight(face.weight, weight) && face.style === style) return true;
  }
  return false;
}

function sameWeight(a: string, b: string): boolean {
  return weightNumber(a) === weightNumber(b);
}

function weightNumber(value: string): string {
  return value === 'normal' ? '400' : value === 'bold' ? '700' : value;
}

export function faceStatus(document: Document, family: string): FaceScan['status'] {
  const faces = [...document.fonts].filter(
    (face) => normalizeFamily(face.family) === normalizeFamily(family),
  );
  if (faces.length === 0) return 'missing';
  for (const status of ['loaded', 'loading', 'error'] as const) {
    if (faces.some((face) => face.status === status)) return status;
  }
  return 'unloaded';
}

/** The first comment's licence lines: font services put the font's licence there. */
function licenceIn(text: string): string | undefined {
  const comment = /\/\*([\s\S]*?)\*\//.exec(text)?.[1];
  if (!comment || !/licen[cs]e|ofl|版权|许可|授权|copyright/i.test(comment)) return undefined;
  const lines = comment
    .split('\n')
    .map((line) => line.replace(/^\s*\*?\s*/, '').trim())
    .filter((line) => /licen[cs]e|ofl|版权|许可|授权|copyright/i.test(line));
  const excerpt = lines.join(' ').replace(/\s+/g, ' ');
  return excerpt.length > 300 ? `${excerpt.slice(0, 300)}…` : excerpt;
}

/**
 * Each stack the sheets set and the page shows: whether its first family is
 * found, and which characters on screen it lacks. A character measures zero
 * wide when only the blank font, after the first family, has a glyph for it.
 */
export async function scanStacks(
  view: Window & typeof globalThis,
  families: readonly FamilyDeclaration[],
  shown: ReadonlyMap<string, ShownText>,
): Promise<StackScan[]> {
  const { document } = view;
  const declaredBy = new Map<string, StackScan['declared']>();
  for (const declaration of families) {
    const resolved = resolvedStack(view, declaration.selector, declaration.value);
    if (!resolved) continue;
    const list = declaredBy.get(resolved) ?? [];
    list.push(declaration);
    declaredBy.set(resolved, list);
  }
  const relevant = [...shown.values()].filter((entry) => declaredBy.has(entry.stack));
  if (relevant.length === 0) return [];

  const blank = new view.FontFace(BLANK_FAMILY, base64Bytes(BLANK_FONT_WOFF));
  await blank.load();
  document.fonts.add(blank);
  try {
    const context = document.createElement('canvas').getContext('2d');
    if (!context) return [];
    const byStack = new Map<
      string,
      { scan: StackScan; present: boolean; lacking: Set<string>; sampled: string[] }
    >();
    for (const entry of relevant) {
      const listed = parseStack(entry.stack);
      const named = listed.filter((family) => !GENERIC.has(family.toLowerCase()));
      const first = listed[0] ?? '';
      const found = byStack.get(entry.stack) ?? {
        scan: {
          stack: entry.stack,
          declared: declaredBy.get(entry.stack) ?? [],
          elements: 0,
          first,
          provided: 'generic' as const,
          lacks: '',
          generic: named.length < listed.length,
          icons: false,
        },
        present: false,
        lacking: new Set<string>(),
        sampled: [],
      };
      found.scan.elements += entry.elements.length;
      byStack.set(entry.stack, found);
      // Characters that have no width in any font, such as joiners and combining marks, say nothing.
      const characters = [...new Set(entry.sample)].filter(
        (character) => !/[\p{Cc}\p{Cf}\p{Mn}\p{Me}\p{Z}]/u.test(character),
      );
      found.sampled.push(...characters);
      if (named.length === 0 || characters.length === 0) continue;
      const weight = `${entry.style} ${entry.weight} ${PROBE_SIZE}px`;
      const text = characters.join('');
      await Promise.all(
        named.map((family) =>
          document.fonts.load(`${weight} ${quoteFamily(family)}`, text).catch(() => []),
        ),
      );
      const widths = (tried: readonly string[]) => {
        context.font = `${weight} ${[...tried.map(quoteFamily), `"${BLANK_FAMILY}"`].join(', ')}`;
        // A font the canvas cannot parse leaves the old one, and its widths say nothing.
        if (!context.font.includes(BLANK_FAMILY)) return undefined;
        return characters.map((character) => context.measureText(character).width);
      };
      if (!GENERIC.has(first.toLowerCase())) {
        const own = widths([first]);
        if (own?.some((width) => width > 0)) found.present = true;
      }
      widths(named)?.forEach((width, index) => {
        if (width === 0) found.lacking.add(characters[index] ?? '');
      });
    }
    return [...byStack.values()].map(({ scan, present, lacking, sampled }) => {
      const icons = sampled.length > 0 && sampled.every((character) => /\p{Co}/u.test(character));
      const lacks = [...lacking].join('');
      if (GENERIC.has(scan.first.toLowerCase())) return { ...scan, lacks, icons };
      const faces = [...document.fonts].filter(
        (face) => face !== blank && normalizeFamily(face.family) === normalizeFamily(scan.first),
      );
      const provided =
        faces.length > 0
          ? present || faces.some((face) => face.status === 'loaded')
            ? 'webfont'
            : 'failed'
          : present
            ? 'installed'
            : 'missing';
      return { ...scan, provided, lacks, icons };
    });
  } finally {
    document.fonts.delete(blank);
  }
}

/**
 * The stack a declaration computes to, read off an element it matches;
 * custom properties resolve there.
 */
function resolvedStack(
  view: Window & typeof globalThis,
  selector: string,
  value: string,
): string | undefined {
  const plain = selector.replace(
    /::?(?:before|after|first-line|first-letter|placeholder|marker)\b/g,
    '',
  );
  let element: Element | null = null;
  try {
    element = view.document.querySelector(plain || '*');
  } catch {
    return value.includes('var(') ? undefined : normalizeStack(value);
  }
  if (!element) return value.includes('var(') ? undefined : normalizeStack(value);
  if (!value.includes('var(')) return normalizeStack(value);
  return normalizeStack(view.getComputedStyle(element).fontFamily);
}

function base64Bytes(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}
