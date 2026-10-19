import type { Routes } from '../backend';
import { json, text } from '../http';

/**
 * Studio runs no tokenizer. Counts use SillyTavern's own estimate
 * (tokenizers.js guesstimate: characters / 3.35), so token counters in the UI
 * stay plausible. These handlers are synchronous because SillyTavern calls
 * some of them with synchronous XHR.
 */
const CHARACTERS_PER_TOKEN = 3.35;

const estimate = (content: string) => Math.ceil(content.length / CHARACTERS_PER_TOKEN);

const encode: Routes[string] = (request) =>
  json({ ids: [], count: estimate(text(request.json(), 'text') ?? ''), chunks: [] });

export const tokenizerRoutes: Routes = {
  'POST /api/tokenizers/openai/count': (request) => {
    const messages = request.json();
    return json({ token_count: estimate(JSON.stringify(Array.isArray(messages) ? messages : [])) });
  },
  'POST /api/tokenizers/:tokenizer/encode': encode,
  'POST /api/tokenizers/:tokenizer/decode': () => json({ text: '', chunks: [] }),
  'POST /api/tokenizers/remote/:api/:operation': encode,
};
