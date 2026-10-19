import { ENDPOINT_PRESETS, probeEndpoint, type Endpoint } from '@tavern-studio/agent';
import { clsx } from 'clsx';
import { Check, ChevronDown, Plus, TriangleAlert } from 'lucide-react';
import { useId, useState } from 'react';
import { AlertDialog, AlertDialogContent, AlertDialogTrigger } from '../ui/alert-dialog';
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
    </>
  );
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
        reasoning: true,
        images: true,
        contextWindow: 128_000,
        maxTokens: 16_000,
      };
}

type Probe =
  { state: 'idle' } | { state: 'running' } | { state: 'ok' } | { state: 'failed'; message: string };

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
  const known = settings.endpoints.some((candidate) => candidate.id === endpoint.id);
  const custom = !ENDPOINT_PRESETS.some((preset) => preset.id === value.id);
  const presets = ENDPOINT_PRESETS.filter(
    (preset) =>
      preset.id === value.id || !settings.endpoints.some((existing) => existing.id === preset.id),
  );
  const complete = value.baseUrl.trim() !== '' && value.model.trim() !== '' && key.trim() !== '';

  const edit = (change: Partial<Endpoint>) => {
    setValue((current) => ({ ...current, ...change }));
    setProbe({ state: 'idle' });
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
            onChange={(event) => edit({ baseUrl: event.target.value })}
          />
        )}
      </Field>
      <Field label="模型" hint="服务方的模型 id。">
        {(id) => (
          <Input
            id={id}
            value={value.model}
            spellCheck={false}
            onChange={(event) => edit({ model: event.target.value })}
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
            }}
          />
        )}
      </Field>
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
