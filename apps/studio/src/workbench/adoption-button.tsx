import { Import } from 'lucide-react';
import type { Difference } from '@tavern-studio/workspace';
import { lazy, Suspense, useEffect, useState } from 'react';
import type { Project } from '../project/project';
import { useCurrentProject, useProjectState } from '../project/use-project';
import { Button } from '../ui/button';
import { LoadingLine } from '../ui/loading';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { showToast } from '../ui/toast';

// The panel brings CodeMirror's diff with it, so it loads when the author
// heads for the button, not with the first screen.
const loadPanel = () => import('../adoption/adoption-panel');
const AdoptionPanel = lazy(() => loadPanel().then((module) => ({ default: module.AdoptionPanel })));
const prefetch = () => void loadPanel();

/** Each overwrite is told once, however often the badge mounts. */
const announced = new WeakSet<readonly Difference[]>();

/** A lost session write in a few words: where it was, and what it held. */
function describe(difference: Difference): string {
  if (difference.kind === 'file') return difference.placement.path;
  const value =
    difference.session === undefined ? '（已删除）' : JSON.stringify(difference.session);
  return `${difference.pointer.join('.')} = ${value.length > 60 ? `${value.slice(0, 60)}…` : value}`;
}

/**
 * "待采纳 N": how many mount points hold session writes the project does not
 * have, opening the panel that adopts or discards them (docs/Architecture.md
 * §5). It shows only while there is something to adopt, or the panel is open.
 */
export function AdoptionButton() {
  const project = useCurrentProject();
  return project ? <Adoption key={project.record.id} project={project} /> : null;
}

function Adoption({ project }: { project: Project }) {
  const { differences, overwritten } = useProjectState(project);
  const count = new Set(differences.map((difference) => difference.placement)).size;
  const [open, setOpen] = useState(false);
  // A project change that overwrote session writes says what was lost (docs/Architecture.md §5).
  useEffect(() => {
    if (overwritten.length === 0 || announced.has(overwritten)) return;
    announced.add(overwritten);
    showToast({
      title: '项目改动覆盖了预览里尚未采纳的修改',
      description: `这些值换成了项目里的内容：${overwritten.map(describe).join('；')}`,
      stay: true,
    });
  }, [overwritten]);
  if (count === 0 && !open) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <span className="flex transition-[opacity,scale] motion-moderate starting:opacity-0 motion-safe:starting:scale-90">
        <PopoverTrigger
          render={
            <Button
              aria-label={`待采纳 ${count}`}
              onPointerEnter={prefetch}
              onFocus={prefetch}
              className="pr-2 max-md:pl-2"
            />
          }
        >
          <Import />
          <span className="max-md:hidden">待采纳</span>
          <span className="min-w-4 rounded-full bg-primary px-1 text-center text-micro text-primary-fg tabular-nums">
            {count}
          </span>
        </PopoverTrigger>
      </span>
      <PopoverContent className="@container w-[min(36rem,calc(100vw-1rem))]">
        <Suspense
          fallback={
            <div aria-busy="true" className="relative h-24">
              <LoadingLine label="正在载入待采纳的修改" />
            </div>
          }
        >
          <AdoptionPanel project={project} differences={differences} />
        </Suspense>
      </PopoverContent>
    </Popover>
  );
}
