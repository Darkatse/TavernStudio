/**
 * The screenshot fallback (docs/Agent.md §5): snapdom renders the vendor page,
 * or one element of it, from its DOM, in the page's own realm. Built as an ES
 * module served at /_studio/capture.js and imported only when a screenshot
 * needs it, so its weight stays off every page load.
 *
 * Known distortions on SillyTavern (P0 V7): background layers dropped or
 * darkened, `<q>` quotes doubled, text rewrapped.
 */
import { snapdom } from '@zumer/snapdom';
import { CAPTURE_IMAGE, type PageCapture } from './host';

export async function capture(element: Element | undefined): Promise<PageCapture> {
  // The page background is painted through the root element, so the whole page captures from it.
  const target = element ?? document.documentElement;
  const { width } = target.getBoundingClientRect();
  const result = await snapdom(target, { cache: 'disabled', dpr: 1 });
  let blob: Blob;
  try {
    blob = await result.toBlob({
      type: CAPTURE_IMAGE.format,
      quality: CAPTURE_IMAGE.quality,
      ...(width > CAPTURE_IMAGE.maxWidth ? { width: CAPTURE_IMAGE.maxWidth } : {}),
    });
  } catch (error) {
    const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    throw new Error(
      `The browser would not draw snapdom's SVG of the page (${reason}). ${svgProblem(result.url)}`,
      { cause: error },
    );
  }
  return { blob, warnings: [...new Set(result.warnings.map((warning) => warning.code))] };
}

/**
 * Why snapdom's SVG would not decode as an image. A browser refuses an SVG
 * image that is not well-formed XML, and says no more than that; its XML
 * parser says where.
 */
function svgProblem(url: string): string {
  const comma = url.indexOf(',');
  const data = url.slice(comma + 1);
  const svg = url.slice(0, comma).endsWith(';base64')
    ? new TextDecoder().decode(Uint8Array.from(atob(data), (char) => char.charCodeAt(0)))
    : decodeURIComponent(data);
  const size = `${Math.round(svg.length / 1024)} KB`;
  const report = new DOMParser()
    .parseFromString(svg, 'image/svg+xml')
    .querySelector('parsererror')?.textContent;
  if (!report)
    return `The SVG (${size}) is well-formed XML, so the browser refused it for another reason, such as its size.`;
  const place = /line (\d+) at column (\d+): ([^\n]*)/.exec(report);
  if (!place) return `The SVG (${size}) is not well-formed XML: ${report.trim().slice(0, 300)}`;
  const [, line = '1', column = '1', message = ''] = place;
  const text = svg.split('\n')[Number(line) - 1] ?? '';
  const at = Number(column) - 1;
  return `The SVG (${size}) is not well-formed XML: ${message.trim()} At line ${line}, column ${column}: …${text.slice(Math.max(0, at - 160), at)}⟪here⟫${text.slice(at, at + 80)}…`;
}
