import { describe, expect, test } from '@rstest/core';
import { sha256, StaleFileError } from '@tavern-studio/workspace';
import { normalizeArguments } from './arguments';
import type { ReadState } from './read-state';
import { modelToolName, ToolError } from './tool';
import { resultForModel } from './tool-results';
import type { AgentWorkspace, WorkspaceRoot } from './workspace';
import { workspaceTools } from './workspace-tools';

const LIST = 'workspace.list_files';
const READ = 'workspace.read_file';
const WRITE = 'workspace.write_file';
const EDIT = 'workspace.edit_file';
const THEME = 'project/theme.css';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

class MemoryRoot implements WorkspaceRoot {
  protected readonly contents = new Map<string, Uint8Array>();

  constructor(files: Record<string, string> = {}) {
    for (const [path, text] of Object.entries(files)) this.contents.set(path, encoder.encode(text));
  }

  kind(path: string): Promise<'file' | 'directory' | undefined> {
    if (this.contents.has(path)) return Promise.resolve('file');
    const isDirectory = this.#paths().some((file) => file.startsWith(`${path}/`));
    return Promise.resolve(isDirectory ? 'directory' : undefined);
  }

  read(path: string): Promise<Uint8Array> {
    const bytes = this.contents.get(path);
    return bytes ? Promise.resolve(bytes) : Promise.reject(new Error(`No file ${path}`));
  }

  files(directory: string): Promise<string[]> {
    const prefix = directory === '' ? '' : `${directory}/`;
    return Promise.resolve(
      this.#paths()
        .filter((file) => file.startsWith(prefix))
        .map((file) => file.slice(prefix.length)),
    );
  }

  put(path: string, text: string): Promise<void> {
    this.contents.set(path, encoder.encode(text));
    return Promise.resolve();
  }

  text(path: string): string | undefined {
    const bytes = this.contents.get(path);
    return bytes && decoder.decode(bytes);
  }

  #paths(): string[] {
    return [...this.contents.keys()].toSorted();
  }
}

class WritableMemoryRoot extends MemoryRoot {
  async write(path: string, content: Uint8Array, expected?: string | null): Promise<string> {
    if (expected !== undefined) {
      const current = this.contents.get(path);
      if ((current ? await sha256(current) : null) !== expected) {
        throw new StaleFileError(`${path} changed since it was read`);
      }
    }
    this.contents.set(path, content);
    return sha256(content);
  }
}

function run(workspace: AgentWorkspace) {
  const tools = new Map(workspaceTools(workspace).map((tool) => [tool.id, tool]));
  const reads: ReadState = new Map();
  return async (id: string, input: unknown): Promise<string> => {
    const tool = tools.get(id);
    if (!tool) throw new Error(`No tool ${id}`);
    const context = { run: 'test', signal: new AbortController().signal, reads };
    return (await tool.run(normalizeArguments(input), context)).text;
  };
}

function project(files: Record<string, string>) {
  const root = new WritableMemoryRoot(files);
  const call = run({ project: root, vendor: new MemoryRoot({ 'style.css': 'body {}' }) });
  return { root, call };
}

async function failure(call: Promise<unknown>): Promise<string> {
  try {
    await call;
  } catch (error) {
    if (error instanceof ToolError) return error.code;
    throw error;
  }
  throw new Error('The call succeeded');
}

describe('Workspace tools', () => {
  test('an existing file is overwritten only after the Run read it', async () => {
    const { root, call } = project({ 'theme.css': 'a {}' });
    const write = { path: THEME, content: 'b {}' };
    expect(await failure(call(WRITE, write))).toBe('workspace.write_requires_read');
    expect(root.text('theme.css')).toBe('a {}');

    await call(READ, { path: THEME });
    await call(WRITE, write);
    expect(root.text('theme.css')).toBe('b {}');
  });

  test('a file changed since the Run read it is not written', async () => {
    const { root, call } = project({ 'theme.css': 'a { color: red; }' });
    await call(READ, { path: THEME });
    await root.put('theme.css', 'a { color: blue; }');

    expect(await failure(call(WRITE, { path: THEME, content: 'b {}' }))).toBe(
      'workspace.write_stale_file',
    );
    expect(
      await failure(call(EDIT, { path: THEME, old_string: 'color', new_string: 'background' })),
    ).toBe('workspace.patch_stale_file');
    expect(root.text('theme.css')).toBe('a { color: blue; }');
  });

  test('after a partial read, an edit changes only text the Run has seen', async () => {
    const { root, call } = project({ 'theme.css': 'a {}\nb {}\nc {}' });
    await call(READ, { path: THEME, start_line: 1, line_count: 1 });

    await call(EDIT, { path: THEME, old_string: 'a {}', new_string: 'a { color: red; }' });
    // What the Run has seen reads with its own edit applied.
    await call(EDIT, { path: THEME, old_string: 'red', new_string: 'blue' });
    expect(root.text('theme.css')).toBe('a { color: blue; }\nb {}\nc {}');

    const everywhere = { path: THEME, old_string: '{}', new_string: '{ }', replace_all: true };
    expect(await failure(call(EDIT, everywhere))).toBe('workspace.patch_requires_full_read');
    expect(root.text('theme.css')).toBe('a { color: blue; }\nb {}\nc {}');
  });

  test('after a failed edit of a partially read file, only a full read allows the next', async () => {
    const { root, call } = project({ 'theme.css': 'a {}\nb {}' });
    const seen = { path: THEME, old_string: 'b {}', new_string: 'b { color: red; }' };
    await call(READ, { path: THEME, start_line: 2, line_count: 1 });

    expect(await failure(call(EDIT, { ...seen, old_string: 'a {}' }))).toBe(
      'workspace.patch_requires_full_read',
    );
    expect(await failure(call(EDIT, seen))).toBe('workspace.patch_requires_full_read');
    await call(READ, { path: THEME, start_line: 2, line_count: 1 });
    expect(await failure(call(EDIT, seen))).toBe('workspace.patch_requires_full_read');

    await call(READ, { path: THEME });
    await call(EDIT, seen);
    expect(root.text('theme.css')).toBe('a {}\nb { color: red; }');
  });

  test('a file the Run wrote can be edited and rewritten without reading it', async () => {
    const { root, call } = project({});
    await call(WRITE, { path: 'project/new.css', content: 'a {}\nb {}' });
    await call(EDIT, {
      path: 'project/new.css',
      old_string: '{}',
      new_string: '{ }',
      replace_all: true,
    });
    expect(root.text('new.css')).toBe('a { }\nb { }');

    await call(WRITE, { path: 'project/new.css', content: 'c {}' });
    expect(root.text('new.css')).toBe('c {}');
  });

  test('paths outside the workspace and on read-only roots are refused', async () => {
    const { root, call } = project({ 'theme.css': 'a {}' });
    for (const path of ['project/../secret', '..', '/etc/passwd', '\\\\server\\share', 'C:/x']) {
      expect(await failure(call(READ, { path }))).toBe('workspace.invalid_path');
    }
    expect(await failure(call(LIST, { path: '../' }))).toBe('tool.invalid_arguments');
    expect(await failure(call(READ, { path: 'secret/key' }))).toBe('workspace.path_not_visible');
    for (const path of ['vendor/style.css', 'project', 'secret/key']) {
      expect(await failure(call(WRITE, { path, content: '' }))).toBe('workspace.path_not_writable');
    }
    expect(
      await failure(call(EDIT, { path: 'vendor/style.css', old_string: 'body', new_string: 'p' })),
    ).toBe('workspace.path_not_writable');

    // Separators and `.` segments normalize: this reads the same file the write names.
    await call(READ, { path: '.\\project\\\\theme.css' });
    await call(WRITE, { path: THEME, content: 'b {}' });
    expect(root.text('theme.css')).toBe('b {}');
  });
});

describe('normalizeArguments', () => {
  test('reads the empty forms as no arguments', () => {
    for (const raw of [undefined, null, '', ' \n', 'null']) {
      expect(normalizeArguments(raw)).toEqual({});
    }
    expect(normalizeArguments('{"path":"project"}')).toEqual({ path: 'project' });
    expect(normalizeArguments({ path: 'project' })).toEqual({ path: 'project' });
  });

  test('refuses anything but an object', () => {
    for (const raw of ['[]', '42', '{"path":', 42, true, []]) {
      expect(() => normalizeArguments(raw)).toThrow(ToolError);
    }
  });
});

describe('Long results', () => {
  const origin = { runId: 'run-1', round: 2, callId: 'call:1' };

  test('are stored, and the model gets their beginning and where to read the rest', async () => {
    const results = new MemoryRoot();
    const text = `${'a'.repeat(4_000)}\n${'b'.repeat(100_000)}`;
    const { text: shown, storedAt } = await resultForModel(text, origin, results);

    expect(storedAt).toMatch(/^tool-results\/run-1\/round-002-call_[0-9a-f]{16}\.txt$/);
    const stored = results.text((storedAt as string).slice('tool-results/'.length)) as string;
    expect(stored.split('\n').every((line) => line.length <= 3_000)).toBe(true);
    expect(stored.replaceAll('\n', '')).toBe(text.replaceAll('\n', ''));

    expect(shown).toContain(`\`${storedAt}\``);
    expect(shown).toContain(modelToolName(READ));
    expect(shown).toContain(modelToolName('workspace.search_files'));
    expect(shown.endsWith(`\n\n${'a'.repeat(3_000)}`)).toBe(true);

    expect(await resultForModel('short', origin, results)).toEqual({ text: 'short' });
  });

  test('read back are not stored again', async () => {
    // Lines this short make a read return its most lines and characters at once.
    const results = new MemoryRoot();
    const text = Array.from({ length: 5_000 }, () => 'x'.repeat(65)).join('\n');
    const { storedAt } = await resultForModel(text, origin, results);

    const read = await run({ 'tool-results': results })(READ, { path: storedAt });
    expect((await resultForModel(read, origin, results)).storedAt).toBeUndefined();
  });
});
