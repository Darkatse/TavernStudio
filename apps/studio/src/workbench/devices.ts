export type DeviceId = 'desktop' | 'mobile';

/**
 * What a View presents to the vendor page (docs/Architecture.md §2). The
 * preview always has the viewport's CSS size; the stage only scales it.
 */
export interface Device {
  id: DeviceId;
  label: string;
  viewport: { width: number; height: number };
  /** Corner radius of the screen or window, in viewport pixels. */
  cornerRadius: number;
}

export const devices: Record<DeviceId, Device> = {
  desktop: {
    id: 'desktop',
    label: '桌面',
    viewport: { width: 1440, height: 900 },
    cornerRadius: 12,
  },
  mobile: {
    id: 'mobile',
    label: '移动',
    viewport: { width: 390, height: 844 },
    cornerRadius: 47,
  },
};
