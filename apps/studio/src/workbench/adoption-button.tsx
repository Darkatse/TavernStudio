import type { Difference } from '@tavern-studio/workspace';
import { lazy, Suspense, useDeferredValue, useEffect, useState } from 'react';
import { messagesNow } from '../i18n/messages';
import { useOverwritten } from '../preview/use-session';
import type { Project } from '../project/project';
import { useCurrentProject, useProjectState } from '../project/use-project';
import { showToast } from '../ui/toast';
import { workbenchMessages } from './messages';

// The badge brings the popover with it, so it loads once there is something to adopt.
const AdoptionBadge = lazy(() =>
  import('./adoption-badge').then((module) => ({ default: module.AdoptionBadge })),
);

/** Each overwrite is told once, however often the button mounts. */
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
  const { differences } = useProjectState(project);
  const overwritten = useOverwritten();
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
  // Deferred, the badge appears with its code, so its entrance plays.
  const shown = useDeferredValue(differences.length > 0 || open, false);

  return (
    <Suspense>
      {shown && (
        <AdoptionBadge
          project={project}
          differences={differences}
          open={open}
          onOpenChange={setOpen}
        />
      )}
    </Suspense>
  );
}
