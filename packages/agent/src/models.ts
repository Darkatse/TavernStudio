import { ENDPOINT_PRESETS, providerCatalog, type Endpoint } from './endpoints';

export interface ModelInfo {
  id: string;
  name: string | undefined;
  contextWindow: number | undefined;
  maxTokens: number | undefined;
  images: boolean | undefined;
  reasoning: boolean | undefined;
  /** Undefined when nobody gave the limits. */
  limitsFrom: 'service' | 'pi-ai' | undefined;
}

/**
 * What the service says of a model wins over pi-ai's catalogs. These are
 * searched from the endpoint's own provider on: a relay serves other
 * providers' models under their ids, and a model's limits go with it.
 */
export async function listModels(
  endpoint: Endpoint,
  apiKey: string,
  signal?: AbortSignal,
): Promise<ModelInfo[]> {
  const providers = [endpoint.id, ...ENDPOINT_PRESETS.map((preset) => preset.id)];
  const [listed, ...catalogs] = await Promise.all([
    fetchModels(endpoint, apiKey, signal),
    ...[...new Set(providers)].map(providerCatalog),
  ]);
  return listed
    .map((model) => {
      const known = catalogs.map((catalog) => catalog?.[model.id]).find(Boolean);
      return {
        id: model.id,
        name: model.name ?? known?.name,
        contextWindow: model.contextWindow ?? known?.contextWindow,
        maxTokens: model.maxTokens ?? known?.maxTokens,
        images: model.images ?? known?.input.includes('image'),
        reasoning: model.reasoning ?? known?.reasoning,
        limitsFrom:
          model.contextWindow !== undefined || model.maxTokens !== undefined
            ? ('service' as const)
            : known
              ? ('pi-ai' as const)
              : undefined,
      };
    })
    .toSorted((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

interface ListedModel {
  id: string;
  name?: string | undefined;
  contextWindow?: number | undefined;
  maxTokens?: number | undefined;
  images?: boolean | undefined;
  reasoning?: boolean | undefined;
}

async function fetchModels(
  endpoint: Endpoint,
  apiKey: string,
  signal: AbortSignal | undefined,
): Promise<ListedModel[]> {
  const base = endpoint.baseUrl.trim().replace(/\/+$/, '');
  switch (endpoint.api) {
    case 'openai-responses':
    case 'openai-completions': {
      const body = await getJson(`${base}/models`, { authorization: `Bearer ${apiKey}` }, signal);
      return arrayAt(body, 'data').flatMap(openAIModel);
    }
    case 'anthropic-messages': {
      const body = await getJson(
        `${base}/v1/models?limit=1000`,
        {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        signal,
      );
      return arrayAt(body, 'data').flatMap((model) =>
        typeof model.id === 'string'
          ? [
              {
                id: model.id,
                name: text(model.display_name),
                contextWindow: count(model.max_input_tokens),
                maxTokens: count(model.max_tokens),
              },
            ]
          : [],
      );
    }
    case 'google-generative-ai': {
      const body = await getJson(
        `${base}/models?pageSize=1000`,
        { 'x-goog-api-key': apiKey },
        signal,
      );
      return arrayAt(body, 'models').flatMap((model) => {
        const methods: unknown[] = Array.isArray(model.supportedGenerationMethods)
          ? model.supportedGenerationMethods
          : [];
        if (typeof model.name !== 'string' || !methods.includes('generateContent')) return [];
        return [
          {
            id: model.name.replace(/^models\//, ''),
            name: text(model.displayName),
            contextWindow: count(model.inputTokenLimit),
            maxTokens: count(model.outputTokenLimit),
            reasoning: typeof model.thinking === 'boolean' ? model.thinking : undefined,
          },
        ];
      });
    }
  }
}

/**
 * OpenAI and most relays give the id alone; OpenRouter adds the context
 * length, the output limit, the input modalities and the parameters the model
 * takes.
 */
function openAIModel(model: Record<string, unknown>): ListedModel[] {
  if (typeof model.id !== 'string') return [];
  const modalities = record(model.architecture)?.input_modalities;
  const parameters = model.supported_parameters;
  return [
    {
      id: model.id,
      name: text(model.name),
      contextWindow: count(model.context_length),
      maxTokens: count(record(model.top_provider)?.max_completion_tokens),
      images: Array.isArray(modalities) ? modalities.includes('image') : undefined,
      reasoning: Array.isArray(parameters) ? parameters.includes('reasoning') : undefined,
    },
  ];
}

async function getJson(
  url: string,
  headers: Record<string, string>,
  signal: AbortSignal | undefined,
): Promise<unknown> {
  const response = await fetch(url, { headers, ...(signal ? { signal } : {}) });
  if (!response.ok) {
    const detail = (await response.text()).trim().slice(0, 200);
    throw new Error(`HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
  }
  return response.json();
}

function arrayAt(body: unknown, key: string): Record<string, unknown>[] {
  const list = record(body)?.[key];
  if (!Array.isArray(list)) throw new Error(`The model list has no "${key}" array`);
  return list.flatMap((item: unknown) => {
    const entry = record(item);
    return entry ? [entry] : [];
  });
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function count(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}
