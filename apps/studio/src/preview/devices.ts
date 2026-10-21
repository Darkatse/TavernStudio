import type { DeviceIdentity, HostIdentity } from '@tavern-studio/preview';

export type DeviceId = 'desktop' | 'mobile';

/** The preview always has the viewport's CSS size; the stage only scales it. */
export interface Device {
  id: DeviceId;
  viewport: { width: number; height: number };
  /**
   * The system bars above and below the page, in viewport pixels. As on
   * TauriTavern's mobile hosts, the page lays out in the safe area between
   * them; the bars only show the screen's proportions.
   */
  insets: { top: number; bottom: number };
  /** Of the screen, in viewport pixels. */
  cornerRadius: number;
  /** SillyTavern reads the user agent; TauriTavern reads its host identity. */
  identity: DeviceIdentity;
}

export const devices: Record<DeviceId, Device> = {
  desktop: {
    id: 'desktop',
    viewport: { width: 1440, height: 900 },
    insets: { top: 0, bottom: 0 },
    cornerRadius: 12,
    // The browser Studio runs in, as it is.
    identity: { navigator: {}, host: { platform: desktopPlatform(), kind: 'desktop' } },
  },
  mobile: {
    id: 'mobile',
    // An iPhone 17: a 402 × 874 screen less its safe area.
    viewport: { width: 402, height: 778 },
    insets: { top: 62, bottom: 34 },
    cornerRadius: 62,
    identity: {
      navigator: {
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
        platform: 'iPhone',
        maxTouchPoints: 5,
      },
      host: { platform: 'ios', kind: 'mobile' },
    },
  },
};

/** The viewport with the system bars around it. */
export function screenOf(device: Device): { width: number; height: number } {
  const { viewport, insets } = device;
  return { width: viewport.width, height: viewport.height + insets.top + insets.bottom };
}

export function isDeviceId(value: string): value is DeviceId {
  return Object.hasOwn(devices, value);
}

function desktopPlatform(): HostIdentity['platform'] {
  const platform = navigator.platform.toLowerCase();
  if (platform.startsWith('mac')) return 'macos';
  if (platform.startsWith('linux')) return 'linux';
  return 'windows';
}
