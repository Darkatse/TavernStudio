import { clsx } from 'clsx';
import { History, Undo2 } from 'lucide-react';
import { use } from 'react';
import { AlertDialogContent } from '../ui/alert-dialog';
import { Button } from '../ui/button';
import type { RollbackPlan } from './checkpoints';
import type { Conversation } from './conversation';
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
  const result = use(request.plan);
  const undo = request.target.kind === 'rollback';
  if ('error' in result) {
    return (
      <AlertDialogContent
        title="无法回滚"
        description={result.error}
        action="知道了"
        cancel="关闭"
        onAction={() => {}}
      />
    );
  }
  const { plan } = result;
  const conflicts = plan.files.filter((file) => file.conflict).length;
  return (
    <AlertDialogContent
      title={undo ? '撤销这次回滚？' : '回滚到这次运行之前？'}
      description={
        undo
          ? '文件回到回滚之前的内容。'
          : '项目文件回到这次运行开始之前。之后的运行留在对话里，标为已回滚，Agent 继续对话时不再参考它们。回滚可以撤销。'
      }
      action={undo ? '撤销回滚' : '回滚到此处'}
      onAction={() => void conversation.rollback(plan)}
    >
      <ul className="flex flex-col gap-1 py-0.5" aria-label="受影响的文件">
        {plan.files.map((file) => (
          <li key={file.path} className="flex items-baseline gap-3 text-caption">
            <span className="min-w-0 flex-1 truncate font-mono">{file.path}</span>
            {file.conflict && <span className="shrink-0 font-medium">之后有改动</span>}
            <span className="shrink-0 text-muted">
              {file.restore === null ? '删除' : file.current === null ? '重新创建' : '还原'}
            </span>
          </li>
        ))}
      </ul>
      {conflicts > 0 && (
        <p className="mt-2 border-t border-line pt-2 text-caption text-pretty text-muted">
          标为"之后有改动"的文件在 Agent 写入之后又被修改过，回滚会覆盖这些修改。
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
            <span className="shrink-0">回滚到「</span>
            <span className="min-w-0 truncate">{target.request}</span>
            <span className="shrink-0">」之前</span>
          </>
        ) : (
          <span className="shrink-0">{target?.kind === 'rollback' ? '撤销回滚' : '回滚'}</span>
        )}
        <span className="shrink-0 tabular-nums">
          {` · ${block.files} 个文件${block.undone ? ' · 已回滚' : ''}`}
        </span>
      </span>
      <span className="h-px min-w-4 flex-1 bg-line" />
      {latest && block.restorable && (
        <Button variant="ghost" className="h-7 px-2 text-caption" onClick={() => onUndo(block)}>
          <Undo2 />
          撤销
        </Button>
      )}
    </div>
  );
}
