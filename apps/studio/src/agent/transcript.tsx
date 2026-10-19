import type { AssistantMessage, HistoryEntry } from '@tavern-studio/agent';
import { ArrowDown } from 'lucide-react';
import { Suspense, useLayoutEffect, useRef, useState } from 'react';
import { AlertDialog } from '../ui/alert-dialog';
import { Button } from '../ui/button';
import type { Conversation } from './conversation';
import { requestRollback, RollbackConfirm, RollbackView, type RollbackRequest } from './rollback';
import { RunView } from './run-view';
import { transcriptBlocks, type RunBlock, type TranscriptBlock } from './runs';
import { useConversationState } from './use-conversation';

/** How close to the bottom still counts as following the conversation. */
const FOLLOW_SLACK = 40;

/**
 * The conversation, Run by Run (docs/Agent.md §7). It follows the bottom
 * while the author is there and stays put while they read further up. The
 * log itself is silent; one announcement says when a Run ends, not every
 * streamed word (docs/UI.md §5).
 */
export function Transcript({ conversation }: { conversation: Conversation }) {
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
  const rollBackTo = (target: TranscriptBlock) => {
    setRollback(requestRollback(conversation, target));
    setConfirming(true);
  };

  // Keep to the bottom as content grows, while following.
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
        aria-label="与 Agent 的对话"
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
      <p aria-live="polite" className="sr-only">
        {lastRun && lastRun.status !== 'running' ? statusAnnouncement(lastRun.status) : ''}
      </p>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        {rollback && (
          // The plan reads the files; that takes well under the 300 ms that needs a hint.
          <Suspense fallback={null}>
            <RollbackConfirm conversation={conversation} request={rollback} />
          </Suspense>
        )}
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
            回到最新
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * The reply still streaming, until it lands in History. A reply already in
 * History for the same round is not shown twice.
 */
function streamingReply(
  work: readonly HistoryEntry[],
  partial: AssistantMessage | undefined,
): AssistantMessage | undefined {
  if (!partial) return undefined;
  return work.some((entry) => entry.message === partial) ? undefined : partial;
}

function statusAnnouncement(status: string): string {
  if (status === 'completed') return 'Agent 已完成';
  if (status === 'failed') return 'Agent 运行失败';
  if (status === 'cancelled') return 'Agent 已停止';
  return '';
}
