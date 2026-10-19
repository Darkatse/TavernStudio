import { CAPTURE_IMAGE } from '@tavern-studio/preview';
import { useSyncExternalStore } from 'react';
import { previewSession } from './session';

/** A screenshot of the preview, encoded for the model. */
export interface PreviewShot {
  blob: Blob;
  method: 'element-capture' | 'snapdom';
  warnings: readonly string[];
}

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

  async take(selector: string | undefined): Promise<PreviewShot> {
    const page = previewSession.page();
    if (!page) throw new Error('The preview is still starting');
    if (this.#share && onScreen(page.frame))
      return this.#fromScreen(this.#share, page.frame, selector);
    const shot = await page.agent.capture(selector);
    return { blob: shot.blob, method: 'snapdom', warnings: shot.warnings };
  }

  async #fromScreen(
    share: Share,
    frame: HTMLIFrameElement,
    selector: string | undefined,
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
    let source = { x: 0, y: 0, width: video.videoWidth, height: video.videoHeight };
    if (selector !== undefined) {
      const element = page.document.querySelector(selector);
      if (!element) throw new Error(`No element matches ${selector}`);
      const rect = element.getBoundingClientRect();
      const left = Math.max(0, rect.left);
      const top = Math.max(0, rect.top);
      const right = Math.min(page.innerWidth, rect.right);
      const bottom = Math.min(page.innerHeight, rect.bottom);
      if (right <= left || bottom <= top) {
        throw new Error(
          `${selector} is outside the visible part of the page; scroll it into view first`,
        );
      }
      source = {
        x: left * ratio,
        y: top * ratio,
        width: (right - left) * ratio,
        height: (bottom - top) * ratio,
      };
    }
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
    return { blob, method: 'element-capture', warnings: [] };
  }

  #notify(): void {
    for (const listener of this.#listeners) listener();
  }
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
