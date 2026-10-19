import { MonitorPlay } from 'lucide-react';
import { useElementSize } from '../lib/use-element-size';
import { EmptyState } from '../ui/empty-state';
import type { Device } from './devices';

/** Height of the caption line plus its gap to the frame. */
const CAPTION_SPACE = 28;

/**
 * Fits the device frame into the stage without ever enlarging it. The frame
 * keeps the device's viewport size and is scaled as a whole, so the page
 * inside lays out exactly as it would on the device.
 */
export function DeviceStage({ device }: { device: Device }) {
  const [stageRef, stage] = useElementSize();
  const { width, height } = device.viewport;
  const scale = stage
    ? Math.min(stage.width / width, (stage.height - CAPTION_SPACE) / height, 1)
    : 0;

  return (
    <div
      ref={stageRef}
      className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden bg-sunken p-6"
    >
      {scale > 0 && (
        <figure
          key={device.id}
          className="m-0 flex flex-col items-center gap-3 transition-opacity motion-moderate starting:opacity-0"
        >
          <div
            className="relative grid place-items-center overflow-hidden bg-surface shadow-frame"
            style={{
              width: width * scale,
              height: height * scale,
              borderRadius: device.cornerRadius * scale,
            }}
          >
            <EmptyState icon={<MonitorPlay />} title="预览尚未启动" />
          </div>
          <figcaption className="text-caption text-muted tabular-nums">
            {device.label} · {width} × {height} · {Math.round(scale * 100)}%
          </figcaption>
        </figure>
      )}
    </div>
  );
}
