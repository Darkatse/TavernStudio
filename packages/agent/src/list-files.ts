import { optionalCount, optionalListPath, optionalString } from './arguments';
import { modelToolName, ToolError, type Tool } from './tool';
import {
  filesBelow,
  GREP,
  LIST_FILES,
  listEntries,
  visibleLocation,
  type AgentWorkspace,
} from './workspace';

const DEFAULT_DEPTH = 2;
const MAX_DEPTH = 4;
const MAX_ENTRIES = 200;

export function listFilesTool(workspace: AgentWorkspace): Tool {
  return {
    id: LIST_FILES,
    description: `List what a workspace directory holds, its subdirectories ending in /. With glob, list the files matching it at any depth instead. To find files by what they contain, use ${modelToolName(GREP)}.`,
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        path: {
          type: 'string',
          description:
            'A workspace directory, such as project or vendor/src. Omit to start from the workspace root.',
        },
        depth: {
          type: 'integer',
          description: `How many levels of subdirectories to enter: 0 lists only what path holds. Defaults to ${DEFAULT_DEPTH}; at most ${MAX_DEPTH}. Not used with glob.`,
        },
        glob: {
          type: 'string',
          description:
            'List only files matching this glob, at any depth below path, such as *.css or anatomy/*.json. A glob without / matches file names; one with / matches the path below path.',
        },
      },
    },
    async run(input) {
      const path = optionalListPath(input, 'path');
      const location = path === undefined ? undefined : visibleLocation(workspace, path);
      const depth = optionalCount(input, 'depth') ?? DEFAULT_DEPTH;
      if (depth > MAX_DEPTH) {
        throw new ToolError('tool.invalid_arguments', `depth must be <= ${MAX_DEPTH}`);
      }
      const glob = optionalString(input, 'glob');
      const where = path ?? 'the workspace';

      if (glob !== undefined) {
        const list = await filesBelow(workspace, location, glob, MAX_ENTRIES);
        if (list.files.length === 0) return { text: `No files match \`${glob}\` in ${where}.` };
        const lines = list.files.map((file) => file.path);
        if (list.truncated) {
          lines.push(
            '',
            `Listed the first ${MAX_ENTRIES} files; narrow path or glob to see the rest.`,
          );
        }
        return { text: lines.join('\n') };
      }

      const list = await listEntries(workspace, location, depth, MAX_ENTRIES);
      if (list.entries.length === 0) return { text: `${where} is empty.` };
      const lines = list.entries.map((entry) =>
        entry.kind === 'directory' ? `${entry.path}/` : entry.path,
      );
      if (list.truncated) {
        lines.push(
          '',
          `Listed the first ${MAX_ENTRIES} entries; give a deeper path or a glob to see the rest.`,
        );
      }
      return { text: lines.join('\n') };
    },
  };
}
