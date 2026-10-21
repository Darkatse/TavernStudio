import {
  appTools,
  compactConversation,
  conversationTitle,
  endpointModel,
  endpointStreams,
  inspectTools,
  previewTools,
  runAgent,
  workspaceTools,
  type AgentModel,
  type Endpoint,
  type HistoryEntry,
  type RunEnvironment,
  type UserMessage,
  type WorkspaceRoot,
} from '@tavern-studio/agent';
import type { Project } from '../project/project';
import { agentMedia } from './media';
import { agentPreview } from './preview-surface';
import { agentSettings, compactAtOf, effortOf } from './settings';
import { systemPrompt } from './system-prompt';
import { agentWorkspace } from './workspace';

export type RunHooks = Omit<
  RunEnvironment,
  'agent' | 'systemPrompt' | 'tools' | 'secrets' | 'compactAt'
>;

export interface SelectedModel {
  endpoint: Endpoint;
  apiKey: string;
}

/**
 * The Run writes the project through `projectRoot`, which keeps its
 * Checkpoint. This module loads with the first Run, so the Agent's engine
 * stays off Studio's first screen.
 */
export async function runInProject(
  project: Project,
  projectRoot: WorkspaceRoot,
  run: string,
  history: readonly HistoryEntry[],
  message: UserMessage,
  model: SelectedModel,
  hooks: RunHooks,
): Promise<void> {
  await runAgent(run, history, message, await environment(project, projectRoot, model, hooks));
}

/**
 * Compacts the conversation at the author's request, with the Run's own
 * system prompt and tools, so the request is the one the model's cache holds.
 */
export async function compactInProject(
  project: Project,
  projectRoot: WorkspaceRoot,
  run: string,
  history: readonly HistoryEntry[],
  model: SelectedModel,
  hooks: RunHooks,
): Promise<void> {
  await compactConversation(run, history, await environment(project, projectRoot, model, hooks));
}

async function environment(
  project: Project,
  projectRoot: WorkspaceRoot,
  model: SelectedModel,
  hooks: RunHooks,
): Promise<RunEnvironment> {
  const preview = agentPreview(project);
  return {
    agent: await agentModel(model),
    systemPrompt: await systemPrompt(project),
    secrets: Object.values(agentSettings().keys).filter((key) => key !== ''),
    tools: [
      ...workspaceTools(agentWorkspace(project.record.id, projectRoot), {
        reader: agentMedia,
        images: model.endpoint.images,
      }),
      ...previewTools(preview.control, { images: model.endpoint.images }),
      ...appTools(preview.surface),
      ...inspectTools(preview.inspect),
    ],
    compactAt: compactAtOf(model.endpoint) / 100,
    ...hooks,
  };
}

/** A name for a new conversation, asked of the model beside its first Run. */
export async function titleConversation(
  message: string,
  model: SelectedModel,
  signal: AbortSignal,
): Promise<string | undefined> {
  return conversationTitle(await agentModel(model), message, signal);
}

async function agentModel({ endpoint, apiKey }: SelectedModel): Promise<AgentModel> {
  const [model, streams] = await Promise.all([
    endpointModel(endpoint),
    endpointStreams(endpoint.api),
  ]);
  // pi-ai turns reasoning off when a request asks for none.
  const effort = effortOf(endpoint);
  return {
    model,
    streams,
    options: { apiKey, ...(effort === 'off' ? {} : { reasoning: effort }) },
  };
}
