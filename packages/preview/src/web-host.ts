/**
 * The TT image loads this module right after Attach, ahead of TT's own module
 * scripts, so the host exists before `init.js` runs.
 *
 * Built as an ES module served at /_studio/web-host.js. The import below is
 * the vendor's own file and stays a static import in the output.
 */
import { installWebHost } from '/tauri/web-host/install.js';
import { HOST_KEY, type PreviewHost } from './host';

// Attach has pointed `parent` at the page itself; the frame belongs to Studio.
const studio = window.frameElement?.ownerDocument.defaultView as
  (Window & { [HOST_KEY]?: PreviewHost }) | null | undefined;
const host = studio?.[HOST_KEY];
if (!host) throw new Error('This page only runs inside a Tavern Studio preview');
const webHost = installWebHost(host.webHost(window));
host.exitThrough(window, () => webHost.exit());
