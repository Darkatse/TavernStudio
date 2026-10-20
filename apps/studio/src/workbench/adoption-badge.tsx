import type { Difference } from '@tavern-studio/workspace';
import { Import } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { useMessages } from '../i18n/messages';
import type { Project } from '../project/project';
import { Button } from '../ui/button';
import { LoadingLine } from '../ui/loading';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { workbenchMessages } from './messages';

const loadPanel = () => import('../adoption/adoption-panel');
const AdoptionPanel = lazy(() => loadPanel().then((module) => ({ default: module.AdoptionPanel })));
const prefetch = () => void loadPanel();

export function AdoptionBadge({
  project,
  differences,
  open,
  onOpenChange,
}: {
  project: Project;
  differences: readonly Difference[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const m = useMessages(workbenchMessages).adoption;
  const count = new Set(differences.map((difference) => difference.placement)).size;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
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
