import { unfence, type Difference, type JsonValue, type Placement } from '@tavern-studio/workspace';
import { CircleCheck, TriangleAlert, X } from 'lucide-react';
import { useState } from 'react';
import { common } from '../i18n/common';
import { useMessages } from '../i18n/messages';
import { mountPoint } from '../project/mount-points';
import type { Project } from '../project/project';
import { Alert } from '../ui/alert';
import { AlertDialog, AlertDialogContent } from '../ui/alert-dialog';
import { Button } from '../ui/button';
import { EmptyState } from '../ui/empty-state';
import { PathText } from '../ui/path-text';
import { PopoverClose, PopoverTitle } from '../ui/popover';
import { adoptionMessages } from './messages';
import { TextDiff } from './text-diff';
import { fieldName, ValueTable, type ValueRow } from './value-table';

export interface AdoptionPanelProps {
  project: Project;
  differences: readonly Difference[];
}

/**
 * Session writes on the project's mount points, one group per mount point,
 * since that is the unit of adopting (docs/Architecture.md §5). Adopting or
 * discarding changes the project or the Session; the project compares them
 * again, and the group goes away by itself.
 */
export function AdoptionPanel({ project, differences }: AdoptionPanelProps) {
  const m = useMessages(adoptionMessages);
  const c = useMessages(common);
  const groups = [...Map.groupBy(differences, (difference) => difference.placement)];

  return (
    <div className="flex flex-col pb-1">
      <header
        data-density="compact"
        className="sticky top-0 z-10 flex items-center gap-2 bg-raised py-2.5 pr-2.5 pl-4"
      >
        <PopoverTitle className="flex-1 text-subtitle">{m.title}</PopoverTitle>
        <PopoverClose render={<Button variant="ghost" icon aria-label={c.close} />}>
          <X />
        </PopoverClose>
      </header>
      {groups.length === 0 ? (
        <div className="px-4 py-8">
          <EmptyState icon={<CircleCheck />} title={m.allDone} description={m.inSync} />
        </div>
      ) : (
        <>
          <p className="px-4 pb-3 text-pretty text-muted">{m.intro}</p>
          {groups.map(([placement, group]) => (
            <MountPointGroup
              key={mountPoint(placement)}
              project={project}
              placement={placement}
              differences={group}
            />
          ))}
        </>
      )}
    </div>
  );
}

function MountPointGroup({
  project,
  placement,
  differences,
}: {
  project: Project;
  placement: Placement;
  differences: readonly Difference[];
}) {
  const m = useMessages(adoptionMessages);
  const c = useMessages(common);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ error: string; retry: () => void }>();
  const [confirming, setConfirming] = useState(false);

  const run = (action: () => Promise<void>) => {
    setBusy(true);
    setFailure(undefined);
    action()
      .catch((error: unknown) =>
        setFailure({
          error: error instanceof Error ? error.message : String(error),
          retry: () => run(action),
        }),
      )
      .finally(() => setBusy(false));
  };
  const point = mountPoint(placement);

  return (
    <section aria-label={point} className="flex flex-col gap-2.5 border-t border-line px-4 py-3">
      <header data-density="compact" className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 className="font-mono text-caption break-words">
            <PathText path={point} />
          </h3>
          <p className="text-caption text-muted">{m.from(placement.source)}</p>
        </div>
        <Button disabled={busy} onClick={() => setConfirming(true)}>
          {m.discard}
        </Button>
        <Button
          variant="primary"
          disabled={busy}
          onClick={() => run(() => project.adopt(placement))}
        >
          {m.adopt}
        </Button>
      </header>
      <Changes placement={placement} differences={differences} />
      {failure && (
        <Alert
          kind="error"
          icon={<TriangleAlert />}
          title={m.failed}
          actions={<Button onClick={failure.retry}>{c.retry}</Button>}
        >
          {failure.error}
        </Alert>
      )}
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent
          title={m.discardTitle}
          description={m.discardWarning(placement.source)}
          action={m.discard}
          onAction={() => run(() => project.discard(placement))}
        >
          <ul className="flex flex-col gap-1 font-mono text-caption break-words">
            {lost(placement, differences, m.wholeValue).map((item) => (
              <li key={item}>
                <PathText path={item} />
              </li>
            ))}
          </ul>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

/**
 * What a discard throws away: the fields of a JSON mount, or the whole text
 * or file. `whole` names a field that is the mount's whole value.
 */
function lost(placement: Placement, differences: readonly Difference[], whole: string): string[] {
  if (placement.kind === 'value' && placement.format === 'json') {
    return differences.flatMap((difference) =>
      difference.kind === 'value'
        ? [fieldName(difference.pointer.slice(placement.pointer.length), whole)]
        : [],
    );
  }
  return [mountPoint(placement)];
}

const utf8 = new TextDecoder('utf-8', { fatal: true });

function Changes({
  placement,
  differences,
}: {
  placement: Placement;
  differences: readonly Difference[];
}) {
  const m = useMessages(adoptionMessages);
  const [first] = differences;
  if (!first) return null;

  if (first.kind === 'file') {
    if (!first.session) return <Note>{m.fileDeleted}</Note>;
    const original = textOf(first.placement.bytes);
    const changed = textOf(first.session);
    if (original === undefined || changed === undefined) return <Note>{m.contentsDiffer}</Note>;
    return <TextDiff original={original} changed={changed} path={placement.source} />;
  }

  if (first.placement.format === 'text') {
    const { fence } = first.placement;
    const original = valueText(first.project, fence);
    const changed = valueText(first.session, fence);
    if (changed === undefined) return <Note>{m.valueDeleted}</Note>;
    return <TextDiff original={original ?? ''} changed={changed} path={placement.source} />;
  }

  const rows = differences.flatMap((difference): ValueRow[] =>
    difference.kind === 'value'
      ? [
          {
            pointer: difference.pointer.slice(first.placement.pointer.length),
            project: difference.project,
            session: difference.session,
          },
        ]
      : [],
  );
  return <ValueTable rows={rows} />;
}

function Note({ children }: { children: string }) {
  return <p className="rounded-lg bg-sunken px-3 py-2 text-muted">{children}</p>;
}

function textOf(bytes: Uint8Array): string | undefined {
  try {
    return utf8.decode(bytes);
  } catch {
    return undefined;
  }
}

/**
 * A text mount's value as the author writes it: inside its code block when
 * the Mount fences it. A value that is not such a block shows as it is.
 */
function valueText(value: JsonValue | undefined, fence: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') return JSON.stringify(value, null, 2);
  return fence === undefined ? value : (unfence(value, fence) ?? value);
}
