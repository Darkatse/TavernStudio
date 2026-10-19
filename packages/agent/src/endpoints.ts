import type { Api, Model, ProviderStreams } from '@earendil-works/pi-ai';

/** The model APIs Studio reaches straight from the browser (docs/Agent.md §2). */
export type EndpointApi =
  'openai-responses' | 'openai-completions' | 'anthropic-messages' | 'google-generative-ai';

/** A model service the author configured, with their own key (BYOK). */
export interface Endpoint {
  /**
   * The provider id pi-ai sees. It must stay the same for an endpoint: pi-ai
   * replays reasoning only to the provider, API and model that produced it,
   * and recognises known providers (`openai`, `anthropic`, `deepseek`, …) by it.
   */
  id: string;
  label: string;
  api: EndpointApi;
  baseUrl: string;
  model: string;
  /** Whether the model reasons; pi-ai asks for reasoning only then. */
  reasoning: boolean;
  /** Whether the model takes images; screenshots need it. */
  images: boolean;
  contextWindow: number;
  maxTokens: number;
}

/** The services an author can pick from; the model, key and limits are theirs to set. */
export const ENDPOINT_PRESETS: readonly Omit<Endpoint, 'model'>[] = [
  preset('openai', 'OpenAI', 'openai-responses', 'https://api.openai.com/v1'),
  preset('anthropic', 'Anthropic', 'anthropic-messages', 'https://api.anthropic.com'),
  preset(
    'google',
    'Gemini',
    'google-generative-ai',
    'https://generativelanguage.googleapis.com/v1beta',
  ),
  preset('deepseek', 'DeepSeek', 'openai-completions', 'https://api.deepseek.com'),
  preset('openrouter', 'OpenRouter', 'openai-completions', 'https://openrouter.ai/api/v1'),
];

function preset(id: string, label: string, api: EndpointApi, baseUrl: string) {
  return {
    id,
    label,
    api,
    baseUrl,
    reasoning: true,
    images: true,
    contextWindow: 128_000,
    maxTokens: 16_000,
  };
}

/** pi-ai's description of the endpoint's model. Studio does not price calls, so cost is zero. */
export function endpointModel(endpoint: Endpoint): Model<Api> {
  return {
    id: endpoint.model,
    name: endpoint.model,
    api: endpoint.api,
    provider: endpoint.id,
    baseUrl: endpoint.baseUrl,
    input: endpoint.images ? ['text', 'image'] : ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    reasoning: endpoint.reasoning,
    contextWindow: endpoint.contextWindow,
    maxTokens: endpoint.maxTokens,
  };
}

/**
 * Asks the endpoint for a one-word reply, to tell the author whether the
 * address, model and key work before a Run depends on them.
 */
export async function probeEndpoint(
  endpoint: Endpoint,
  apiKey: string,
  signal?: AbortSignal,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const [streams, { normalizeContext }] = await Promise.all([
    endpointStreams(endpoint.api),
    import('@earendil-works/pi-ai/utils/transcript'),
  ]);
  const context = normalizeContext({
    messages: [{ role: 'user', content: 'Reply with OK.', timestamp: Date.now() }],
  });
  const reply = await streams
    .streamSimple(endpointModel(endpoint), context, {
      apiKey,
      maxTokens: 32,
      maxRetries: 0,
      ...(signal ? { signal } : {}),
    })
    .result();
  return reply.stopReason === 'error' || reply.stopReason === 'aborted'
    ? { ok: false, message: reply.errorMessage ?? 'The request failed' }
    : { ok: true };
}

/**
 * The API implementation, loaded on first use: each lives in its own chunk
 * with its provider SDK, so none of them weighs on Studio's first screen.
 * Whatever calls a model loads pi-ai this way, the probe included.
 */
export function endpointStreams(api: EndpointApi): Promise<ProviderStreams> {
  switch (api) {
    case 'openai-responses':
      return import('@earendil-works/pi-ai/api/openai-responses.lazy').then((m) =>
        m.openAIResponsesApi(),
      );
    case 'openai-completions':
      return import('@earendil-works/pi-ai/api/openai-completions.lazy').then((m) =>
        m.openAICompletionsApi(),
      );
    case 'anthropic-messages':
      return import('@earendil-works/pi-ai/api/anthropic-messages.lazy').then((m) =>
        m.anthropicMessagesApi(),
      );
    case 'google-generative-ai':
      return import('@earendil-works/pi-ai/api/google-generative-ai.lazy').then((m) =>
        m.googleGenerativeAIApi(),
      );
  }
}
