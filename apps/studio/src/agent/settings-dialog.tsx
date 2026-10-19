import {
  ENDPOINT_PRESETS,
  listModels,
  MODEL_DEFAULTS,
  probeEndpoint,
  type Endpoint,
  type ModelInfo,
} from '@tavern-studio/agent';
import { clsx } from 'clsx';
import { Check, ChevronDown, Plus, TriangleAlert } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { AlertDialog, AlertDialogContent, AlertDialogTrigger } from '../ui/alert-dialog';
import { Autocomplete } from '../ui/autocomplete';
import { Button } from '../ui/button';
import { DialogContent } from '../ui/dialog';
import { Field, Input } from '../ui/input';
import { updateAgentSettings, useAgentSettings } from './settings';

const CUSTOM = 'custom';

/** The model services the Agent can use, each with the author's own key (docs/Agent.md §2). */
export function SettingsDialog() {
  return (
    <DialogContent
      size="lg"
      title="模型"
      description="Agent 在浏览器里直接请求你配置的模型服务，使用你自己的 API Key。"
    >
      <Endpoints />
    </DialogContent>
  );
}

/** Mounted while the dialog is open, so each opening starts from the stored settings. */
function Endpoints() {
  const settings = useAgentSettings();
  const rememberId = useId();
  const [editing, setEditing] = useState<Endpoint | undefined>(() =>
    settings.endpoints.length === 0 ? draft(firstUnused(settings.endpoints)) : undefined,
  );

  return (
    <>
      {settings.endpoints.length > 0 && (
        <ul className="flex flex-col gap-1" aria-label="已配置的模型">
          {settings.endpoints.map((endpoint) => {
            const selected = endpoint.id === settings.selected;
            return (
              <li key={endpoint.id} className="flex items-center gap-2">
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => void updateAgentSettings({ selected: endpoint.id })}
                  className={clsx(
                    'flex h-(--size-control) min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-3 text-left transition-colors motion-fast hover:bg-hover',
                    selected && 'bg-selected',
                  )}
                >
                  <Check
                    className={clsx('size-(--size-icon) shrink-0', !selected && 'invisible')}
                  />
                  <span className="shrink-0 font-medium">{endpoint.label}</span>
                  <span className="truncate text-muted">{endpoint.model}</span>
                  {!settings.keys[endpoint.id] && (
                    <span className="ml-auto shrink-0 text-caption text-muted">未填写 Key</span>
                  )}
                </button>
                <Button variant="ghost" onClick={() => setEditing(endpoint)}>
                  编辑
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {editing ? (
        <EndpointForm
          key={editing.id}
          endpoint={editing}
          apiKey={settings.keys[editing.id] ?? ''}
          onDone={() => setEditing(undefined)}
        />
      ) : (
        <Button
          className="self-start"
          onClick={() => setEditing(draft(firstUnused(settings.endpoints)))}
        >
          <Plus />
          添加模型服务
        </Button>
      )}
      <div className="flex items-start gap-2.5 rounded-lg bg-sunken p-3">
        <input
          id={rememberId}
          type="checkbox"
          aria-describedby={`${rememberId}-hint`}
          className="mt-1 size-4 shrink-0 accent-primary"
          checked={settings.rememberKeys}
          onChange={(event) => void updateAgentSettings({ rememberKeys: event.target.checked })}
        />
        <div className="flex flex-col gap-0.5">
          <label htmlFor={rememberId} className="font-medium">
            在本机记住 API Key
          </label>
          <p id={`${rememberId}-hint`} className="text-caption text-pretty text-muted">
            默认只放在内存里，关闭页面就忘掉。记住后存在浏览器里；预览中运行的扩展和卡片与 Studio
            同源，也能读到它。建议使用有额度上限的 Key。
          </p>
        </div>
      </div>
      <StorageUsage />
    </>
  );
}

/** How much Studio keeps in this browser (docs/Agent.md §1, 存储上限). */
function StorageUsage() {
  const [usage, setUsage] = useState<number>();
  useEffect(() => {
    void navigator.storage.estimate().then((estimate) => setUsage(estimate.usage));
  }, []);
  if (usage === undefined) return null;
  return (
    <p className="text-caption text-pretty text-muted">
      Studio 在这个浏览器里占用 {formatSize(usage)}
      。只有最近 20 次运行保留截图和长结果；Checkpoint 每个项目最多保留 100 MB，超出时从最早的清理。
    </p>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * The first preset not configured yet. A preset's id is its provider's id,
 * which pi-ai relies on (see Endpoint.id), so each preset is configured once.
 */
function firstUnused(endpoints: readonly Endpoint[]): string {
  const unused = ENDPOINT_PRESETS.find(
    (preset) => !endpoints.some((endpoint) => endpoint.id === preset.id),
  );
  return unused?.id ?? CUSTOM;
}

/** A new endpoint from a preset, or an OpenAI-compatible one the author points at. */
function draft(preset: string): Endpoint {
  const base = ENDPOINT_PRESETS.find((candidate) => candidate.id === preset);
  return base
    ? { ...base, model: '' }
    : {
        id: `custom-${crypto.randomUUID().slice(0, 8)}`,
        label: '自定义',
        api: 'openai-completions',
        baseUrl: '',
        model: '',
        ...MODEL_DEFAULTS,
      };
}

type Probe =
  { state: 'idle' } | { state: 'running' } | { state: 'ok' } | { state: 'failed'; message: string };

type Listing =
  | { state: 'idle' }
  | { state: 'running' }
  | { state: 'done'; models: ModelInfo[] }
  | { state: 'failed'; message: string };

/** Who filled the limits in; undefined once the author sets them. */
type LimitsFrom = ModelInfo['limitsFrom'] | 'nobody';

const LIMITS_HINT: Record<NonNullable<LimitsFrom>, string> = {
  service: '上限按服务的模型列表填好了，可以修改。',
  'pi-ai': '上限按 pi-ai 的模型资料填好了，可以修改。',
  nobody: '服务和 pi-ai 都没有给出这个模型的上限，这里是默认值，请按服务文档核对。',
};

/**
 * What picking a model fills in: what is known of it, and the defaults for
 * the rest, so nothing carries over from the model picked before.
 */
function prefill(model: ModelInfo): Partial<Endpoint> {
  return {
    reasoning: model.reasoning ?? MODEL_DEFAULTS.reasoning,
    images: model.images ?? MODEL_DEFAULTS.images,
    contextWindow: model.contextWindow ?? MODEL_DEFAULTS.contextWindow,
    maxTokens: model.maxTokens ?? MODEL_DEFAULTS.maxTokens,
  };
}

/** A token count the way services write it: 128K, 1M. */
function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${Math.round(tokens / 100_000) / 10}M`;
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}K`;
  return String(tokens);
}

function isLimit(tokens: number): boolean {
  return Number.isSafeInteger(tokens) && tokens > 0;
}

function EndpointForm({
  endpoint,
  apiKey,
  onDone,
}: {
  endpoint: Endpoint;
  apiKey: string;
  onDone: () => void;
}) {
  const settings = useAgentSettings();
  const [value, setValue] = useState(endpoint);
  const [key, setKey] = useState(apiKey);
  // A probe speaks for the values it tested, so any edit clears it.
  const [probe, setProbe] = useState<Probe>({ state: 'idle' });
  // A model list speaks for the address and key it was fetched with.
  const [listing, setListing] = useState<Listing>({ state: 'idle' });
  const listingRequest = useRef<AbortController>(null);
  const [limitsFrom, setLimitsFrom] = useState<LimitsFrom>();
  const [choosing, setChoosing] = useState(false);
  const modelInput = useRef<HTMLInputElement>(null);
  const known = settings.endpoints.some((candidate) => candidate.id === endpoint.id);
  const custom = !ENDPOINT_PRESETS.some((preset) => preset.id === value.id);
  const presets = ENDPOINT_PRESETS.filter(
    (preset) =>
      preset.id === value.id || !settings.endpoints.some((existing) => existing.id === preset.id),
  );
  const reachable = value.baseUrl.trim() !== '' && key.trim() !== '';
  const complete =
    reachable &&
    value.model.trim() !== '' &&
    isLimit(value.contextWindow) &&
    isLimit(value.maxTokens);
  const models = listing.state === 'done' ? listing.models : [];

  const edit = (change: Partial<Endpoint>) => {
    setValue((current) => ({ ...current, ...change }));
    setProbe({ state: 'idle' });
  };

  /** The address or key changed, so the model list, fetched or on its way, no longer holds. */
  const forgetModels = () => {
    listingRequest.current?.abort();
    setListing({ state: 'idle' });
  };

  const fetchModels = () => {
    const request = new AbortController();
    listingRequest.current = request;
    setListing({ state: 'running' });
    void listModels(trimmed(value), key.trim(), request.signal).then(
      (listed) => {
        if (request.signal.aborted) return;
        setListing({ state: 'done', models: listed });
        modelInput.current?.focus();
        setChoosing(true);
      },
      (error: unknown) => {
        if (request.signal.aborted) return;
        setListing({
          state: 'failed',
          message: error instanceof Error ? error.message : String(error),
        });
      },
    );
  };

  const editModel = (model: string) => {
    const picked = models.find((candidate) => candidate.id === model.trim());
    edit(picked ? { model, ...prefill(picked) } : { model });
    if (picked) setLimitsFrom(picked.limitsFrom ?? 'nobody');
  };

  const editLimit = (change: Partial<Endpoint>) => {
    edit(change);
    setLimitsFrom(undefined);
  };

  const test = () => {
    setProbe({ state: 'running' });
    void probeEndpoint(trimmed(value), key.trim()).then(
      (result) =>
        setProbe(result.ok ? { state: 'ok' } : { state: 'failed', message: result.message }),
      (error: unknown) =>
        setProbe({
          state: 'failed',
          message: error instanceof Error ? error.message : String(error),
        }),
    );
  };

  const save = () => {
    const saved = trimmed(value);
    const endpoints = known
      ? settings.endpoints.map((candidate) => (candidate.id === saved.id ? saved : candidate))
      : [...settings.endpoints, saved];
    void updateAgentSettings({
      endpoints,
      selected: settings.selected ?? saved.id,
      keys: { ...settings.keys, [saved.id]: key.trim() },
    });
    onDone();
  };

  const remove = () => {
    const endpoints = settings.endpoints.filter((candidate) => candidate.id !== endpoint.id);
    const { [endpoint.id]: _removed, ...keys } = settings.keys;
    void updateAgentSettings({
      endpoints,
      keys,
      selected: settings.selected === endpoint.id ? endpoints[0]?.id : settings.selected,
    });
    onDone();
  };

  return (
    <form
      className="flex flex-col gap-3 rounded-xl p-4 shadow-panel"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      {!known && (
        <Field label="服务">
          {(id) => (
            <div className="relative">
              <select
                id={id}
                value={custom ? CUSTOM : value.id}
                onChange={(event) => {
                  setValue(draft(event.target.value));
                  setProbe({ state: 'idle' });
                  forgetModels();
                  setLimitsFrom(undefined);
                }}
                className="h-(--size-control) w-full cursor-pointer appearance-none rounded-md bg-surface pr-9 pl-3 shadow-control transition-shadow motion-fast outline-none focus-visible:shadow-focus"
              >
                {presets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
                <option value={CUSTOM}>自定义（OpenAI 兼容）</option>
              </select>
              <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-(--size-icon) -translate-y-1/2 text-muted" />
            </div>
          )}
        </Field>
      )}
      {custom && (
        <Field label="名称">
          {(id) => (
            <Input
              id={id}
              value={value.label}
              onChange={(event) => edit({ label: event.target.value })}
            />
          )}
        </Field>
      )}
      <Field
        label="地址"
        hint={custom ? 'OpenAI 兼容接口的地址，例如 https://example.com/v1' : undefined}
      >
        {(id) => (
          <Input
            id={id}
            value={value.baseUrl}
            inputMode="url"
            spellCheck={false}
            onChange={(event) => {
              edit({ baseUrl: event.target.value });
              forgetModels();
            }}
          />
        )}
      </Field>
      <Field label="API Key">
        {(id) => (
          <Input
            id={id}
            type="password"
            autoComplete="off"
            value={key}
            onChange={(event) => {
              setKey(event.target.value);
              setProbe({ state: 'idle' });
              forgetModels();
            }}
          />
        )}
      </Field>
      <Field
        label="模型"
        hint={
          listing.state === 'done'
            ? `服务提供了 ${listing.models.length} 个模型。可以从列表里选，也可以直接填写模型 id。`
            : '服务方的模型 id。填好地址和 API Key 后，可以从服务获取模型列表。'
        }
        error={listing.state === 'failed' ? probeAdvice(listing.message) : undefined}
      >
        {(id) => (
          <div className="flex gap-2">
            <Autocomplete
              value={value.model}
              onValueChange={editModel}
              items={models}
              itemToString={(model) => model.id}
              empty="没有匹配的模型，也可以直接填写。"
              open={choosing}
              onOpenChange={setChoosing}
              input={{ id, ref: modelInput, className: 'flex-1' }}
            >
              {(model) => (
                <>
                  <span className="truncate">{model.id}</span>
                  {model.contextWindow !== undefined && (
                    <span className="ml-auto shrink-0 pl-3 text-caption text-muted tabular-nums">
                      {formatTokens(model.contextWindow)}
                    </span>
                  )}
                </>
              )}
            </Autocomplete>
            <Button
              type="button"
              disabled={!reachable || listing.state === 'running'}
              onClick={fetchModels}
            >
              {listing.state === 'running' ? '正在获取…' : '获取模型'}
            </Button>
          </div>
        )}
      </Field>
      <div className="flex flex-col gap-1.5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="上下文窗口（tokens）">
            {(id) => (
              <Input
                id={id}
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={value.contextWindow || ''}
                onChange={(event) => editLimit({ contextWindow: event.target.valueAsNumber || 0 })}
              />
            )}
          </Field>
          <Field label="单次输出上限（tokens）">
            {(id) => (
              <Input
                id={id}
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={value.maxTokens || ''}
                onChange={(event) => editLimit({ maxTokens: event.target.valueAsNumber || 0 })}
              />
            )}
          </Field>
        </div>
        <p className="text-caption text-pretty text-muted">
          {limitsFrom
            ? LIMITS_HINT[limitsFrom]
            : '上下文窗口是模型一次能读的 token 数，单次输出上限是一次回复最多写的 token 数；对话越长，留给回复的越少。'}
        </p>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <Toggle
          label="会思考（推理模型）"
          checked={value.reasoning}
          onChange={(reasoning) => edit({ reasoning })}
        />
        <Toggle
          label="能看图（截图需要）"
          checked={value.images}
          onChange={(images) => edit({ images })}
        />
      </div>
      {probe.state === 'ok' && (
        <output className="flex items-center gap-1.5 text-caption">
          <Check className="size-3.5" />
          连接成功。
        </output>
      )}
      {probe.state === 'failed' && (
        <p role="alert" className="flex items-start gap-1.5 text-caption text-pretty text-danger">
          <TriangleAlert className="mt-px size-3.5 shrink-0" />
          {probeAdvice(probe.message)}
        </p>
      )}
      <div className="flex justify-end gap-2">
        {known && (
          <AlertDialog>
            <AlertDialogTrigger
              render={<Button type="button" variant="ghost" className="mr-auto" />}
            >
              移除
            </AlertDialogTrigger>
            <AlertDialogContent
              title={`移除 ${endpoint.label}？`}
              description="它的地址、模型和 API Key 会从 Studio 中删除。对话记录不受影响。"
              action="移除"
              onAction={remove}
            />
          </AlertDialog>
        )}
        <Button type="button" variant="ghost" onClick={onDone}>
          取消
        </Button>
        <Button type="button" disabled={!complete || probe.state === 'running'} onClick={test}>
          {probe.state === 'running' ? '正在测试…' : '测试连接'}
        </Button>
        <Button type="submit" variant="primary" disabled={!complete}>
          保存
        </Button>
      </div>
    </form>
  );
}

function trimmed(endpoint: Endpoint): Endpoint {
  return {
    ...endpoint,
    label: endpoint.label.trim(),
    baseUrl: endpoint.baseUrl.trim(),
    model: endpoint.model.trim(),
  };
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-caption">
      <input
        type="checkbox"
        className="size-4 accent-primary"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

/** A failed probe in the author's terms: a browser that cannot reach the address is a CORS question. */
function probeAdvice(message: string): string {
  if (/fetch|network|cors|connection error/i.test(message)) {
    return `浏览器无法直接访问这个地址（${message}）。服务可能没有返回 CORS 头：换用支持浏览器直连的地址，或经 CORS 中继访问。`;
  }
  return message;
}
