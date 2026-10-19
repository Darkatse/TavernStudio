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
  /** The tokens the model reads at most: the conversation, the tools and the reply. */
  contextWindow: number;
  /** The tokens one reply writes at most; pi-ai lowers it as the conversation fills the window. */
  maxTokens: number;
}

/**
 * What a new endpoint assumes of its model, until the author picks a model
 * the service or pi-ai knows, or says otherwise.
 */
export const MODEL_DEFAULTS = {
  reasoning: true,
  images: true,
  contextWindow: 128_000,
  maxTokens: 16_000,
} as const satisfies Partial<Endpoint>;

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
    ...MODEL_DEFAULTS,
  };
}

/**
 * The model pi-ai calls for the endpoint. A model pi-ai knows by the same
 * provider, id and API keeps what pi-ai knows of its requests, such as
 * DeepSeek's reasoning format; the address, limits and abilities are the
 * author's. Studio does not price calls, so a model pi-ai does not know
 * costs nothing.
 */
export async function endpointModel(endpoint: Endpoint): Promise<Model<Api>> {
  const catalogued = (await providerCatalog(endpoint.id))?.[endpoint.model];
  const known = catalogued?.api === endpoint.api ? catalogued : undefined;
  return {
    ...known,
    id: endpoint.model,
    name: known?.name ?? endpoint.model,
    api: endpoint.api,
    provider: endpoint.id,
    baseUrl: endpoint.baseUrl,
    input: endpoint.images ? ['text', 'image'] : ['text'],
    cost: known?.cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    reasoning: endpoint.reasoning,
    contextWindow: endpoint.contextWindow,
    maxTokens: endpoint.maxTokens,
  };
}

/**
 * pi-ai's catalog of a preset's provider, by model id, loaded on first use:
 * each lives in its own chunk. Other providers have none.
 */
export function providerCatalog(
  provider: string,
): Promise<Readonly<Record<string, Model<Api>>> | undefined> {
  switch (provider) {
    case 'openai':
      return import('@earendil-works/pi-ai/providers/openai.models').then((m) => m.OPENAI_MODELS);
    case 'anthropic':
      return import('@earendil-works/pi-ai/providers/anthropic.models').then(
        (m) => m.ANTHROPIC_MODELS,
      );
    case 'google':
      return import('@earendil-works/pi-ai/providers/google.models').then((m) => m.GOOGLE_MODELS);
    case 'deepseek':
      return import('@earendil-works/pi-ai/providers/deepseek.models').then(
        (m) => m.DEEPSEEK_MODELS,
      );
    case 'openrouter':
      return import('@earendil-works/pi-ai/providers/openrouter.models').then(
        (m) => m.OPENROUTER_MODELS,
      );
    default:
      return Promise.resolve(undefined);
  }
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
  const [streams, { normalizeContext }, model] = await Promise.all([
    endpointStreams(endpoint.api),
    import('@earendil-works/pi-ai/utils/transcript'),
    endpointModel(endpoint),
  ]);
  const context = normalizeContext({
    messages: [{ role: 'user', content: 'Reply with OK.', timestamp: Date.now() }],
  });
  const reply = await streams
    .streamSimple(model, context, {
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
