import { Check, FileCode2, FileX2, GitCompareArrows, Link2, TriangleAlert } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Editors, Tab } from '../editor/editors';
import { Alert } from '../ui/alert';
import { Button } from '../ui/button';
import { Collapsible, CollapsiblePanel } from '../ui/collapsible';
import { EmptyState } from '../ui/empty-state';
import { Tooltip } from '../ui/tooltip';
import { FileTabs } from './file-tabs';
import { MountPointList } from './file-row';
import { nameOf, parentOf } from '../project/paths';

export interface EditorAreaProps {
  editors: Editors;
  tabs: readonly Tab[];
  active: string | undefined;
  mountPoints: ReadonlyMap<string, readonly string[]>;
  /** Why the project could not be placed in the preview. */
  projectError: string | undefined;
  /** The button that shows and hides the file tree. */
  filesToggle: ReactNode;
  /** What to do when nothing is open; shown under the empty state. */
  emptyAction: ReactNode;
  panelId: string;
}

/** The open files: tabs, a compact toolbar, what needs the author's attention, and the editor. */
export function EditorArea({
  editors,
  tabs,
  active,
  mountPoints,
  projectError,
  filesToggle,
  emptyAction,
  panelId,
}: EditorAreaProps) {
  const tab = tabs.find((open) => open.path === active);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      {tabs.length > 0 && (
        <FileTabs editors={editors} tabs={tabs} active={active} panel={panelId} />
      )}
      <div
        data-density="compact"
        className="flex h-9 shrink-0 items-center gap-2 border-b border-line pr-3 pl-1.5"
      >
        {filesToggle}
        {tab ? (
          <>
            <FilePath path={tab.path} />
            <MountPoints points={mountPoints.get(tab.path)} />
            <SaveStatus tab={tab} />
          </>
        ) : (
          <span className="text-caption text-muted">未打开文件</span>
        )}
      </div>
      <Folding>
        {projectError && (
          <Alert kind="error" icon={<TriangleAlert />} title="预览没能更新">
            <span className="font-mono text-caption">{projectError}</span>
          </Alert>
        )}
      </Folding>
      <Folding>
        {tab && (tab.conflict || tab.error) && <TabNotice editors={editors} tab={tab} />}
      </Folding>
      <div
        id={panelId}
        role={tabs.length > 0 ? 'tabpanel' : undefined}
        aria-label={tab?.path}
        className="relative min-h-0 flex-1"
      >
        <EditorHost editors={editors} hidden={!tab?.text} />
        {!tab && (
          <div className="absolute inset-0 grid place-items-center p-6">
            <EmptyState
              icon={<FileCode2 />}
              title="没有打开的文件"
              description="从文件列表打开一个文件。改动会自动保存，并即时出现在预览里。"
              action={emptyAction}
            />
          </div>
        )}
        {tab && !tab.text && (
          <div className="absolute inset-0 grid place-items-center p-6">
            <EmptyState
              icon={<FileX2 />}
              title="不能以文本打开"
              description="编辑器只打开 UTF-8 文本文件。这个文件仍会照常挂载到预览里。"
            />
          </div>
        )}
      </div>
    </div>
  );
}

/** Where the one editor view lives while the code view is mounted. */
function EditorHost({ editors, hidden }: { editors: Editors; hidden: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (host.current) return editors.attach(host.current);
  }, [editors]);
  return <div ref={host} hidden={hidden} className="absolute inset-0 [&>.cm-editor]:h-full" />;
}

/** The file's path: its folder gives way before its name does. */
function FilePath({ path }: { path: string }) {
  const folder = parentOf(path);
  return (
    <p className="flex min-w-0 items-baseline overflow-hidden text-caption">
      {folder && <span className="truncate text-muted">{folder}/</span>}
      <span className="shrink-0 font-medium">{nameOf(path)}</span>
    </p>
  );
}

/** Where the file is mounted. In a narrow toolbar it gives way first, down to its icon. */
function MountPoints({ points }: { points: readonly string[] | undefined }) {
  const [first, ...rest] = points ?? [];
  if (first === undefined) return null;
  return (
    <Tooltip content={<MountPointList points={points ?? []} />}>
      <span className="flex min-w-6 shrink-[100] items-center gap-1 overflow-hidden rounded-md bg-sunken py-0.5 pr-1.5 pl-1 text-caption text-muted">
        <Link2 aria-hidden="true" className="size-3.5 shrink-0" />
        <span className="sr-only">挂载到</span>
        <span className="truncate font-mono">{first}</span>
        {rest.length > 0 && <span className="shrink-0">+{rest.length}</span>}
      </span>
    </Tooltip>
  );
}

/**
 * Where the buffer stands against its file. Saves quicker than a quiet wait
 * never show as saving, and while typing it says nothing: the tab's dot does.
 */
function SaveStatus({ tab }: { tab: Tab }) {
  const status = tab.conflict
    ? { key: 'conflict', icon: <GitCompareArrows />, text: '冲突' }
    : tab.error
      ? { key: 'failed', icon: <TriangleAlert className="text-danger" />, text: '保存失败' }
      : tab.saving
        ? {
            key: 'saving',
            icon: (
              <span className="size-3 animate-spin rounded-full border-[1.5px] border-line-strong border-t-fg" />
            ),
            text: '保存中',
          }
        : tab.dirty || !tab.text
          ? undefined
          : { key: 'saved', icon: <Check />, text: '已保存' };
  return (
    <span className="ml-auto flex shrink-0 items-center text-caption text-muted">
      {status && (
        <span
          key={status.key}
          className="flex items-center gap-1 transition-opacity motion-fast starting:opacity-0 [&_svg]:size-3.5"
        >
          {status.icon}
          {status.text}
        </span>
      )}
    </span>
  );
}

/** A conflict or a failed save of the shown file, with the ways out. */
function TabNotice({ editors, tab }: { editors: Editors; tab: Tab }) {
  const name = nameOf(tab.path);
  if (tab.conflict) {
    const removed = tab.conflict.kind === 'removed';
    return (
      <Alert
        icon={<GitCompareArrows />}
        title={removed ? `${name} 已在别处删除` : `${name} 已在别处修改`}
        actions={
          <>
            <Button onClick={() => editors.takeTheirs(tab.path)}>
              {removed ? '关闭文件' : '载入新版本'}
            </Button>
            <Button onClick={() => void editors.keepMine(tab.path)}>保留我的修改</Button>
          </>
        }
      >
        {removed
          ? '编辑器里还有没保存的修改。保留它们会重新创建这个文件。'
          : '编辑器里还有没保存的修改。载入新版本会替换它们，可以撤销；保留我的修改会覆盖另一处的改动。'}
      </Alert>
    );
  }
  if (tab.error) {
    return (
      <Alert
        kind="error"
        icon={<TriangleAlert />}
        title={`没能保存 ${name}`}
        actions={<Button onClick={() => void editors.retry(tab.path)}>重试</Button>}
      >
        <span className="font-mono text-caption">{tab.error}</span>
      </Alert>
    );
  }
  return null;
}

/**
 * A message that folds in above the editor (docs/UI.md §4): the height
 * changes at once and the content fades. It keeps its last content while it
 * folds away, so it fades out instead of going blank.
 */
function Folding({ children }: { children: ReactNode }) {
  const present = Boolean(children);
  const [shown, setShown] = useState<ReactNode>(children);
  if (present && children !== shown) setShown(children);
  return (
    <Collapsible open={present}>
      <CollapsiblePanel keepMounted={false} className="shrink-0 px-2 pt-2">
        {shown}
      </CollapsiblePanel>
    </Collapsible>
  );
}
