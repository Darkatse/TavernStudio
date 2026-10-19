import { useEffect, useSyncExternalStore } from 'react';
import { previewSession, type SessionStatus, type VendorChoice } from './session';

/** The fixture every preview starts from until projects choose their own. */
export const DEFAULT_FIXTURE = 'showcase';

/** Opens the preview Session on first use and follows its status. */
export function useSessionStatus(): SessionStatus {
  useEffect(() => {
    void previewSession.open(DEFAULT_FIXTURE);
  }, []);
  return useSyncExternalStore(previewSession.subscribe, () => previewSession.status);
}

/** The built vendor images and the one the preview runs. */
export function useVendorChoice(): VendorChoice {
  return useSyncExternalStore(previewSession.subscribe, () => previewSession.vendors);
}
