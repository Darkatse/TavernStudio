import type { Realm } from './realm';

/**
 * Marks a window's current global as seen. A frame's WindowProxy keeps its
 * identity when the frame navigates, and WebKit puts a new global behind it
 * for a srcdoc document, so the mark lives on the global itself.
 */
const SEEN = Symbol('Tavern Studio realm');
const observed = new WeakSet<Document>();

/**
 * Calls `onRealm` once for a window and for every same-origin window framed
 * below it, now and later. Frames are taken when they are inserted: the
 * initial window of a srcdoc frame carries over to its document in Chromium
 * and Firefox, so the frame's scripts start with whatever `onRealm` installs.
 * WebKit replaces that window, which is then taken at the frame's load event.
 */
export function observeRealms(win: Realm, onRealm: (realm: Realm) => void): void {
  if (!Object.hasOwn(win, SEEN)) {
    Object.defineProperty(win, SEEN, { value: true });
    onRealm(win);
    // A reused initial window gets a new document when its content loads.
    win.addEventListener('DOMContentLoaded', () => observeFrames(win, onRealm));
  }
  observeFrames(win, onRealm);
}

function observeFrames(win: Realm, onRealm: (realm: Realm) => void): void {
  const doc = win.document;
  if (observed.has(doc)) return;
  observed.add(doc);

  const adopt = (frame: HTMLIFrameElement) => {
    const take = () => {
      const child = sameOriginWindow(frame);
      if (child) observeRealms(child, onRealm);
    };
    take();
    frame.addEventListener('load', take);
  };

  doc.querySelectorAll('iframe').forEach(adopt);
  new win.MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof win.Element)) continue;
        if (node instanceof win.HTMLIFrameElement) adopt(node);
        node.querySelectorAll('iframe').forEach(adopt);
      }
    }
  }).observe(doc, { childList: true, subtree: true });
}

function sameOriginWindow(frame: HTMLIFrameElement): Realm | null {
  try {
    const child = frame.contentWindow as Realm | null;
    return child && child.origin === frame.ownerDocument.defaultView?.origin ? child : null;
  } catch {
    return null;
  }
}
