import { describe, expect, test } from '@rstest/core';
import type {
  Api,
  AssistantMessage,
  Model,
  ProviderStreams,
  StopReason,
  ToolCall,
  UserMessage,
} from '@earendil-works/pi-ai';
import { createAssistantMessageEventStream } from '@earendil-works/pi-ai/utils/event-stream';
import { closeToolGroups } from './context';
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
  const streamSimple = () => {
    const stream = createAssistantMessageEventStream();
    const message = replies.shift();
    if (!message) throw new Error('The script ran out of replies');
    queueMicrotask(() => {
      stream.push({ type: 'start', partial: message });
      stream.push({
        type: 'done',
        reason: message.stopReason as 'stop' | 'length' | 'toolUse',
        message,
      });
    });
    return stream;
  };
  return { stream: streamSimple, streamSimple };
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

function environment(streams: ProviderStreams) {
  const history: HistoryEntry[] = [];
  const journal: JournalEvent[] = [];
  const env: RunEnvironment = {
    agent: { model, streams, options: {} },
    systemPrompt: 'Help.',
    tools: [echo],
    secrets: [],
    toolResults: { put: () => Promise.resolve() },
    record: (entry) => history.push(entry),
    journal: (event) => journal.push(event),
    takeGuidance: () => [],
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
