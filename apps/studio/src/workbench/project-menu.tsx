import { Check, FileDown, FileUp } from 'lucide-react';
import { useRef, useState } from 'react';
import { createFromTemplate, openProject } from '../project/projects';
import { PROJECT_TEMPLATES } from '../project/templates';
import { useCurrentProject, useProjectRecords } from '../project/use-project';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '../ui/menu';
import { showToast } from '../ui/toast';
import { ProjectButton } from './project-button';

// The archive brings the zip library with it, so it loads as the author heads for the menu.
const loadArchive = () => import('../project/archive');
const prefetch = () => void loadArchive();

/** How many projects the menu lists, the ones opened last. */
const RECENT = 8;

/**
 * The project the workbench shows, and the ways to another: start one from a
 * template, switch to a recent one, import an archive; and to keep this one
 * as an archive (docs/Architecture.md §6).
 */
export function ProjectMenu() {
  const project = useCurrentProject();
  const records = useProjectRecords();
  const picker = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const run = async (failure: string, action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      showToast({
        kind: 'error',
        title: failure,
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Menu>
        <MenuTrigger
          disabled={busy}
          render={<ProjectButton onPointerEnter={prefetch} onFocus={prefetch} />}
        />
        <MenuContent>
          {PROJECT_TEMPLATES.map((template) => (
            <MenuItem
              key={template.folder}
              icon={<template.icon />}
              onClick={() =>
                void run('项目没能新建', async () =>
                  openProject(await createFromTemplate(template)),
                )
              }
            >
              {template.action}
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
                  if (!open) void run('项目没能打开', () => openProject(record));
                }}
              >
                <span className="truncate">{record.name}</span>
              </MenuItem>
            );
          })}
          <MenuSeparator />
          <MenuItem icon={<FileUp />} onClick={() => picker.current?.click()}>
            导入项目…
          </MenuItem>
          <MenuItem
            icon={<FileDown />}
            disabled={!project}
            onClick={() => {
              if (!project) return;
              void run('项目没能导出', async () => {
                const outcome = await (await loadArchive()).exportArchive(project);
                if (outcome === 'cancelled') return;
                showToast({
                  title: outcome === 'saved' ? '项目已保存' : '项目已交给浏览器下载',
                  description: `${project.record.name}.zip，可在这里导入，或在别处解压编辑。`,
                });
              });
            }}
          >
            导出项目
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
          void run('项目没能导入', async () => {
            const record = await (await loadArchive()).importArchive(file);
            await openProject(record);
            showToast({ title: '项目已导入', description: record.name });
          });
        }}
      />
    </>
  );
}
