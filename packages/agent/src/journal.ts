/** Appended in order and never rewritten. */
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
  /** The context is being compacted before the Round's request. */
  | { type: 'compaction_started'; round: number }
  /** Tokens of the context before and after, as estimated. */
  | { type: 'context_compacted'; round: number; before: number; after: number }
  | { type: 'run_completed' }
  | { type: 'run_cancelled' }
  | { type: 'run_failed'; code: string; message: string }
  /**
   * A rollback, itself an operation named by `run`: the project went back to
   * before `target`, a Run or an earlier rollback.
   */
  | { type: 'rolled_back'; target: string; files: number }
  /** The operation's Checkpoint was cleared for space; it can no longer be rolled back to. */
  | { type: 'checkpoint_pruned' }
);

/** A Run without one of these after a reload was interrupted. */
export const TERMINAL_EVENTS = new Set<JournalEvent['type']>([
  'run_completed',
  'run_cancelled',
  'run_failed',
]);
