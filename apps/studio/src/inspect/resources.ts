import type { JsonObject } from '@tavern-studio/agent';
import {
  scanResources,
  type ImageScan,
  type ImportScan,
  type ResourceScan,
  type RuleRef,
  type StackScan,
} from '@tavern-studio/preview/inspect';
import type { JsonValue } from '@tavern-studio/workspace';
import { byteSize } from '../media/kinds';
import { lineFinder } from './lines';
import type { SourceNamer } from './sources';

const SHOWN = 12;
const DECLARATIONS_SHOWN = 3;
/** The densest screens are 3x: an image needs at most three pixels for each it covers. */
const SCREEN_SCALE = 3;
/** Larger than twice what a 3x screen needs is weight the page carries for nothing. */
const OVERSIZE = 2;
/** An inline image this large, and this much of the CSS, is better as a file. */
const INLINE_BYTES = 8 * 1024;
const INLINE_SHARE = 0.1;

interface Problem {
  /** Lower is worse. */
  severity: number;
  problem: string;
  source: string | undefined;
}

export async function inspectResources(page: Window, namer: SourceNamer): Promise<JsonValue> {
  const { document } = page;
  const sheets = [...document.styleSheets, ...document.adoptedStyleSheets].filter((sheet) =>
    namer.owns(sheet),
  );
  if (sheets.length === 0) {
    return { summary: 'The project places no stylesheet in the page, so it loads no resources.' };
  }
  const scan = await scanResources(page, sheets);
  const lines = await lineFinder(page, refsIn(scan));
  const at = (ref: RuleRef) => namer.sheet(ref.sheet, lines(ref));
  const name = (url: string) => named(url, page, namer);

  const problems: Problem[] = [
    ...scan.images.flatMap((image) => imageProblems(image, name, at)),
    ...scan.imports.flatMap((each) => importProblems(each, scan, at)),
    ...scan.stacks.flatMap((stack) => stackProblems(stack, at)),
    ...inlineProblems(scan, namer),
  ].toSorted((a, b) => a.severity - b.severity);

  const fontBytes = scan.imports.reduce((sum, each) => sum + (each.bytesLoaded ?? 0), 0);
  const importBytes = scan.imports.reduce((sum, each) => sum + (each.cssBytes ?? 0), 0);
  const inlineBytes = scan.inline.reduce((sum, each) => sum + each.bytes, 0);
  const failed = scan.images.filter((image) => image.status === 'failed').length;
  return {
    summary: [
      `${scan.images.length} images${failed > 0 ? ` (${failed} did not load)` : ''}`,
      `${scan.imports.length} font imports (${byteSize(importBytes)} of CSS${fontBytes > 0 ? `, ${byteSize(fontBytes)} of font files for what is on screen` : ''})`,
      `${scan.faces.length} @font-face rules`,
      `${scan.stacks.length} font stacks shown`,
      `${scan.inline.length} inline data URLs (${byteSize(inlineBytes)})`,
      `the theme's CSS is ${byteSize(scan.cssBytes)}`,
    ].join('; '),
    ...(scan.truncated
      ? { truncated: 'The page has more elements than are read: some went unchecked.' }
      : {}),
    problems: listed(
      problems.map(({ problem, source }) => ({ problem, ...(source ? { source } : {}) })),
    ),
    images: listed(scan.images.map((image) => describeImage(image, name, at))),
    fonts: {
      imports: listed(scan.imports.map((each) => describeImport(each, at))),
      faces: listed(
        scan.faces.map((face) => ({
          family: face.family,
          declared: at(face),
          status: face.status,
          sources: face.sources.map(name),
        })),
      ),
      stacks: listed(scan.stacks.map((stack) => describeStack(stack, at))),
    },
    inline: listed(
      scan.inline
        .toSorted((a, b) => b.bytes - a.bytes)
        .map((each) => ({
          type: each.type,
          bytes: byteSize(each.bytes),
          declared: namer.sheet(each.sheet, each.line),
        })),
    ),
  };
}

function refsIn(scan: ResourceScan): RuleRef[] {
  return [
    ...scan.images.flatMap((image) => image.declared),
    ...scan.imports,
    ...scan.faces,
    ...scan.stacks.flatMap((stack) => stack.declared),
  ];
}

/** Lists keep their worst or largest first; the rest are counted. */
function listed(items: JsonValue[]): JsonValue {
  if (items.length <= SHOWN) return items;
  return [...items.slice(0, SHOWN), `…and ${items.length - SHOWN} more`];
}

/** A URL as the theme would write it: a data URL by its type and size, a preview path as a path. */
function named(url: string, page: Window, namer: SourceNamer): string {
  if (url.startsWith('data:')) {
    const type = /^data:([^;,]*)/i.exec(url)?.[1] || 'text/plain';
    return `data:${type} (${byteSize(url.length)} inline)`;
  }
  const parsed = new URL(url);
  if (parsed.origin !== page.location.origin) return url;
  const file = namer.file(parsed);
  return `${decodeURIComponent(parsed.pathname)}${parsed.search}${file ? `, ${file}` : ''}`;
}

function declaredAt(image: ImageScan, at: (ref: RuleRef) => string): string[] {
  const shown = image.declared
    .slice(0, DECLARATIONS_SHOWN)
    .map((each) => `${at(each)} (${each.selector} { ${each.property} })`);
  const more = image.declared.length - shown.length;
  return more > 0 ? [...shown, `and ${more} more`] : shown;
}

function describeImage(
  image: ImageScan,
  name: (url: string) => string,
  at: (ref: RuleRef) => string,
): JsonObject {
  return {
    url: name(image.url),
    declared: declaredAt(image, at),
    status: image.status,
    ...(image.natural ? { size: dimensions(image.natural) } : {}),
    shown:
      image.shown === 0
        ? 'nowhere on this screen'
        : `by ${image.shown} ${image.shown === 1 ? 'box' : 'boxes'}${image.largest ? `, at most ${dimensions(image.largest)}` : ''}`,
    ...(image.bytes === undefined ? {} : { bytes: byteSize(image.bytes) }),
  };
}

function imageProblems(
  image: ImageScan,
  name: (url: string) => string,
  at: (ref: RuleRef) => string,
): Problem[] {
  const [first] = image.declared;
  const source = first ? at(first) : undefined;
  if (image.status === 'failed') {
    const why =
      image.httpStatus === undefined
        ? 'its host refused it, answered with an error, or could not be reached'
        : `the preview answered ${image.httpStatus}`;
    return [{ severity: 0, problem: `${name(image.url)} did not load: ${why}.`, source }];
  }
  const { natural, largest } = image;
  // A vector image is drawn at whatever size it shows.
  if (image.type === 'image/svg+xml') return [];
  if (!natural || !largest || largest.width === 0 || largest.height === 0) return [];
  const needed = {
    width: Math.ceil(largest.width * SCREEN_SCALE),
    height: Math.ceil(largest.height * SCREEN_SCALE),
  };
  if (natural.width <= needed.width * OVERSIZE || natural.height <= needed.height * OVERSIZE) {
    return [];
  }
  const weight = image.bytes === undefined ? '' : ` and ${byteSize(image.bytes)}`;
  return [
    {
      severity: 7,
      problem: `${name(image.url)} is ${dimensions(natural)}${weight}, but shows at most ${dimensions(largest)}: a 3x screen needs ${dimensions(needed)}.`,
      source,
    },
  ];
}

function describeImport(each: ImportScan, at: (ref: RuleRef) => string): JsonObject {
  return {
    url: each.url,
    declared: at(each),
    status: each.status,
    ...(each.httpStatus === undefined ? {} : { httpStatus: each.httpStatus }),
    ...(each.families.length > 0 ? { families: each.families } : {}),
    ...(each.status === 'loaded'
      ? {
          faces: each.faces,
          facesLoaded: each.facesLoaded,
          css: byteSize(each.cssBytes ?? 0),
          ...(each.bytesLoaded === undefined
            ? {}
            : { fontFilesLoaded: byteSize(each.bytesLoaded) }),
        }
      : {}),
    ...(each.licence ? { licence: each.licence } : {}),
  };
}

function importProblems(
  each: ImportScan,
  scan: ResourceScan,
  at: (ref: RuleRef) => string,
): Problem[] {
  const source = at(each);
  if (each.status === 'failed') {
    return [
      { severity: 1, problem: `@import ${each.url} failed with HTTP ${each.httpStatus}.`, source },
    ];
  }
  if (each.status === 'unknown') {
    return [
      {
        severity: 1,
        problem: `@import ${each.url} could not be read: its host is unreachable or sends no CORS header, so whether the page got its fonts is unknown.`,
        source,
      },
    ];
  }
  const unused = each.families.filter((family) => scan.unused.includes(family.toLowerCase()));
  if (unused.length === 0 || unused.length < each.families.length) return [];
  return [
    {
      severity: 6,
      problem: `@import ${each.url} brings ${byteSize(each.cssBytes ?? 0)} of CSS for ${unused.map((family) => `"${family}"`).join(', ')}, which no rule names.`,
      source,
    },
  ];
}

function describeStack(stack: StackScan, at: (ref: RuleRef) => string): JsonObject {
  return {
    stack: stack.stack,
    declared: stack.declared
      .slice(0, DECLARATIONS_SHOWN)
      .map((each) => `${at(each)} (${each.selector})`),
    elements: stack.elements,
    first: stack.first,
    found: stack.provided,
    ...(stack.lacks ? { lacks: stack.lacks } : {}),
    generic: stack.generic,
  };
}

function stackProblems(stack: StackScan, at: (ref: RuleRef) => string): Problem[] {
  // An icon font's glyphs have no stand-in: a fallback would draw other characters.
  if (stack.icons || stack.provided === 'generic') return [];
  const [first] = stack.declared;
  const source = first ? at(first) : undefined;
  const family = `"${stack.first}"`;
  const shown = `by ${stack.elements} ${stack.elements === 1 ? 'element' : 'elements'}`;
  // Each family in a normalized stack is quoted or generic, so commas only separate them.
  const alone = stack.stack.split(',').length === 1;
  const fallback = stack.generic
    ? 'the generic family at the end of the stack'
    : "the browser's default font";
  const problems: Problem[] = [];
  if (stack.provided === 'failed') {
    problems.push({
      severity: 2,
      problem: `${family}, first in ${stack.stack}, is a web font that did not load: text shown ${shown} uses the next family that has its characters.`,
      source,
    });
  } else if (alone && stack.provided === 'missing') {
    problems.push({
      severity: 2,
      problem: `${family} is neither loaded by the theme nor installed here: text shown ${shown} uses the browser's default font.`,
      source,
    });
  } else if (alone && stack.provided === 'installed') {
    problems.push({
      severity: 3,
      problem: `${family} is not loaded by the theme: it shows only where it is installed, as on this computer; elsewhere text shown ${shown} uses the browser's default font.`,
      source,
    });
  }
  if (stack.lacks) {
    problems.push({
      severity: 4,
      problem: `${alone ? `${family} has no glyph` : `None of the families in ${stack.stack} has a glyph`} for ${quoted(stack.lacks)}, shown ${shown}: those characters use ${fallback}.`,
      source,
    });
  }
  if (!stack.generic) {
    problems.push({
      severity: 5,
      problem: `${stack.stack} ends without a generic family, such as serif or sans-serif: if its fonts do not load, text falls back to the browser's default font.`,
      source,
    });
  }
  return problems;
}

function inlineProblems(scan: ResourceScan, namer: SourceNamer): Problem[] {
  return scan.inline
    .filter(
      (each) =>
        each.type.startsWith('image/') &&
        each.type !== 'image/svg+xml' &&
        each.bytes >= INLINE_BYTES &&
        each.bytes >= scan.cssBytes * INLINE_SHARE,
    )
    .map((each) => ({
      severity: 8,
      problem: `An inline ${each.type} of ${byteSize(each.bytes)} makes up ${Math.round((each.bytes / scan.cssBytes) * 100)}% of the theme's CSS.`,
      source: namer.sheet(each.sheet, each.line),
    }));
}

function quoted(characters: string): string {
  const each = Array.from(characters);
  return `"${each.slice(0, 24).join('')}"${each.length > 24 ? ' and more' : ''}`;
}

function dimensions({ width, height }: { width: number; height: number }): string {
  return `${Math.round(width)}×${Math.round(height)}`;
}
