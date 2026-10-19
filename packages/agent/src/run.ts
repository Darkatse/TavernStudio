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
import { modelContext } from './context';
import type { HistoryEntry } from './history';
import type { JournalEvent } from './journal';
import type { ReadState } from './read-state';
import { modelToolName, ToolError, type Tool, type ToolContext, type ToolResult } from './tool';
import { resultForModel, type ToolResultStore } from './tool-results';

/** A model ready to stream: pi-ai's model description and the API that serves it. */
export interface AgentModel {
  model: Model<Api>;
  streams: ProviderStreams;
  /** Key, headers, fetch and reasoning for the endpoint; retries stay off. */
  options: SimpleStreamOptions;
}

/** Budgets per Run, TauriTavern's defaults. */
export const MAX_ROUNDS = 80;
export const MAX_TOOL_CALLS = 80;

/** What a Run reads and where it writes; the app provides the stores. */
export interface RunEnvironment {
  agent: AgentModel;
  systemPrompt: string;
  tools: readonly Tool[];
  toolResults: ToolResultStore;
  /** Appends to History. */
  record(entry: HistoryEntry): void;
  /** Appends to the Journal. */
  journal(event: JournalEvent): void;
  /** The assistant message as it streams, for the Transcript. */
  streaming?(partial: AssistantMessage, round: number): void;
  /** Guidance the author added since the last request; the Run takes it before each request. */
  takeGuidance(): string[];
  signal: AbortSignal;
}

export type RunOutcome =
  | { status: 'completed' }
  | { status: 'cancelled' }
  | { status: 'failed'; code: string; message: string };

/**
 * Runs the Agent from the author's message until the model answers without
 * calling a tool (docs/Agent.md §1): the Session mode of TauriTavern's in-app
 * assistant, with no finish tool. Each Round sends the context, streams the
 * reply, then runs its tool calls in order.
 *
 * Mistakes the model can correct go back to it as error results. The Run
 * fails, with its record kept, when the model's reply cannot be acted on: an
 * error, output cut off at the length limit, an undeclared tool. Cancelling
 * keeps what already happened; unanswered calls are explained to the next Run
 * instead of replayed.
 */
export async function runAgent(
  id: string,
  history: readonly HistoryEntry[],
  message: UserMessage,
  environment: RunEnvironment,
): Promise<RunOutcome> {
  const { agent, signal } = environment;
  const entries = [...history];
  const record = (entry: HistoryEntry) => {
    entries.push(entry);
    environment.record(entry);
  };
  const journal = (event: DistributiveOmit<JournalEvent, 'run' | 'time'>) =>
    environment.journal({ ...event, run: id, time: Date.now() });
  const end = (outcome: RunOutcome): RunOutcome => {
    if (outcome.status === 'completed') journal({ type: 'run_completed' });
    else if (outcome.status === 'cancelled') journal({ type: 'run_cancelled' });
    else journal({ type: 'run_failed', code: outcome.code, message: outcome.message });
    return outcome;
  };

  journal({ type: 'run_created' });
  record({ run: id, round: 0, message });
  const tools = new Map(environment.tools.map((tool) => [modelToolName(tool.id), tool]));
  const reads: ReadState = new Map();
  let calls = 0;

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    if (signal.aborted) return end({ status: 'cancelled' });
    const guidance = environment.takeGuidance();
    if (guidance.length > 0) {
      record({ run: id, round, message: guidanceMessage(guidance) });
      journal({ type: 'guidance_added', round });
    }

    journal({ type: 'model_request', round });
    const context = modelContext(environment.systemPrompt, environment.tools, entries);
    const stream = agent.streams.streamSimple(agent.model, normalizeContext(context), {
      ...agent.options,
      maxRetries: 0,
      signal,
    });
    for await (const event of stream) {
      if ('partial' in event) environment.streaming?.(event.partial, round);
    }
    const reply = await stream.result();
    record({ run: id, round, message: reply });
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

    if (reply.stopReason === 'aborted') return end({ status: 'cancelled' });
    if (reply.stopReason === 'error') {
      return end({
        status: 'failed',
        code: 'agent.model_error',
        message: reply.errorMessage ?? 'The model request failed',
      });
    }
    if (reply.stopReason === 'length') {
      return end({
        status: 'failed',
        code: 'agent.output_truncated',
        message: 'The reply reached the output limit, so its tool calls were not run',
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
      calls += 1;
      let outcome: Awaited<ReturnType<typeof callTool>>;
      try {
        outcome = await callTool(tool, call, calls, { run: id, signal, reads });
      } catch (error) {
        // A tool cut short by cancelling ends the Run as cancelled; its call stays unanswered.
        if (signal.aborted) return end({ status: 'cancelled' });
        throw error;
      }
      const result = await resultForModel(
        outcome.text,
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
  return end({
    status: 'failed',
    code: 'agent.max_tool_rounds_exceeded',
    message: `The Run used all ${MAX_ROUNDS} rounds without finishing`,
  });
}

/**
 * Runs one call. The budget is spent before the arguments are checked, as in
 * TauriTavern. A `ToolError` becomes an error result with its code; any other
 * error ends the Run.
 */
async function callTool(
  tool: Tool,
  call: ToolCall,
  calls: number,
  context: ToolContext,
): Promise<ToolResult & { error?: string }> {
  try {
    if (calls > MAX_TOOL_CALLS) {
      throw new ToolError(
        'agent.tool_budget_exhausted',
        `This Run has used all ${MAX_TOOL_CALLS} tool calls. Answer with what you have.`,
      );
    }
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

/** Guidance joins the context as one user message before the next request, as in TauriTavern. */
function guidanceMessage(guidance: readonly string[]): UserMessage {
  return {
    role: 'user',
    content: guidance.map((text) => `<user_guidance>\n${text}\n</user_guidance>`).join('\n\n'),
    timestamp: Date.now(),
  };
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
