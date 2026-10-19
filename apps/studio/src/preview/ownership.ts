import type { DiagnosticEntry } from '@tavern-studio/preview';

const LOCK = 'studio-session';
/** How long the tab holding the Session may take to hand it over before it is taken. */
const HANDOVER_TIMEOUT_MS = 5000;

export interface Ownership {
  /** Unloads this tab's Views and lands its writes, before the Session goes to another tab. */
  handOver(): Promise<void>;
  /** The Session is now another tab's. */
  lost(): void;
  report(entry: DiagnosticEntry): void;
}

/**
 * Makes this tab the one that holds the Session (docs/Architecture.md §4).
 * A Web Lock is the ownership, released by the browser if the tab dies; a
 * BroadcastChannel carries the request, so that the holder can unload its
 * Views and finish persisting before it lets go. Resolves once this tab
 * holds the Session.
 */
export async function ownSession(ownership: Ownership): Promise<void> {
  const channel = new BroadcastChannel(LOCK);
  const { promise: held, resolve: release } = Promise.withResolvers<void>();
  let gone = false;
  const lose = (late: boolean) => {
    gone = true;
    ownership.lost();
    if (late) {
      ownership.report(
        storageEntry(
          'error',
          'Another Studio tab took the Session without a handover; writes since the last save may be lost',
        ),
      );
    }
  };
  channel.addEventListener('message', () => {
    if (gone) return;
    gone = true;
    void ownership.handOver().finally(() => {
      release();
      lose(false);
    });
  });

  const hold = (options: LockOptions) =>
    new Promise<boolean>((granted) => {
      navigator.locks
        .request(LOCK, options, async (lock) => {
          granted(lock !== null);
          if (lock) await held;
        })
        .catch((error: unknown) => {
          // A newer tab stole the lock: the Session went without a handover.
          if (error instanceof DOMException && error.name === 'AbortError' && !gone) lose(true);
          else granted(false);
        });
    });

  if (await hold({ ifAvailable: true })) return;
  channel.postMessage('hand-over');
  if (await hold({ signal: AbortSignal.timeout(HANDOVER_TIMEOUT_MS) })) return;
  await hold({ steal: true });
  ownership.report(
    storageEntry(
      'warning',
      'The Studio tab holding the Session did not hand it over; writes it had not saved may be lost',
    ),
  );
}

function storageEntry(level: DiagnosticEntry['level'], message: string): DiagnosticEntry {
  return { level, kind: 'storage', message, frame: 'backend', time: Date.now() };
}
