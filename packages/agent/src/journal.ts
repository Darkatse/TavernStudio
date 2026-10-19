/**
 * What happened during a Run, appended in order and never rewritten
 * (docs/Agent.md §1). The Journal records progress and the end of a Run; the
 * messages themselves are in History.
 */
export type JournalEvent = { run: string; time: number } & (
  | { type: 'run_created' }
  | { type: 'model_request'; round: number }
  | {
      type: 'model_completed';
      round: number;
      stopReason: string;
      durationMs: number | undefined;
      usage: { input: number; output: number; cacheRead: number; cacheWrite: number };
    }
  | { type: 'tool_call_started'; round: number; callId: string; tool: string }
  | {
      type: 'tool_call_completed';
      round: number;
      callId: string;
      durationMs: number;
      /** Set when the call went back to the model as an error result. */
      error?: string;
      /** The workspace path where a long result was stored. */
      storedAt?: string;
    }
  | { type: 'guidance_added'; round: number }
  | { type: 'run_completed' }
  | { type: 'run_cancelled' }
  | { type: 'run_failed'; code: string; message: string }
);

/** The events that end a Run; a Run without one after a reload was interrupted. */
export const TERMINAL_EVENTS = new Set<JournalEvent['type']>([
  'run_completed',
  'run_cancelled',
  'run_failed',
]);
