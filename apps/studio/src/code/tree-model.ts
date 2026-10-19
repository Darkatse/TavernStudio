import { join, nameOf, parentOf, ROOT } from '../project/paths';

export interface TreeNode {
  path: string;
  name: string;
  folder: boolean;
  draft: boolean;
  children: string[];
}

export interface Draft {
  parent: string;
  folder: boolean;
}

/** No project path holds a NUL, so the draft row's id cannot collide with a real one. */
function draftId(parent: string): string {
  return join(parent, '\u0000');
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

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

export type NameProblem =
  | { kind: 'empty' }
  | { kind: 'separator' }
  | { kind: 'dots' }
  | { kind: 'spaces' }
  | { kind: 'taken'; name: string };

export function nameProblem(
  nodes: ReadonlyMap<string, TreeNode>,
  parent: string,
  name: string,
  self?: string,
): NameProblem | undefined {
  if (name.trim() === '') return { kind: 'empty' };
  if (/[/\\]/.test(name)) return { kind: 'separator' };
  if (name === '.' || name === '..') return { kind: 'dots' };
  if (name.trim() !== name) return { kind: 'spaces' };
  // A local folder may live on a case-insensitive file system.
  const folded = name.toLowerCase();
  const taken = nodes
    .get(parent)
    ?.children.some(
      (child) =>
        child !== self && !nodes.get(child)?.draft && nameOf(child).toLowerCase() === folded,
    );
  return taken ? { kind: 'taken', name } : undefined;
}
