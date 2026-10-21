import type {
  Api,
  AssistantMessage,
  Model,
  ProviderStreams,
  SimpleStreamOptions,
  ToolCall,
  ToolResultMessage,
  UserMessage,
} from '@earendil-works/pi-ai';
import { normalizeContext } from '@earendil-works/pi-ai/utils/transcript';
import { normalizeArguments } from './arguments';
import {
  CompactionError,
  compactionPoint,
  contextTokens,
  handoffMessage,
  keptFrom,
  overflowed,
  writeHandoff,
} from './compaction';
import { contextEntries, modelContext } from './context';
import type { HistoryEntry } from './history';
import type { JournalEvent } from './journal';
import type { ReadState } from './read-state';
import { modelToolName, ToolError, type Tool, type ToolContext, type ToolResult } from './tool';
import { resultForModel, type ToolResultStore } from './tool-results';

const MODEL_RETRIES = 3;

export interface AgentModel {
  model: Model<Api>;
  streams: ProviderStreams;
  options: SimpleStreamOptions;
}

export interface RunEnvironment {
  agent: AgentModel;
  systemPrompt: string;
  tools: readonly Tool[];
  secrets: readonly string[];
  toolResults: ToolResultStore;
  record(entry: HistoryEntry): void;
  journal(event: JournalEvent): void;
  streaming?(partial: AssistantMessage, round: number): void;
  /** Guidance the author added since the last request; the Run takes it before each request. */
  takeGuidance(): string[];
  /** The share of the context window at which the context is compacted. */
  compactAt: number;
  signal: AbortSignal;
}

export type RunOutcome =
  | { status: 'completed' }
  | { status: 'cancelled' }
  | { status: 'failed'; code: string; message: string };

/**
 * The Session mode of TauriTavern's in-app assistant, with no finish tool:
 * the Run ends when the model answers without calling a tool.
 *
 * Mistakes the model can correct go back to it as error results. The Run
 * fails, with its record kept, when the model's reply cannot be acted on.
 * Cancelling keeps what already happened; unanswered calls are explained to
 * the next Run instead of replayed.
 */
export async function runAgent(
  id: string,
  history: readonly HistoryEntry[],
  message: UserMessage,
  environment: RunEnvironment,
): Promise<RunOutcome> {
  const { agent, signal } = environment;
  const operation = startOperation(id, history, environment);
  const { entries, record, journal, end, requesting, point } = operation;
  record({ run: id, round: 0, message });
  const tools = new Map(environment.tools.map((tool) => [modelToolName(tool.id), tool]));
  const reads: ReadState = new Map();
  const context = () => modelContext(environment.systemPrompt, environment.tools, entries);
  const compact = async (round: number): Promise<RunOutcome | undefined> => {
    const failure = await compactContext(round, operation, environment);
    // The Run's reads left the context with the Rounds the handoff replaced.
    if (!failure) reads.clear();
    return failure && end(failure);
  };

  for (let round = 1; ; round++) {
    if (signal.aborted) return end({ status: 'cancelled' });
    const guidance = environment.takeGuidance();
    if (guidance.length > 0) {
      record({ run: id, round, message: guidanceMessage(guidance) });
      journal({ type: 'guidance_added', round });
    }

    // At most once a Round, before its request or when the request overflows.
    let compacted = false;
    if (contextTokens(context()) >= point) {
      const stopped = await compact(round);
      if (stopped) return stopped;
      compacted = true;
    }
    let reply: AssistantMessage;
    for (;;) {
      journal({ type: 'model_request', round });
      const stream = agent.streams.streamSimple(agent.model, normalizeContext(context()), {
        ...requesting.options,
        signal,
      });
      for await (const event of stream) {
        if ('partial' in event) environment.streaming?.(event.partial, round);
      }
      reply = withDistinctCallIds(await stream.result());
      journal({
        type: 'model_completed',
        round,
        stopReason: reply.stopReason,
        durationMs: reply.durationMs,
        usage: {
          input: reply.usage.input,
          output: reply.usage.output,
          cacheRead: reply.usage.cacheRead,
          cacheWrite: reply.usage.cacheWrite,
        },
      });
      if (compacted || !overflowed(reply, agent.model)) break;
      // The estimate fell short of what the provider counts.
      const stopped = await compact(round);
      if (stopped) return stopped;
      compacted = true;
    }
    record({ run: id, round, message: reply });

    if (reply.stopReason === 'aborted') return end({ status: 'cancelled' });
    if (reply.stopReason === 'error') {
      return end({
        status: 'failed',
        code: 'agent.model_error',
        message: reply.errorMessage ?? 'The model request failed',
      });
    }
    if (reply.stopReason === 'length') {
      // pi-ai lowers the output limit as the conversation fills the window, so both decide it.
      const { input, cacheRead, cacheWrite, output } = reply.usage;
      return end({
        status: 'failed',
        code: 'agent.output_truncated',
        message: `The reply stopped at the output limit after ${output} tokens, so its tool calls were not run (input ${input + cacheRead + cacheWrite} tokens; output limit ${agent.model.maxTokens}, context window ${agent.model.contextWindow})`,
      });
    }
    if (reply.stopReason !== 'stop' && reply.stopReason !== 'toolUse') {
      return end({
        status: 'failed',
        code: 'agent.unexpected_stop',
        message: `The model stopped with "${reply.stopReason}"`,
      });
    }

    const toolCalls = reply.content.filter((part): part is ToolCall => part.type === 'toolCall');
    if (toolCalls.length === 0) return end({ status: 'completed' });
    for (const call of toolCalls) {
      if (signal.aborted) return end({ status: 'cancelled' });
      const tool = tools.get(call.name);
      if (!tool) {
        return end({
          status: 'failed',
          code: 'agent.tool_not_declared',
          message: `The model called ${call.name}, which is not one of its tools`,
        });
      }
      journal({ type: 'tool_call_started', round, callId: call.id, tool: tool.id });
      const started = performance.now();
      let outcome: Awaited<ReturnType<typeof callTool>>;
      try {
        outcome = await callTool(tool, call, { run: id, signal, reads });
      } catch (error) {
        // A tool cut short by cancelling ends the Run as cancelled; its call stays unanswered.
        if (signal.aborted) return end({ status: 'cancelled' });
        throw error;
      }
      let text = outcome.text;
      for (const secret of environment.secrets) text = text.replaceAll(secret, '[redacted]');
      const result = await resultForModel(
        text,
        { runId: id, round, callId: call.id },
        environment.toolResults,
      );
      const durationMs = Math.round(performance.now() - started);
      record({
        run: id,
        round,
        message: toolResult(call, { ...outcome, text: result.text }, durationMs),
      });
      journal({
        type: 'tool_call_completed',
        round,
        callId: call.id,
        durationMs,
        ...(outcome.error === undefined ? {} : { error: outcome.error }),
        ...(result.storedAt === undefined ? {} : { storedAt: result.storedAt }),
      });
    }
  }
}

/**
 * Compacts a conversation's context when the author asks: an operation of its
 * own in the Journal, as a Run is, so that a rollback past it undoes it.
 */
export async function compactConversation(
  id: string,
  history: readonly HistoryEntry[],
  environment: RunEnvironment,
): Promise<RunOutcome> {
  const operation = startOperation(id, history, environment);
  const failure = await compactContext(0, operation, environment);
  return operation.end(failure ?? { status: 'completed' });
}

interface Operation {
  id: string;
  entries: HistoryEntry[];
  record: (entry: HistoryEntry) => void;
  journal: (event: DistributiveOmit<JournalEvent, 'run' | 'time'>) => void;
  end: (outcome: RunOutcome) => RunOutcome;
  /** The model as the operation requests it. */
  requesting: AgentModel;
  /** The tokens at which the context is compacted. */
  point: number;
}

function startOperation(
  id: string,
  history: readonly HistoryEntry[],
  environment: RunEnvironment,
): Operation {
  const entries = [...history];
  const journal = (event: DistributiveOmit<JournalEvent, 'run' | 'time'>) =>
    environment.journal({ ...event, run: id, time: Date.now() });
  journal({ type: 'run_created' });
  const { agent } = environment;
  return {
    id,
    entries,
    record: (entry) => {
      entries.push(entry);
      environment.record(entry);
    },
    journal,
    end: (outcome) => {
      if (outcome.status === 'completed') journal({ type: 'run_completed' });
      else if (outcome.status === 'cancelled') journal({ type: 'run_cancelled' });
      else journal({ type: 'run_failed', code: outcome.code, message: outcome.message });
      return outcome;
    },
    requesting: { ...agent, options: { ...agent.options, maxRetries: MODEL_RETRIES } },
    point: compactionPoint(agent.model, environment.compactAt),
  };
}

/**
 * Replaces the context's earlier Rounds with a handoff the model writes,
 * keeping the latest Rounds as they were. Resolves to the outcome when the
 * operation cannot go on.
 */
async function compactContext(
  round: number,
  { id: run, entries, record, journal, requesting: agent, point }: Operation,
  environment: RunEnvironment,
): Promise<RunOutcome | undefined> {
  const context = () => modelContext(environment.systemPrompt, environment.tools, entries);
  const before = contextTokens(context());
  journal({ type: 'compaction_started', round });
  const inContext = contextEntries(entries);
  let handoff: string;
  try {
    handoff = await writeHandoff(
      agent,
      context(),
      inContext[0]?.handoff !== undefined,
      environment.signal,
    );
  } catch (error) {
    if (environment.signal.aborted) return { status: 'cancelled' };
    if (!(error instanceof CompactionError)) throw error;
    return { status: 'failed', code: 'agent.compaction_failed', message: error.message };
  }
  const kept = inContext.filter((entry) => entry.handoff === undefined);
  record({
    run,
    round,
    message: handoffMessage(handoff),
    handoff: { keptFrom: keptFrom(kept, point) },
  });
  const after = contextTokens(context());
  journal({ type: 'context_compacted', round, before, after });
  if (after < point) return undefined;
  return {
    status: 'failed',
    code: 'agent.context_full',
    message: `The context is still ${after} tokens after compaction, at or above the ${point} at which it compacts`,
  };
}

async function callTool(
  tool: Tool,
  call: ToolCall,
  context: ToolContext,
): Promise<ToolResult & { error?: string }> {
  try {
    if (call.argumentsError !== undefined) {
      throw new ToolError('tool.invalid_arguments', call.argumentsError);
    }
    return await tool.run(normalizeArguments(call.arguments), context);
  } catch (error) {
    if (!(error instanceof ToolError)) throw error;
    // OpenAI's formats carry no error flag, so the text says it, as in TauriTavern.
    return { text: `## Tool error\n${error.code}: ${error.message}`, error: error.code };
  }
}

function toolResult(
  call: ToolCall,
  { text, images, details, error }: ToolResult & { error?: string },
  durationMs: number,
): ToolResultMessage {
  return {
    role: 'toolResult',
    toolCallId: call.id,
    toolName: call.name,
    content: [{ type: 'text', text }, ...(images ?? [])],
    ...(details === undefined ? {} : { details }),
    isError: error !== undefined,
    timestamp: Date.now(),
    durationMs,
  };
}

/**
 * Some OpenAI-compatible relays send no call ids, which pi-ai reads as empty.
 * Every later step pairs a result with its call by id, so an empty or repeated
 * id becomes a new one here; every other id stays as the provider sent it.
 */
function withDistinctCallIds(reply: AssistantMessage): AssistantMessage {
  const seen = new Set<string>();
  const content = reply.content.map((part) => {
    if (part.type !== 'toolCall') return part;
    const id =
      part.id === '' || seen.has(part.id)
        ? `call_${crypto.randomUUID().replaceAll('-', '').slice(0, 24)}`
        : part.id;
    seen.add(id);
    return id === part.id ? part : { ...part, id };
  });
  return { ...reply, content };
}

/** Guidance joins the context as TauriTavern adds it. */
function guidanceMessage(guidance: readonly string[]): UserMessage {
  return {
    role: 'user',
    content: guidance.map((text) => `<user_guidance>\n${text}\n</user_guidance>`).join('\n\n'),
    timestamp: Date.now(),
  };
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
