import {
  ensureOnlyArguments,
  optionalBoolean,
  optionalCount,
  optionalListPath,
  optionalString,
  requiredRawString,
} from './arguments';
import { plural } from './text';
import { modelToolName, ToolError, type JsonObject, type Tool } from './tool';
import {
  filesBelow,
  GREP,
  READ_FILE,
  readText,
  textAt,
  visibleLocation,
  type AgentWorkspace,
  type TextFile,
} from './workspace';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;
const MAX_CONTEXT = 10;
const MAX_FILES = 5000;
/** A longer line, as in a minified file, shows only the part around its first match. */
const MAX_LINE_CHARS = 500;
const SHOWN_BEFORE_MATCH = 150;
/** Files read at once while the results are taken in order. */
const READ_AHEAD = 8;

const OUTPUT_MODES = ['content', 'files_with_matches', 'count'] as const;
type OutputMode = (typeof OUTPUT_MODES)[number];

export function grepTool(workspace: AgentWorkspace): Tool {
  return {
    id: GREP,
    description: `Search file contents with a regular expression, as grep or ripgrep does. Matching lines come back as path:line:text, so you can find where a selector, custom property, function or string is defined or used, then read around a line with ${modelToolName(READ_FILE)}.
The pattern is a JavaScript regular expression, matched within each line, and case-sensitive unless ignore_case is set. Escape ( ) [ ] { } . * + ? | ^ $ \\ to match them as text. Searches the whole workspace, project/ first, unless path narrows it; files that are not text are skipped.`,
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        pattern: {
          type: 'string',
          description: 'The regular expression, such as --SmartThemeBodyColor or \\.mes_text\\b.',
        },
        path: {
          type: 'string',
          description:
            'A workspace file or directory to search, such as project or vendor/src. Omit to search the whole workspace.',
        },
        glob: {
          type: 'string',
          description:
            'Search only files matching this glob, such as *.css or scripts/**/*.js. A glob without / matches file names at any depth; one with / matches the path below path.',
        },
        ignore_case: {
          type: 'boolean',
          description: 'Match letters in either case. Defaults to false.',
        },
        context: {
          type: 'integer',
          description: `Lines to show before and after each match, as grep -C does. Defaults to 0; at most ${MAX_CONTEXT}.`,
        },
        output_mode: {
          type: 'string',
          enum: [...OUTPUT_MODES],
          description:
            'content, the default, gives matching lines as path:line:text, context lines as path-line-text, and -- between separate groups. files_with_matches gives only the paths of matching files; count gives each file as path:count, the number of its matching lines.',
        },
        limit: {
          type: 'integer',
          description: `The most matching lines to return, or files for files_with_matches and count. Defaults to ${DEFAULT_LIMIT}; at most ${MAX_LIMIT}.`,
        },
      },
      required: ['pattern'],
    },
    async run(input, { signal }) {
      ensureOnlyArguments(input, [
        'pattern',
        'path',
        'glob',
        'ignore_case',
        'context',
        'output_mode',
        'limit',
      ]);
      const pattern = requiredRawString(input, 'pattern');
      if (pattern === '') throw new ToolError('tool.invalid_arguments', 'pattern is required');
      const path = optionalListPath(input, 'path');
      const glob = optionalString(input, 'glob');
      const regex = compile(pattern, optionalBoolean(input, 'ignore_case') ?? false);
      const context = optionalCount(input, 'context') ?? 0;
      if (context > MAX_CONTEXT) {
        throw new ToolError('tool.invalid_arguments', `context must be <= ${MAX_CONTEXT}`);
      }
      const mode = outputMode(input);
      const limit = optionalCount(input, 'limit') ?? DEFAULT_LIMIT;
      if (limit === 0 || limit > MAX_LIMIT) {
        throw new ToolError('tool.invalid_arguments', `limit must be between 1 and ${MAX_LIMIT}`);
      }

      const location = path === undefined ? undefined : visibleLocation(workspace, path);
      const list = await filesBelow(workspace, location, glob, MAX_FILES);
      // A file named on its own must be text; in a directory, files that are not text are skipped.
      const named = list.files.length === 1 && list.files[0]!.path === location?.path;
      const output = new Output(mode, limit, regex, context);
      for (let start = 0; start < list.files.length && !output.full; start += READ_AHEAD) {
        signal.throwIfAborted();
        const batch = list.files.slice(start, start + READ_AHEAD);
        const files = await Promise.all(batch.map((at) => (named ? readText(at) : textAt(at))));
        for (const file of files) {
          if (file) output.add(file);
          if (output.full) break;
        }
      }

      const scope = path ?? 'the workspace';
      const notes: string[] = [];
      if (output.empty) {
        const among = glob === undefined ? '' : ` among files matching \`${glob}\``;
        notes.push(`No matches for \`${pattern}\` in ${scope}${among}.`);
      }
      if (output.more) notes.push(output.moreNote());
      if (list.truncated) {
        notes.push(
          `Searched only the first ${MAX_FILES} files in ${scope}; narrow path or glob to search the rest.`,
        );
      }
      if (output.shortened) {
        notes.push(
          `Lines longer than ${MAX_LINE_CHARS} characters show only the part around their first match, cut off with ….`,
        );
      }
      return { text: [output.text(), ...notes].filter((part) => part !== '').join('\n\n') };
    },
  };
}

function compile(pattern: string, ignoreCase: boolean): RegExp {
  try {
    // Without the u flag, as ripgrep accepts it, an escaped punctuation mark is that mark.
    return new RegExp(pattern, ignoreCase ? 'i' : '');
  } catch (error) {
    throw new ToolError(
      'workspace.grep_pattern_invalid',
      `pattern is not a valid regular expression: ${(error as Error).message}. Escape ( ) [ ] { } . * + ? | ^ $ \\ to match them as text.`,
    );
  }
}

function outputMode(input: JsonObject): OutputMode {
  const mode = input['output_mode'];
  if (mode === undefined) return 'content';
  if (!OUTPUT_MODES.includes(mode as OutputMode)) {
    throw new ToolError(
      'tool.invalid_arguments',
      `output_mode must be one of ${OUTPUT_MODES.join(', ')}`,
    );
  }
  return mode as OutputMode;
}

/** Results in path order, stopping once one more than `limit` has turned up. */
class Output {
  readonly #mode: OutputMode;
  readonly #limit: number;
  readonly #regex: RegExp;
  readonly #context: number;
  readonly #lines: string[] = [];
  /** Matching lines for content, files otherwise. */
  #taken = 0;
  #files = 0;
  #matches = 0;
  more = false;
  shortened = false;

  constructor(mode: OutputMode, limit: number, regex: RegExp, context: number) {
    this.#mode = mode;
    this.#limit = limit;
    this.#regex = regex;
    this.#context = context;
  }

  /** Counts read every file, for their total. */
  get full(): boolean {
    return this.more && this.#mode !== 'count';
  }

  get empty(): boolean {
    return this.#files === 0;
  }

  add(file: TextFile): void {
    const lines = file.text.split('\n');
    const hits = lines.flatMap((line, index) => (this.#regex.test(line) ? [index] : []));
    if (hits.length === 0) return;
    this.#files += 1;
    this.#matches += hits.length;
    if (this.#mode !== 'content') {
      if (this.#taken === this.#limit) {
        this.more = true;
        return;
      }
      this.#taken += 1;
      this.#lines.push(this.#mode === 'count' ? `${file.path}:${hits.length}` : file.path);
      return;
    }

    // The last line shown of this file; context runs up to the next match.
    let last = -1;
    for (const [at, hit] of hits.entries()) {
      if (this.#taken === this.#limit) {
        this.more = true;
        return;
      }
      this.#taken += 1;
      const from = Math.max(hit - this.#context, last + 1);
      const apart = last === -1 || from > last + 1;
      if (this.#context > 0 && this.#lines.length > 0 && apart) this.#lines.push('--');
      for (let index = from; index < hit; index++) this.#push(file.path, lines, index, '-');
      this.#push(file.path, lines, hit, ':');
      const next = hits[at + 1] ?? lines.length;
      last = Math.min(hit + this.#context, next - 1);
      for (let index = hit + 1; index <= last; index++) this.#push(file.path, lines, index, '-');
    }
  }

  #push(path: string, lines: readonly string[], index: number, separator: ':' | '-'): void {
    this.#lines.push(`${path}${separator}${index + 1}${separator}${this.#shown(lines[index]!)}`);
  }

  #shown(line: string): string {
    if (line.length <= MAX_LINE_CHARS) return line;
    this.shortened = true;
    const start = Math.max(0, line.search(this.#regex) - SHOWN_BEFORE_MATCH);
    const end = Math.min(line.length, start + MAX_LINE_CHARS);
    return `${start > 0 ? '…' : ''}${line.slice(start, end)}${end < line.length ? '…' : ''}`;
  }

  text(): string {
    const lines = this.#lines.join('\n');
    if (this.#mode !== 'count' || this.empty) return lines;
    return `${lines}\n\n${plural(this.#matches, 'matching line')} in ${plural(this.#files, 'file')}.`;
  }

  moreNote(): string {
    const narrow = 'Narrow the search with path or glob, or raise limit.';
    switch (this.#mode) {
      case 'content':
        return `Showing the first ${this.#limit} matching lines; there are more. ${narrow}`;
      case 'files_with_matches':
        return `Showing the first ${this.#limit} matching files; there are more. ${narrow}`;
      case 'count':
        return `Showing ${this.#limit} of the ${this.#files} matching files. ${narrow}`;
    }
  }
}
