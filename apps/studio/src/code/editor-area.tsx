import { Check, FileCode2, FileX2, GitCompareArrows, Link2, TriangleAlert } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Editors, Tab } from '../editor/editors';
import { common } from '../i18n/common';
import { useMessages } from '../i18n/messages';
import { Alert } from '../ui/alert';
import { Button } from '../ui/button';
import { Collapsible, CollapsiblePanel } from '../ui/collapsible';
import { EmptyState } from '../ui/empty-state';
import { Tooltip } from '../ui/tooltip';
import { FileTabs } from './file-tabs';
import { MountPointList } from './file-row';
import { codeMessages } from './messages';
import { nameOf, parentOf } from '../project/paths';

export interface EditorAreaProps {
  editors: Editors;
  tabs: readonly Tab[];
  active: string | undefined;
  mountPoints: ReadonlyMap<string, readonly string[]>;
  projectError: string | undefined;
  filesToggle: ReactNode;
  emptyAction: ReactNode;
  panelId: string;
}

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
  const m = useMessages(codeMessages);
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
          <span className="text-caption text-muted">{m.noFileOpen}</span>
        )}
      </div>
      <Folding>
        {projectError && (
          <Alert kind="error" icon={<TriangleAlert />} title={m.previewFailed}>
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
            <EmptyState icon={<FileCode2 />} title={m.noOpenFiles} action={emptyAction} />
          </div>
        )}
        {tab && !tab.text && (
          <div className="absolute inset-0 grid place-items-center p-6">
            <EmptyState icon={<FileX2 />} title={m.notText} description={m.notTextHint} />
          </div>
        )}
      </div>
    </div>
  );
}

function EditorHost({ editors, hidden }: { editors: Editors; hidden: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (host.current) return editors.attach(host.current);
  }, [editors]);
  return <div ref={host} hidden={hidden} className="absolute inset-0 [&>.cm-editor]:h-full" />;
}

function FilePath({ path }: { path: string }) {
  const folder = parentOf(path);
  return (
    <p className="flex min-w-0 items-baseline overflow-hidden text-caption">
      {folder && <span className="truncate text-muted">{folder}/</span>}
      <span className="shrink-0 font-medium">{nameOf(path)}</span>
    </p>
  );
}

function MountPoints({ points }: { points: readonly string[] | undefined }) {
  const m = useMessages(codeMessages);
  const [first, ...rest] = points ?? [];
  if (first === undefined) return null;
  return (
    <Tooltip content={<MountPointList points={points ?? []} />}>
      <span className="flex min-w-6 shrink-[100] items-center gap-1 overflow-hidden rounded-md bg-sunken py-0.5 pr-1.5 pl-1 text-caption text-muted">
        <Link2 aria-hidden="true" className="size-3.5 shrink-0" />
        <span className="sr-only">{m.mountedAt}</span>
        <span className="truncate font-mono">{first}</span>
        {rest.length > 0 && <span className="shrink-0">+{rest.length}</span>}
      </span>
    </Tooltip>
  );
}

/** While the buffer is dirty this says nothing: the tab's dot does. */
function SaveStatus({ tab }: { tab: Tab }) {
  const { saveStatus } = useMessages(codeMessages);
  const status = tab.conflict
    ? { key: 'conflict', icon: <GitCompareArrows />, text: saveStatus.conflict }
    : tab.error
      ? { key: 'failed', icon: <TriangleAlert className="text-danger" />, text: saveStatus.failed }
      : tab.saving
        ? {
            key: 'saving',
            icon: (
              <span className="size-3 animate-spin rounded-full border-[1.5px] border-line-strong border-t-fg" />
            ),
            text: saveStatus.saving,
          }
        : tab.dirty || !tab.text
          ? undefined
          : { key: 'saved', icon: <Check />, text: saveStatus.saved };
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

function TabNotice({ editors, tab }: { editors: Editors; tab: Tab }) {
  const m = useMessages(codeMessages);
  const c = useMessages(common);
  const name = nameOf(tab.path);
  if (tab.conflict) {
    const removed = tab.conflict.kind === 'removed';
    return (
      <Alert
        icon={<GitCompareArrows />}
        title={removed ? m.deletedElsewhere(name) : m.changedElsewhere(name)}
        actions={
          <>
            <Button onClick={() => editors.takeTheirs(tab.path)}>
              {removed ? m.closeFile : m.takeTheirs}
            </Button>
            <Button onClick={() => void editors.keepMine(tab.path)}>{m.keepMine}</Button>
          </>
        }
      >
        {m.unsavedEdits}
      </Alert>
    );
  }
  if (tab.error) {
    return (
      <Alert
        kind="error"
        icon={<TriangleAlert />}
        title={m.saveFailed(name)}
        actions={<Button onClick={() => void editors.retry(tab.path)}>{c.retry}</Button>}
      >
        <span className="font-mono text-caption">{tab.error}</span>
      </Alert>
    );
  }
  return null;
}

/** Keeps its last content while it folds away, so it fades out instead of going blank. */
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
