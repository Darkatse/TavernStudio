import { Import } from 'lucide-react';
import type { Difference } from '@tavern-studio/workspace';
import { lazy, Suspense, useEffect, useState } from 'react';
import { messagesNow, useMessages } from '../i18n/messages';
import type { Project } from '../project/project';
import { useCurrentProject, useProjectState } from '../project/use-project';
import { Button } from '../ui/button';
import { LoadingLine } from '../ui/loading';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { showToast } from '../ui/toast';
import { workbenchMessages } from './messages';

const loadPanel = () => import('../adoption/adoption-panel');
const AdoptionPanel = lazy(() => loadPanel().then((module) => ({ default: module.AdoptionPanel })));
const prefetch = () => void loadPanel();

/** Each overwrite is told once, however often the badge mounts. */
const announced = new WeakSet<readonly Difference[]>();

function describe(difference: Difference, deleted: string): string {
  if (difference.kind === 'file') return difference.placement.path;
  const value = difference.session === undefined ? deleted : JSON.stringify(difference.session);
  return `${difference.pointer.join('.')} = ${value.length > 60 ? `${value.slice(0, 60)}…` : value}`;
}

export function AdoptionButton() {
  const project = useCurrentProject();
  return project ? <Adoption key={project.record.id} project={project} /> : null;
}

function Adoption({ project }: { project: Project }) {
  const m = useMessages(workbenchMessages).adoption;
  const { differences, overwritten } = useProjectState(project);
  const count = new Set(differences.map((difference) => difference.placement)).size;
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (overwritten.length === 0 || announced.has(overwritten)) return;
    announced.add(overwritten);
    const text = messagesNow(workbenchMessages).adoption;
    showToast({
      title: text.overwritten,
      description: overwritten
        .map((difference) => describe(difference, text.deleted))
        .join(text.separator),
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
              aria-label={m.count(count)}
              onPointerEnter={prefetch}
              onFocus={prefetch}
              className="pr-2 max-md:pl-2"
            />
          }
        >
          <Import />
          <span className="max-md:hidden">{m.label}</span>
          <span className="min-w-4 rounded-full bg-primary px-1 text-center text-micro text-primary-fg tabular-nums">
            {count}
          </span>
        </PopoverTrigger>
      </span>
      <PopoverContent className="@container w-[min(36rem,calc(100vw-1rem))]">
        <Suspense
          fallback={
            <div aria-busy="true" className="relative h-24">
              <LoadingLine label={m.loading} />
            </div>
          }
        >
          <AdoptionPanel project={project} differences={differences} />
        </Suspense>
      </PopoverContent>
    </Popover>
  );
}
