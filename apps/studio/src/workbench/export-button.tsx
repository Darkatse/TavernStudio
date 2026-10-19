import { Download } from 'lucide-react';
import { useState } from 'react';
import { exportsOf, exportTheme } from '../project/export';
import { usePlacements } from '../project/mount-points';
import type { Project } from '../project/project';
import { useCurrentProject, useProjectState } from '../project/use-project';
import { Button } from '../ui/button';
import { showToast } from '../ui/toast';
import { Tooltip } from '../ui/tooltip';

/**
 * Exports the project as the frontend imports it (docs/plan/P1.md §9), when
 * its Mounts make something to export.
 */
export function ExportButton() {
  const project = useCurrentProject();
  const placements = usePlacements();
  if (!project || !exportsOf(placements).includes('theme')) return null;
  return <ThemeExport project={project} />;
}

function ThemeExport({ project }: { project: Project }) {
  const { differences } = useProjectState(project);
  const [busy, setBusy] = useState(false);
  const pending = new Set(differences.map((difference) => difference.placement)).size;

  const run = async () => {
    setBusy(true);
    try {
      const outcome = await exportTheme(project);
      if (outcome === 'cancelled') return;
      showToast({
        title: outcome === 'saved' ? '主题已保存' : '主题已交给浏览器下载',
        description: [
          `${project.record.name}.json，可在 SillyTavern 的主题设置里导入。`,
          pending > 0 ? `预览里还有 ${pending} 处待采纳的修改，没有包含在内。` : '',
        ].join(''),
      });
    } catch (error) {
      showToast({
        kind: 'error',
        title: '主题没能导出',
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Tooltip content="导出为 SillyTavern 主题">
      <Button
        aria-label="导出主题"
        disabled={busy}
        onClick={() => void run()}
        className="max-md:w-(--size-control) max-md:px-0"
      >
        <Download />
        <span className="max-md:hidden">导出</span>
      </Button>
    </Tooltip>
  );
}
