import { ChevronDown, Download, Palette, Puzzle } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { exportFileName, exportsOf, saveExport, type ProjectExport } from '../project/export';
import { usePlacements } from '../project/mount-points';
import type { Project } from '../project/project';
import { useCurrentProject, useProjectState } from '../project/use-project';
import { Button } from '../ui/button';
import { showToast } from '../ui/toast';
import { Tooltip } from '../ui/tooltip';

// Only a project with several exports lists them in a menu, which brings
// Base UI's Menu; it loads then, behind a button that looks the same.
const ExportMenu = lazy(() =>
  import('./export-menu').then((module) => ({ default: module.ExportMenu })),
);

/** How the workbench speaks of each kind of export. */
const KINDS = {
  theme: {
    noun: '主题',
    hint: '导出为 SillyTavern 主题',
    next: '可在 SillyTavern 的主题设置里导入。',
    icon: Palette,
  },
  extension: {
    noun: '扩展',
    hint: '导出为扩展的 zip',
    next: '解压到 data/default-user/extensions/，重新载入后即可使用。',
    icon: Puzzle,
  },
} as const;

function labelOf(item: ProjectExport): string {
  return item.kind === 'theme' ? '导出主题' : `导出扩展 ${item.name}`;
}

/**
 * Exports the project as the frontend installs it (docs/plan/P1.md §9), when
 * its Mounts make something to export: one button for one export, a menu
 * for several.
 */
export function ExportButton() {
  const project = useCurrentProject();
  return project ? <Exports key={project.record.id} project={project} /> : null;
}

function Exports({ project }: { project: Project }) {
  const exports = exportsOf(usePlacements());
  const { differences } = useProjectState(project);
  const [busy, setBusy] = useState(false);

  const run = async (item: ProjectExport) => {
    const { noun, next } = KINDS[item.kind];
    // Session writes are not exported; the author hears of those the export reads.
    const pending = new Set(
      differences
        .map((difference) => difference.placement)
        .filter((placement) => item.placements.some((placed) => placed === placement)),
    ).size;
    setBusy(true);
    try {
      const outcome = await saveExport(project, item);
      if (outcome === 'cancelled') return;
      showToast({
        title: outcome === 'saved' ? `${noun}已保存` : `${noun}已交给浏览器下载`,
        description: [
          `${exportFileName(project, item)}，${next}`,
          pending > 0 ? `预览里还有 ${pending} 处待采纳的修改，没有包含在内。` : '',
        ].join(''),
      });
    } catch (error) {
      showToast({
        kind: 'error',
        title: `${noun}没能导出`,
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
    }
  };

  const [only, ...others] = exports;
  if (!only) return null;
  if (others.length === 0) {
    return (
      <Tooltip content={KINDS[only.kind].hint}>
        <Button
          aria-label={labelOf(only)}
          disabled={busy}
          onClick={() => void run(only)}
          className="max-md:w-(--size-control) max-md:px-0"
        >
          <Download />
          <span className="max-md:hidden">导出</span>
        </Button>
      </Tooltip>
    );
  }
  const trigger = (
    <Button aria-label="导出" disabled={busy} className="max-md:w-(--size-control) max-md:px-0">
      <Download />
      <span className="max-md:hidden">导出</span>
      <ChevronDown className="max-md:hidden" />
    </Button>
  );
  return (
    <Suspense fallback={trigger}>
      <ExportMenu
        trigger={trigger}
        items={exports.map((item) => {
          const Icon = KINDS[item.kind].icon;
          return {
            key: item.kind === 'theme' ? 'theme' : `extension:${item.name}`,
            label: labelOf(item),
            icon: <Icon />,
            onClick: () => void run(item),
          };
        })}
      />
    </Suspense>
  );
}
