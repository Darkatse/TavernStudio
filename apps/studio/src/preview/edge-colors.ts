/** sRGB channels, 0–255. */
export type Rgb = readonly [red: number, green: number, blue: number];

/** The colors along a page's top and bottom edges, which the system bars carry on. */
export interface EdgeColors {
  top: Rgb;
  bottom: Rgb;
}

/** Points across an edge, as shares of the width, and how far in from it. */
const ACROSS = [0.25, 0.5, 0.75];
const INSET = 2;

let canvas: CanvasRenderingContext2D | undefined;
const images = new Map<string, HTMLImageElement>();

/**
 * Calls back with the page's edge colors now and whenever they may have
 * changed: when its root, body or styles change, which is how themes change
 * them, when the layers last found at an edge change, and when a background
 * image they use has loaded. Each edge is read at most once a frame.
 *
 * @param bands - How much of the page's top and bottom an image's color is
 *   taken from, in CSS pixels: the bars' own heights.
 */
export function observeEdgeColors(
  page: Window,
  bands: { top: number; bottom: number },
  onColors: (colors: EdgeColors) => void,
): () => void {
  const { documentElement, head, body } = page.document;
  let last: string | undefined;
  let pending = 0;
  const observer = new MutationObserver(() => {
    pending ||= requestAnimationFrame(read);
  });
  function read() {
    pending = 0;
    observer.disconnect();
    const layers = new Set<Element>([documentElement, body]);
    const loading = () => {
      pending ||= requestAnimationFrame(read);
    };
    const colors = {
      top: edgeColor(page, INSET, { from: 0, to: bands.top }, layers, loading),
      bottom: edgeColor(
        page,
        page.innerHeight - INSET,
        { from: page.innerHeight - bands.bottom, to: page.innerHeight },
        layers,
        loading,
      ),
    };
    for (const layer of layers) {
      observer.observe(layer, { attributes: true, attributeFilter: ['style', 'class'] });
    }
    observer.observe(head, { childList: true, subtree: true, characterData: true });
    const key = `${colors.top.join()} ${colors.bottom.join()}`;
    if (key === last) return;
    last = key;
    onColors(colors);
  }
  read();
  return () => {
    observer.disconnect();
    cancelAnimationFrame(pending);
  };
}

/**
 * The page's color a few pixels in from an edge, averaged across it. At each
 * point every element there is painted from the bottom up, as the browser
 * paints them: its background color, then a background image as the average
 * of its part that lies in the band, each at the element's opacity. Gradients,
 * borders and filters are left out.
 */
function edgeColor(
  page: Window,
  y: number,
  band: { from: number; to: number },
  layers: Set<Element>,
  loading: () => void,
): Rgb {
  const paint = (canvas ??= newCanvas());
  const total = [0, 0, 0];
  for (const share of ACROSS) {
    paint.globalAlpha = 1;
    paint.fillStyle = 'white';
    paint.fillRect(0, 0, 1, 1);
    for (const element of page.document
      .elementsFromPoint(page.innerWidth * share, y)
      .toReversed()) {
      layers.add(element);
      const style = page.getComputedStyle(element);
      paint.globalAlpha = Number(style.opacity);
      paint.fillStyle = style.backgroundColor;
      paint.fillRect(0, 0, 1, 1);
      const source = /url\("(.+?)"\)/.exec(style.backgroundImage)?.[1];
      if (source !== undefined) paintImage(paint, page, element, style, source, band, loading);
    }
    const [red, green, blue] = paint.getImageData(0, 0, 1, 1).data;
    total[0]! += red!;
    total[1]! += green!;
    total[2]! += blue!;
  }
  return total.map((channel) => Math.round(channel / ACROSS.length)) as unknown as Rgb;
}

function newCanvas(): CanvasRenderingContext2D {
  const element = document.createElement('canvas');
  element.width = element.height = 1;
  const paint = element.getContext('2d', { willReadFrequently: true })!;
  paint.imageSmoothingQuality = 'high';
  return paint;
}

/** Draws the part of the image in the band, shrunk to the one pixel: its average color. */
function paintImage(
  paint: CanvasRenderingContext2D,
  page: Window,
  element: Element,
  style: CSSStyleDeclaration,
  source: string,
  band: { from: number; to: number },
  loading: () => void,
) {
  let image = images.get(source);
  if (!image) {
    image = new Image();
    image.src = source;
    images.set(source, image);
  }
  if (!image.complete) {
    image.addEventListener('load', loading, { once: true });
    return;
  }
  if (image.naturalWidth === 0) return;
  const box = style.backgroundAttachment.startsWith('fixed')
    ? new DOMRect(0, 0, page.innerWidth, page.innerHeight)
    : element.getBoundingClientRect();
  const drawn = imageRect(box, style, image.naturalWidth, image.naturalHeight);
  const left = Math.max(drawn.left, 0);
  const right = Math.min(drawn.right, page.innerWidth);
  const top = Math.max(drawn.top, band.from);
  const bottom = Math.min(drawn.bottom, band.to);
  if (right <= left || bottom <= top) return;
  const scaleX = image.naturalWidth / drawn.width;
  const scaleY = image.naturalHeight / drawn.height;
  paint.drawImage(
    image,
    (left - drawn.left) * scaleX,
    (top - drawn.top) * scaleY,
    (right - left) * scaleX,
    (bottom - top) * scaleY,
    0,
    0,
    1,
    1,
  );
}

/** Where a background image lies, from the first layer's computed size and position. */
function imageRect(box: DOMRect, style: CSSStyleDeclaration, width: number, height: number) {
  const size = style.backgroundSize.split(',')[0]!.trim();
  let drawnWidth: number;
  let drawnHeight: number;
  if (size === 'cover' || size === 'contain') {
    const fit = size === 'cover' ? Math.max : Math.min;
    const scale = fit(box.width / width, box.height / height);
    drawnWidth = width * scale;
    drawnHeight = height * scale;
  } else {
    const [x = 'auto', y = 'auto'] = size.split(/\s+/);
    const across = length(x, box.width);
    const down = length(y, box.height);
    drawnWidth = across ?? (down === undefined ? width : (width * down) / height);
    drawnHeight = down ?? (height * drawnWidth) / width;
  }
  const [x = '0%', y = '0%'] = style.backgroundPosition.split(',')[0]!.trim().split(/\s+/);
  return new DOMRect(
    box.left + offset(x, box.width - drawnWidth),
    box.top + offset(y, box.height - drawnHeight),
    drawnWidth,
    drawnHeight,
  );
}

function length(value: string, whole: number): number | undefined {
  if (value === 'auto') return undefined;
  return value.endsWith('%') ? (parseFloat(value) / 100) * whole : parseFloat(value);
}

function offset(value: string, room: number): number {
  return value.endsWith('%') ? (parseFloat(value) / 100) * room : parseFloat(value);
}

/**
 * TauriTavern's rule for the glyphs on its system bars: dark over a color
 * whose relative luminance is above 0.179, light otherwise.
 */
export function wantsDarkGlyphs(color: Rgb): boolean {
  const [red, green, blue] = color.map((channel) => {
    const value = channel / 255;
    return value <= 0.040_45 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue > 0.179;
}
