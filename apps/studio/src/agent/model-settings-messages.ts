import { formatNumber, plural } from '../i18n/common';
import type { Locale } from '../i18n/locale';
import { defineMessages } from '../i18n/messages';
import type { LimitsFrom } from './model-settings';

/** The model settings' text. It loads with the settings dialog. */
export const modelSettingsMessages = defineMessages({
  zh: {
    description: 'Agent 在浏览器里直接请求你配置的模型服务，使用你自己的 API Key。',
    configuredModels: '已配置的模型',
    edit: '编辑',
    addService: '添加模型服务',
    rememberKeys: '在本机记住 API Key',
    rememberKeysHint:
      '默认只放在内存里，关闭页面就忘掉。记住后存在浏览器里；预览中运行的扩展和卡片与 Studio 同源，也能读到它。建议使用有额度上限的 Key。',
    /** The name a new OpenAI-compatible endpoint starts with. */
    customName: '自定义',
    service: '服务',
    customService: '自定义（OpenAI 兼容）',
    name: '名称',
    baseUrl: '地址',
    baseUrlHint: 'OpenAI 兼容接口的地址，例如 https://example.com/v1',
    apiKey: 'API Key',
    model: '模型',
    modelHint: '服务方的模型 id。填好地址和 API Key 后，可以从服务获取模型列表。',
    modelsListed: (count: number) =>
      `服务提供了 ${formatNumber(count)} 个模型。可以从列表里选，也可以直接填写模型 id。`,
    noMatchingModel: '没有匹配的模型，也可以直接填写。',
    fetchModels: '获取模型',
    fetchingModels: '正在获取…',
    contextWindow: '上下文窗口（tokens）',
    maxTokens: '单次输出上限（tokens）',
    limitsHint:
      '上下文窗口是模型一次能读的 token 数，单次输出上限是一次回复最多写的 token 数；对话越长，留给回复的越少。',
    limitsFrom: {
      service: '上限按服务的模型列表填好了，可以修改。',
      'pi-ai': '上限按 pi-ai 的模型资料填好了，可以修改。',
      nobody: '服务和 pi-ai 都没有给出这个模型的上限，这里是默认值，请按服务文档核对。',
    } satisfies Record<NonNullable<LimitsFrom>, string>,
    reasoning: '会思考（推理模型）',
    images: '能看图（截图需要）',
    connected: '连接成功。',
    testConnection: '测试连接',
    testing: '正在测试…',
    remove: '移除',
    removeTitle: (endpoint: string) => `移除 ${endpoint}？`,
    removeDescription: '它的地址、模型和 API Key 会从 Studio 中删除。对话记录不受影响。',
    /** A browser that cannot reach the address: a CORS question. */
    unreachable: (error: string) =>
      `浏览器无法直接访问这个地址（${error}）。服务可能没有返回 CORS 头：换用支持浏览器直连的地址，或经 CORS 中继访问。`,
    probeFailed: (error: string) => `连接失败：${error}`,
    listingFailed: (error: string) => `未能获取模型列表：${error}`,
  },
  en: {
    description:
      'The Agent calls the model services you set up straight from the browser, with your own API Key.',
    configuredModels: 'Configured models',
    edit: 'Edit',
    addService: 'Add model service',
    rememberKeys: 'Remember API Keys on this device',
    rememberKeysHint:
      "By default, keys stay in memory and are forgotten when the page closes. Remembered keys are stored in this browser, where extensions and cards running in the preview can read them too, since they share Studio's origin. Use a key with a spending limit.",
    customName: 'Custom',
    service: 'Service',
    customService: 'Custom (OpenAI-compatible)',
    name: 'Name',
    baseUrl: 'Base URL',
    baseUrlHint: 'The base URL of an OpenAI-compatible API, such as https://example.com/v1',
    apiKey: 'API Key',
    model: 'Model',
    modelHint:
      "The service's model ID. With the base URL and API Key filled in, you can fetch the service's model list.",
    modelsListed: (count: number) =>
      `The service offers ${plural(count, 'model', 'models')}. Pick one from the list or enter a model ID.`,
    noMatchingModel: 'No matching models. You can also enter an ID directly.',
    fetchModels: 'Fetch models',
    fetchingModels: 'Fetching…',
    contextWindow: 'Context window (tokens)',
    maxTokens: 'Output limit (tokens)',
    limitsHint:
      'The context window is how many tokens the model reads at once; the output limit is the most tokens one reply can write. The longer the conversation, the less room a reply has.',
    limitsFrom: {
      service: "Limits filled in from the service's model list. You can change them.",
      'pi-ai': "Limits filled in from pi-ai's model data. You can change them.",
      nobody:
        "Neither the service nor pi-ai gives limits for this model. These are defaults; check them against the service's docs.",
    },
    reasoning: 'Reasoning model',
    images: 'Image input (needed for screenshots)',
    connected: 'Connected.',
    testConnection: 'Test connection',
    testing: 'Testing…',
    remove: 'Remove',
    removeTitle: (endpoint: string) => `Remove ${endpoint}?`,
    removeDescription:
      "Its base URL, model and API Key are deleted from Studio. Conversations aren't affected.",
    unreachable: (error: string) =>
      `The browser can't reach this address directly (${error}). The service may not send CORS headers: use an address that allows browser access, or go through a CORS proxy.`,
    probeFailed: (error: string) => `Connection failed: ${error}`,
    listingFailed: (error: string) => `Couldn't fetch the model list: ${error}`,
  },
});

export type ModelSettingsText = (typeof modelSettingsMessages)[Locale];
