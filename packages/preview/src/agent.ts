import { createObservation, interact, type InteractionOptions } from '@tauritavern/app-use';
import type { PageAgent } from './host';

/**
 * The app-use engine of a vendor page. It is evaluated in the page's own
 * realm, as in TauriTavern's in-app assistant: snapshots, same-origin iframes
 * and interactions then see the page the way its own code does.
 */
export function createPageAgent(): PageAgent {
  const observation = createObservation();
  const options: InteractionOptions = { scrollTo };
  return {
    snapshot(runId, args) {
      observation.enterRun(runId);
      return observation.snapshot(args);
    },
    interact(runId, args) {
      observation.enterRun(runId);
      return interact(args, observation, options);
    },
  };
}

interface ChatSurfaceContext {
  scrollChatSurfaceTo?: (options: ScrollToOptions) => void;
}

/**
 * A page whose chat is laid out by its own surface (TauriTavern's ChatSurface)
 * offers `scrollChatSurfaceTo`, and the chat must scroll through it, as TT's
 * in-app assistant does. Every other region scrolls as usual.
 */
function scrollTo(element: HTMLElement, options: ScrollToOptions): void {
  const tavern = (window as { SillyTavern?: { getContext(): ChatSurfaceContext } }).SillyTavern;
  const scrollChat = tavern?.getContext().scrollChatSurfaceTo;
  if (scrollChat && element === document.getElementById('chat')) scrollChat(options);
  else element.scrollTo(options);
}
