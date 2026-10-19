import { clsx } from 'clsx';
import { ArrowUp, CornerDownRight, Square, TriangleAlert } from 'lucide-react';
import { useRef, useState, useSyncExternalStore, type ReactElement } from 'react';
import { useMessages } from '../i18n/messages';
import { Button } from '../ui/button';
import { Tooltip } from '../ui/tooltip';
import type { Conversation, ConversationProblem, ConversationState } from './conversation';
import { agentMessages, type AgentText } from './messages';
import { selectedEndpoint, useAgentSettings, type ModelProblem } from './settings';

export function Composer({
  conversation,
  onOpenSettings,
}: {
  /** None until a project is open. */
  conversation: Conversation | undefined;
  onOpenSettings: () => void;
}) {
  const m = useMessages(agentMessages);
  const settings = useAgentSettings();
  const state = useSyncExternalStore(
    conversation?.subscribe ?? noSubscription,
    () => conversation?.state,
  );
  const [text, setText] = useState('');
  const field = useRef<HTMLTextAreaElement>(null);
  const selected = selectedEndpoint(settings);
  const running = state?.active !== undefined;
  const stop = running && text.trim() === '';
  const blocked = blockedReason(state, 'problem' in selected ? selected.problem : undefined, m);

  const submit = () => {
    const message = text.trim();
    if (!conversation || blocked || message === '') return;
    setText('');
    if (field.current) field.current.style.height = '';
    void conversation.send(message);
  };

  return (
    <form
      className="flex shrink-0 flex-col gap-2 px-3 pb-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {state?.problem && (
        <p
          role="alert"
          className="flex items-start gap-1.5 px-1 text-caption text-pretty text-danger"
        >
          <TriangleAlert className="mt-px size-3.5 shrink-0" />
          {problemText(state.problem, m)}
        </p>
      )}
      <div className="rounded-xl bg-surface shadow-control transition-shadow motion-fast focus-within:shadow-focus">
        {state && state.guidance.length > 0 && <Guidance items={state.guidance} />}
        <label htmlFor="composer-message" className="sr-only">
          {m.message}
        </label>
        <textarea
          ref={field}
          id="composer-message"
          rows={2}
          value={text}
          disabled={!state?.loaded}
          placeholder={running ? m.guidancePlaceholder : m.placeholder}
          onChange={(event) => {
            setText(event.target.value);
            fitToContent(event.target);
          }}
          onKeyDown={(event) => {
            // keyCode 229: Safari ends composition with an Enter whose isComposing is already false.
            const composing = event.nativeEvent.isComposing || event.keyCode === 229;
            if (event.key !== 'Enter' || event.shiftKey || composing) return;
            event.preventDefault();
            submit();
          }}
          className="block max-h-48 w-full resize-none bg-transparent px-3.5 pt-3 text-prose outline-none placeholder:text-muted disabled:cursor-not-allowed"
        />
        <div data-density="compact" className="flex items-center justify-between gap-2 p-2 pl-2">
          <Button variant="ghost" className="min-w-0 px-1.5 text-caption" onClick={onOpenSettings}>
            <span className="truncate">
              {selected.endpoint
                ? `${selected.endpoint.label} · ${selected.endpoint.model}`
                : m.noModel}
            </span>
            {'problem' in selected && selected.endpoint && (
              <span className="shrink-0 text-fg">· {m.noKey}</span>
            )}
          </Button>
          <Explained reason={blocked}>
            <Button
              type={stop ? 'button' : 'submit'}
              variant="primary"
              icon
              disabled={!stop && (blocked !== undefined || text.trim() === '')}
              aria-label={stop ? m.stop : running ? m.sendGuidance : m.send}
              onClick={stop ? () => conversation?.cancel() : undefined}
            >
              <SendIcon stop={stop} />
            </Button>
          </Explained>
        </div>
      </div>
    </form>
  );
}

const noSubscription = () => () => {};

/** During a Run, Guidance needs no model of its own. */
function blockedReason(
  state: ConversationState | undefined,
  modelProblem: ModelProblem | undefined,
  m: AgentText,
): string | undefined {
  if (!state) return m.noProject;
  if (!state.loaded) return m.notLoaded;
  if (!state.active && modelProblem) return problemText(modelProblem, m);
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

function Explained({ reason, children }: { reason: string | undefined; children: ReactElement }) {
  return reason ? (
    <Tooltip content={reason} side="top">
      {children}
    </Tooltip>
  ) : (
    children
  );
}

function fitToContent(field: HTMLTextAreaElement) {
  field.style.height = 'auto';
  field.style.height = `${field.scrollHeight}px`;
}
