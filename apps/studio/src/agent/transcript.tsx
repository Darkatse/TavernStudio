import type { AssistantMessage, HistoryEntry } from '@tavern-studio/agent';
import { ArrowDown } from 'lucide-react';
import { Suspense, useLayoutEffect, useRef, useState, useTransition } from 'react';
import { useMessages } from '../i18n/messages';
import { AlertDialog } from '../ui/alert-dialog';
import { Button } from '../ui/button';
import type { Conversation } from './conversation';
import { runMessages } from './run-messages';
import { requestRollback, RollbackConfirm, RollbackView, type RollbackRequest } from './rollback';
import { RunView } from './run-view';
import { transcriptBlocks, type RunBlock, type RunStatus, type TranscriptBlock } from './runs';
import { useConversationState } from './use-conversation';

/** Pixels from the bottom that still count as following the conversation. */
const FOLLOW_SLACK = 40;

/**
 * The log itself is silent; one announcement says when a Run ends, not every
 * streamed word.
 */
export function Transcript({ conversation }: { conversation: Conversation }) {
  const m = useMessages(runMessages);
  const state = useConversationState(conversation);
  // Blocks stay the same objects while a reply streams, so only the Run that streams renders again.
  const blocks = transcriptBlocks({
    entries: state.entries,
    events: state.events,
    files: state.files,
    activeId: state.active?.id,
    rollingBack: state.rollingBack,
  });
  const scroller = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const [away, setAway] = useState(false);
  const [rollback, setRollback] = useState<RollbackRequest>();
  const [confirming, setConfirming] = useState(false);
  const last = blocks.at(-1);
  const lastRun = blocks.findLast((block): block is RunBlock => block.kind === 'run');
  const announcements: Partial<Record<RunStatus, string>> = m.announcement;
  const [, startTransition] = useTransition();
  // The confirmation opens once its plan is read, with the plan in it.
  const rollBackTo = (target: TranscriptBlock) =>
    startTransition(() => {
      setRollback(requestRollback(conversation, target));
      setConfirming(true);
    });

  useLayoutEffect(() => {
    const root = scroller.current;
    const content = root?.firstElementChild;
    if (!root || !content) return;
    const observer = new ResizeObserver(() => {
      if (following.current) root.scrollTop = root.scrollHeight;
    });
    observer.observe(content);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  // A new Run brings the author back to the newest; the scroll event clears `away`.
  const lastId = last?.id;
  useLayoutEffect(() => {
    const root = scroller.current;
    if (!root || lastId === undefined) return;
    following.current = true;
    root.scrollTop = root.scrollHeight;
  }, [lastId]);

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scroller}
        role="log"
        aria-label={m.conversation}
        aria-live="off"
        aria-busy={state.active !== undefined}
        className="h-full overflow-y-auto px-4 pt-2 pb-6"
        onScroll={(event) => {
          const root = event.currentTarget;
          following.current = root.scrollHeight - root.clientHeight - root.scrollTop < FOLLOW_SLACK;
          setAway(!following.current);
        }}
      >
        <div className="flex flex-col gap-8">
          {blocks.map((block) =>
            block.kind === 'run' ? (
              <RunView
                key={block.id}
                block={block}
                latest={block === lastRun}
                partial={
                  state.active?.id === block.id
                    ? streamingReply(block.work, state.active.partial)
                    : undefined
                }
                onRollback={rollBackTo}
              />
            ) : (
              <RollbackView
                key={block.id}
                block={block}
                latest={block === last}
                onUndo={rollBackTo}
              />
            ),
          )}
        </div>
      </div>
      {/* Said once a Run ends; an interrupted Run ended before this page opened. */}
      <p aria-live="polite" className="sr-only">
        {(lastRun && announcements[lastRun.status]) ?? ''}
      </p>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <Suspense>
          {rollback && <RollbackConfirm conversation={conversation} request={rollback} />}
        </Suspense>
      </AlertDialog>
      {away && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <Button
            className="pointer-events-auto transition-opacity motion-fast starting:opacity-0"
            onClick={() => {
              following.current = true;
              setAway(false);
              scroller.current?.scrollTo({
                top: scroller.current.scrollHeight,
                behavior: 'smooth',
              });
            }}
          >
            <ArrowDown />
            {m.jumpToLatest}
          </Button>
        </div>
      )}
    </div>
  );
}

/** A reply already in History for the same round is not shown twice. */
function streamingReply(
  work: readonly HistoryEntry[],
  partial: AssistantMessage | undefined,
): AssistantMessage | undefined {
  if (!partial) return undefined;
  return work.some((entry) => entry.message === partial) ? undefined : partial;
}
