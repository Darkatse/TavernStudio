import { editFileTool } from './edit-file';
import { listFilesTool } from './list-files';
import { readFileTool } from './read-file';
import { searchFilesTool } from './search-files';
import type { Tool } from './tool';
import type { AgentWorkspace } from './workspace';
import { writeFileTool } from './write-file';

/**
 * The workspace tools (docs/Agent.md §4), ported from TauriTavern's
 * `agent_tools/workspace/` with the same rules, limits, error codes and
 * model-facing text.
 */
export function workspaceTools(workspace: AgentWorkspace): Tool[] {
  return [
    listFilesTool(workspace),
    searchFilesTool(workspace),
    readFileTool(workspace),
    writeFileTool(workspace),
    editFileTool(workspace),
  ];
}
