import { ensureOnlyArguments, optionalCount, requiredTrimmedString } from './arguments';
import { rememberFileRead } from './read-state';
import { countLines, isPartial, measure, numberLines, selectLines } from './text';
import type { Tool } from './tool';
import {
  parseWorkspacePath,
  READ_FILE,
  readText,
  visibleLocation,
  type AgentWorkspace,
} from './workspace';

const MAX_READ_BYTES = 256 * 1024;
const MAX_READ_LINES = 1200;
const MAX_READ_CHARS = 80_000;

export function readFileTool(workspace: AgentWorkspace): Tool {
  return {
    id: READ_FILE,
    description:
      'Read a UTF-8 workspace file with line numbers. Use this to inspect text before editing. Large results include a preview and the next line to read.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        path: {
          type: 'string',
          description: 'Workspace file path, such as project/theme.css.',
        },
        start_line: {
          type: 'integer',
          minimum: 1,
          description: '1-based starting line. Omit to start at line 1.',
        },
        line_count: {
          type: 'integer',
          minimum: 1,
          description:
            'Number of lines to read. Omit to read through the end; oversized results return a shorter preview.',
        },
      },
      required: ['path'],
    },
    async run(input, { reads }) {
      ensureOnlyArguments(input, ['path', 'start_line', 'line_count']);
      const path = parseWorkspacePath(requiredTrimmedString(input, 'path'));
      const location = visibleLocation(workspace, path);
      const startLine = optionalCount(input, 'start_line') ?? 1;
      const lineCount = optionalCount(input, 'line_count');

      const file = await readText(location);
      const total = measure(file.text);
      const wholeFile = startLine === 1 && lineCount === undefined;
      const fits =
        file.bytes <= MAX_READ_BYTES &&
        countLines(file.text) <= MAX_READ_LINES &&
        total.chars <= MAX_READ_CHARS;
      const selection = selectLines(
        file.text,
        startLine,
        lineCount,
        MAX_READ_LINES,
        wholeFile && fits ? Number.POSITIVE_INFINITY : MAX_READ_CHARS,
      );
      const partial = isPartial(selection);
      rememberFileRead(reads, file.path, file.sha256, !partial, selection.content);

      const selected = measure(selection.content);
      let text = `${file.path} lines ${selection.startLine}-${selection.endLine} of ${selection.totalLines}, chars ${selected.chars} of ${total.chars}, words ${selected.words} of ${total.words}${partial ? ' (preview)' : ''}`;
      if (selection.startLine > 0) {
        text += `\n${numberLines(selection.content.split('\n'), selection.startLine, selection.endLine)}`;
      }
      if (selection.endLine < selection.totalLines) {
        text += `\n\nPreview ended before the file. Continue with start_line=${selection.endLine + 1} and line_count=${selection.endLine - selection.startLine + 1}.`;
      }
      if (selection.lineTruncated) {
        text += `\n\nLine ${selection.startLine} is longer than this reader can return safely, so only its beginning is shown. Search this file for specific text if you need a later section.`;
      }
      return { text };
    },
  };
}
