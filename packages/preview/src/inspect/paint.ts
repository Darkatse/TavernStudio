/**
 * What a page paints, read from its computed styles for `inspect.audit`:
 * colors in sRGB, the backgrounds behind a point of the page, and the WCAG 2
 * contrast of text over them.
 *
 * The backgrounds follow axe-core's color-contrast rule: those of the
 * elements on the hit-test stack at the point are composited, top first,
 * until one is opaque. Below them all lies the canvas, white where the page
 * sets no background, and for a frame inside the page, the page around the
 * frame. A gradient paints colors between its stops; an image or a backdrop
 * filter could paint any.
 *
 * Opacity multiplies the alpha of each color by the opacity of its element
 * and its ancestors; text over a faded element's own background is then
 * composited over that background instead of through it, which understates
 * contrast slightly. Filters, blend modes, text shadows and pseudo-element
 * backgrounds are not seen; neither is the background of an element that
 * ignores pointer events, since hit testing passes over it.
 */

export interface Point {
  x: number;
  y: number;
}

/** A color in sRGB: channels 0–255, alpha 0–1. */
export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Computed styles and colors of a page, each read once, from the page's own realm. */
export interface PageReader {
  /** The vendor page; frames inside it, such as frontend cards, are part of what it paints. */
  page: Window;
  style(element: Element): CSSStyleDeclaration;
  /** A computed CSS color, in any color space, as sRGB. */
  color(value: string): Rgba;
  /** The opacity an element is painted with: its own times its ancestors'. */
  opacity(element: Element): number;
  /** An element's background color as painted, its opacity applied. */
  background(element: Element): Rgba;
}

/**
 * The backgrounds behind a point, top first. The last is opaque, unless the
 * layers lie on a backdrop that varies: an image, a gradient or a filtered
 * backdrop, of some color between two bounds.
 */
export interface Backdrop {
  layers: Rgba[];
  varies?: {
    element: Element;
    cause: 'background-image' | 'gradient' | 'backdrop-filter';
    bounds: readonly [Rgba, Rgba];
  };
}

const BLACK: Rgba = { r: 0, g: 0, b: 0, a: 1 };
const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 };
/** The colors in a computed value, which spells each as a function. */
const COLOR_FUNCTION = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^()]*\)/g;
/** Background images other than gradients. */
const IMAGE_FUNCTION = /\b(?:url|image|image-set|cross-fade|element|paint)\(/;

/** A reader for one inspection: a page changes its styles as it runs. */
export function pageReader(page: Window): PageReader {
  const styles = new Map<Element, CSSStyleDeclaration>();
  const opacities = new Map<Element, number>();
  const colors = new Map<string, Rgba>();
  // A computed color may be in any color space; a canvas converts it to sRGB.
  const context = new OffscreenCanvas(1, 1).getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('No 2D canvas to read colors with');
  context.globalCompositeOperation = 'copy';

  const reader: PageReader = {
    page,
    style(element) {
      let style = styles.get(element);
      if (!style) {
        const view = element.ownerDocument.defaultView;
        if (!view) throw new Error('The element is no longer in a page');
        style = view.getComputedStyle(element);
        styles.set(element, style);
      }
      return style;
    },
    color(value) {
      let color = colors.get(value);
      if (!color) {
        context.fillStyle = value;
        context.fillRect(0, 0, 1, 1);
        const [r = 0, g = 0, b = 0, a = 0] = context.getImageData(0, 0, 1, 1).data;
        color = { r, g, b, a: a / 255 };
        colors.set(value, color);
      }
      return color;
    },
    opacity(element) {
      let opacity = opacities.get(element);
      if (opacity === undefined) {
        const parent = element.parentElement;
        opacity = Number(reader.style(element).opacity) * (parent ? reader.opacity(parent) : 1);
        opacities.set(element, opacity);
      }
      return opacity;
    },
    background(element) {
      const color = reader.color(reader.style(element).backgroundColor);
      return { ...color, a: color.a * reader.opacity(element) };
    },
  };
  return reader;
}

/**
 * The frame showing a document inside the vendor page, such as a frontend
 * card; none for the page itself, whose own frame is Studio's.
 */
export function frameInPage(document: Document, page: Window): Element | null {
  const view = document.defaultView;
  return view && view !== page ? view.frameElement : null;
}

/**
 * What is painted behind an element's text at a point, or nothing when the
 * text does not show there: an opaque element in front of it hides it, or it
 * is clipped away.
 */
export function backdrop(holder: Element, point: Point, reader: PageReader): Backdrop | undefined {
  const stack = holder.ownerDocument.elementsFromPoint(point.x, point.y);
  const index = stack.indexOf(holder);
  if (index < 0) {
    // Hit testing passes over an element that ignores pointer events; any other is not painted here.
    if (reader.style(holder).pointerEvents !== 'none') return undefined;
  } else if (
    stack
      .slice(0, index)
      .some((above) => !holder.contains(above) && reader.background(above).a >= 1)
  ) {
    return undefined;
  }
  return paintBelow(holder.ownerDocument, paintedFrom(stack, holder), point, reader);
}

/**
 * The contrast of text over a backdrop, as a range when the backdrop varies:
 * over its darkest and its lightest bound. Where the text is lighter than one
 * and darker than the other, some backdrop between matches it, so the range
 * starts at 1. The backgrounds are those the range was taken over.
 */
export function textContrast(text: Rgba, behind: Backdrop) {
  const cases = (behind.varies?.bounds ?? [BLACK]).map((base) => {
    const background = behind.layers.reduceRight((below, layer) => over(layer, below), base);
    const foreground = luminance(over(text, background));
    const back = luminance(background);
    return { background, difference: foreground - back, ratio: contrast(foreground, back) };
  });
  const ratios = cases.map((each) => each.ratio);
  const [first, second] = cases;
  const crosses = first && second && Math.sign(first.difference) !== Math.sign(second.difference);
  return {
    min: crosses ? 1 : Math.min(...ratios),
    max: Math.max(...ratios),
    backgrounds: cases.map((each) => each.background),
  };
}

/** `#rrggbb`, or `#rrggbbaa` for a translucent color. */
export function hex({ r, g, b, a }: Rgba): string {
  const channels = a < 1 ? [r, g, b, a * 255] : [r, g, b];
  return `#${channels.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * The elements at and behind `element` on a hit-test stack, top first. An
 * element that ignores pointer events is missing from the stack; it is taken
 * to lie just above its nearest ancestor on it.
 */
function paintedFrom(stack: readonly Element[], element: Element): Element[] {
  const index = stack.indexOf(element);
  if (index >= 0) return stack.slice(index);
  const ancestor = stack.findIndex((each) => each.contains(element));
  return [element, ...stack.slice(Math.max(ancestor, 0))];
}

/**
 * Composites the backgrounds of `elements`, top first, down to the first
 * opaque one; below them all lies the canvas, then for a frame inside the
 * page, the page behind the frame.
 */
function paintBelow(
  document: Document,
  elements: readonly Element[],
  point: Point,
  reader: PageReader,
): Backdrop {
  const root = document.documentElement;
  // The root's background paints the canvas; when it has none, the body's does instead.
  const rootStyle = reader.style(root);
  const canvas =
    document.body &&
    rootStyle.backgroundImage === 'none' &&
    reader.color(rootStyle.backgroundColor).a === 0
      ? document.body
      : root;
  const layers: Rgba[] = [];
  for (const element of [...elements.filter((each) => each !== root && each !== canvas), canvas]) {
    const style = reader.style(element);
    if (style.backgroundImage !== 'none') {
      const bounds = gradientBounds(style, reader);
      const cause = bounds ? 'gradient' : 'background-image';
      return { layers, varies: { element, cause, bounds: bounds ?? [BLACK, WHITE] } };
    }
    const color = reader.background(element);
    if (color.a > 0) layers.push(color);
    if (color.a >= 1) return { layers };
    if (style.backdropFilter !== 'none') {
      return { layers, varies: { element, cause: 'backdrop-filter', bounds: [BLACK, WHITE] } };
    }
  }
  const frame = frameInPage(document, reader.page);
  // A browser paints the canvas of a page with no background white.
  if (!frame) return { layers: [...layers, WHITE] };
  const below = behindFrame(frame, point, reader);
  return { ...below, layers: [...layers, ...below.layers] };
}

/**
 * The darkest and the lightest color, channel by channel, that a background
 * of opaque gradients paints, since each color a gradient paints lies between
 * its stops; the gradients are taken to cover their element. Nothing is known
 * of an image, or of a gradient with a stop that lets what is below show.
 */
function gradientBounds(style: CSSStyleDeclaration, reader: PageReader): [Rgba, Rgba] | undefined {
  const image = style.backgroundImage;
  if (IMAGE_FUNCTION.test(image)) return undefined;
  const stops = (image.match(COLOR_FUNCTION) ?? []).map((value) => reader.color(value));
  if (/currentcolor/i.test(image)) stops.push(reader.color(style.color));
  if (stops.length === 0 || stops.some((stop) => stop.a < 1)) return undefined;
  const bound = (pick: (...values: number[]) => number): Rgba => ({
    r: pick(...stops.map((stop) => stop.r)),
    g: pick(...stops.map((stop) => stop.g)),
    b: pick(...stops.map((stop) => stop.b)),
    a: 1,
  });
  return [bound(Math.min), bound(Math.max)];
}

/** Where a frame's document starts in the page around it: the frame's content box. */
export function frameOrigin(frame: Element, reader: PageReader): Point {
  const rect = frame.getBoundingClientRect();
  const style = reader.style(frame);
  return {
    x: rect.left + frame.clientLeft + parseFloat(style.paddingLeft),
    y: rect.top + frame.clientTop + parseFloat(style.paddingTop),
  };
}

/** What the page paints behind a frame, at a point of the frame's document. */
function behindFrame(frame: Element, point: Point, reader: PageReader): Backdrop {
  const origin = frameOrigin(frame, reader);
  const at = { x: origin.x + point.x, y: origin.y + point.y };
  const document = frame.ownerDocument;
  const stack = document.elementsFromPoint(at.x, at.y);
  return paintBelow(document, paintedFrom(stack, frame), at, reader);
}

/** `top` composited over an opaque color. */
function over(top: Rgba, below: Rgba): Rgba {
  const mix = (upper: number, lower: number) => upper * top.a + lower * (1 - top.a);
  return { r: mix(top.r, below.r), g: mix(top.g, below.g), b: mix(top.b, below.b), a: 1 };
}

/** Relative luminance (WCAG 2). */
function luminance({ r, g, b }: Rgba): number {
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** An sRGB channel, 0–255, as linear light. */
function linear(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function contrast(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
