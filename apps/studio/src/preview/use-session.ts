import { useSyncExternalStore } from 'react';
import type { Difference } from '@tavern-studio/workspace';
import type { DeviceId } from './devices';
import { previewSession, type SessionStatus, type VendorChoice } from './session';

export function useSessionStatus(): SessionStatus {
  return useSyncExternalStore(previewSession.subscribe, () => previewSession.status);
}

export function useViewGeneration(): number {
  return useSyncExternalStore(previewSession.subscribe, () => previewSession.generation);
}

export function useDevice(): DeviceId {
  return useSyncExternalStore(previewSession.subscribe, () => previewSession.device);
}

export function useVendorChoice(): VendorChoice {
  return useSyncExternalStore(previewSession.subscribe, () => previewSession.vendors);
}

export function useOverwritten(): readonly Difference[] {
  return useSyncExternalStore(previewSession.subscribe, () => previewSession.overwritten);
}
