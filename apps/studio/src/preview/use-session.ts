import { useSyncExternalStore } from 'react';
import type { DeviceId } from './devices';
import { previewSession, type SessionStatus, type VendorChoice } from './session';

export function useSessionStatus(): SessionStatus {
  return useSyncExternalStore(previewSession.subscribe, () => previewSession.status);
}

/** Changes whenever the Views reload, which gives each generation of Views its own key. */
export function useViewGeneration(): number {
  return useSyncExternalStore(previewSession.subscribe, () => previewSession.generation);
}

/** The device the preview presents. */
export function useDevice(): DeviceId {
  return useSyncExternalStore(previewSession.subscribe, () => previewSession.device);
}

/** The built vendor images and the one the preview runs. */
export function useVendorChoice(): VendorChoice {
  return useSyncExternalStore(previewSession.subscribe, () => previewSession.vendors);
}
