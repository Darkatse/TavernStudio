import type { AssistantMessage, ToolResultMessage, UserMessage } from '@earendil-works/pi-ai';

/**
 * The message is pi-ai's, stored as it is, so every provider's signatures and
 * encrypted reasoning replay unchanged.
 */
export interface HistoryEntry {
  run: string;
  /** 0 for the author's message that starts the Run; then the Round it belongs to. */
  round: number;
  message: UserMessage | AssistantMessage | ToolResultMessage;
  /**
   * Set on the handoff the model wrote when its context was compacted: from
   * then on its context starts with this message, followed by the entries
   * from `keptFrom` on, the first entry of that Run and Round, if any.
   */
  handoff?: { keptFrom: { run: string; round: number } | null };
}
