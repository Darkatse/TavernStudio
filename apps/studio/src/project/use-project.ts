import { useSyncExternalStore } from 'react';
import type { ProjectRecord } from '../storage/db';
import type { Project, ProjectState } from './project';
import { currentProject, projectRecords, projectRestored, subscribeProject } from './projects';

export function useCurrentProject(): Project | undefined {
  return useSyncExternalStore(subscribeProject, currentProject);
}

export function useProjectRestored(): boolean {
  return useSyncExternalStore(subscribeProject, projectRestored);
}

export function useProjectRecords(): readonly ProjectRecord[] {
  return useSyncExternalStore(subscribeProject, projectRecords);
}

export function useProjectState(project: Project): ProjectState {
  return useSyncExternalStore(project.subscribe, () => project.state);
}
