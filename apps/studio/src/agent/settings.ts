import type { Endpoint, ModelThinkingLevel } from '@tavern-studio/agent';
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

/** In percent of the context window. */
export const COMPACT_AT = { initial: 95, min: 50, max: 95 } as const;

const KEY = 'agent';
let settings: AgentSettings = {
  endpoints: [],
  selected: undefined,
  keys: {},
  rememberKeys: false,
};
let read = false;
const listeners = new Set<() => void>();
const loaded = db
  .then((database) => database.get('preferences', KEY))
  .then((record) => {
    if (record) settings = { ...settings, ...(record.value as Partial<AgentSettings>) };
    read = true;
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

/** Until then the settings are the defaults, not the user's. */
export function useSettingsLoaded(): boolean {
  return useSyncExternalStore(subscribe, () => read);
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

/** An endpoint whose effort the author has not chosen reasons at medium. */
export function effortOf(endpoint: Endpoint): ModelThinkingLevel {
  return endpoint.effort ?? 'medium';
}

/** An endpoint whose threshold the author has not set compacts at 95%. */
export function compactAtOf(endpoint: Endpoint): number {
  return endpoint.compactAt ?? COMPACT_AT.initial;
}

export function isCompactAt(percent: number): boolean {
  return Number.isInteger(percent) && percent >= COMPACT_AT.min && percent <= COMPACT_AT.max;
}

export function chooseEffort(id: string, effort: ModelThinkingLevel): Promise<void> {
  return updateAgentSettings({
    endpoints: settings.endpoints.map((endpoint) =>
      endpoint.id === id ? { ...endpoint, effort } : endpoint,
    ),
  });
}

export type ModelProblem = { kind: 'no-model' } | { kind: 'no-key'; label: string };

export type SelectedEndpoint =
  | { endpoint: Endpoint; apiKey: string }
  | { endpoint: Endpoint | undefined; problem: ModelProblem };

/**
 * Takes the settings rather than reading them, so a component that renders it
 * re-renders with them (the React Compiler memoizes calls by their arguments).
 */
export function selectedEndpoint(current: AgentSettings): SelectedEndpoint {
  const endpoint = current.endpoints.find((candidate) => candidate.id === current.selected);
  if (!endpoint) return { endpoint, problem: { kind: 'no-model' } };
  const apiKey = current.keys[endpoint.id];
  if (!apiKey) return { endpoint, problem: { kind: 'no-key', label: endpoint.label } };
  return { endpoint, apiKey };
}
