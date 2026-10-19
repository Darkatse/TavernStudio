import { optionalCount, optionalListPath, requiredTrimmedString } from './arguments';
import { textSearch, type SearchHit } from './text';
import { modelToolName, ToolError, type Tool } from './tool';
import {
  comparePaths,
  listEntries,
  READ_FILE,
  SEARCH_FILES,
  textAt,
  visibleLocation,
  type AgentWorkspace,
  type Location,
} from './workspace';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const DEFAULT_CONTEXT_LINES = 2;
const MAX_CONTEXT_LINES = 5;
const MAX_DEPTH = 8;
const MAX_FILES = 1000;

export function searchFilesTool(workspace: AgentWorkspace): Tool {
  return {
    id: SEARCH_FILES,
    description: `Find text in workspace files. Results include snippets; use ${modelToolName(READ_FILE)} for the full text or exact lines.`,
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: {
          type: 'string',
          description: 'Plain text to search for in visible workspace files.',
        },
        path: {
          type: 'string',
          description:
            'Optional workspace file or directory path. Omit to search all readable directories.',
        },
        limit: {
          type: 'integer',
          description: `Maximum hits to return. Defaults to ${DEFAULT_LIMIT}; maximum is ${MAX_LIMIT}.`,
        },
        context_lines: {
          type: 'integer',
          description: `Context lines before and after each match. Defaults to ${DEFAULT_CONTEXT_LINES}; maximum is ${MAX_CONTEXT_LINES}.`,
        },
      },
      required: ['query'],
    },
    async run(input, { signal }) {
      const query = requiredTrimmedString(input, 'query');
      const path = optionalListPath(input, 'path');
      const location = path === undefined ? undefined : visibleLocation(workspace, path);
      const limit = optionalCount(input, 'limit') ?? DEFAULT_LIMIT;
      if (limit === 0) throw new ToolError('workspace.search_limit_invalid', 'limit must be >= 1');
      if (limit > MAX_LIMIT) {
        throw new ToolError('workspace.search_limit_too_large', `limit must be <= ${MAX_LIMIT}`);
      }
      const contextLines = optionalCount(input, 'context_lines') ?? DEFAULT_CONTEXT_LINES;
      if (contextLines > MAX_CONTEXT_LINES) {
        throw new ToolError(
          'workspace.search_context_too_large',
          `context_lines must be <= ${MAX_CONTEXT_LINES}`,
        );
      }

      const { files, truncated: traversalTruncated } = await searchedFiles(workspace, location);
      const search = textSearch(query, limit, contextLines);
      const hits: (SearchHit & { path: string })[] = [];
      let skipped = 0;
      for (const at of files) {
        signal.throwIfAborted();
        const file = await textAt(at);
        if (!file) {
          skipped += 1;
          continue;
        }
        hits.push(...search(file.text).map((hit) => ({ ...hit, path: file.path })));
      }
      hits.sort(
        (a, b) => b.score - a.score || comparePaths(a.path, b.path) || a.startLine - b.startLine,
      );
      const truncated = traversalTruncated || hits.length > limit;
      const shown = hits.slice(0, limit);

      let text: string;
      if (shown.length === 0) {
        text = `No visible workspace files matched \`${query}\`.`;
      } else {
        text = `Search \`${query}\` matched ${shown.length} workspace location${shown.length === 1 ? '' : 's'}. Use ${modelToolName(READ_FILE)} with path and start_line/line_count to read exact text.`;
        for (const hit of shown) {
          const ref = `workspace:${hit.path}#L${hit.startLine}-L${hit.endLine}`;
          text += `\n\n${hit.path} score ${hit.score.toFixed(3)} ref ${ref}\n${hit.snippet}`;
        }
        if (truncated) text += '\n\nResults were truncated.';
      }
      if (skipped > 0) {
        text += `\n\nSkipped ${skipped} file${skipped === 1 ? '' : 's'} that could not be read as text.`;
      }
      return { text };
    },
  };
}

/** The files below the location, or below every root, up to `MAX_FILES`. */
async function searchedFiles(
  workspace: AgentWorkspace,
  location: Location | undefined,
): Promise<{ files: Location[]; truncated: boolean }> {
  const starts = location
    ? [location]
    : Object.keys(workspace)
        .toSorted()
        .map((root) => visibleLocation(workspace, root));
  const files: Location[] = [];
  let truncated = false;
  for (const start of starts) {
    const remaining = MAX_FILES - files.length;
    if (remaining === 0) {
      truncated = true;
      break;
    }
    const list = await listEntries(workspace, start, MAX_DEPTH, remaining + 1);
    truncated ||= list.truncated;
    for (const entry of list.entries) {
      if (entry.kind !== 'file') continue;
      if (files.length >= MAX_FILES) {
        truncated = true;
        break;
      }
      files.push(visibleLocation(workspace, entry.path));
    }
  }
  return { files, truncated };
}
