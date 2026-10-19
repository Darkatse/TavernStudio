/**
 * Attach: the first script of every vendor page (docs/Vendors.md §1). It runs
 * before any SillyTavern script, connects the page to its View in Studio and
 * installs the device identity, diagnostics, the API layer and the Agent's
 * app-use engine.
 *
 * Built as a classic script and served at /_studio/attach.js.
 */
import { installAccess } from './access';
import { createPageAgent } from './agent';
import { installDiagnostics } from './diagnostics';
import { HOST_KEY, type DeviceIdentity, type PreviewHost, type ViewConnection } from './host';

const studio = window.parent as Window & { [HOST_KEY]?: PreviewHost };
const host = studio === window ? undefined : studio[HOST_KEY];
if (!host) throw new Error('This page only runs inside a Tavern Studio preview');
const view = host.connect(window, createPageAgent());

// In production SillyTavern is the top-level page, and extensions rely on
// `parent` being the page itself. `top` cannot be redefined and stays Studio.
Object.defineProperty(window, 'parent', { value: window, configurable: true, writable: true });

applyDevice(window, view.device);
installAccess(window, view, (realm) => installDiagnostics(realm, (entry) => view.report(entry)));
reportReady(view);

function applyDevice(win: Window, device: DeviceIdentity): void {
  for (const [key, value] of Object.entries(device)) {
    if (value !== undefined)
      Object.defineProperty(win.navigator, key, { configurable: true, get: () => value });
  }
}

/**
 * Listens on SillyTavern's own event bus. The events module has no other
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
