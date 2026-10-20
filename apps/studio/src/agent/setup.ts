import type { Project } from '../project/project';
import { useCurrentProject, useProjectRestored } from '../project/use-project';
import type { AgentText } from './messages';
import {
  selectedEndpoint,
  useAgentSettings,
  useSettingsLoaded,
  type ModelProblem,
  type SelectedEndpoint,
} from './settings';

/** What the Agent needs before a first message: a project and a model, set up in either order. */
export interface Setup {
  project: Project | undefined;
  model: SelectedEndpoint;
}

/** Undefined until Studio has read both, so a step already done is never offered. */
export function useSetup(): Setup | undefined {
  const restored = useProjectRestored();
  const loaded = useSettingsLoaded();
  const project = useCurrentProject();
  const model = selectedEndpoint(useAgentSettings());
  return restored && loaded ? { project, model } : undefined;
}

/** The one name for what fixes a model problem, wherever it is offered. */
export function connectText(problem: ModelProblem, m: AgentText): string {
  return problem.kind === 'no-key' ? m.setup.enterKey(problem.label) : m.setup.model;
}
