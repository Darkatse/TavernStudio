import {
  appTools,
  endpointModel,
  endpointStreams,
  inspectTools,
  previewTools,
  runAgent,
  workspaceTools,
  type Endpoint,
  type HistoryEntry,
  type RunEnvironment,
  type UserMessage,
  type WorkspaceRoot,
} from '@tavern-studio/agent';
import type { Project } from '../project/project';
import { agentPreview } from './preview-surface';
import { systemPrompt } from './system-prompt';
import { agentWorkspace } from './workspace';

export type RunHooks = Omit<RunEnvironment, 'agent' | 'systemPrompt' | 'tools'>;

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
  model: { endpoint: Endpoint; apiKey: string },
  hooks: RunHooks,
): Promise<void> {
  const preview = agentPreview(project);
  const [agentModel, streams] = await Promise.all([
    endpointModel(model.endpoint),
    endpointStreams(model.endpoint.api),
  ]);
  await runAgent(run, history, message, {
    agent: { model: agentModel, streams, options: { apiKey: model.apiKey, reasoning: 'medium' } },
    systemPrompt: await systemPrompt(project),
    tools: [
      ...workspaceTools(agentWorkspace(project.record.id, projectRoot)),
      ...previewTools(preview.control, { images: model.endpoint.images }),
      ...appTools(preview.surface),
      ...inspectTools(preview.inspect),
    ],
    ...hooks,
  });
}
