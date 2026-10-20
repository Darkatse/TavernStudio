import { requiredRawString, requiredTrimmedString } from './arguments';
import { rememberFile } from './read-state';
import { countLines, plural } from './text';
import { modelToolName, ToolError, type JsonObject, type Tool } from './tool';
import {
  EDIT_FILE,
  kindAt,
  LIST_FILES,
  parseWorkspacePath,
  pathIsDirectory,
  READ_FILE,
  readText,
  writableLocation,
  WRITE_FILE,
  writeText,
  type AgentWorkspace,
  type TextFile,
  type WriteConflict,
} from './workspace';

export function writeFileTool(workspace: AgentWorkspace): Tool {
  return {
    id: WRITE_FILE,
    description: `Create a text file, replace a file's whole contents, or append to it. To change part of a file, use ${modelToolName(EDIT_FILE)}. Before replacing a file that exists, read it with ${modelToolName(READ_FILE)}, unless you wrote its current contents yourself.`,
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        path: {
          type: 'string',
          description: 'A workspace file path in a writable directory, such as project/theme.css.',
        },
        content: {
          type: 'string',
          description:
            'The whole file for replace, or the text to add to its end for append. Include the newlines you need.',
        },
        mode: {
          type: 'string',
          enum: ['replace', 'append'],
          description:
            'replace writes content as the whole file. append adds it to the end, creating the file if it is missing; use it to write a file too long for one call in parts. Defaults to replace.',
        },
      },
      required: ['path', 'content'],
    },
    async run(input, { reads }) {
      const rawPath = requiredTrimmedString(input, 'path');
      const content = requiredRawString(input, 'content');
      const mode = writeMode(input);
      const location = writableLocation(workspace, parseWorkspacePath(rawPath));
      const kind = await kindAt(location);
      if (kind === 'directory') throw pathIsDirectory(location.path);

      let written: TextFile | WriteConflict;
      let fullyKnown: boolean;
      if (mode === 'replace') {
        // An existing file is overwritten only as the Run last saw it; one it
        // has not read, or one that went away, only if there still is none.
        const known = kind === 'file' ? reads.get(location.path) : undefined;
        written = await writeText(location, content, known?.sha256 ?? null);
        fullyKnown = true;
      } else {
        // Appending needs no read; the Run still knows the whole result when
        // it knew the whole file before.
        const previous = kind === 'file' ? await readText(location) : undefined;
        written = await writeText(
          location,
          (previous?.text ?? '') + content,
          previous?.sha256 ?? null,
        );
        const known = reads.get(location.path);
        fullyKnown =
          previous === undefined || (known?.fullRead === true && known.sha256 === previous.sha256);
      }
      if (typeof written === 'string') throw writeConflict(written);
      if (fullyKnown) rememberFile(reads, written.path, written.sha256);

      const done = kind === undefined ? 'Created' : mode === 'replace' ? 'Replaced' : 'Appended to';
      return {
        text: `${done} ${written.path}; it has ${plural(countLines(written.text), 'line')}.`,
      };
    },
  };
}

function writeMode(input: JsonObject): 'replace' | 'append' {
  const mode = input['mode'];
  if (mode === undefined) return 'replace';
  const trimmed = typeof mode === 'string' ? mode.trim() : undefined;
  if (trimmed !== 'replace' && trimmed !== 'append') {
    throw new ToolError('workspace.write_mode_invalid', 'mode must be `replace` or `append`');
  }
  return trimmed;
}

function writeConflict(conflict: WriteConflict): ToolError {
  switch (conflict) {
    case 'exists':
      return new ToolError(
        'workspace.write_requires_read',
        `file already exists; read it with ${modelToolName(READ_FILE)} before rewriting it`,
      );
    case 'changed':
      return new ToolError(
        'workspace.write_stale_file',
        'file changed since you last read or wrote it. Read the file again before rewriting it.',
      );
    case 'missing':
      return new ToolError(
        'workspace.write_stale_file',
        `file changed since you last read or wrote it and is no longer there; check its directory with ${modelToolName(LIST_FILES)} before writing it again.`,
      );
  }
}
