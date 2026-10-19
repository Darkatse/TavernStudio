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
import { useId, useRef, useState } from 'react';
import { common } from '../i18n/common';
import { useMessages } from '../i18n/messages';
import { AlertDialog, AlertDialogContent, AlertDialogTrigger } from '../ui/alert-dialog';
import { Autocomplete } from '../ui/autocomplete';
import { Button } from '../ui/button';
import { Field, Input } from '../ui/input';
import { agentMessages } from './messages';
import { modelSettingsMessages, type ModelSettingsText } from './model-settings-messages';
import { updateAgentSettings, useAgentSettings } from './settings';

const CUSTOM = 'custom';

/** Mounted while the settings show it, so each opening starts from the stored settings. */
export function ModelSettings() {
  const m = useMessages(modelSettingsMessages);
  const panel = useMessages(agentMessages);
  const settings = useAgentSettings();
  const rememberId = useId();
  const [editing, setEditing] = useState<Endpoint | undefined>(() =>
    settings.endpoints.length === 0
      ? draft(firstUnused(settings.endpoints), m.customName)
      : undefined,
  );

  return (
    <>
      {settings.endpoints.length > 0 && (
        <ul className="flex flex-col gap-1" aria-label={m.configuredModels}>
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
                    <span className="ml-auto shrink-0 text-caption text-muted">{panel.noKey}</span>
                  )}
                </button>
                <Button variant="ghost" onClick={() => setEditing(endpoint)}>
                  {m.edit}
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
          onClick={() => setEditing(draft(firstUnused(settings.endpoints), m.customName))}
        >
          <Plus />
          {m.addService}
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
            {m.rememberKeys}
          </label>
          <p id={`${rememberId}-hint`} className="text-caption text-pretty text-muted">
            {m.rememberKeysHint}
          </p>
        </div>
      </div>
    </>
  );
}

/**
 * A preset's id is its provider's id, which pi-ai relies on (see Endpoint.id),
 * so each preset is configured once.
 */
function firstUnused(endpoints: readonly Endpoint[]): string {
  const unused = ENDPOINT_PRESETS.find(
    (preset) => !endpoints.some((endpoint) => endpoint.id === preset.id),
  );
  return unused?.id ?? CUSTOM;
}

function draft(preset: string, customName: string): Endpoint {
  const base = ENDPOINT_PRESETS.find((candidate) => candidate.id === preset);
  return base
    ? { ...base, model: '' }
    : {
        id: `custom-${crypto.randomUUID().slice(0, 8)}`,
        label: customName,
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
export type LimitsFrom = ModelInfo['limitsFrom'] | 'nobody';

/**
 * What is not known of a model takes the defaults, so nothing carries over
 * from the model picked before.
 */
function prefill(model: ModelInfo): Partial<Endpoint> {
  return {
    reasoning: model.reasoning ?? MODEL_DEFAULTS.reasoning,
    images: model.images ?? MODEL_DEFAULTS.images,
    contextWindow: model.contextWindow ?? MODEL_DEFAULTS.contextWindow,
    maxTokens: model.maxTokens ?? MODEL_DEFAULTS.maxTokens,
  };
}

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
  const m = useMessages(modelSettingsMessages);
  const c = useMessages(common);
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
        <Field label={m.service}>
          {(id) => (
            <div className="relative">
              <select
                id={id}
                value={custom ? CUSTOM : value.id}
                onChange={(event) => {
                  setValue(draft(event.target.value, m.customName));
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
                <option value={CUSTOM}>{m.customService}</option>
              </select>
              <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-(--size-icon) -translate-y-1/2 text-muted" />
            </div>
          )}
        </Field>
      )}
      {custom && (
        <Field label={m.name}>
          {(id) => (
            <Input
              id={id}
              value={value.label}
              onChange={(event) => edit({ label: event.target.value })}
            />
          )}
        </Field>
      )}
      <Field label={m.baseUrl} hint={custom ? m.baseUrlHint : undefined}>
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
      <Field label={m.apiKey}>
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
        label={m.model}
        hint={listing.state === 'done' ? m.modelsListed(listing.models.length) : m.modelHint}
        error={
          listing.state === 'failed'
            ? requestAdvice(listing.message, m, m.listingFailed)
            : undefined
        }
      >
        {(id) => (
          <div className="flex gap-2">
            <Autocomplete
              value={value.model}
              onValueChange={editModel}
              items={models}
              itemToString={(model) => model.id}
              empty={m.noMatchingModel}
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
              {listing.state === 'running' ? m.fetchingModels : m.fetchModels}
            </Button>
          </div>
        )}
      </Field>
      <div className="flex flex-col gap-1.5">
        {/* Bottom-aligned, so the fields line up when one label wraps. */}
        <div className="grid grid-cols-2 items-end gap-3">
          <Field label={m.contextWindow}>
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
          <Field label={m.maxTokens}>
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
          {limitsFrom ? m.limitsFrom[limitsFrom] : m.limitsHint}
        </p>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <Toggle
          label={m.reasoning}
          checked={value.reasoning}
          onChange={(reasoning) => edit({ reasoning })}
        />
        <Toggle label={m.images} checked={value.images} onChange={(images) => edit({ images })} />
      </div>
      {probe.state === 'ok' && (
        <output className="flex items-center gap-1.5 text-caption">
          <Check className="size-3.5" />
          {m.connected}
        </output>
      )}
      {probe.state === 'failed' && (
        <p role="alert" className="flex items-start gap-1.5 text-caption text-pretty text-danger">
          <TriangleAlert className="mt-px size-3.5 shrink-0" />
          {requestAdvice(probe.message, m, m.probeFailed)}
        </p>
      )}
      {/* Where the actions do not fit beside Remove, they wrap below it, still on the right. */}
      <div className="flex flex-wrap gap-2">
        {known && (
          <AlertDialog>
            <AlertDialogTrigger
              render={<Button type="button" variant="ghost" className="mr-auto" />}
            >
              {m.remove}
            </AlertDialogTrigger>
            <AlertDialogContent
              title={m.removeTitle(endpoint.label)}
              description={m.removeDescription}
              action={m.remove}
              onAction={remove}
            />
          </AlertDialog>
        )}
        <div className="ml-auto flex gap-2">
          <Button type="button" variant="ghost" onClick={onDone}>
            {c.cancel}
          </Button>
          <Button type="button" disabled={!complete || probe.state === 'running'} onClick={test}>
            {probe.state === 'running' ? m.testing : m.testConnection}
          </Button>
          <Button type="submit" variant="primary" disabled={!complete}>
            {c.save}
          </Button>
        </div>
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

/** A browser that cannot reach the address is a CORS question. */
function requestAdvice(
  message: string,
  m: ModelSettingsText,
  failed: (error: string) => string,
): string {
  if (/fetch|network|cors|connection error/i.test(message)) return m.unreachable(message);
  return failed(message);
}
