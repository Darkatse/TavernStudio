import { CAPTURE_IMAGE } from '@tavern-studio/preview';
import { useSyncExternalStore } from 'react';
import { previewSession } from './session';

/** A screenshot of the preview, encoded for the model. */
export interface PreviewShot {
  blob: Blob;
  method: 'element-capture' | 'snapdom';
  warnings: readonly string[];
  /** The part of the page the image shows, in the page's viewport coordinates. */
  region: DOMRect;
}

/** A label to draw on a screenshot over a box of the page, in the page's viewport coordinates. */
export interface Mark {
  label: string;
  rect: DOMRect;
}

/**
 * The ink of a mark's label. Marks take Studio's accent (docs/UI.md §3), an
 * amber light enough in both schemes for dark ink to read on it.
 */
const MARK_INK = 'oklch(0.2 0.01 70)';
const MARK_FONT = '600 12px system-ui, sans-serif';

// Element Capture is newer than TypeScript's DOM types.
interface RestrictableTrack extends MediaStreamTrack {
  restrictTo(target: unknown): Promise<void>;
}
declare const RestrictionTarget: { fromElement(element: Element): Promise<unknown> };

/** The shared tab: its track, a video playing it, and the frame it is restricted to. */
interface Share {
  track: RestrictableTrack;
  video: HTMLVideoElement;
  frame?: HTMLIFrameElement;
}

/** How long to wait for the frame of a newly targeted View before using what the stream holds. */
const FRAME_WAIT_MS = 500;

/**
 * Screenshots of the preview for the Agent (docs/Agent.md §5).
 *
 * Element Capture shares Studio's own tab, restricted to the View's frame, so
 * a screenshot is exactly what the browser paints. Sharing needs the author's
 * click, so the Agent cannot start it; once shared, the stream stays open and
 * a screenshot reads its latest frame. Without it, or while the preview is not
 * on screen, the page renders itself from its DOM with snapdom.
 */
class PreviewCapture {
  #share: Share | undefined;
  readonly #listeners = new Set<() => void>();

  /** Whether this browser has Element Capture at all. */
  readonly supported = 'RestrictionTarget' in globalThis;

  /** Whether screenshots come from the shared tab. */
  get shared(): boolean {
    return this.#share !== undefined;
  }

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  /** Shares the tab for Element Capture. Call it from the author's click: the browser asks them. */
  async share(): Promise<void> {
    if (this.#share) return;
    // Offers this tab first, so the author confirms rather than picks.
    const options: DisplayMediaStreamOptions & { preferCurrentTab: boolean } = {
      video: true,
      preferCurrentTab: true,
    };
    const stream = await navigator.mediaDevices.getDisplayMedia(options);
    const [track] = stream.getVideoTracks();
    if (!track) throw new Error('The shared tab has no video');
    const video = document.createElement('video');
    video.muted = true;
    video.srcObject = stream;
    await video.play();
    // The author can stop sharing from the browser's own controls.
    track.addEventListener('ended', () => {
      this.#share = undefined;
      this.#notify();
    });
    this.#share = { track: track as RestrictableTrack, video };
    this.#notify();
  }

  /** The page, or one element of it, which may sit in a frame inside the page. */
  async take(element: Element | undefined): Promise<PreviewShot> {
    const page = previewSession.page();
    if (!page) throw new Error('The preview is still starting');
    if (this.#share && onScreen(page.frame))
      return this.#fromScreen(this.#share, page.frame, element);
    const view = page.frame.contentWindow;
    if (!view) throw new Error('The preview frame has no page');
    const shot = await page.agent.capture(element);
    // snapdom renders the whole box, on screen or not.
    const region = rectInPage(element ?? view.document.documentElement, view);
    return { blob: shot.blob, method: 'snapdom', warnings: shot.warnings, region };
  }

  async #fromScreen(
    share: Share,
    frame: HTMLIFrameElement,
    element: Element | undefined,
  ): Promise<PreviewShot> {
    // Each View has its own frame; the stream follows the one on screen.
    if (share.frame !== frame) {
      await share.track.restrictTo(await RestrictionTarget.fromElement(frame));
      share.frame = frame;
      await nextFrame(share.video);
    }
    const { video } = share;
    const page = frame.contentWindow;
    if (!page) throw new Error('The preview frame has no page');
    // The frame is scaled onto the stage; the stream holds it at its painted size.
    const ratio = video.videoWidth / page.innerWidth;
    let region = new DOMRect(0, 0, page.innerWidth, page.innerHeight);
    if (element !== undefined) {
      const rect = rectInPage(element, page);
      const left = Math.max(0, rect.left);
      const top = Math.max(0, rect.top);
      const right = Math.min(page.innerWidth, rect.right);
      const bottom = Math.min(page.innerHeight, rect.bottom);
      if (right <= left || bottom <= top) {
        throw new Error(
          'The element is outside the visible part of the page; scroll it into view first',
        );
      }
      region = new DOMRect(left, top, right - left, bottom - top);
    }
    const source = {
      x: region.x * ratio,
      y: region.y * ratio,
      width: region.width * ratio,
      height: region.height * ratio,
    };
    const scale = Math.min(1, CAPTURE_IMAGE.maxWidth / source.width);
    const canvas = new OffscreenCanvas(
      Math.round(source.width * scale),
      Math.round(source.height * scale),
    );
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No canvas to draw the screenshot on');
    context.drawImage(
      video,
      source.x,
      source.y,
      source.width,
      source.height,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    const blob = await canvas.convertToBlob({
      type: CAPTURE_IMAGE.mimeType,
      quality: CAPTURE_IMAGE.quality,
    });
    return { blob, method: 'element-capture', warnings: [], region };
  }

  #notify(): void {
    for (const listener of this.#listeners) listener();
  }
}

/**
 * Draws marks over a screenshot (docs/Agent.md §4, set-of-marks): a box
 * around each, and its label at the box's top left. Studio draws them on the
 * image, not into the page, so the page stays as its code made it. A mark
 * outside the image, or around all of it, is left out.
 */
export async function drawMarks(
  shot: PreviewShot,
  marks: readonly Mark[],
): Promise<{ blob: Blob; drawn: number }> {
  const bitmap = await createImageBitmap(shot.blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No canvas to draw the marks on');
  context.drawImage(bitmap, 0, 0);
  bitmap.close();

  const { region } = shot;
  const scaleX = canvas.width / region.width;
  const scaleY = canvas.height / region.height;
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--color-accent');
  context.font = MARK_FONT;
  context.lineWidth = 2;
  let drawn = 0;
  for (const { label, rect } of marks) {
    const left = Math.max(0, (rect.left - region.left) * scaleX);
    const top = Math.max(0, (rect.top - region.top) * scaleY);
    const right = Math.min(canvas.width, (rect.right - region.left) * scaleX);
    const bottom = Math.min(canvas.height, (rect.bottom - region.top) * scaleY);
    if (right <= left || bottom <= top) continue;
    // A box around the whole image, such as the document's, tells nothing apart.
    if (left === 0 && top === 0 && right === canvas.width && bottom === canvas.height) continue;
    context.strokeStyle = accent;
    context.strokeRect(left + 1, top + 1, right - left - 2, bottom - top - 2);
    const width = context.measureText(label).width + 6;
    context.fillStyle = accent;
    context.fillRect(left, top, width, 16);
    context.fillStyle = MARK_INK;
    context.fillText(label, left + 3, top + 12);
    drawn++;
  }
  const blob = await canvas.convertToBlob({
    type: CAPTURE_IMAGE.mimeType,
    quality: CAPTURE_IMAGE.quality,
  });
  return { blob, drawn };
}

/**
 * An element's box in the page's viewport: an element in a frame inside the
 * page, such as a frontend card, is offset by the frames around it.
 */
export function rectInPage(element: Element, page: Window): DOMRect {
  const rect = element.getBoundingClientRect();
  let { x, y } = rect;
  for (
    let view: Window | null = element.ownerDocument.defaultView;
    view && view !== page;
    view = view.parent
  ) {
    const frame = view.frameElement;
    if (!frame) break;
    const outer = frame.getBoundingClientRect();
    x += outer.x + frame.clientLeft;
    y += outer.y + frame.clientTop;
  }
  return new DOMRect(x, y, rect.width, rect.height);
}

/** Element Capture only delivers frames of an element the browser paints. */
function onScreen(frame: HTMLIFrameElement): boolean {
  const rect = frame.getBoundingClientRect();
  return document.visibilityState === 'visible' && rect.width > 0 && rect.height > 0;
}

/**
 * The next frame of the stream, or none within a moment: a page that does
 * not repaint delivers no new frame, and the latest one is then current.
 */
function nextFrame(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, FRAME_WAIT_MS);
    video.requestVideoFrameCallback(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

export const previewCapture = new PreviewCapture();

export function useCaptureShared(): boolean {
  return useSyncExternalStore(previewCapture.subscribe, () => previewCapture.shared);
}
