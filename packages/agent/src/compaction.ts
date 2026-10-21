import type {
  Api,
  AssistantMessage,
  Context,
  Message,
  Model,
  UserMessage,
} from '@earendil-works/pi-ai';
import {
  estimateContextTokens,
  estimateMessageTokens,
  estimateTextTokens,
} from '@earendil-works/pi-ai/utils/estimate';
import { isContextOverflow } from '@earendil-works/pi-ai/utils/overflow';
import { normalizeContext } from '@earendil-works/pi-ai/utils/transcript';
import type { HistoryEntry } from './history';
import type { AgentModel } from './run';

/**
 * Room to write a handoff in: pi-ai caps a reply at the window less the
 * context and 4,096, and a handoff runs to a few thousand tokens, thinking
 * included.
 */
const HANDOFF_ROOM = 20_000;
/** The latest Rounds stay as they were, up to this much. */
const KEPT_TOKENS = 20_000;
/** Of the point it compacts at, so that a compacted context lands well below it. */
const KEPT_SHARE = 0.25;

const HANDOFF_REQUEST = `Context compaction: write a handoff for yourself. The earlier part of this conversation is about to leave your context, and you will carry on from the handoff, with only the latest rounds kept as they are. Reply with the handoff alone; do not call tools and do not continue the task.

Use these sections:
## Goal
What the author wants: their requests in their own words, and the constraints and preferences they gave.
## Done
What is finished: each file changed, by path, and what the change does.
## In progress
What you were doing as you wrote this, and how far it got.
## Decisions
What was chosen and why, and what was tried and dropped.
## Current state
The preview's frontend and device, what it showed last, and any errors or failing checks.
## Next steps
What is left, in order.

Keep exact paths, line numbers, selectors, custom properties and error messages. Leave out what the project's files already say: you will read a file again before you change it.`;

const EARLIER_HANDOFF =
  '\n\nYour context begins with an earlier handoff. Keep from it what still holds, and add what happened since.';

const HANDOFF_PREFIX = `The earlier part of this conversation was compacted. Below is the handoff you wrote as it left your context: your own notes, not a message from the author. The latest rounds follow as they were. Read a file again before you change it.`;

/** A failed handoff; the Run cannot continue without one. */
export class CompactionError extends Error {
  override name = 'CompactionError';
}

/** The tokens at which the context is compacted. */
export function compactionPoint(model: Model<Api>, share: number): number {
  return Math.min(Math.floor(model.contextWindow * share), model.contextWindow - HANDOFF_ROOM);
}

/**
 * The provider's count of the context it last read, and an estimate of what
 * came after. Without a count, the system prompt and tools are estimated too.
 */
export function contextTokens(context: Context): number {
  const estimate = estimateContextTokens(context.messages);
  if (estimate.usageTokens > 0) return estimate.tokens;
  return (
    estimate.tokens +
    estimateTextTokens(`${context.systemPrompt ?? ''}${JSON.stringify(context.tools ?? [])}`)
  );
}

/**
 * Where the kept Rounds start: as many of the latest whole Rounds of the
 * context as fit in their share, or none when even the latest does not.
 */
export function keptFrom(
  entries: readonly HistoryEntry[],
  point: number,
): { run: string; round: number } | null {
  const budget = Math.min(KEPT_TOKENS, point * KEPT_SHARE);
  let tokens = 0;
  let from: { run: string; round: number } | null = null;
  for (let end = entries.length; end > 0;) {
    const last = entries[end - 1]!;
    let start = end - 1;
    while (
      start > 0 &&
      entries[start - 1]!.run === last.run &&
      entries[start - 1]!.round === last.round
    ) {
      start -= 1;
    }
    for (const entry of entries.slice(start, end)) tokens += estimateMessageTokens(entry.message);
    if (tokens > budget) break;
    from = { run: last.run, round: last.round };
    end = start;
  }
  return from;
}

/**
 * The model's own request with the instruction after it: the same system
 * prompt, tools, history with its reasoning and options, so the provider's
 * cached prefix serves it, and no channel sees reasoning it expects missing.
 * Tool choice stays as it is, since changing it costs Anthropic's message
 * cache; a reply that only calls tools is asked again with tools turned off.
 * A context too long even for this loses its oldest turns, which keeps the
 * cached prefix of the rest.
 */
export async function writeHandoff(
  agent: AgentModel,
  context: Context,
  earlier: boolean,
  signal: AbortSignal,
): Promise<string> {
  const first = context.messages[0];
  let messages = context.messages;
  let toolsOff = false;
  for (;;) {
    const instruction: UserMessage = {
      role: 'user',
      content:
        earlier && messages[0] === first ? HANDOFF_REQUEST + EARLIER_HANDOFF : HANDOFF_REQUEST,
      timestamp: Date.now(),
    };
    const stream = agent.streams.streamSimple(
      agent.model,
      normalizeContext({ ...context, messages: [...messages, instruction] }),
      { ...agent.options, ...(toolsOff ? { toolChoice: 'none' as const } : {}), signal },
    );
    const reply = await stream.result();
    if (reply.stopReason === 'aborted') throw new CompactionError('The handoff was cancelled');
    if (overflowed(reply, agent.model)) {
      messages = withoutOldestTurn(messages);
      if (messages.length === 0) throw new CompactionError('The context is too long to hand off');
      continue;
    }
    if (reply.stopReason === 'error') {
      throw new CompactionError(reply.errorMessage ?? 'The handoff request failed');
    }
    if (reply.stopReason === 'length') {
      throw new CompactionError(
        `The handoff stopped at the output limit after ${reply.usage.output} tokens`,
      );
    }
    const text = reply.content
      .flatMap((part) => (part.type === 'text' ? [part.text] : []))
      .join('')
      .trim();
    if (text !== '') return text;
    if (toolsOff) throw new CompactionError('The model wrote no handoff');
    toolsOff = true;
  }
}

/** The handoff as the context begins with it. */
export function handoffMessage(handoff: string): UserMessage {
  return {
    role: 'user',
    content: `${HANDOFF_PREFIX}\n\n<handoff>\n${handoff}\n</handoff>`,
    timestamp: Date.now(),
  };
}

/** What the model wrote, from the message the context begins with. */
export function handoffText(message: UserMessage): string {
  const content = typeof message.content === 'string' ? message.content : '';
  return /<handoff>\n([\s\S]*)\n<\/handoff>$/.exec(content)?.[1] ?? content;
}

/** A reply that failed because the request was longer than the context window. */
export function overflowed(reply: AssistantMessage, model: Model<Api>): boolean {
  return (
    (reply.stopReason === 'error' || reply.stopReason === 'length') &&
    isContextOverflow(reply, model.contextWindow)
  );
}

/** A user message, or an assistant message with the results of its calls. */
function withoutOldestTurn(messages: readonly Message[]): Message[] {
  let next = 1;
  while (messages[next]?.role === 'toolResult') next += 1;
  return messages.slice(next);
}
