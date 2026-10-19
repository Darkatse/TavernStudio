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

/** Why a Run cannot start with the model settings, for the interface to word. */
export type ModelProblem =
  | { kind: 'no-model' }
  /** The selected endpoint, by its label, has no key. */
  | { kind: 'no-key'; label: string };

/**
 * The selected endpoint and its key, or why a Run cannot start. It takes the
 * settings rather than reading them, so a component that renders it re-renders
 * with them (the React Compiler memoizes calls by their arguments).
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
