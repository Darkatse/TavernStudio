import { clsx } from 'clsx';
import { AppWindow, Check, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { common } from '../i18n/common';
import { useMessages } from '../i18n/messages';
import { previewSession, type SessionStatus } from '../preview/session';
import { Button } from '../ui/button';
import { workbenchMessages } from './messages';

type StepState = 'pending' | 'active' | 'done';

export function StartupOverlay({ session, booted }: { session: SessionStatus; booted: boolean }) {
  const m = useMessages(workbenchMessages).startup;
  const hidden = booted && session.phase === 'open';

  return (
    <div
      aria-hidden={hidden}
      className={clsx(
        'absolute inset-0 grid place-items-center bg-surface p-6 transition-[opacity,visibility] motion-slow',
        hidden && 'invisible opacity-0',
      )}
    >
      {!hidden && session.phase !== 'elsewhere' && <Progress />}
      {session.phase === 'failed' ? (
        <Failure error={session.error} />
      ) : session.phase === 'elsewhere' ? (
        <Elsewhere />
      ) : (
        // The least width keeps the steps in place when the vendor's name
        // arrives; a step that is longer in some language widens it from the start.
        <ol className="flex w-max min-w-52 flex-col gap-2.5" aria-label={m.steps}>
          <Step state={stepState(session, booted, 0)}>{m.worker}</Step>
          <Step state={stepState(session, booted, 1)}>{m.data}</Step>
          <Step state={stepState(session, booted, 2)}>
            {m.vendor(session.phase === 'open' ? session.vendor.label : undefined)}
          </Step>
        </ol>
      )}
    </div>
  );
}

function stepState(session: SessionStatus, booted: boolean, index: number): StepState {
  const current =
    session.phase === 'opening'
      ? session.step === 'worker'
        ? 0
        : 1
      : session.phase === 'open'
        ? booted
          ? 3
          : 2
        : -1;
  if (current === -1) return 'pending';
  return index < current ? 'done' : index === current ? 'active' : 'pending';
}

function Step({ state, children }: { state: StepState; children: ReactNode }) {
  return (
    <li
      aria-current={state === 'active' ? 'step' : undefined}
      className={clsx(
        'flex items-center gap-2.5 transition-colors motion-moderate',
        state === 'active' ? 'text-fg' : 'text-muted',
      )}
    >
      <span className="grid size-4 place-items-center">
        {state === 'done' ? (
          <span className="grid size-4 place-items-center rounded-full bg-fg text-surface transition-[opacity,scale] motion-moderate starting:scale-50 starting:opacity-0">
            <Check className="size-2.5" strokeWidth={3} />
          </span>
        ) : state === 'active' ? (
          <span className="size-3.5 animate-spin rounded-full border-[1.5px] border-line-strong border-t-fg" />
        ) : (
          <span className="size-1.5 rounded-full bg-line-strong" />
        )}
      </span>
      {children}
    </li>
  );
}

function Progress() {
  return (
    <span className="absolute inset-x-0 top-0 h-0.5 overflow-hidden" aria-hidden="true">
      <span className="absolute inset-y-0 w-1/3 animate-indeterminate bg-fg/35" />
    </span>
  );
}

/** Opening Studio here again takes the Session back from the other tab. */
function Elsewhere() {
  const m = useMessages(workbenchMessages).startup;
  return (
    <div className="flex max-w-72 flex-col items-center gap-3 text-center">
      <span className="grid size-10 place-items-center rounded-xl bg-sunken text-muted shadow-[inset_0_0_0_1px_var(--color-line)]">
        <AppWindow className="size-5" />
      </span>
      <h2 className="text-subtitle">{m.elsewhere}</h2>
      <Button onClick={() => location.reload()}>{m.continueHere}</Button>
    </div>
  );
}

function Failure({ error }: { error: string }) {
  const m = useMessages(workbenchMessages).startup;
  const { retry } = useMessages(common);
  return (
    <div role="alert" className="flex max-w-72 flex-col items-center gap-3 text-center">
      <span className="grid size-10 place-items-center rounded-xl bg-sunken text-danger shadow-[inset_0_0_0_1px_var(--color-line)]">
        <TriangleAlert className="size-5" />
      </span>
      <div className="flex flex-col gap-1">
        <h2 className="text-subtitle">{m.failed}</h2>
        <p className="font-mono text-caption break-words text-muted">{error}</p>
      </div>
      <Button onClick={() => void previewSession.retry()}>{retry}</Button>
    </div>
  );
}
