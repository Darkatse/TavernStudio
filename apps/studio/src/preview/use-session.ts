import { useSyncExternalStore } from 'react';
import { previewSession, type SessionStatus, type VendorChoice } from './session';

export function useSessionStatus(): SessionStatus {
  return useSyncExternalStore(previewSession.subscribe, () => previewSession.status);
}

/** Changes whenever the Views reload, which gives each generation of Views its own key. */
export function useViewGeneration(): number {
  return useSyncExternalStore(previewSession.subscribe, () => previewSession.generation);
}

/** The built vendor images and the one the preview runs. */
export function useVendorChoice(): VendorChoice {
  return useSyncExternalStore(previewSession.subscribe, () => previewSession.vendors);
}
