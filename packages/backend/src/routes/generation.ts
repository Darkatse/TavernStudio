import type { Routes } from '../backend';
import { json, type BackendResponse } from '../http';
import { ReplayError, type Reply } from '../replay';

/** The one model Replay offers, so the frontend counts the API as connected. */
const MODEL = 'replay';
const CHARACTERS_PER_EVENT = 8;
const EVENT_INTERVAL_MS = 25;

export const generationRoutes: Routes = {
  // chat-completions.js /status forwards the provider's model list.
  'POST /api/backends/chat-completions/status': () => json({ data: [{ id: MODEL }] }),

  // chat-completions.js /generate, answered by Replay in the OpenAI format
  // SillyTavern's client reads: a completion, or server-sent chunks ending in [DONE].
  'POST /api/backends/chat-completions/generate': (request) => {
    const { stream } = request.json() as { stream?: unknown };
    let reply: Reply;
    try {
      reply = request.replay.next();
    } catch (error) {
      if (!(error instanceof ReplayError)) throw error;
      return json({ error: { message: error.message } }, 400);
    }
    return stream === true ? streamed(reply) : completed(reply);
  },
};

function completed({ content, reasoning }: Reply): BackendResponse {
  return json({
    object: 'chat.completion',
    model: MODEL,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content,
          ...(reasoning ? { reasoning_content: reasoning } : {}),
        },
        finish_reason: 'stop',
      },
    ],
  });
}

function streamed({ content, reasoning }: Reply): BackendResponse {
  const deltas = [
    ...pieces(reasoning ?? '').map((piece) => ({ reasoning_content: piece })),
    ...pieces(content).map((piece) => ({ content: piece })),
  ];
  const events = [
    ...deltas.map((delta) => chunk(delta, null)),
    chunk({}, 'stop'),
    'data: [DONE]\n\n',
  ];
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      let sent = 0;
      const send = () => {
        const event = events[sent++];
        if (event === undefined) {
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(event));
        timer = setTimeout(send, EVENT_INTERVAL_MS);
      };
      send();
    },
    cancel() {
      clearTimeout(timer);
    },
  });
  return { status: 200, headers: { 'content-type': 'text/event-stream; charset=utf-8' }, body };
}

function chunk(delta: Record<string, string>, finishReason: string | null): string {
  const data = {
    object: 'chat.completion.chunk',
    model: MODEL,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  };
  return `data: ${JSON.stringify(data)}\n\n`;
}

/** Never splits inside a surrogate pair. */
function pieces(text: string): string[] {
  const characters = Array.from(text);
  const result: string[] = [];
  for (let start = 0; start < characters.length; start += CHARACTERS_PER_EVENT) {
    result.push(characters.slice(start, start + CHARACTERS_PER_EVENT).join(''));
  }
  return result;
}
