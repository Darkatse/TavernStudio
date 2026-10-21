import { createServer } from 'node:http';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
};

/**
 * `script(round, request)` returns `{ text?, calls?: [{ name, args }] }` for
 * each reply of a Run, `round` counting from 0 since the author's last
 * message. Calls name tools as the model sees them.
 */
export async function startScriptedModel(port, script) {
  const requests = [];
  const server = createServer(async (request, response) => {
    if (request.method === 'OPTIONS') {
      response.writeHead(204, CORS).end();
      return;
    }
    let body = '';
    for await (const part of request) body += part;
    const payload = JSON.parse(body);
    response.writeHead(200, { ...CORS, 'content-type': 'text/event-stream' });
    const send = (delta, finish = null) =>
      response.write(
        `data: ${JSON.stringify({ id: 'scripted', object: 'chat.completion.chunk', created: 0, model: payload.model, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`,
      );

    // A connection test has no tools.
    const reply = payload.tools ? script(roundOf(payload.messages), payload) : { text: 'OK' };
    if (payload.tools) requests.push(payload);
    if (reply.text) send({ role: 'assistant', content: reply.text });
    for (const [index, call] of (reply.calls ?? []).entries()) {
      send({
        tool_calls: [
          {
            index,
            id: `call_${requests.length}_${index}`,
            type: 'function',
            function: { name: call.name, arguments: JSON.stringify(call.args) },
          },
        ],
      });
    }
    send({}, reply.calls?.length ? 'tool_calls' : 'stop');
    // As a real service reports what it read, here roughly four characters a token.
    response.write(
      `data: ${JSON.stringify({ id: 'scripted', object: 'chat.completion.chunk', created: 0, model: payload.model, choices: [], usage: { prompt_tokens: Math.round(body.length / 4), completion_tokens: 10, total_tokens: Math.round(body.length / 4) + 10 } })}\n\n`,
    );
    response.end('data: [DONE]\n\n');
  });
  await new Promise((resolve) => server.listen(port, resolve));
  return { requests, close: () => server.close() };
}

/**
 * pi-ai moves screenshots into user messages of their own on this API; the
 * author's messages are text.
 */
function roundOf(messages) {
  const author = messages.findLastIndex(
    (message) =>
      message.role === 'user' &&
      (typeof message.content === 'string' ||
        !message.content.some((part) => part.type === 'image_url')),
  );
  return messages.slice(author).filter((message) => message.role === 'assistant').length;
}
