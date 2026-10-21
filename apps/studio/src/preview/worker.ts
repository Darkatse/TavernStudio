import type { DiagnosticEntry } from '@tavern-studio/preview';

const WORKER = '/_studio/preview-sw.js';

/**
 * Registering again would wait behind the update checks every navigation
 * starts; those checks keep an existing registration current by themselves.
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
 * The Preview SW reports API requests from a context without an API layer,
 * which it answers 501, and data files the Session does not have.
 */
export function reportWorkerDiagnostics(report: (entry: DiagnosticEntry) => void): void {
  if (listening) return;
  listening = true;
  navigator.serviceWorker.addEventListener(
    'message',
    (
      event: MessageEvent<{
        type?: string;
        kind?: 'request' | 'resource';
        message?: string;
        url?: string;
      }>,
    ) => {
      if (event.data.type !== 'diagnostic' || !event.data.kind) return;
      report({
        level: 'error',
        kind: event.data.kind,
        message: event.data.message ?? '',
        ...(event.data.url ? { url: event.data.url } : {}),
        frame: 'worker',
        time: Date.now(),
      });
    },
  );
}
