import { join, nameOf, parentOf, ROOT } from '../project/paths';

/** A row of the file tree: a file, a folder, or a new one being named. */
export interface TreeNode {
  /** The project path; '' for the project root. */
  path: string;
  name: string;
  folder: boolean;
  /** Set on the row of a file or folder that is being named and does not exist yet. */
  draft: boolean;
  children: string[];
}

/** What a new row will become once named. */
export interface Draft {
  parent: string;
  folder: boolean;
}

/** The draft row's id: no project path holds a NUL. */
function draftId(parent: string): string {
  return join(parent, '\u0000');
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/**
 * The tree of a project's files. Folders come from the files' paths, plus
 * `folders`: empty ones made in the tree, which the store does not list until
 * a file is written inside. Folders sort before files, both by name; a draft
 * row comes first in its folder.
 */
export function buildTree(
  files: readonly string[],
  folders: readonly string[],
  draft: Draft | undefined,
): ReadonlyMap<string, TreeNode> {
  const nodes = new Map<string, TreeNode>([
    [ROOT, { path: ROOT, name: '', folder: true, draft: false, children: [] }],
  ]);
  const add = (path: string, folder: boolean) => {
    if (nodes.has(path)) return;
    const parent = parentOf(path);
    if (!nodes.has(parent)) add(parent, true);
    nodes.set(path, { path, name: nameOf(path), folder, draft: false, children: [] });
    nodes.get(parent)?.children.push(path);
  };
  for (const folder of folders) add(folder, true);
  for (const file of files) add(file, false);

  for (const node of nodes.values()) {
    node.children.sort((a, b) => {
      const [x, y] = [nodes.get(a), nodes.get(b)];
      if (x?.folder !== y?.folder) return x?.folder ? -1 : 1;
      return collator.compare(nameOf(a), nameOf(b));
    });
  }
  if (draft) {
    const id = draftId(draft.parent);
    nodes.set(id, { path: id, name: '', folder: draft.folder, draft: true, children: [] });
    nodes.get(draft.parent)?.children.unshift(id);
  }
  return nodes;
}

/** Why `name` cannot be used in `parent`, or undefined when it can. */
export function nameProblem(
  nodes: ReadonlyMap<string, TreeNode>,
  parent: string,
  name: string,
  self?: string,
): string | undefined {
  if (name.trim() === '') return '名称不能为空';
  if (/[/\\]/.test(name)) return '名称里不能有 / 或 \\';
  if (name === '.' || name === '..') return '不能用 . 或 .. 作名称';
  if (name.trim() !== name) return '名称不能以空格开头或结尾';
  // Folded case, since a local folder may live on a case-insensitive file system.
  const folded = name.toLowerCase();
  const taken = nodes
    .get(parent)
    ?.children.some(
      (child) =>
        child !== self && !nodes.get(child)?.draft && nameOf(child).toLowerCase() === folded,
    );
  return taken ? `这里已经有名为 ${name} 的文件或文件夹` : undefined;
}
