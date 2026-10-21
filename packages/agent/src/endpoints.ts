import type { Api, Model, ModelThinkingLevel, ProviderStreams } from '@earendil-works/pi-ai';

/** Studio calls these APIs straight from the browser. */
export type EndpointApi =
  'openai-responses' | 'openai-completions' | 'anthropic-messages' | 'google-generative-ai';

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
  /** How hard the model reasons, once the author has chosen. */
  effort?: ModelThinkingLevel;
  /** The percentage of the context window at which the context is compacted, once the author has chosen. */
  compactAt?: number;
  images: boolean;
  /** The tokens the model reads at most: the conversation, the tools and the reply. */
  contextWindow: number;
  /** The tokens one reply writes at most; pi-ai lowers it as the conversation fills the window. */
  maxTokens: number;
}

export const MODEL_DEFAULTS = {
  reasoning: true,
  images: true,
  contextWindow: 128_000,
  maxTokens: 16_000,
} as const satisfies Partial<Endpoint>;

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
 * A model pi-ai knows by the same provider, id and API keeps what pi-ai knows
 * of its requests, such as DeepSeek's reasoning format; the address, limits
 * and abilities are the author's. Studio does not price calls, so a model
 * pi-ai does not know costs nothing.
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

/** The efforts pi-ai knows the model to take, from `off` up. */
export async function supportedEfforts(endpoint: Endpoint): Promise<ModelThinkingLevel[]> {
  const [{ getSupportedThinkingLevels }, model] = await Promise.all([
    import('@earendil-works/pi-ai/models'),
    endpointModel(endpoint),
  ]);
  return getSupportedThinkingLevels(model);
}

/** Each catalog lives in its own chunk. Undefined for a provider without one. */
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
 * Each API lives in its own chunk with its provider SDK, so none of them
 * weighs on Studio's first screen. Whatever calls a model loads pi-ai this
 * way, the probe included.
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
