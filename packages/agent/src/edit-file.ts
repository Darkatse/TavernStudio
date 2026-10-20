import { optionalBoolean, requiredRawString, requiredTrimmedString } from './arguments';
import {
  oldStringWasObserved,
  rememberFile,
  rememberPartialEdit,
  requireFullReadBeforeEdit,
} from './read-state';
import { modelToolName, ToolError, type Tool } from './tool';
import {
  EDIT_FILE,
  LIST_FILES,
  parseWorkspacePath,
  READ_FILE,
  readText,
  writableLocation,
  writeText,
  type AgentWorkspace,
} from './workspace';

const LINES_LISTED = 10;

/** TauriTavern's `workspace.apply_patch`, named as coding agents name it. */
export function editFileTool(workspace: AgentWorkspace): Tool {
  const read = modelToolName(READ_FILE);
  return {
    id: EDIT_FILE,
    description: `Replace exact text in a file. old_string must match the file exactly, whitespace and indentation included, and occur once unless replace_all is set. Read the file with ${read} first, unless you wrote its current contents yourself. If you read only part of the file, old_string must be text you have read, replace_all needs the whole file read, and after a failed edit read the whole file before the next.`,
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        path: {
          type: 'string',
          description: 'A workspace file path in a writable directory, such as project/theme.css.',
        },
        old_string: {
          type: 'string',
          description: `The exact text to replace, without the line numbers ${read} puts before each line.`,
        },
        new_string: {
          type: 'string',
          description: 'The text to put in its place, without line numbers.',
        },
        replace_all: {
          type: 'boolean',
          description: 'Replace every occurrence of old_string. Defaults to false.',
        },
      },
      required: ['path', 'old_string', 'new_string'],
    },
    async run(input, { reads }) {
      const rawPath = requiredTrimmedString(input, 'path');
      const oldString = requiredRawString(input, 'old_string');
      const newString = requiredRawString(input, 'new_string');
      const replaceAll = optionalBoolean(input, 'replace_all') ?? false;
      if (oldString === '') {
        throw new ToolError('workspace.edit_empty_old_string', 'old_string cannot be empty');
      }
      if (oldString === newString) {
        throw new ToolError('workspace.edit_no_change', 'old_string and new_string are identical');
      }

      const location = writableLocation(workspace, parseWorkspacePath(rawPath));
      const { path } = location;
      const state = reads.get(path);
      if (!state) {
        throw new ToolError(
          'workspace.edit_requires_read',
          `read the file with ${read} before editing it`,
        );
      }
      if (state.editRequiresFullRead) {
        throw new ToolError(
          'workspace.edit_requires_full_read',
          `an earlier edit of this file failed after you read only part of it. Read the whole file with ${read} before editing it again.`,
        );
      }
      // After only a partial read, an edit may change only text the Run has
      // seen, and any failure requires a full read before the next edit.
      const partial = !state.fullRead;
      const fail = (code: string, message: string): ToolError => {
        if (partial) requireFullReadBeforeEdit(reads, path);
        return new ToolError(code, message);
      };
      if (partial && replaceAll) {
        throw fail(
          'workspace.edit_requires_full_read',
          `replace_all can change text outside the part you read. Read the whole file with ${read} before using replace_all.`,
        );
      }
      if (partial && !oldStringWasObserved(state, oldString)) {
        throw fail(
          'workspace.edit_requires_full_read',
          `old_string is not in the part of the file you have read. Read the whole file with ${read} before editing it again.`,
        );
      }

      const file = await readText(location);
      if (file.sha256 !== state.sha256) {
        throw fail(
          'workspace.edit_stale_file',
          partial
            ? `the file changed since you read it. Read the whole file with ${read} before editing it.`
            : `the file changed since you read it. Read it again with ${read} before editing it.`,
        );
      }
      const matches = file.text.split(oldString).length - 1;
      if (matches === 0) {
        throw fail(
          'workspace.edit_old_string_not_found',
          partial
            ? `old_string is not in the file. Read the whole file with ${read} before editing it again.`
            : 'old_string is not in the file; it must match exactly, whitespace and indentation included',
        );
      }
      if (matches > 1 && !replaceAll) {
        throw fail(
          'workspace.edit_old_string_not_unique',
          partial
            ? `old_string occurs ${matches} times in the file. Read the whole file with ${read}, then give more surrounding text to pick one, or set replace_all.`
            : `old_string occurs ${matches} times; give more surrounding text to pick one, or set replace_all to replace them all`,
        );
      }

      const updated = replaceAll
        ? file.text.replaceAll(oldString, () => newString)
        : file.text.replace(oldString, () => newString);
      const written = await writeText(location, updated, file.sha256);
      if (typeof written === 'string') {
        throw fail(
          'workspace.edit_stale_file',
          written === 'missing'
            ? `the file was removed before the edit could be written; check its directory with ${modelToolName(LIST_FILES)}.`
            : `the file changed before the edit could be written. Read it again with ${read} before editing it.`,
        );
      }
      if (partial) rememberPartialEdit(reads, path, written.sha256, oldString, newString);
      else rememberFile(reads, path, written.sha256);

      return { text: `Edited ${path}: ${replaced(editedLines(file.text, oldString, newString))}.` };
    },
  };
}

/** The line each replacement starts on in the edited file, as `replaceAll` makes them. */
function editedLines(text: string, oldString: string, newString: string): number[] {
  const shift = newlines(newString) - newlines(oldString);
  const lines: number[] = [];
  let line = 1;
  let cursor = 0;
  for (let at = text.indexOf(oldString); at !== -1; at = text.indexOf(oldString, cursor)) {
    line += newlines(text.slice(cursor, at));
    lines.push(line + lines.length * shift);
    line += newlines(oldString);
    cursor = at + oldString.length;
  }
  return lines;
}

function newlines(text: string): number {
  return text.split('\n').length - 1;
}

function replaced(lines: readonly number[]): string {
  if (lines.length === 1) return `replaced 1 occurrence, at line ${lines[0]}`;
  const listed = lines.slice(0, LINES_LISTED).join(', ');
  const rest = lines.length > LINES_LISTED ? ` and ${lines.length - LINES_LISTED} more` : '';
  return `replaced ${lines.length} occurrences, at lines ${listed}${rest}`;
}
