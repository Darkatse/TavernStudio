import { createObservation, interact } from '@tauritavern/app-use';
import type { PageAgent } from './host';

/**
 * The app-use engine of a vendor page. It is evaluated in the page's own
 * realm, as in TauriTavern's in-app assistant: snapshots, same-origin iframes
 * and interactions then see the page the way its own code does.
 */
export function createPageAgent(): PageAgent {
  const observation = createObservation();
  return {
    snapshot(runId, args) {
      observation.enterRun(runId);
      return observation.snapshot(args);
    },
    interact(runId, args) {
      observation.enterRun(runId);
      return interact(args, observation);
    },
  };
}
