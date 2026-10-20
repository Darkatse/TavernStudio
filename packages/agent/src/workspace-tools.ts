import { editFileTool } from './edit-file';
import { grepTool } from './grep';
import { listFilesTool } from './list-files';
import { readFileTool } from './read-file';
import type { Tool } from './tool';
import type { AgentWorkspace } from './workspace';
import { writeFileTool } from './write-file';

/**
 * Ported from TauriTavern's `agent_tools/workspace/`: its read state, CAS
 * writes and limits. Search is grep, as coding agents search, and results
 * speak of paths and lines.
 */
export function workspaceTools(workspace: AgentWorkspace): Tool[] {
  return [
    listFilesTool(workspace),
    grepTool(workspace),
    readFileTool(workspace),
    writeFileTool(workspace),
    editFileTool(workspace),
  ];
}
