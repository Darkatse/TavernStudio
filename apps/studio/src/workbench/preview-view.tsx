import { clsx } from 'clsx';
import { useState } from 'react';
import { useMessages } from '../i18n/messages';
import { previewSession } from '../preview/session';
import { useSessionStatus } from '../preview/use-session';
import type { Device } from '../preview/devices';
import { workbenchMessages } from './messages';
import { StartupOverlay } from './startup-overlay';

export function PreviewView({ device, scale }: { device: Device; scale: number }) {
  const m = useMessages(workbenchMessages);
  const session = useSessionStatus();
  const [booted, setBooted] = useState(false);
  const { width, height } = device.viewport;

  const attach = (frame: HTMLIFrameElement | null) => {
    if (!frame) return;
    const remove = previewSession.addView(frame, {
      device: device.identity,
      onReady: () => setBooted(true),
      // The page unloads before the View goes: fade back to the startup overlay.
      onRetire: () => setBooted(false),
    });
    frame.src = '/';
    return remove;
  };

  return (
    <>
      {session.phase === 'open' && (
        <div
          className="absolute top-0 left-0 origin-top-left"
          style={{ width, height, scale: String(scale) }}
        >
          {/* Unsandboxed on purpose: the vendor page shares Studio's origin. */}
          {/* `isolate`: Element Capture only delivers frames for an element with its own stacking context. */}
          {/* oxlint-disable-next-line react/iframe-missing-sandbox */}
          <iframe
            ref={attach}
            title={m.preview}
            className={clsx(
              'isolate block size-full border-0 transition-opacity motion-slow',
              booted ? 'opacity-100' : 'pointer-events-none opacity-0',
            )}
          />
        </div>
      )}
      <StartupOverlay session={session} booted={booted} />
    </>
  );
}
