import { clsx } from 'clsx';
import { History, Undo2 } from 'lucide-react';
import { use } from 'react';
import { common } from '../i18n/common';
import { useMessages } from '../i18n/messages';
import { AlertDialogContent } from '../ui/alert-dialog';
import { Button } from '../ui/button';
import type { RollbackPlan } from './checkpoints';
import type { Conversation } from './conversation';
import { runMessages } from './run-messages';
import type { RollbackBlock, TranscriptBlock } from './runs';

/** A rollback the author asked for: its target and the plan being worked out. */
export interface RollbackRequest {
  target: TranscriptBlock;
  plan: Promise<{ plan: RollbackPlan } | { error: string }>;
}

export function requestRollback(
  conversation: Conversation,
  target: TranscriptBlock,
): RollbackRequest {
  return {
    target,
    plan: conversation.planRollback(target.id).then(
      (plan) => ({ plan }),
      (error: unknown) => ({ error: error instanceof Error ? error.message : String(error) }),
    ),
  };
}

/**
 * Confirms a rollback, listing what it changes (docs/UI.md §5). A file that
 * changed after the Agent last wrote it is marked: rolling back overwrites it.
 */
export function RollbackConfirm({
  conversation,
  request,
}: {
  conversation: Conversation;
  request: RollbackRequest;
}) {
  const m = useMessages(runMessages);
  const c = useMessages(common);
  const result = use(request.plan);
  const undo = request.target.kind === 'rollback';
  if ('error' in result) {
    return (
      <AlertDialogContent
        title={m.cannotRollBack}
        description={result.error}
        action={m.understood}
        cancel={c.close}
        onAction={() => {}}
      />
    );
  }
  const { plan } = result;
  const conflicts = plan.files.filter((file) => file.conflict).length;
  return (
    <AlertDialogContent
      title={undo ? m.undoRollbackTitle : m.rollBackTitle}
      description={undo ? m.undoRollbackDescription : m.rollBackDescription}
      action={undo ? m.undoRollback : m.rollBackHere}
      onAction={() => void conversation.rollback(plan)}
    >
      <ul className="flex flex-col gap-1 py-0.5" aria-label={m.affectedFiles}>
        {plan.files.map((file) => (
          <li key={file.path} className="flex items-baseline gap-3 text-caption">
            <span className="min-w-0 flex-1 truncate font-mono">{file.path}</span>
            {file.conflict && <span className="shrink-0 font-medium">{m.changedLater}</span>}
            <span className="shrink-0 text-muted">
              {file.restore === null
                ? m.fileChange.remove
                : file.current === null
                  ? m.fileChange.recreate
                  : m.fileChange.restore}
            </span>
          </li>
        ))}
      </ul>
      {conflicts > 0 && (
        <p className="mt-2 border-t border-line pt-2 text-caption text-pretty text-muted">
          {m.conflictNote}
        </p>
      )}
    </AlertDialogContent>
  );
}

/**
 * Where a rollback happened. Undoing it is offered while nothing came after
 * it; later, rolling back to before a Run says what it does more plainly.
 */
export function RollbackView({
  block,
  latest,
  onUndo,
}: {
  block: RollbackBlock;
  latest: boolean;
  onUndo: (block: RollbackBlock) => void;
}) {
  const m = useMessages(runMessages);
  const target = block.target;
  return (
    <div
      className={clsx(
        'flex items-center gap-2 text-caption text-muted transition-opacity motion-moderate run-block',
        block.undone && 'opacity-55',
      )}
    >
      <History className="size-3.5 shrink-0" />
      {/* Only the quoted request shortens; the words around it stay whole. */}
      <span className="flex min-w-0 whitespace-pre">
        {target?.kind === 'run' ? (
          <>
            <span className="shrink-0">{m.rolledBackTo.prefix}</span>
            <span className="min-w-0 truncate">{target.request}</span>
            <span className="shrink-0">{m.rolledBackTo.suffix}</span>
          </>
        ) : (
          <span className="shrink-0">
            {target?.kind === 'rollback' ? m.undidRollback : m.rolledBack}
          </span>
        )}
        <span className="shrink-0 tabular-nums">
          {` · ${m.files(block.files)}${block.undone ? ` · ${m.rollbackUndone}` : ''}`}
        </span>
      </span>
      <span className="h-px min-w-4 flex-1 bg-line" />
      {latest && block.restorable && (
        <Button variant="ghost" className="h-7 px-2 text-caption" onClick={() => onUndo(block)}>
          <Undo2 />
          {m.undo}
        </Button>
      )}
    </div>
  );
}
