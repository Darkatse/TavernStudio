import {
  hotkeysCoreFeature,
  syncDataLoaderFeature,
  type ItemInstance,
  type TreeInstance,
} from '@headless-tree/core';
import { useTree } from '@headless-tree/react/react-compiler';
import {
  FilePlus,
  FolderPlus,
  PanelLeftClose,
  PencilLine,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { useRef, useState } from 'react';
import type { Editors } from '../editor/editors';
import { mountPointsBySource, usePlacements } from '../project/mount-points';
import { isWithin, join, nameOf, parentOf, ROOT } from '../project/paths';
import type { Project } from '../project/project';
import { relist, useProjectFiles } from '../project/project-files';
import { Alert } from '../ui/alert';
import { AlertDialog, AlertDialogContent } from '../ui/alert-dialog';
import { Button } from '../ui/button';
import { EmptyState } from '../ui/empty-state';
import { useListHighlight } from '../ui/list-highlight';
import {
  ContextMenu,
  ContextMenuTrigger,
  createMenuHandle,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
} from '../ui/menu';
import { PathText } from '../ui/path-text';
import { showToast } from '../ui/toast';
import { Tooltip } from '../ui/tooltip';
import { FileRow, type Naming } from './file-row';
import { buildTree, nameProblem, type TreeNode } from './tree-model';

/** A name being typed: a rename, or a new file or folder. */
type Editing = { value: string; problem: string | undefined } & (
  { kind: 'rename'; path: string } | { kind: 'create'; parent: string; folder: boolean }
);

export interface FileTreeProps {
  project: Project;
  editors: Editors;
  /** The file shown in the editor. */
  active: string | undefined;
  /** Opens a file; `focus` moves focus into the editor, as Enter does and a click does not. */
  onOpen: (path: string, focus: boolean) => void;
  /** Where the tree covers the editor, the way back to it. */
  onClose?: (() => void) | undefined;
}

/** Keys typed within this long of each other search together. */
const TYPEAHEAD_MS = 500;

/**
 * The project's files: headless-tree for state, keyboard and ARIA, with rows
 * drawn here. Arrows, Home and End move; typing jumps to a name; Enter opens;
 * F2 renames; Delete asks to delete.
 */
export function FileTree({ project, editors, active, onOpen, onClose }: FileTreeProps) {
  const listing = useProjectFiles(project.store);
  const mountPoints = mountPointsBySource(usePlacements());
  // Empty folders made here. The store lists files, so until a file is
  // written inside, a new folder lives only in the tree.
  const [folders, setFolders] = useState<readonly string[]>([]);
  const [editing, setEditing] = useState<Editing>();
  // What the delete dialog asks about; kept while the dialog animates out.
  const [removing, setRemoving] = useState<TreeNode>();
  const [removeOpen, setRemoveOpen] = useState(false);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [opened, setOpened] = useState(false);
  const [menu] = useState(() => createMenuHandle<TreeNode>());
  const [contextTarget, setContextTarget] = useState<TreeNode>();
  const committing = useRef(false);
  const focusAfterMenu = useRef(true);
  const typed = useRef({ text: '', at: 0 });
  const { listProps, block } = useListHighlight('[role="treeitem"]', { focusRing: true });

  const files = listing.files ?? [];
  const nodes = buildTree(
    files,
    folders,
    editing?.kind === 'create' ? { parent: editing.parent, folder: editing.folder } : undefined,
  );
  const nodeOf = (path: string): TreeNode =>
    nodes.get(path) ?? { path, name: nameOf(path), folder: false, draft: false, children: [] };

  // A project has few folders: they all start open.
  if (listing.files && !opened) {
    setOpened(true);
    setExpanded(
      [...nodes.values()]
        .filter((node) => node.folder && node.path !== ROOT)
        .map((node) => node.path),
    );
  }

  const tree = useTree<TreeNode>({
    rootItemId: ROOT,
    state: { expandedItems: expanded },
    setExpandedItems: setExpanded,
    getItemName: (item) => item.getItemData().name,
    isItemFolder: (item) => item.getItemData().folder,
    dataLoader: { getItem: nodeOf, getChildren: (id) => nodes.get(id)?.children ?? [] },
    onPrimaryAction: (item) => {
      const node = item.getItemData();
      if (!node.folder && !node.draft) onOpen(node.path, false);
    },
    features: [syncDataLoaderFeature, hotkeysCoreFeature],
    ignoreHotkeysOnInputs: true,
    hotkeys: {
      customOpen: {
        hotkey: 'Enter',
        handler: (_event, instance) => {
          const item = instance.getFocusedItem();
          const node = item.getItemData();
          if (!node.folder) onOpen(node.path, true);
          else if (item.isExpanded()) item.collapse();
          else item.expand();
        },
      },
      customRename: {
        hotkey: 'F2',
        handler: (_event, instance) => startRename(instance.getFocusedItem().getItemData()),
      },
      customRemove: {
        hotkey: 'Delete',
        handler: (_event, instance) => askRemove(instance.getFocusedItem().getItemData()),
      },
      customTypeahead: {
        hotkey: 'LetterOrNumber',
        handler: (event, instance) => typeahead(event, instance),
      },
    },
  });
  // The data is this render's files, folders and draft; rebuild the rows from
  // it before they are read. It is a small tree, and this keeps no second copy.
  tree().scheduleRebuildTree();
  const items = tree().getItems();

  const focusRow = (path: string) => {
    tree().getItemInstance(path).setFocused();
    tree().updateDomFocus();
  };

  /** Moves focus to the next row whose name starts with what was just typed. */
  const typeahead = ({ key, timeStamp }: KeyboardEvent, instance: TreeInstance<TreeNode>) => {
    const text = timeStamp - typed.current.at < TYPEAHEAD_MS ? typed.current.text + key : key;
    typed.current = { text, at: timeStamp };
    const rows = instance.getItems();
    const from = rows.indexOf(instance.getFocusedItem());
    // A new search starts after the focused row; a longer one may stay on it.
    const order = [...rows.slice(from + (text.length > 1 ? 0 : 1)), ...rows.slice(0, from + 1)];
    const match = order.find((row) =>
      row.getItemName().toLowerCase().startsWith(text.toLowerCase()),
    );
    if (match) focusRow(match.getId());
  };

  const startRename = (node: TreeNode) => {
    if (node.path === ROOT || node.draft) return;
    focusAfterMenu.current = false;
    setEditing({ kind: 'rename', path: node.path, value: node.name, problem: undefined });
  };

  const startCreate = (node: TreeNode, folder: boolean) => {
    const parent = node.folder ? node.path : parentOf(node.path);
    if (parent !== ROOT && !expanded.includes(parent)) setExpanded([...expanded, parent]);
    focusAfterMenu.current = false;
    setEditing({ kind: 'create', parent, folder, value: '', problem: undefined });
  };

  const askRemove = (node: TreeNode) => {
    if (node.path === ROOT || node.draft) return;
    setRemoving(node);
    setRemoveOpen(true);
  };

  const stopEditing = (focus: string) => {
    setEditing(undefined);
    focusRow(focus);
  };

  const commit = async () => {
    if (!editing || committing.current) return;
    const parent = editing.kind === 'create' ? editing.parent : parentOf(editing.path);
    const self = editing.kind === 'rename' ? editing.path : undefined;
    if (self !== undefined && editing.value === nameOf(self)) {
      stopEditing(self);
      return;
    }
    const problem = nameProblem(nodes, parent, editing.value, self);
    if (problem) {
      setEditing({ ...editing, problem });
      return;
    }
    const target = join(parent, editing.value);
    committing.current = true;
    try {
      if (editing.kind === 'rename') {
        await editors.rename(editing.path, target);
        const moved = (path: string) =>
          isWithin(path, editing.path) ? `${target}${path.slice(editing.path.length)}` : path;
        setFolders((current) => current.map(moved));
        setExpanded((current) => current.map(moved));
        stopEditing(target);
      } else if (editing.folder) {
        setFolders((current) => [...current, target]);
        setExpanded((current) => [...current, target]);
        stopEditing(target);
      } else {
        await editors.create(target);
        setEditing(undefined);
        onOpen(target, true);
      }
    } catch (error) {
      setEditing({ ...editing, problem: error instanceof Error ? error.message : String(error) });
    } finally {
      committing.current = false;
    }
  };

  const remove = async (node: TreeNode) => {
    try {
      await editors.remove([node.path]);
      setFolders((current) => current.filter((path) => !isWithin(path, node.path)));
    } catch (error) {
      showToast({
        kind: 'error',
        title: `没能删除 ${node.name}`,
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const naming = (node: TreeNode): Naming | undefined => {
    const matches =
      editing && (editing.kind === 'rename' ? editing.path === node.path : node.draft);
    if (!editing || !matches) return undefined;
    return {
      value: editing.value,
      problem: editing.problem,
      onChange: (value) => setEditing({ ...editing, value, problem: undefined }),
      onCommit: () => void commit(),
      onCancel: () => {
        if (!committing.current) {
          stopEditing(editing.kind === 'rename' ? editing.path : editing.parent);
        }
      },
    };
  };

  const menuItems = (node: TreeNode) => (
    <>
      <MenuItem icon={<FilePlus />} onClick={() => startCreate(node, false)}>
        新建文件
      </MenuItem>
      <MenuItem icon={<FolderPlus />} onClick={() => startCreate(node, true)}>
        新建文件夹
      </MenuItem>
      {node.path !== ROOT && (
        <>
          <MenuSeparator />
          <MenuItem icon={<PencilLine />} shortcut="F2" onClick={() => startRename(node)}>
            重命名
          </MenuItem>
          <MenuItem icon={<Trash2 />} shortcut="Delete" onClick={() => askRemove(node)}>
            删除…
          </MenuItem>
        </>
      )}
    </>
  );

  // An item that opens a name field keeps focus there as the menu closes.
  const finalFocus = () => {
    const back = focusAfterMenu.current;
    focusAfterMenu.current = true;
    return back;
  };

  const removed = removing ? files.filter((path) => isWithin(path, removing.path)) : [];
  const focused = items.find((item) => item.isFocused())?.getItemData() ?? nodeOf(ROOT);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header
        data-density="compact"
        className="flex h-9 shrink-0 items-center gap-1 border-b border-line pr-1 pl-3"
      >
        <h2 className="min-w-0 flex-1 truncate text-caption font-medium text-muted">
          {project.record.name}
        </h2>
        <Tooltip content="新建文件">
          <Button
            variant="ghost"
            icon
            aria-label="新建文件"
            onClick={() => startCreate(focused, false)}
          >
            <FilePlus />
          </Button>
        </Tooltip>
        <Tooltip content="新建文件夹">
          <Button
            variant="ghost"
            icon
            aria-label="新建文件夹"
            onClick={() => startCreate(focused, true)}
          >
            <FolderPlus />
          </Button>
        </Tooltip>
        {onClose && (
          <Tooltip content="隐藏文件列表">
            <Button variant="ghost" icon aria-label="隐藏文件列表" onClick={onClose}>
              <PanelLeftClose />
            </Button>
          </Tooltip>
        )}
      </header>
      {listing.error && (
        <div className="p-2">
          <Alert
            kind="error"
            icon={<TriangleAlert />}
            title="没能列出项目文件"
            actions={<Button onClick={() => relist(project.store)}>重试</Button>}
          >
            {listing.error}
          </Alert>
        </div>
      )}
      {listing.files?.length === 0 && folders.length === 0 && !editing ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <EmptyState
            icon={<FilePlus />}
            title="项目里还没有文件"
            description="新建一个文件开始编写，或者让 Agent 来写。"
            action={<Button onClick={() => startCreate(nodeOf(ROOT), false)}>新建文件</Button>}
          />
        </div>
      ) : (
        <ContextMenu>
          <ContextMenuTrigger
            className="min-h-0 flex-1 overflow-y-auto"
            onContextMenu={(event) => {
              const row =
                event.target instanceof Element
                  ? event.target.closest<HTMLElement>('[data-path]')
                  : null;
              const node = nodeOf(row?.dataset.path ?? ROOT);
              setContextTarget(node);
              if (row) tree().getItemInstance(node.path).setFocused();
            }}
          >
            <div
              {...tree().getContainerProps('项目文件')}
              {...listProps}
              data-density="compact"
              className="relative p-1 outline-none"
            >
              {block}
              {items.map((item: ItemInstance<TreeNode>) => {
                const node = item.getItemData();
                return (
                  <FileRow
                    key={item.getId()}
                    item={item}
                    active={node.path === active}
                    mountPoints={mountPoints.get(node.path)}
                    naming={naming(node)}
                    menu={menu}
                  />
                );
              })}
            </div>
          </ContextMenuTrigger>
          <MenuContent at="pointer" finalFocus={finalFocus}>
            {menuItems(contextTarget ?? nodeOf(ROOT))}
          </MenuContent>
        </ContextMenu>
      )}
      <Menu handle={menu}>
        {({ payload }) =>
          payload && (
            <MenuContent align="end" finalFocus={finalFocus}>
              {menuItems(payload)}
            </MenuContent>
          )
        }
      </Menu>
      <AlertDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        onOpenChangeComplete={(open) => {
          if (!open) setRemoving(undefined);
        }}
      >
        {removing && (
          <AlertDialogContent
            title={`删除 ${removing.name}？`}
            description={
              removed.length === 0
                ? '这个文件夹是空的。'
                : '下列文件会从项目中删除，打开的标签随之关闭，未保存的修改一并丢弃。删除后不能撤销。'
            }
            action="删除"
            onAction={() => void remove(removing)}
          >
            {removed.length > 0 && (
              <ul className="flex flex-col gap-1 font-mono text-caption break-words">
                {removed.map((path) => (
                  <li key={path}>
                    <PathText path={path} />
                  </li>
                ))}
              </ul>
            )}
          </AlertDialogContent>
        )}
      </AlertDialog>
    </div>
  );
}
