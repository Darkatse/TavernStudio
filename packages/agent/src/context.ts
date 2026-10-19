import type {
  AssistantMessage,
  Context,
  ImageContent,
  Message,
  TextContent,
  Tool as ModelTool,
  ToolCall,
  ToolResultMessage,
} from '@earendil-works/pi-ai';
import type { HistoryEntry } from './history';
import { modelToolName, type Tool } from './tool';

export const IMAGES_KEPT = 3;

const INTERRUPTED =
  'The previous turn stopped. Actions without recorded results have an unknown outcome; check the current state before repeating them.';
const IMAGE_REMOVED: TextContent = {
  type: 'text',
  text: '[An earlier screenshot was removed from the context.]',
};

export function modelContext(
  systemPrompt: string,
  tools: readonly Tool[],
  history: readonly HistoryEntry[],
): Context {
  return {
    systemPrompt,
    tools: tools.map(modelTool),
    messages: keepLatestImages(closeToolGroups(history.map((entry) => entry.message)), IMAGES_KEPT),
  };
}

function modelTool(tool: Tool): ModelTool {
  return {
    name: modelToolName(tool.id),
    description: tool.description,
    // A JSON Schema object; pi-ai's TypeBox schemas are JSON Schema too.
    parameters: tool.inputSchema,
  };
}

/**
 * Follows TauriTavern's `prepareAgentHistory`. A group with an unanswered
 * call, left by a Run that stopped, becomes one assistant text that says so,
 * in TauriTavern's words: no tool is replayed, and no provider sees an
 * unanswered call.
 */
export function closeToolGroups(messages: readonly Message[]): Message[] {
  const closed: Message[] = [];
  for (let index = 0; index < messages.length;) {
    const message = messages[index++] as Message;
    if (message.role === 'toolResult') {
      throw new Error('agent.tool_history_orphan: a tool result has no preceding call');
    }
    if (message.role !== 'assistant') {
      closed.push(message);
      continue;
    }
    const calls = message.content.filter((part): part is ToolCall => part.type === 'toolCall');
    const pending = new Set(calls.map((call) => call.id));
    if (pending.size !== calls.length) {
      throw new Error('agent.tool_history_duplicate: a call id repeats within one message');
    }
    const results: ToolResultMessage[] = [];
    while (index < messages.length && messages[index]?.role === 'toolResult') {
      const result = messages[index++] as ToolResultMessage;
      if (!pending.delete(result.toolCallId)) {
        throw new Error('agent.tool_history_orphan: a tool result answers no unanswered call');
      }
      results.push(result);
    }
    if (pending.size === 0) closed.push(message, ...results);
    else closed.push(interrupted(message, results));
  }
  return closed;
}

function interrupted(
  message: AssistantMessage,
  results: readonly ToolResultMessage[],
): AssistantMessage {
  const byCall = new Map(results.map((result) => [result.toolCallId, result]));
  const lines = [INTERRUPTED];
  for (const part of message.content) {
    if (part.type === 'text') lines.push(part.text);
    if (part.type !== 'toolCall') continue;
    const result = byCall.get(part.id);
    const outcome = result
      ? `Recorded ${result.isError ? 'error' : 'result'}: ${textOf(result)}`
      : 'Outcome unknown: no recorded result.';
    lines.push(`${part.name}(${JSON.stringify(part.arguments)})\n${outcome}`);
  }
  // The text replaces what the turn said, signatures included, so it is a plain answer.
  const { errorMessage: _error, ...rest } = message;
  return { ...rest, content: [{ type: 'text', text: lines.join('\n\n') }], stopReason: 'stop' };
}

function textOf(result: ToolResultMessage): string {
  return result.content.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('\n');
}

export function withoutImages<T extends Message>(message: T): T {
  if (message.role === 'assistant' || typeof message.content === 'string') return message;
  if (!message.content.some((part) => part.type === 'image')) return message;
  return {
    ...message,
    content: message.content.map((part) => (part.type === 'image' ? IMAGE_REMOVED : part)),
  };
}

export function keepLatestImages(messages: readonly Message[], kept: number): Message[] {
  let seen = 0;
  const keep = (part: TextContent | ImageContent): TextContent | ImageContent => {
    if (part.type !== 'image') return part;
    seen += 1;
    return seen <= kept ? part : IMAGE_REMOVED;
  };
  return messages
    .toReversed()
    .map((message): Message => {
      if (message.role === 'toolResult') {
        return { ...message, content: message.content.toReversed().map(keep).toReversed() };
      }
      if (message.role === 'user' && typeof message.content !== 'string') {
        return { ...message, content: message.content.toReversed().map(keep).toReversed() };
      }
      return message;
    })
    .toReversed();
}
