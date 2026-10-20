import { Check, FileDown, FileUp } from 'lucide-react';
import { useRef, useState } from 'react';
import { messagesNow, useMessages } from '../i18n/messages';
import { ArchiveError, exportArchive, importArchive, type ArchiveReason } from '../project/archive';
import { projectMessages } from '../project/messages';
import { openProject } from '../project/projects';
import { startProject, useStartingProject } from '../project/start';
import { PROJECT_TEMPLATES } from '../project/templates';
import { useCurrentProject, useProjectRecords } from '../project/use-project';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '../ui/menu';
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
  const [busy, setBusy] = useState(false);

  const run = async (failure: keyof ProjectMenuText['failed'], action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      const text = messagesNow(projectMenuMessages);
      showToast({ kind: 'error', title: text.failed[failure], description: describe(error, text) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Menu>
        <MenuTrigger
          disabled={busy || starting !== undefined}
          render={<ProjectButton onPointerEnter={prefetch} onFocus={prefetch} />}
        />
        <MenuContent>
          {PROJECT_TEMPLATES.map((template) => (
            <MenuItem
              key={template.folder}
              icon={<template.icon />}
              onClick={() => void startProject(template)}
            >
              {templates[template.folder].action}
            </MenuItem>
          ))}
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
          <MenuItem icon={<FileUp />} onClick={() => picker.current?.click()}>
            {m.import}
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
    </>
  );
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
