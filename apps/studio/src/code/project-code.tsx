import { clsx } from 'clsx';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Group, Panel, Separator, usePanelRef } from 'react-resizable-panels';
import { editorsOf, useEditors } from '../editor/editors';
import { messagesNow, useMessages } from '../i18n/messages';
import { useMediaQuery } from '../lib/use-media-query';
import { mountPointsBySource, usePlacements } from '../project/mount-points';
import type { Project } from '../project/project';
import { useProjectState } from '../project/use-project';
import { Button } from '../ui/button';
import { showToast } from '../ui/toast';
import { Tooltip } from '../ui/tooltip';
import { EditorArea } from './editor-area';
import { FileTree } from './file-tree';
import { codeMessages } from './messages';

/**
 * The code view of an open project: the file tree beside the editor on wide
 * screens, resizable as the shell is; one at a time on narrow ones, where the
 * tree is a panel opened from the editor's toolbar (docs/UI.md §1).
 *
 * This module and the editor behind it load on demand, out of the first
 * screen (docs/plan/P1.md, 性能).
 */
export function ProjectCode({ project }: { project: Project }) {
  const m = useMessages(codeMessages);
  const wide = useMediaQuery('(min-width: 768px)');
  const editors = editorsOf(project.store);
  const { tabs, active } = useEditors(editors);
  const { error } = useProjectState(project);
  const mountPoints = mountPointsBySource(usePlacements());
  const panelId = useId();
  const filesId = useId();
  const filesPanel = usePanelRef();
  const toggleButton = useRef<HTMLButtonElement>(null);
  const filesOverlay = useRef<HTMLDivElement>(null);
  // Wide: whether the tree's panel is expanded. Narrow: whether the tree covers
  // the editor, as it does while no file is open.
  const [shown, setShown] = useState(wide || tabs.length === 0);

  // Esc leaves the narrow file panel, unless a name field is taking it back.
  // The shell mounts a new workbench when the width class changes, so the
  // panel is here, or not, for this component's whole life.
  useEffect(() => {
    const overlay = filesOverlay.current;
    if (!overlay) return;
    const leave = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.target instanceof HTMLInputElement) return;
      setShown(false);
      toggleButton.current?.focus();
    };
    overlay.addEventListener('keydown', leave);
    return () => overlay.removeEventListener('keydown', leave);
  }, []);

  const showFiles = (show: boolean) => {
    if (wide) {
      if (show) filesPanel.current?.expand();
      else filesPanel.current?.collapse();
      return;
    }
    setShown(show);
    if (show) {
      requestAnimationFrame(() =>
        filesOverlay.current
          ?.querySelector<HTMLElement>('[role="treeitem"][tabindex="0"]')
          ?.focus(),
      );
    } else {
      toggleButton.current?.focus();
    }
  };

  const open = (path: string, focus: boolean) => {
    if (!wide) setShown(false);
    editors.open(path).then(
      () => {
        if (focus) editors.focus();
        else if (!wide) toggleButton.current?.focus();
      },
      (reason: unknown) =>
        showToast({
          kind: 'error',
          title: messagesNow(codeMessages).openFailed(path),
          description: reason instanceof Error ? reason.message : String(reason),
        }),
    );
  };

  const filesToggle = (
    <Tooltip content={shown ? m.hideFileList : m.showFileList}>
      <Button
        ref={toggleButton}
        variant="ghost"
        icon
        aria-label={m.fileList}
        aria-controls={filesId}
        aria-expanded={shown}
        onClick={() => showFiles(!shown)}
      >
        {shown ? <PanelLeftClose /> : <PanelLeftOpen />}
      </Button>
    </Tooltip>
  );

  const tree = (
    <FileTree
      project={project}
      editors={editors}
      active={active}
      onOpen={open}
      onClose={wide ? undefined : () => showFiles(false)}
    />
  );
  const editorArea = (
    <EditorArea
      editors={editors}
      tabs={tabs}
      active={active}
      mountPoints={mountPoints}
      projectError={error}
      filesToggle={filesToggle}
      emptyAction={
        shown ? undefined : <Button onClick={() => showFiles(true)}>{m.openFileList}</Button>
      }
      panelId={panelId}
    />
  );

  if (wide) {
    return (
      <Group orientation="horizontal" className="min-h-0 min-w-0 flex-1">
        <Panel
          id="files"
          panelRef={filesPanel}
          defaultSize={232}
          minSize={180}
          maxSize="50%"
          collapsible
          groupResizeBehavior="preserve-pixel-size"
          onResize={(size) => setShown(size.inPixels > 0)}
        >
          <div id={filesId} className="h-full">
            {tree}
          </div>
        </Panel>
        <Separator className="group relative w-px bg-line outline-none">
          <span className="absolute inset-y-0 -left-px w-[3px] bg-accent opacity-0 transition-opacity motion-fast group-hover:opacity-60 group-focus-visible:opacity-100 group-data-[separator=active]:opacity-100" />
        </Separator>
        <Panel id="editor" minSize={320}>
          {editorArea}
        </Panel>
      </Group>
    );
  }

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      {editorArea}
      <div
        ref={filesOverlay}
        id={filesId}
        inert={!shown}
        className={clsx(
          'absolute inset-0 z-10 bg-surface motion-reduce:translate-x-0',
          // A drawer on the moderate tier: in from the left, out a step faster.
          shown
            ? '[transition:opacity_var(--motion-moderate)_var(--ease-spring),translate_var(--motion-moderate)_var(--ease-spring)]'
            : 'invisible -translate-x-4 opacity-0 [transition:opacity_var(--motion-moderate-exit)_var(--ease-exit),translate_var(--motion-moderate-exit)_var(--ease-exit),visibility_0s_var(--motion-moderate-exit)]',
        )}
      >
        {tree}
      </div>
    </div>
  );
}
