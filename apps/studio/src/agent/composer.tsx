import { clsx } from 'clsx';
import { ArrowUp, CornerDownRight, Square, TriangleAlert } from 'lucide-react';
import { useRef, useState, useSyncExternalStore, type ReactElement } from 'react';
import { Button } from '../ui/button';
import { Tooltip } from '../ui/tooltip';
import type { Conversation, ConversationState } from './conversation';
import { selectedEndpoint, useAgentSettings } from './settings';

/**
 * Where the author writes to the Agent. Enter sends and Shift+Enter breaks
 * the line; during a Run, a message joins the Run as Guidance and the empty
 * composer offers Stop in the send button's place.
 */
export function Composer({
  conversation,
  onOpenSettings,
}: {
  /** None until a project is open. */
  conversation: Conversation | undefined;
  onOpenSettings: () => void;
}) {
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
  const blocked = blockedReason(state, 'problem' in selected ? selected.problem : undefined);

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
          {state.problem}
        </p>
      )}
      <div className="rounded-xl bg-surface shadow-control transition-shadow motion-fast focus-within:shadow-focus">
        {state && state.guidance.length > 0 && <Guidance items={state.guidance} />}
        <label htmlFor="composer-message" className="sr-only">
          给 Agent 的消息
        </label>
        <textarea
          ref={field}
          id="composer-message"
          rows={2}
          value={text}
          disabled={!state?.loaded}
          placeholder={running ? '补充说明，会在下一步交给 Agent…' : '描述你想要的效果…'}
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
                : '未配置模型'}
            </span>
            {'problem' in selected && selected.endpoint && (
              <span className="shrink-0 text-fg">· 未填写 Key</span>
            )}
          </Button>
          <Explained reason={blocked}>
            <Button
              type={stop ? 'button' : 'submit'}
              variant="primary"
              icon
              disabled={!stop && (blocked !== undefined || text.trim() === '')}
              aria-label={stop ? '停止' : running ? '补充给 Agent' : '发送'}
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

/** Why nothing can be sent now; during a Run, Guidance needs no model of its own. */
function blockedReason(state: ConversationState | undefined, modelProblem: string | undefined) {
  if (!state) return '打开项目后即可对话';
  if (!state.loaded) return '对话记录还没有读取';
  if (!state.active) return modelProblem;
  return undefined;
}

/** Guidance waiting for the Run's next request, so the author sees it was taken. */
function Guidance({ items }: { items: ConversationState['guidance'] }) {
  return (
    <ul aria-label="待交给 Agent 的补充" className="flex flex-col gap-1 px-3.5 pt-3">
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

/** Send and Stop share one cell; the arriving icon uses the full tier, the leaving one the exit tier. */
function SendIcon({ stop }: { stop: boolean }) {
  return (
    <span className="grid">
      <ArrowUp className={swapped(!stop)} data-ending-style={stop ? '' : undefined} />
      <Square
        className={clsx(swapped(stop), 'fill-current')}
        data-ending-style={stop ? undefined : ''}
      />
    </span>
  );
}

function swapped(shown: boolean): string {
  return clsx(
    'col-start-1 row-start-1 transition-[opacity,scale] motion-fast',
    !shown && 'opacity-0 motion-safe:scale-60',
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
