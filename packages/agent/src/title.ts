import { normalizeContext } from '@earendil-works/pi-ai/utils/transcript';
import type { AgentModel } from './run';

const PROMPT =
  "Name the conversation that the author's message below begins. Reply with the name alone: a few words that say what the author wants, in the language of the message, with no quotation marks and no closing period.";
/** Enough to name it by; a long first message is mostly pasted code. */
const MESSAGE_CHARS = 2000;
/** Room for a title, and for the little thinking a model that cannot stop thinking does. */
const TITLE_TOKENS = 256;
const TITLE_CHARS = 80;

/**
 * A short name for a conversation from its first message, asked of the model
 * on its own, without the conversation's tools. Undefined when the reply
 * holds none.
 */
export async function conversationTitle(
  agent: AgentModel,
  message: string,
  signal: AbortSignal,
): Promise<string | undefined> {
  // pi-ai asks for no reasoning when no level is given.
  const { reasoning: _reasoning, ...options } = agent.options;
  const context = normalizeContext({
    systemPrompt: PROMPT,
    messages: [
      {
        role: 'user',
        content: Array.from(message).slice(0, MESSAGE_CHARS).join(''),
        timestamp: Date.now(),
      },
    ],
  });
  const stream = agent.streams.streamSimple(agent.model, context, {
    ...options,
    maxTokens: TITLE_TOKENS,
    signal,
  });
  const reply = await stream.result();
  if (reply.stopReason !== 'stop') return undefined;
  const text = reply.content.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('');
  const title = (text.split('\n').find((line) => line.trim() !== '') ?? '')
    .trim()
    .replace(/^["'“”‘’「」『』《》]+|["'“”‘’「」『』《》。.]+$/gu, '')
    .trim();
  return title === '' ? undefined : Array.from(title).slice(0, TITLE_CHARS).join('');
}
