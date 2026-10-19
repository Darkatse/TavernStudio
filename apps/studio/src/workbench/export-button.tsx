import { ChevronDown, Download, Palette, Puzzle } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { messagesNow, useMessages } from '../i18n/messages';
import { exportFileName, exportsOf, saveExport, type ProjectExport } from '../project/export';
import { usePlacements } from '../project/mount-points';
import type { Project } from '../project/project';
import { useCurrentProject, useProjectState } from '../project/use-project';
import { Button } from '../ui/button';
import { showToast } from '../ui/toast';
import { Tooltip } from '../ui/tooltip';
import { workbenchMessages } from './messages';

const ExportMenu = lazy(() =>
  import('./export-menu').then((module) => ({ default: module.ExportMenu })),
);

const icons = { theme: Palette, extension: Puzzle } as const;

export function ExportButton() {
  const project = useCurrentProject();
  return project ? <Exports key={project.record.id} project={project} /> : null;
}

function Exports({ project }: { project: Project }) {
  const m = useMessages(workbenchMessages).exports;
  const exports = exportsOf(usePlacements());
  const { differences } = useProjectState(project);
  const [busy, setBusy] = useState(false);

  const run = async (item: ProjectExport) => {
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
      const text = messagesNow(workbenchMessages).exports;
      const kind = text[item.kind];
      showToast({
        title: outcome === 'saved' ? kind.saved : kind.downloaded,
        description: text.pending(kind.next(exportFileName(project, item)), pending),
      });
    } catch (error) {
      showToast({
        kind: 'error',
        title: messagesNow(workbenchMessages).exports[item.kind].failed,
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
      <Tooltip content={m[only.kind].hint}>
        <Button
          aria-label={m.label(only)}
          disabled={busy}
          onClick={() => void run(only)}
          className="max-md:w-(--size-control) max-md:px-0"
        >
          <Download />
          <span className="max-md:hidden">{m.export}</span>
        </Button>
      </Tooltip>
    );
  }
  const trigger = (
    <Button aria-label={m.export} disabled={busy} className="max-md:w-(--size-control) max-md:px-0">
      <Download />
      <span className="max-md:hidden">{m.export}</span>
      <ChevronDown className="max-md:hidden" />
    </Button>
  );
  return (
    <Suspense fallback={trigger}>
      <ExportMenu
        trigger={trigger}
        items={exports.map((item) => {
          const Icon = icons[item.kind];
          return {
            key: item.kind === 'theme' ? 'theme' : `extension:${item.name}`,
            label: m.label(item),
            icon: <Icon />,
            onClick: () => void run(item),
          };
        })}
      />
    </Suspense>
  );
}
