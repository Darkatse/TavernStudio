import { clsx } from 'clsx';
import { ArrowUp, CornerDownRight, KeyRound, Square, TriangleAlert } from 'lucide-react';
import { lazy, Suspense, useSyncExternalStore, type RefObject } from 'react';
import { useMessages } from '../i18n/messages';
import { Button } from '../ui/button';
import type { Conversation, ConversationProblem, ConversationState } from './conversation';
import { agentMessages, type AgentText } from './messages';
import type { SelectedEndpoint } from './settings';
import { connectText, useSetup } from './setup';

const EffortMenu = lazy(() =>
  import('./effort-menu').then((module) => ({ default: module.EffortMenu })),
);

/**
 * Always open for writing: when sending is blocked, what blocks it shows
 * above as soon as there is something to send, and a missing model turns the
 * model button into the way to connect one.
 */
export function Composer({
  ref,
  conversation,
  draft,
  onDraftChange,
  onOpenModels,
}: {
  ref: RefObject<HTMLTextAreaElement | null>;
  /** None until a project is open. */
  conversation: Conversation | undefined;
  draft: string;
  onDraftChange: (draft: string) => void;
  onOpenModels: () => void;
}) {
  const m = useMessages(agentMessages);
  const model = useSetup()?.model;
  const state = useSyncExternalStore(
    conversation?.subscribe ?? noSubscription,
    () => conversation?.state,
  );
  const message = draft.trim();
  const running = state?.active !== undefined;
  const stop = running && message === '';
  const blocked = blockedReason(state, model, m);

  const submit = () => {
    if (!conversation || blocked || message === '') return;
    onDraftChange('');
    void conversation.send(message);
  };

  return (
    <form
      className="flex shrink-0 flex-col px-3 pb-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {state?.problem && (
        <p
          role="alert"
          className="mb-2 flex items-start gap-1.5 px-1 text-caption text-pretty text-danger"
        >
          <TriangleAlert className="mt-px size-3.5 shrink-0" />
          {problemText(state.problem, m)}
        </p>
      )}
      <output className="block px-1 text-caption text-pretty text-muted not-empty:mb-2">
        {!state?.problem && message !== '' && blocked && (
          <span className="transition-opacity motion-moderate starting:opacity-0">{blocked}</span>
        )}
      </output>
      <div className="rounded-xl bg-surface shadow-control transition-shadow motion-fast focus-within:shadow-focus">
        {state && state.guidance.length > 0 && <Guidance items={state.guidance} />}
        <label htmlFor="composer-message" className="sr-only">
          {m.message}
        </label>
        <textarea
          ref={ref}
          id="composer-message"
          rows={2}
          value={draft}
          placeholder={running ? m.guidancePlaceholder : m.placeholder}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            // keyCode 229: Safari ends composition with an Enter whose isComposing is already false.
            const composing = event.nativeEvent.isComposing || event.keyCode === 229;
            if (event.key !== 'Enter' || event.shiftKey || composing) return;
            event.preventDefault();
            submit();
          }}
          className="block field-sizing-content max-h-48 min-h-[calc(2lh+--spacing(3))] w-full resize-none bg-transparent px-3.5 pt-3 text-prose outline-none placeholder:text-muted"
        />
        <div data-density="compact" className="flex items-center justify-between gap-2 p-2 pl-2">
          <div className="flex min-w-0 items-center">
            <Button
              variant="ghost"
              className={clsx('min-w-0 px-1.5 text-caption', !model && 'invisible')}
              onClick={onOpenModels}
            >
              {model && 'problem' in model ? (
                <>
                  <KeyRound className="text-fg" />
                  <span className="truncate text-fg">{connectText(model.problem, m)}</span>
                </>
              ) : (
                <span className="truncate">
                  {model && `${model.endpoint.label} · ${model.endpoint.model}`}
                </span>
              )}
            </Button>
            {model?.endpoint?.reasoning && (
              <Suspense>
                <EffortMenu endpoint={model.endpoint} running={running} />
              </Suspense>
            )}
          </div>
          <Button
            type={stop ? 'button' : 'submit'}
            variant="primary"
            icon
            disabled={!stop && (blocked !== undefined || message === '')}
            aria-label={stop ? m.stop : running ? m.sendGuidance : m.send}
            onClick={stop ? () => conversation?.cancel() : undefined}
          >
            <SendIcon stop={stop} />
          </Button>
        </div>
      </div>
    </form>
  );
}

const noSubscription = () => () => {};

/** During a Run, Guidance needs no model of its own. */
function blockedReason(
  state: ConversationState | undefined,
  model: SelectedEndpoint | undefined,
  m: AgentText,
): string | undefined {
  if (!state) return m.noProject;
  if (!state.loaded) return m.notLoaded;
  if (state.elsewhere) return m.busyElsewhere;
  if (!state.active && model && 'problem' in model) return problemText(model.problem, m);
  return undefined;
}

function problemText(problem: ConversationProblem, m: AgentText): string {
  switch (problem.kind) {
    case 'no-model':
      return m.modelMissing;
    case 'no-key':
      return m.keyMissing(problem.label);
    default:
      return m.failed[problem.kind](problem.error);
  }
}

function Guidance({ items }: { items: ConversationState['guidance'] }) {
  const m = useMessages(agentMessages);
  return (
    <ul aria-label={m.guidance} className="flex flex-col gap-1 px-3.5 pt-3">
      {items.map((item, index) => (
        // oxlint-disable-next-line react/no-array-index-key -- Guidance only grows during a Run.
        <li key={index} className="flex items-center gap-1.5 text-caption text-muted">
          <CornerDownRight className="size-3.5 shrink-0" />
          <span className="truncate">{item}</span>
        </li>
      ))}
    </ul>
  );
}

function SendIcon({ stop }: { stop: boolean }) {
  return (
    <span className="grid">
      <ArrowUp className={swapped(!stop)} />
      <Square className={clsx(swapped(stop), 'fill-current')} />
    </span>
  );
}

function swapped(shown: boolean): string {
  return clsx(
    'col-start-1 row-start-1 transition-[opacity,scale]',
    shown ? 'motion-fast' : 'opacity-0 motion-fast-exit motion-safe:scale-60',
  );
}
