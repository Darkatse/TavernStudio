import { optionalCount, optionalListPath } from './arguments';
import { ToolError, type Tool } from './tool';
import { LIST_FILES, listEntries, visibleLocation, type AgentWorkspace } from './workspace';

const DEFAULT_DEPTH = 2;
const MAX_DEPTH = 4;
const MAX_ENTRIES = 200;

export function listFilesTool(workspace: AgentWorkspace): Tool {
  return {
    id: LIST_FILES,
    description:
      'List workspace files and directories. Use this to find paths before reading files.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        path: {
          type: 'string',
          description:
            'Optional workspace directory or file path. Omit to list from the workspace root.',
        },
        depth: {
          type: 'integer',
          description: `Directory depth to list. Defaults to ${DEFAULT_DEPTH}; maximum is ${MAX_DEPTH}.`,
        },
      },
    },
    async run(input) {
      const path = optionalListPath(input, 'path');
      const location = path === undefined ? undefined : visibleLocation(workspace, path);
      const depth = optionalCount(input, 'depth') ?? DEFAULT_DEPTH;
      if (depth > MAX_DEPTH) {
        throw new ToolError('workspace.list_depth_too_large', `depth must be <= ${MAX_DEPTH}`);
      }

      const list = await listEntries(workspace, location, depth, MAX_ENTRIES);
      if (list.entries.length === 0) return { text: 'No visible workspace files found.' };
      const lines = list.entries.map((entry) =>
        entry.kind === 'directory' ? `${entry.path}/` : entry.path,
      );
      if (list.truncated) lines.push(`... truncated at ${MAX_ENTRIES} entries`);
      return { text: lines.join('\n') };
    },
  };
}
