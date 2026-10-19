import type { DeviceIdentity, HostIdentity } from '@tavern-studio/preview';

export type DeviceId = 'desktop' | 'mobile';

/**
 * What a View presents to the vendor page (docs/Architecture.md §2). The
 * preview always has the viewport's CSS size; the stage only scales it.
 */
export interface Device {
  id: DeviceId;
  viewport: { width: number; height: number };
  /** Corner radius of the screen or window, in viewport pixels. */
  cornerRadius: number;
  /** SillyTavern reads the user agent; TauriTavern reads its host identity. */
  identity: DeviceIdentity;
}

export const devices: Record<DeviceId, Device> = {
  desktop: {
    id: 'desktop',
    viewport: { width: 1440, height: 900 },
    cornerRadius: 12,
    // The browser Studio runs in, as it is.
    identity: { navigator: {}, host: { platform: desktopPlatform(), kind: 'desktop' } },
  },
  mobile: {
    id: 'mobile',
    viewport: { width: 390, height: 844 },
    cornerRadius: 47,
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

export function isDeviceId(value: string): value is DeviceId {
  return Object.hasOwn(devices, value);
}

/** The desktop platform of the browser Studio runs in. */
function desktopPlatform(): HostIdentity['platform'] {
  const platform = navigator.platform.toLowerCase();
  if (platform.startsWith('mac')) return 'macos';
  if (platform.startsWith('linux')) return 'linux';
  return 'windows';
}
