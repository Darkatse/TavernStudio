import type { AssistantMessage, ToolResultMessage, UserMessage } from '@earendil-works/pi-ai';

/**
 * One message of the conversation as the model saw or said it (docs/Agent.md
 * §1). The message is pi-ai's, stored as it is, so every provider's
 * signatures and encrypted reasoning replay unchanged. History is the one
 * record the Transcript and the model's context both come from.
 */
export interface HistoryEntry {
  run: string;
  /** 0 for the author's message that starts the Run; then the Round it belongs to. */
  round: number;
  message: UserMessage | AssistantMessage | ToolResultMessage;
}
