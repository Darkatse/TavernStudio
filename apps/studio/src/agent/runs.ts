import {
  operations,
  restorePlan,
  TERMINAL_EVENTS,
  undoneOperations,
  type AssistantMessage,
  type CheckpointFile,
  type HistoryEntry,
  type JournalEvent,
  type ToolResultMessage,
} from '@tavern-studio/agent';
import type { ConversationState } from './conversation';

export type RunStatus = 'running' | 'completed' | 'cancelled' | 'failed' | 'interrupted';

interface Operation {
  id: string;
  /** A later rollback undid it, and that rollback is still in effect. */
  undone: boolean;
  /** The project can go back to before it: its Checkpoint is kept and files changed from it on. */
  restorable: boolean;
}

export interface RunBlock extends Operation {
  kind: 'run';
  request: string;
  /** Everything between the request and the final answer: rounds, guidance, tool calls. */
  work: HistoryEntry[];
  /** The last reply without a tool call. */
  answer: AssistantMessage | undefined;
  status: RunStatus;
  failure: { code: string; message: string } | undefined;
  startedAt: number | undefined;
  endedAt: number | undefined;
  toolCalls: number;
}

export interface RollbackBlock extends Operation {
  kind: 'rollback';
  /** The Run it went back to before, or the rollback it undid. */
  target: RunBlock | RollbackBlock | undefined;
  files: number;
}

export type TranscriptBlock = RunBlock | RollbackBlock;

/**
 * The conversation's operations, in the order they began. A Run without a
 * terminal Journal event that is not the active one was interrupted: Studio
 * closed while it ran, and its tools are not replayed.
 */
export function transcriptBlocks({
  entries,
  events,
  files,
  activeId,
  rollingBack,
}: Pick<ConversationState, 'entries' | 'events' | 'files' | 'rollingBack'> & {
  /** Only which Run is active: its streaming reply changes every frame and is no part of the blocks. */
  activeId: string | undefined;
}): TranscriptBlock[] {
  const runs = new Map<string, RunBlock>();
  for (const entry of entries) {
    let block = runs.get(entry.run);
    if (!block) {
      block = newRun(entry.run);
      runs.set(entry.run, block);
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

  for (const block of runs.values()) {
    const last = block.work.at(-1)?.message;
    if (last?.role === 'assistant' && !last.content.some((part) => part.type === 'toolCall')) {
      block.answer = last;
      block.work.pop();
    }
  }

  const blocks = new Map<string, TranscriptBlock>();
  const pruned = new Set<string>();
  for (const event of events) {
    if (event.type === 'checkpoint_pruned') pruned.add(event.run);
    if (event.type === 'rolled_back') {
      blocks.set(event.run, {
        kind: 'rollback',
        id: event.run,
        target: blocks.get(event.target),
        files: event.files,
        undone: false,
        restorable: false,
      });
      continue;
    }
    const block = runs.get(event.run);
    if (!block) continue;
    if (event.type === 'run_created') {
      block.startedAt = event.time;
      blocks.set(block.id, block);
    }
    if (!TERMINAL_EVENTS.has(event.type)) continue;
    block.endedAt = event.time;
    if (event.type === 'run_completed') block.status = 'completed';
    if (event.type === 'run_cancelled') block.status = 'cancelled';
    if (event.type === 'run_failed') {
      block.status = 'failed';
      block.failure = { code: event.code, message: event.message };
    }
  }
  // History reaches here before the Journal's first event only for a Run just starting.
  for (const block of runs.values()) if (!blocks.has(block.id)) blocks.set(block.id, block);

  const running = activeId === undefined ? undefined : runs.get(activeId);
  if (running) running.status = 'running';
  const undone = undoneOperations(events);
  const busy = activeId !== undefined || rollingBack;
  for (const block of blocks.values()) {
    block.undone = undone.has(block.id);
    block.restorable = !busy && !pruned.has(block.id) && canRestore(events, files, block.id);
  }
  return [...blocks.values()];
}

function newRun(id: string): RunBlock {
  return {
    kind: 'run',
    id,
    request: '',
    work: [],
    answer: undefined,
    status: 'interrupted',
    failure: undefined,
    startedAt: undefined,
    endedAt: undefined,
    toolCalls: 0,
    undone: false,
    restorable: false,
  };
}

function canRestore(
  events: readonly JournalEvent[],
  files: readonly CheckpointFile[],
  op: string,
): boolean {
  return operations(events).includes(op) && restorePlan(events, files, op).length > 0;
}

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
