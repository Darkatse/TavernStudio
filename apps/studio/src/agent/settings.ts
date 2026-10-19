import type { Endpoint } from '@tavern-studio/agent';
import { useSyncExternalStore } from 'react';
import { db } from '../storage/db';

export interface AgentSettings {
  endpoints: readonly Endpoint[];
  selected: string | undefined;
  /** API keys by endpoint id. */
  keys: Readonly<Record<string, string>>;
  /** Off by default: same-origin code, extensions included, can read whatever Studio keeps. */
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

export type ModelProblem = { kind: 'no-model' } | { kind: 'no-key'; label: string };

/**
 * Takes the settings rather than reading them, so a component that renders it
 * re-renders with them (the React Compiler memoizes calls by their arguments).
 */
export function selectedEndpoint(
  current: AgentSettings,
):
  | { endpoint: Endpoint; apiKey: string }
  | { endpoint: Endpoint | undefined; problem: ModelProblem } {
  const endpoint = current.endpoints.find((candidate) => candidate.id === current.selected);
  if (!endpoint) return { endpoint, problem: { kind: 'no-model' } };
  const apiKey = current.keys[endpoint.id];
  if (!apiKey) return { endpoint, problem: { kind: 'no-key', label: endpoint.label } };
  return { endpoint, apiKey };
}
