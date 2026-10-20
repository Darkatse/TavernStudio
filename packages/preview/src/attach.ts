/**
 * The first script of every vendor page: it runs before any vendor script.
 * Built as a classic script and served at /_studio/attach.js.
 */
import { installAccess } from './access';
import { createPageAgent } from './agent';
import { installDiagnostics } from './diagnostics';
import { installFocusBoundary } from './focus';
import { HOST_KEY, type DeviceIdentity, type PreviewHost, type ViewConnection } from './host';
import { observeRealms } from './realms';

const studio = window.parent as Window & { [HOST_KEY]?: PreviewHost };
const host = studio === window ? undefined : studio[HOST_KEY];
if (!host) throw new Error('This page only runs inside a Tavern Studio preview');
const view = host.connect(window, createPageAgent());

// In production SillyTavern is the top-level page, and extensions rely on
// `parent` being the page itself. `top` cannot be redefined and stays Studio.
Object.defineProperty(window, 'parent', { value: window, configurable: true, writable: true });

applyDevice(window, view.device.navigator);
observeRealms(window, (realm) => {
  installDiagnostics(realm, (entry) => view.report(entry));
  installFocusBoundary(realm, window);
  // TauriTavern reaches the API through its own host kernel and the Web Host,
  // which /_studio/web-host.js installs next.
  if (view.vendorKind === 'st') installAccess(realm, view);
});
reportReady(view);

function applyDevice(win: Window, identity: DeviceIdentity['navigator']): void {
  for (const [key, value] of Object.entries(identity)) {
    if (value !== undefined)
      Object.defineProperty(win.navigator, key, { configurable: true, get: () => value });
  }
}

/**
 * Listens on the vendor's own event bus. The events module has no other
 * dependencies, and importing it by its URL shares the instance the page
 * uses; `getContext()` is not usable this early, since the module graph is
 * still evaluating. APP_READY is replayed to late listeners.
 */
function reportReady(connection: ViewConnection): void {
  const url: string = '/scripts/events.js';
  void import(/* webpackIgnore: true */ url).then((events: TavernEvents) => {
    events.eventSource.on(events.event_types.APP_READY, () => connection.ready());
  });
}

interface TavernEvents {
  eventSource: { on(event: string, listener: () => void): void };
  event_types: { APP_READY: string };
}
