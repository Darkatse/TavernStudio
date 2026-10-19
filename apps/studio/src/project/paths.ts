/** Paths inside a project: relative, `/`-separated, '' for the project root. */
export const ROOT = '';

export function join(parent: string, name: string): string {
  return parent === ROOT ? name : `${parent}/${name}`;
}

export function parentOf(path: string): string {
  const at = path.lastIndexOf('/');
  return at === -1 ? ROOT : path.slice(0, at);
}

export function nameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** Whether `path` is `root` or lies below it. */
export function isWithin(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

/** The folders at or below `roots` that hold any of `files`, deepest first. */
export function foldersWithin(files: readonly string[], roots: readonly string[]): string[] {
  const folders = new Set<string>();
  for (const file of files) {
    for (let folder = parentOf(file); folder !== ROOT; folder = parentOf(folder)) {
      if (roots.some((root) => isWithin(folder, root))) folders.add(folder);
    }
  }
  return [...folders].toSorted((a, b) => b.split('/').length - a.split('/').length);
}
