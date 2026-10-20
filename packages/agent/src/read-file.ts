import { ensureOnlyArguments, optionalCount, requiredTrimmedString } from './arguments';
import { rememberFileRead } from './read-state';
import { charCount, countLines, isPartial, numberLines, selectLines } from './text';
import { modelToolName, type Tool } from './tool';
import {
  GREP,
  parseWorkspacePath,
  READ_FILE,
  readText,
  visibleLocation,
  type AgentWorkspace,
} from './workspace';

const MAX_READ_BYTES = 256 * 1024;
const MAX_READ_LINES = 1200;
const MAX_READ_CHARS = 80_000;
/** Of a line longer than one read returns, as in a minified file. */
const LONG_LINE_SHOWN = 2_000;

export function readFileTool(workspace: AgentWorkspace): Tool {
  return {
    id: READ_FILE,
    description: `Read a text file in the workspace with line numbers, each line as N | text: the whole file, or the lines from start_line. A long file comes back in parts, and the result says where the next part starts. Search a minified file with ${modelToolName(GREP)} rather than reading it.`,
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        path: {
          type: 'string',
          description: 'A workspace file path, such as project/theme.css.',
        },
        start_line: {
          type: 'integer',
          minimum: 1,
          description: 'The line to start from, counting from 1. Defaults to 1.',
        },
        line_count: {
          type: 'integer',
          minimum: 1,
          description:
            'How many lines to read. Omit to read to the end; a long file still comes back in parts.',
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
      const wholeFile = startLine === 1 && lineCount === undefined;
      const fits =
        file.bytes <= MAX_READ_BYTES &&
        countLines(file.text) <= MAX_READ_LINES &&
        charCount(file.text) <= MAX_READ_CHARS;
      const selection = selectLines(
        file.text,
        startLine,
        lineCount,
        MAX_READ_LINES,
        wholeFile && fits ? Number.POSITIVE_INFINITY : MAX_READ_CHARS,
        LONG_LINE_SHOWN,
      );
      const partial = isPartial(selection);
      rememberFileRead(reads, file.path, file.sha256, !partial, selection.content);

      if (selection.totalLines === 0) return { text: `${file.path} is empty.` };
      let text = `${file.path} lines ${selection.startLine}-${selection.endLine} of ${selection.totalLines}\n${numberLines(selection.content.split('\n'), selection.startLine, selection.endLine)}`;
      if (selection.endLine < selection.totalLines) {
        text += `\n\nThe file continues after line ${selection.endLine}; read on with start_line=${selection.endLine + 1}.`;
      }
      if (selection.lineTruncated) {
        const length = charCount(file.text.split('\n')[selection.startLine - 1]!);
        text += `\n\nLine ${selection.startLine} has ${length} characters, more than one read returns, so only its first ${LONG_LINE_SHOWN} are shown. To find text further into it, use ${modelToolName(GREP)} on this file.`;
      }
      return { text };
    },
  };
}
