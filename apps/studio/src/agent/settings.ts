import type { Endpoint } from '@tavern-studio/agent';
import { useSyncExternalStore } from 'react';
import { db } from '../storage/db';

export interface AgentSettings {
  endpoints: readonly Endpoint[];
  /** The endpoint new Runs use. */
  selected: string | undefined;
  /** API keys by endpoint id. */
  keys: Readonly<Record<string, string>>;
  /**
   * Whether keys are kept in IndexedDB. Off by default: same-origin code,
   * extensions included, can read whatever Studio keeps (docs/Architecture.md §9).
   */
  rememberKeys: boolean;
}

const KEY = 'agent';
let settings: AgentSettings = { endpoints: [], selected: undefined, keys: {}, rememberKeys: false };
const listeners = new Set<() => void>();
const loaded = db
  .then((database) => database.get('preferences', KEY))
  .then((record) => {
    if (record) settings = { ...settings, ...(record.value as Partial<AgentSettings>) };
    for (const listener of listeners) listener();
  });

export function agentSettings(): AgentSettings {
  return settings;
}

/** Resolves once the stored settings are read. */
export function settingsLoaded(): Promise<void> {
  return loaded;
}

export function useAgentSettings(): AgentSettings {
  return useSyncExternalStore(subscribe, agentSettings);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Changes the settings and stores them; keys only when the author chose to remember them. */
export async function updateAgentSettings(change: Partial<AgentSettings>): Promise<void> {
  settings = { ...settings, ...change };
  for (const listener of listeners) listener();
  const { keys: _keys, ...withoutKeys } = settings;
  const database = await db;
  await database.put('preferences', {
    key: KEY,
    value: settings.rememberKeys ? settings : withoutKeys,
  });
}

/** The selected endpoint and its key, or why a Run cannot start. */
export function selectedEndpoint(): { endpoint: Endpoint; apiKey: string } | { problem: string } {
  const endpoint = settings.endpoints.find((candidate) => candidate.id === settings.selected);
  if (!endpoint) return { problem: '还没有选择模型。在设置里添加一个模型服务。' };
  const apiKey = settings.keys[endpoint.id];
  if (!apiKey) return { problem: `${endpoint.label} 还没有填写 API Key。` };
  return { endpoint, apiKey };
}
