import { Check, FileDown, FileUp, PencilLine } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { messagesNow, useMessages } from '../i18n/messages';
import { ArchiveError, exportArchive, importArchive, type ArchiveReason } from '../project/archive';
import { projectMessages } from '../project/messages';
import {
  openProject,
  projectNameProblem,
  renameProject,
  type ProjectNameProblem,
} from '../project/projects';
import { startProject, useStartingProject } from '../project/start';
import { PROJECT_TEMPLATES } from '../project/templates';
import { useCurrentProject, useProjectRecords } from '../project/use-project';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '../ui/menu';
import { NameField } from '../ui/name-field';
import { showToast } from '../ui/toast';
import { ProjectButton } from './project-button';
import { projectMenuMessages, type ProjectMenuText } from './project-menu-messages';

const prefetch = () => void import('../lib/zip');

const RECENT = 8;
const LISTED = 5;

export function ProjectMenu() {
  const m = useMessages(projectMenuMessages);
  const { templates } = useMessages(projectMessages);
  const project = useCurrentProject();
  const records = useProjectRecords();
  const starting = useStartingProject();
  const picker = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [naming, setNaming] = useState<{ value: string; problem?: ProjectNameProblem }>();
  // From choosing Rename until the name is committed or cancelled: the menu
  // closing meanwhile hands focus to nothing, and a blur after that is ignored.
  const renaming = useRef(false);
  const refocus = useRef(false);

  // Back to the trigger after renaming, unless focus has moved on elsewhere.
  useEffect(() => {
    if (naming || !refocus.current) return;
    refocus.current = false;
    if (document.activeElement === document.body) trigger.current?.focus();
  }, [naming]);

  const run = async (failure: keyof ProjectMenuText['failed'], action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      report(failure, error);
    } finally {
      setBusy(false);
    }
  };

  const stopNaming = () => {
    renaming.current = false;
    refocus.current = true;
    setNaming(undefined);
  };

  // The field stays until the new name is stored, so the old one never shows in between.
  const commitName = async () => {
    if (!naming || !project || !renaming.current) return;
    const record = project.record;
    const problem = projectNameProblem(naming.value, record);
    if (problem) {
      setNaming({ ...naming, problem });
      return;
    }
    renaming.current = false;
    if (naming.value.trim() !== record.name) {
      await renameProject(record, naming.value).catch((error: unknown) => report('rename', error));
    }
    stopNaming();
  };

  return (
    // The field lies over the button, which keeps its place, its size and the
    // menu's anchor. The name's color eases from the button's into the field's.
    <span className="relative flex min-w-0 shrink font-medium [&_input]:transition-colors [&_input]:motion-moderate [&_input]:starting:text-muted">
      <Menu>
        <MenuTrigger
          ref={trigger}
          disabled={busy || starting !== undefined}
          render={
            <ProjectButton draft={naming?.value} onPointerEnter={prefetch} onFocus={prefetch} />
          }
        />
        <MenuContent finalFocus={() => !renaming.current}>
          {PROJECT_TEMPLATES.map((template) => (
            <MenuItem
              key={template.folder}
              icon={<template.icon />}
              onClick={() => void startProject(template)}
            >
              {templates[template.folder].action}
            </MenuItem>
          ))}
          <MenuItem icon={<FileUp />} onClick={() => picker.current?.click()}>
            {m.import}
          </MenuItem>
          {records.length > 0 && <MenuSeparator />}
          {records.slice(0, RECENT).map((record) => {
            const open = record.id === project?.record.id;
            return (
              <MenuItem
                key={record.id}
                icon={open ? <Check /> : <span className="size-(--size-icon)" />}
                onClick={() => {
                  if (!open) void run('open', () => openProject(record));
                }}
              >
                <span className="truncate">{record.name}</span>
              </MenuItem>
            );
          })}
          <MenuSeparator />
          <MenuItem
            icon={<PencilLine />}
            disabled={!project}
            onClick={() => {
              if (!project) return;
              renaming.current = true;
              setNaming({ value: project.record.name });
            }}
          >
            {m.rename}
          </MenuItem>
          <MenuItem
            icon={<FileDown />}
            disabled={!project}
            onClick={() => {
              if (!project) return;
              void run('export', async () => {
                const outcome = await exportArchive(project);
                if (outcome === 'cancelled') return;
                const text = messagesNow(projectMenuMessages);
                showToast({
                  title: outcome === 'saved' ? text.saved : text.downloaded,
                  description: `${project.record.name}.zip`,
                });
              });
            }}
          >
            {m.export}
          </MenuItem>
        </MenuContent>
      </Menu>
      {naming && (
        // Inset like the button's text, so the name stays where it was.
        <span className="absolute inset-0 flex items-center pr-0.5 pl-2">
          <NameField
            naming={{
              value: naming.value,
              problem: naming.problem && m.nameProblem[naming.problem](naming.value.trim()),
              onChange: (value) => setNaming({ value }),
              onCommit: () => void commitName(),
              onCancel: () => {
                if (renaming.current) stopNaming();
              },
            }}
            label={m.projectName}
            className="flex-1"
          />
        </span>
      )}
      <input
        ref={picker}
        type="file"
        accept=".zip,application/zip"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          // The same file can be chosen again after a failed import.
          event.target.value = '';
          if (!file) return;
          void run('import', async () => {
            const record = await importArchive(file);
            await openProject(record);
            showToast({
              title: messagesNow(projectMenuMessages).imported,
              description: record.name,
            });
          });
        }}
      />
    </span>
  );
}

function report(failure: keyof ProjectMenuText['failed'], error: unknown): void {
  const text = messagesNow(projectMenuMessages);
  showToast({ kind: 'error', title: text.failed[failure], description: describe(error, text) });
}

function describe(error: unknown, text: ProjectMenuText): string {
  if (error instanceof ArchiveError) return archiveProblem(error.reason, text.archive);
  return error instanceof Error ? error.message : String(error);
}

function archiveProblem(reason: ArchiveReason, text: ProjectMenuText['archive']): string {
  const list = (items: readonly string[]) => {
    const listed = items.slice(0, LISTED).join(text.separator);
    return items.length > LISTED ? text.more(listed, items.length - LISTED) : listed;
  };
  switch (reason.kind) {
    case 'notZip':
      return text.notZip(reason.detail);
    case 'notProject':
      return text.notProject;
    case 'unsafePaths':
      return text.unsafePaths(list(reason.paths));
    case 'caseClash':
      return text.caseClash(list(reason.pairs.map(([one, other]) => text.pair(one, other))));
  }
}
