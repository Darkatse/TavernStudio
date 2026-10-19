import {
  TERMINAL_EVENTS,
  type AssistantMessage,
  type HistoryEntry,
  type JournalEvent,
  type ToolResultMessage,
} from '@tavern-studio/agent';
import type { ActiveRun } from './conversation';

export type RunStatus = 'running' | 'completed' | 'cancelled' | 'failed' | 'interrupted';

/** One Run as the Transcript shows it (docs/Agent.md §7). */
export interface RunBlock {
  id: string;
  /** The author's message that started the Run. */
  request: string;
  /** Everything between the request and the final answer: rounds, guidance, tool calls. */
  work: HistoryEntry[];
  /** The last reply without a tool call, shown even when the work is folded. */
  answer: AssistantMessage | undefined;
  status: RunStatus;
  failure: { code: string; message: string } | undefined;
  startedAt: number | undefined;
  endedAt: number | undefined;
  toolCalls: number;
}

/**
 * Groups History into Runs. A Run without a terminal Journal event that is
 * not the active one was interrupted: Studio closed while it ran, and its
 * tools are not replayed (docs/Agent.md §1).
 */
export function runBlocks(
  entries: readonly HistoryEntry[],
  events: readonly JournalEvent[],
  active: ActiveRun | undefined,
): RunBlock[] {
  const blocks = new Map<string, RunBlock>();
  for (const entry of entries) {
    let block = blocks.get(entry.run);
    if (!block) {
      block = {
        id: entry.run,
        request: '',
        work: [],
        answer: undefined,
        status: 'interrupted',
        failure: undefined,
        startedAt: undefined,
        endedAt: undefined,
        toolCalls: 0,
      };
      blocks.set(entry.run, block);
    }
    const { message } = entry;
    if (entry.round === 0 && message.role === 'user') {
      block.request = textOf(message.content);
      continue;
    }
    if (message.role === 'assistant') {
      block.toolCalls += message.content.filter((part) => part.type === 'toolCall').length;
    }
    block.work.push(entry);
  }

  for (const block of blocks.values()) {
    const last = block.work.at(-1)?.message;
    if (last?.role === 'assistant' && !last.content.some((part) => part.type === 'toolCall')) {
      block.answer = last;
      block.work.pop();
    }
  }

  for (const event of events) {
    const block = blocks.get(event.run);
    if (!block) continue;
    if (event.type === 'run_created') block.startedAt = event.time;
    if (!TERMINAL_EVENTS.has(event.type)) continue;
    block.endedAt = event.time;
    if (event.type === 'run_completed') block.status = 'completed';
    if (event.type === 'run_cancelled') block.status = 'cancelled';
    if (event.type === 'run_failed') {
      block.status = 'failed';
      block.failure = { code: event.code, message: event.message };
    }
  }
  const running = active && blocks.get(active.id);
  if (running) running.status = 'running';
  return [...blocks.values()];
}

/** The results of a Run's tool calls, by call id, for the rows that show them. */
export function resultsOf(block: RunBlock): Map<string, ToolResultMessage> {
  return new Map(
    block.work.flatMap((entry) =>
      entry.message.role === 'toolResult' ? [[entry.message.toolCallId, entry.message]] : [],
    ),
  );
}

export function textOf(content: string | readonly { type: string; text?: string }[]): string {
  if (typeof content === 'string') return content;
  return content
    .flatMap((part) => (part.type === 'text' && part.text ? [part.text] : []))
    .join('\n');
}
