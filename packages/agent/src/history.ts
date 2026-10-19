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
}
