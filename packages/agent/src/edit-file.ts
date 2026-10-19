import { optionalBoolean, requiredRawString, requiredTrimmedString } from './arguments';
import {
  oldStringWasObserved,
  rememberFile,
  rememberPartialPatch,
  requireFullReadBeforePatch,
} from './read-state';
import { measure } from './text';
import { modelToolName, ToolError, type Tool } from './tool';
import {
  EDIT_FILE,
  parseWorkspacePath,
  READ_FILE,
  readText,
  writableLocation,
  writeText,
  type AgentWorkspace,
} from './workspace';

/**
 * Exact text replacement, TauriTavern's `workspace.apply_patch` under another
 * name (docs/Decisions.md); its error codes keep the `patch` wording.
 */
export function editFileTool(workspace: AgentWorkspace): Tool {
  const read = modelToolName(READ_FILE);
  return {
    id: EDIT_FILE,
    description: `Replace exact text in one file. Read the text with ${read} first, unless you created or replaced the file with the text tools. old_string must match exactly and be unique unless replace_all is true. After a failed patch, read the full file before retrying.`,
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        path: {
          type: 'string',
          description: 'Workspace file path in a writable directory.',
        },
        old_string: {
          type: 'string',
          description:
            'Exact text to replace. Do not include line number prefixes from read output.',
        },
        new_string: {
          type: 'string',
          description: 'Replacement text without line number prefixes.',
        },
        replace_all: {
          type: 'boolean',
          description:
            'Replace every occurrence of old_string. Requires a full read or a file created/replaced with the text tools. Defaults to false.',
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
        throw new ToolError('workspace.patch_empty_old_string', 'old_string cannot be empty');
      }
      if (oldString === newString) {
        throw new ToolError('workspace.patch_no_change', 'old_string and new_string are identical');
      }

      const location = writableLocation(workspace, parseWorkspacePath(rawPath));
      const { path } = location;
      const state = reads.get(path);
      if (!state) {
        throw new ToolError(
          'workspace.patch_requires_read',
          `file must be read with ${read} before applying a patch`,
        );
      }
      if (state.patchRequiresFullRead) {
        throw new ToolError(
          'workspace.patch_requires_full_read',
          `a previous patch attempt for this file failed. Fully read the file with ${read} before applying another patch.`,
        );
      }
      // After only a partial read, an edit may change only text the Run has
      // seen, and any failure requires a full read before the next edit.
      const partial = !state.fullRead;
      const fail = (code: string, message: string): ToolError => {
        if (partial) requireFullReadBeforePatch(reads, path);
        return new ToolError(code, message);
      };
      if (partial && replaceAll) {
        throw fail(
          'workspace.patch_requires_full_read',
          `replace_all can modify text outside the range you read. Fully read the file with ${read} before using replace_all.`,
        );
      }
      if (partial && !oldStringWasObserved(state, oldString)) {
        throw fail(
          'workspace.patch_requires_full_read',
          `old_string was not in the text you have read for this file. Fully read the file with ${read} before retrying the patch.`,
        );
      }

      const file = await readText(location);
      if (file.sha256 !== state.sha256) {
        throw fail(
          'workspace.patch_stale_file',
          partial
            ? `file changed since your last read. Fully read the file with ${read} before patching it.`
            : 'file changed since your last full read. Read the file again before patching it.',
        );
      }
      const matches = file.text.split(oldString).length - 1;
      if (matches === 0) {
        throw fail(
          'workspace.patch_old_string_not_found',
          partial
            ? `old_string was not found in the file. Fully read the file with ${read} before retrying the patch.`
            : 'old_string was not found in the file',
        );
      }
      if (matches > 1 && !replaceAll) {
        throw fail(
          'workspace.patch_old_string_not_unique',
          partial
            ? `old_string matched ${matches} times in the file. Fully read the file with ${read} before retrying with more context, or use replace_all after a full read.`
            : `old_string matched ${matches} times; provide more context or set replace_all=true`,
        );
      }

      const updated = replaceAll
        ? file.text.replaceAll(oldString, () => newString)
        : file.text.replace(oldString, () => newString);
      const written = await writeText(location, updated, file.sha256);
      if (typeof written === 'string') {
        throw fail(
          'workspace.patch_stale_file',
          written === 'missing'
            ? 'file changed before the patch could be written and is no longer present. Read the parent directory before patching again.'
            : partial
              ? `file changed before the patch could be written. Fully read the file with ${read} before patching it.`
              : 'file changed before the patch could be written. Read the file again before patching it.',
        );
      }
      if (partial) rememberPartialPatch(reads, path, written.sha256, oldString, newString);
      else rememberFile(reads, path, written.sha256);

      const metrics = measure(written.text);
      return {
        text: `Patched ${path} with ${matches} replacement(s); file now has ${metrics.chars} chars / ${metrics.words} words.`,
      };
    },
  };
}
