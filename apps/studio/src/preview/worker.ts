import type { DiagnosticEntry } from '@tavern-studio/preview';

const WORKER = '/_studio/preview-sw.js';

/**
 * Registers the Preview SW unless it already is. Registering again would wait
 * behind the update checks every navigation starts (1.6 s after a few preview
 * reloads); those checks keep an existing registration current by themselves.
 */
export async function registerWorker(): Promise<ServiceWorker> {
  const existing = await navigator.serviceWorker.getRegistration('/');
  if (!existing?.active?.scriptURL.endsWith(WORKER)) {
    await navigator.serviceWorker.register(WORKER, { scope: '/', updateViaCache: 'none' });
  }
  const worker = (await navigator.serviceWorker.ready).active;
  if (!worker) throw new Error('The Preview SW did not activate');
  return worker;
}

let listening = false;

/**
 * Reports the API requests the Preview SW answered 501: they came from a
 * context without an API layer (docs/Architecture.md §4).
 */
export function reportUnansweredRequests(report: (entry: DiagnosticEntry) => void): void {
  if (listening) return;
  listening = true;
  navigator.serviceWorker.addEventListener(
    'message',
    (event: MessageEvent<{ type?: string; message?: string; url?: string }>) => {
      if (event.data.type !== 'unanswered-request') return;
      report({
        level: 'error',
        kind: 'request',
        message: event.data.message ?? '',
        ...(event.data.url ? { url: event.data.url } : {}),
        frame: 'worker',
        time: Date.now(),
      });
    },
  );
}
