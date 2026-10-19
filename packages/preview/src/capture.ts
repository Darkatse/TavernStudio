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

export async function capture(selector: string | undefined): Promise<PageCapture> {
  // The page background is painted through the root element, so the whole page captures from it.
  const target =
    selector === undefined ? document.documentElement : document.querySelector(selector);
  if (!target) throw new Error(`No element matches ${selector}`);
  const { width } = target.getBoundingClientRect();
  const result = await snapdom(target, { cache: 'disabled', dpr: 1 });
  const blob = await result.toBlob({
    type: CAPTURE_IMAGE.format,
    quality: CAPTURE_IMAGE.quality,
    ...(width > CAPTURE_IMAGE.maxWidth ? { width: CAPTURE_IMAGE.maxWidth } : {}),
  });
  return { blob, warnings: [...new Set(result.warnings.map((warning) => warning.code))] };
}
