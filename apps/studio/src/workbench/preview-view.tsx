import { clsx } from 'clsx';
import { lazy, Suspense, useState, useTransition } from 'react';
import { useMessages } from '../i18n/messages';
import { screenOf, type Device } from '../preview/devices';
import { previewSession } from '../preview/session';
import { useSessionStatus } from '../preview/use-session';
import { workbenchMessages } from './messages';
import { StartupOverlay } from './startup-overlay';

// The bars show only around a page that is up, so they load while it starts.
const loadSystemBars = () => import('./system-bars');
const SystemBars = lazy(() => loadSystemBars().then((module) => ({ default: module.SystemBars })));

/** The device's screen: the page in its viewport, and the system bars around it. */
export function PreviewView({ device, scale }: { device: Device; scale: number }) {
  const m = useMessages(workbenchMessages);
  const session = useSessionStatus();
  // The page once it is up.
  const [page, setPage] = useState<Window>();
  const [, startTransition] = useTransition();
  const { viewport, insets } = device;
  const screen = screenOf(device);
  const bars = insets.top > 0 || insets.bottom > 0;

  const attach = (frame: HTMLIFrameElement | null) => {
    if (!frame) return;
    if (bars) void loadSystemBars();
    const remove = previewSession.addView(frame, {
      device: device.identity,
      // In a transition, the page shows with its bars once they have loaded.
      onReady: () => startTransition(() => setPage(frame.contentWindow!)),
      // The page unloads before the View goes: fade back to the startup overlay.
      onRetire: () => setPage(undefined),
    });
    frame.src = '/';
    return remove;
  };

  return (
    <>
      {session.phase === 'open' && (
        <div
          className="absolute top-0 left-0 origin-top-left"
          style={{ width: screen.width, height: screen.height, scale: String(scale) }}
        >
          {/* Unsandboxed on purpose: the vendor page shares Studio's origin. */}
          {/* `isolate`: Element Capture only delivers frames for an element with its own stacking context. */}
          {/* oxlint-disable-next-line react/iframe-missing-sandbox */}
          <iframe
            ref={attach}
            title={m.preview}
            className={clsx(
              'absolute left-0 isolate block w-full border-0 transition-opacity motion-slow',
              page ? 'opacity-100' : 'pointer-events-none opacity-0',
            )}
            style={{ top: insets.top, height: viewport.height }}
          />
          {page && bars && (
            <Suspense>
              <SystemBars page={page} insets={insets} />
            </Suspense>
          )}
        </div>
      )}
      <StartupOverlay session={session} booted={page !== undefined} />
    </>
  );
}
