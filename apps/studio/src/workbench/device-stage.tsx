import { useMessages } from '../i18n/messages';
import { useElementSize } from '../lib/use-element-size';
import { useSessionStatus } from '../preview/use-session';
import type { Device } from '../preview/devices';
import { workbenchMessages } from './messages';
import { PreviewView } from './preview-view';

/** Height of the caption line plus its gap to the frame. */
const CAPTION_SPACE = 28;

/**
 * The frame keeps the device's viewport size and is scaled as a whole, so the
 * page inside lays out exactly as it would on the device. A hidden stage
 * measures 0 × 0 and only scales the frame to nothing, while the page inside
 * keeps its viewport and keeps running.
 */
export function DeviceStage({ device, generation }: { device: Device; generation: number }) {
  const m = useMessages(workbenchMessages);
  const [stageRef, stage] = useElementSize();
  const session = useSessionStatus();
  const { width, height } = device.viewport;
  const scale = stage
    ? Math.max(0, Math.min(stage.width / width, (stage.height - CAPTION_SPACE) / height, 1))
    : 0;

  return (
    <div
      ref={stageRef}
      className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden bg-sunken p-6"
    >
      <figure
        key={device.id}
        className="m-0 flex flex-col items-center gap-3 transition-opacity motion-moderate starting:opacity-0"
      >
        <div
          className="relative overflow-hidden bg-surface shadow-frame"
          style={{
            width: width * scale,
            height: height * scale,
            borderRadius: device.cornerRadius * scale,
          }}
        >
          <PreviewView key={generation} device={device} scale={scale} />
        </div>
        <figcaption className="text-caption text-muted tabular-nums">
          {session.phase === 'open' && `${session.vendor.label} · `}
          {m.device[device.id]} · {width} × {height} · {Math.round(scale * 100)}%
        </figcaption>
      </figure>
    </div>
  );
}
