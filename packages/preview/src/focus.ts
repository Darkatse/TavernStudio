import type { Realm } from './realm';

type Method = (this: Element, ...args: unknown[]) => unknown;

/**
 * A page in the preview cannot take focus from Studio. Its own focus moves
 * still happen in the page, but the author stays where they were until they
 * press or tab into the preview themselves. Browsers keep this boundary for
 * cross-origin frames; a same-origin preview has none, and a vendor page
 * starting up, a card or the Agent filling a field would otherwise pull focus,
 * and whatever the author is typing, out of Studio.
 */
export function installFocusBoundary(realm: Realm, preview: Realm): void {
  const studio = preview.frameElement!.ownerDocument;
  const hold = (proto: object, name: string) => {
    const methods = proto as Record<string, Method>;
    const original = methods[name]!;
    methods[name] = function (this: Element, ...args: unknown[]) {
      const author = studio.activeElement as (Element & HTMLOrSVGElement) | null;
      const taken = !preview.document.hasFocus() && author !== studio.body;
      const result = original.apply(this, args);
      if (taken) author!.focus({ preventScroll: true });
      return result;
    };
  };
  // The calls by which a page moves focus itself; a dialog runs its focusing
  // steps as it shows.
  hold(realm.HTMLElement.prototype, 'focus');
  hold(realm.HTMLDialogElement.prototype, 'show');
  hold(realm.HTMLDialogElement.prototype, 'showModal');
}
