import { describe, expect, test } from '@rstest/core';
import type {
  Api,
  AssistantMessage,
  Model,
  ProviderStreams,
  SimpleStreamOptions,
  StopReason,
  ToolCall,
  TranscriptContext,
  UserMessage,
} from '@earendil-works/pi-ai';
import { createAssistantMessageEventStream } from '@earendil-works/pi-ai/utils/event-stream';
import { closeToolGroups, contextEntries } from './context';
import type { HistoryEntry } from './history';
import type { JournalEvent } from './journal';
import { runAgent, type RunEnvironment } from './run';
import { ToolError, type Tool } from './tool';

const model = { id: 'scripted', api: 'scripted', provider: 'test' } as unknown as Model<Api>;

function reply(stopReason: StopReason, ...content: AssistantMessage['content']): AssistantMessage {
  return {
    role: 'assistant',
    content,
    api: 'scripted',
    provider: 'test',
    model: 'scripted',
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason,
    timestamp: 0,
  };
}

function call(id: string, name: string, args: ToolCall['arguments'] = {}): ToolCall {
  return { type: 'toolCall', id, name, arguments: args };
}

function scripted(...replies: AssistantMessage[]): ProviderStreams {
  return recording(...replies).streams;
}

/** The streams, and the context and options of each request they received. */
function recording(...replies: AssistantMessage[]) {
  const requests: { context: TranscriptContext; options: SimpleStreamOptions | undefined }[] = [];
  const streamSimple = (
    _model: Model<Api>,
    context: TranscriptContext,
    options?: SimpleStreamOptions,
  ) => {
    requests.push({ context, options });
    const stream = createAssistantMessageEventStream();
    const message = replies.shift();
    if (!message) throw new Error('The script ran out of replies');
    queueMicrotask(() => {
      stream.push({ type: 'start', partial: message });
      if (message.stopReason === 'error' || message.stopReason === 'aborted') {
        stream.push({ type: 'error', reason: message.stopReason, error: message });
        return;
      }
      stream.push({
        type: 'done',
        reason: message.stopReason as 'stop' | 'length' | 'toolUse',
        message,
      });
    });
    return stream;
  };
  return { streams: { stream: streamSimple, streamSimple } as ProviderStreams, requests };
}

const echo: Tool = {
  id: 'demo.echo',
  description: 'Echoes its text.',
  inputSchema: { type: 'object' },
  run: (input) => {
    if (typeof input.text !== 'string')
      throw new ToolError('demo.missing_text', 'text is required');
    return Promise.resolve({ text: `echo: ${input.text}` });
  },
};

function environment(streams: ProviderStreams, secrets: readonly string[] = []) {
  const history: HistoryEntry[] = [];
  const journal: JournalEvent[] = [];
  const env: RunEnvironment = {
    agent: { model, streams, options: {} },
    systemPrompt: 'Help.',
    tools: [echo],
    secrets,
    toolResults: { put: () => Promise.resolve() },
    record: (entry) => history.push(entry),
    journal: (event) => journal.push(event),
    takeGuidance: () => [],
    compactAt: 0.95,
    signal: new AbortController().signal,
  };
  return { env, history, journal };
}

const ask: UserMessage = { role: 'user', content: 'Go', timestamp: 0 };

describe('runAgent', () => {
  test('runs the calls in order and ends when the model answers without one', async () => {
    const { env, history } = environment(
      scripted(
        reply(
          'toolUse',
          call('a', 'demo_echo', { text: 'one' }),
          call('b', 'demo_echo', { text: 'two' }),
        ),
        reply('stop', { type: 'text', text: 'Done.' }),
      ),
    );
    expect(await runAgent('run-1', [], ask, env)).toEqual({ status: 'completed' });
    expect(history.map((entry) => [entry.round, entry.message.role])).toEqual([
      [0, 'user'],
      [1, 'assistant'],
      [1, 'toolResult'],
      [1, 'toolResult'],
      [2, 'assistant'],
    ]);
    const results = history.flatMap((entry) =>
      entry.message.role === 'toolResult' ? [entry.message] : [],
    );
    expect(results.map((result) => [result.toolCallId, result.content[0]])).toEqual([
      ['a', { type: 'text', text: 'echo: one' }],
      ['b', { type: 'text', text: 'echo: two' }],
    ]);
  });

  test('a mistake goes back to the model; an undeclared tool fails the Run', async () => {
    const { env, history } = environment(
      scripted(
        reply('toolUse', call('a', 'demo_echo')),
        reply('toolUse', call('b', 'demo_shout', { text: 'hi' })),
      ),
    );
    const outcome = await runAgent('run-1', [], ask, env);
    expect(outcome).toMatchObject({ status: 'failed', code: 'agent.tool_not_declared' });
    const [result] = history.flatMap((entry) =>
      entry.message.role === 'toolResult' ? [entry.message] : [],
    );
    expect(result?.isError).toBe(true);
    expect(result?.content[0]).toEqual({
      type: 'text',
      text: '## Tool error\ndemo.missing_text: text is required',
    });
  });

  test('calls that come without distinct ids get their own, and the next request pairs them', async () => {
    const { env, history } = environment(
      scripted(
        reply(
          'toolUse',
          call('', 'demo_echo', { text: 'one' }),
          call('', 'demo_echo', { text: 'two' }),
        ),
        reply('stop', { type: 'text', text: 'Done.' }),
      ),
    );
    expect(await runAgent('run-1', [], ask, env)).toEqual({ status: 'completed' });
    const calls = history.flatMap((entry) =>
      entry.message.role === 'assistant'
        ? entry.message.content.filter((part) => part.type === 'toolCall')
        : [],
    );
    const ids = calls.map((part) => part.id);
    expect(ids).toHaveLength(2);
    expect(ids.every((id) => id !== '')).toBe(true);
    expect(new Set(ids).size).toBe(2);
    const answered = history.flatMap((entry) =>
      entry.message.role === 'toolResult' ? [entry.message.toolCallId] : [],
    );
    expect(answered).toEqual(ids);
    expect(() => closeToolGroups(history.map((entry) => entry.message))).not.toThrow();
  });

  test('a configured key in a tool result reaches History redacted', async () => {
    const { env, history } = environment(
      scripted(
        reply('toolUse', call('a', 'demo_echo', { text: 'key sk-secret here' })),
        reply('stop', { type: 'text', text: 'Done.' }),
      ),
      ['sk-secret'],
    );
    await runAgent('run-1', [], ask, env);
    const [result] = history.flatMap((entry) =>
      entry.message.role === 'toolResult' ? [entry.message] : [],
    );
    expect(result?.content[0]).toEqual({ type: 'text', text: 'echo: key [redacted] here' });
  });

  test('a reply cut off at the length limit runs none of its calls', async () => {
    const { env, history } = environment(
      scripted(reply('length', call('a', 'demo_echo', { text: 'one' }))),
    );
    expect(await runAgent('run-1', [], ask, env)).toMatchObject({
      status: 'failed',
      code: 'agent.output_truncated',
    });
    expect(history.some((entry) => entry.message.role === 'toolResult')).toBe(false);
  });
});

/** A reply carrying the provider's count of what it read. */
function counted(input: number, message: AssistantMessage): AssistantMessage {
  return { ...message, usage: { ...message.usage, input, totalTokens: input } };
}

function text(value: string) {
  return { type: 'text' as const, text: value };
}

describe('Compaction', () => {
  /** It compacts at 20,000 tokens: the window less the room a handoff needs. */
  const small = { ...model, contextWindow: 40_000, maxTokens: 8_000 } as Model<Api>;

  test("at its point, the handoff is asked in the Run's own request, and the next starts from it", async () => {
    const { streams, requests } = recording(
      counted(21_000, reply('toolUse', call('a', 'demo_echo', { text: 'x'.repeat(30_000) }))),
      reply('stop', text('Notes.')),
      reply('stop', text('Done.')),
    );
    const { env, history, journal } = environment(streams);
    env.agent = { ...env.agent, model: small };
    expect(await runAgent('r', [], ask, env)).toEqual({ status: 'completed' });

    const [first, handoff, next] = requests;
    // The provider's cached prefix serves it: nothing before the instruction changes.
    expect(handoff!.context.messages.slice(0, first!.context.messages.length)).toEqual(
      first!.context.messages,
    );
    expect(handoff!.context.messages.at(-1)).toMatchObject({ role: 'user' });
    expect(handoff!.options?.toolChoice).toBeUndefined();
    // The round's tool result was too long to keep, so the handoff stands alone.
    expect(next!.context.messages.slice(1)).toEqual([
      expect.objectContaining({
        role: 'user',
        content: expect.stringContaining('<handoff>\nNotes.\n</handoff>'),
      }),
    ]);
    expect(history.find((entry) => entry.handoff)?.handoff).toEqual({ keptFrom: null });
    expect(journal.map((event) => event.type)).toContain('context_compacted');
  });

  test('a request the provider finds too long compacts once and goes again', async () => {
    const tooLong = {
      ...reply('error'),
      errorMessage: 'prompt is too long: 213462 tokens > 200000 maximum',
    };
    const { streams, requests } = recording(
      tooLong,
      reply('stop', text('Notes.')),
      reply('stop', text('Done.')),
    );
    const { env, history } = environment(streams);
    env.agent = { ...env.agent, model: { ...small, contextWindow: 200_000 } };
    expect(await runAgent('r', [], ask, env)).toEqual({ status: 'completed' });

    expect(requests).toHaveLength(3);
    // The rejected reply is not kept; the author's message is, after the handoff.
    expect(history.map((entry) => entry.message.role)).toEqual(['user', 'user', 'assistant']);
    expect(history[1]!.handoff).toEqual({ keptFrom: { run: 'r', round: 0 } });
    expect(requests[2]!.context.messages.slice(1).map((message) => message.role)).toEqual([
      'user',
      'user',
    ]);
  });
});

function user(content: string): UserMessage {
  return { role: 'user', content, timestamp: 0 };
}

function inRun(
  round: number,
  message: HistoryEntry['message'],
  handoff?: HistoryEntry['handoff'],
): HistoryEntry {
  return { run: 'r', round, message, ...(handoff ? { handoff } : {}) };
}

describe('contextEntries', () => {
  test('starts at the latest handoff, which supersedes one inside the Rounds it keeps', () => {
    const guidance = inRun(2, user('Bluer.'));
    const first = inRun(2, user('First handoff.'), { keptFrom: { run: 'r', round: 2 } });
    const answer = inRun(2, reply('stop', text('Done.')));
    const second = inRun(3, user('Second handoff.'), { keptFrom: { run: 'r', round: 2 } });
    const history = [
      inRun(0, ask),
      inRun(1, reply('stop', text('Hi.'))),
      guidance,
      first,
      answer,
      second,
    ];
    expect(contextEntries(history)).toEqual([second, guidance, answer]);
  });
});

describe('closeToolGroups', () => {
  test("a stopped Run's unanswered calls reach the next request as one explanation", () => {
    const stopped = reply(
      'toolUse',
      call('a', 'demo_echo', { text: 'one' }),
      call('b', 'demo_echo'),
    );
    const answered = {
      role: 'toolResult' as const,
      toolCallId: 'a',
      toolName: 'demo_echo',
      content: [{ type: 'text' as const, text: 'echo: one' }],
      isError: false,
      timestamp: 0,
    };
    const [first, explained, next] = closeToolGroups([ask, stopped, answered, ask]);
    expect(first).toBe(ask);
    expect(next).toBe(ask);
    expect(explained).toMatchObject({ role: 'assistant', stopReason: 'stop' });
    expect((explained as AssistantMessage).content).toEqual([
      {
        type: 'text',
        text: [
          'The previous turn stopped. Actions without recorded results have an unknown outcome; check the current state before repeating them.',
          'demo_echo({"text":"one"})\nRecorded result: echo: one',
          'demo_echo({})\nOutcome unknown: no recorded result.',
        ].join('\n\n'),
      },
    ]);
  });
});
