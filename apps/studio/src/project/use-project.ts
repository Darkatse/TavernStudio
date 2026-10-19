import { useSyncExternalStore } from 'react';
import type { Project, ProjectState } from './project';
import { currentProject, subscribeProject } from './projects';

export function useCurrentProject(): Project | undefined {
  return useSyncExternalStore(subscribeProject, currentProject);
}

export function useProjectState(project: Project): ProjectState {
  return useSyncExternalStore(project.subscribe, () => project.state);
}
