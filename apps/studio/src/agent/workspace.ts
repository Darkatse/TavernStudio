import { TOOL_RESULTS_ROOT, type AgentWorkspace, type WorkspaceRoot } from '@tavern-studio/agent';
import { db } from '../storage/db';

const encoder = new TextEncoder();

/**
 * The Agent's view of files (docs/Agent.md §3): the project, writable through
 * the Run's Checkpoint, and the long results of its own tool calls, read-only.
 */
export function agentWorkspace(project: string, projectRoot: WorkspaceRoot): AgentWorkspace {
  return {
    project: projectRoot,
    [TOOL_RESULTS_ROOT]: toolResultsRoot(project),
  };
}

/** The long results stored for the project's Runs (`tool-results/<run>/…`). */
function toolResultsRoot(project: string): WorkspaceRoot {
  const paths = async () =>
    (await (await db).getAllKeysFromIndex('toolResults', 'project', project)).toSorted();
  return {
    async kind(path) {
      if (await (await db).get('toolResults', path)) return 'file';
      return (await paths()).some((stored) => stored.startsWith(`${path}/`))
        ? 'directory'
        : undefined;
    },
    async read(path) {
      const result = await (await db).get('toolResults', path);
      if (!result) throw new DOMException(`No tool result at ${path}`, 'NotFoundError');
      return encoder.encode(result.text);
    },
    async files(directory) {
      const prefix = directory === '' ? '' : `${directory}/`;
      return (await paths())
        .filter((path) => path.startsWith(prefix))
        .map((path) => path.slice(prefix.length));
    },
  };
}
