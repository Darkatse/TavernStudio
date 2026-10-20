import { ToolError } from './tool';

/**
 * Matches paths below a directory as ripgrep's `--glob` does: a glob without
 * `/` matches a file's name at any depth, one with `/` the whole path below
 * the directory. `**` crosses directories, `*` and `?` do not; `{a,b}` and
 * `[abc]` work as in a shell.
 */
export function globMatcher(glob: string): (path: string) => boolean {
  const pattern = glob.replace(/^\//, '');
  let regex: RegExp;
  try {
    regex = new RegExp(`^${translate(pattern)}$`);
  } catch {
    throw new ToolError('tool.invalid_arguments', `glob \`${glob}\` is not a valid glob`);
  }
  const byName = !pattern.includes('/');
  return (path) => regex.test(byName ? path.slice(path.lastIndexOf('/') + 1) : path);
}

function translate(glob: string): string {
  let out = '';
  let open = 0;
  for (let index = 0; index < glob.length; index++) {
    const character = glob[index]!;
    if (character === '*') {
      if (glob[index + 1] !== '*') {
        out += '[^/]*';
        continue;
      }
      index += 1;
      if (glob[index + 1] === '/') {
        index += 1;
        out += '(?:.*/)?';
      } else {
        out += '.*';
      }
    } else if (character === '?') {
      out += '[^/]';
    } else if (character === '[') {
      const end = glob.indexOf(']', index + 2);
      if (end === -1) throw new SyntaxError('unclosed [');
      const members = glob
        .slice(index + 1, end)
        .replace(/^!/, '^')
        .replaceAll('\\', '\\\\');
      out += `[${members}]`;
      index = end;
    } else if (character === '{') {
      open += 1;
      out += '(?:';
    } else if (character === '}' && open > 0) {
      open -= 1;
      out += ')';
    } else if (character === ',' && open > 0) {
      out += '|';
    } else {
      out += character.replace(/[.+^$(){}|\\]/, '\\$&');
    }
  }
  if (open > 0) throw new SyntaxError('unclosed {');
  return out;
}
