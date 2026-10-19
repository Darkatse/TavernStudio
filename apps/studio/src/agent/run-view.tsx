import type {
  AssistantMessage,
  HistoryEntry,
  ToolCall,
  ToolResultMessage,
} from '@tavern-studio/agent';
import { clsx } from 'clsx';
import {
  Check,
  ChevronRight,
  CircleSlash,
  LoaderCircle,
  TriangleAlert,
  Unplug,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { formatDuration, useNow } from '../lib/use-now';
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from '../ui/collapsible';
import { Markdown } from './markdown';
import { resultsOf, textOf, type RunBlock, type RunStatus } from './runs';
import { callDetail, callLabel, type CallState } from './tool-labels';

/**
 * One Run: the author's message, a bar that folds the work in between, and
 * the final answer, which stays visible when the work is folded. Only the
 * latest Run starts unfolded (docs/Agent.md §7).
 */
export function RunView({
  block,
  latest,
  partial,
}: {
  block: RunBlock;
  latest: boolean;
  /** The reply still streaming in this Run. */
  partial: AssistantMessage | undefined;
}) {
  const [open, setOpen] = useState<boolean>();
  const running = block.status === 'running';
  const expanded = open ?? (running || latest);
  const results = resultsOf(block);
  const streamingWork = partial?.content.some((part) => part.type === 'toolCall') ?? false;
  const tail = streamingWork ? block.answer : (partial ?? block.answer);

  return (
    <section className="flex flex-col gap-3 run-block">
      <p className="ml-10 self-end rounded-xl bg-sunken px-3.5 py-2 text-prose whitespace-pre-wrap">
        {block.request}
      </p>
      {(block.work.length > 0 || running) && (
        <Collapsible open={expanded} onOpenChange={setOpen}>
          <RunBar block={block} />
          <CollapsiblePanel keepMounted={false} className="flex flex-col gap-3 pt-3">
            {block.work.map((entry) => (
              <WorkEntry key={entryKey(entry)} entry={entry} results={results} running={running} />
            ))}
            {streamingWork && partial && (
              <Reply message={partial} results={results} running streaming />
            )}
          </CollapsiblePanel>
        </Collapsible>
      )}
      {tail && (
        <Reply
          key="tail"
          message={tail}
          results={results}
          running={running}
          streaming={tail === partial}
        />
      )}
      {block.status === 'failed' && block.failure && (
        <p className="flex items-start gap-2 text-danger">
          <TriangleAlert className="mt-0.5 size-(--size-icon) shrink-0" />
          <span>
            运行失败：{block.failure.message}
            <span className="ml-1.5 font-mono text-caption text-muted">{block.failure.code}</span>
          </span>
        </p>
      )}
      {block.status === 'cancelled' && (
        <p className="text-muted">已停止。已经生效的文件修改都保留着。</p>
      )}
      {block.status === 'interrupted' && (
        <p className="text-muted">页面关闭时这次运行还没有结束；没有结果的工具调用不会重新执行。</p>
      )}
    </section>
  );
}

const STATUS_ICONS: Partial<Record<RunStatus, { icon: LucideIcon; className: string }>> = {
  running: { icon: LoaderCircle, className: 'animate-spin' },
  failed: { icon: TriangleAlert, className: 'text-danger' },
  cancelled: { icon: CircleSlash, className: '' },
  interrupted: { icon: Unplug, className: '' },
};

/** "工作了 1 分 2 秒 · 5 次调用", ticking while the Run is running. */
function RunBar({ block }: { block: RunBlock }) {
  const running = block.status === 'running';
  const now = useNow(running);
  const start = block.startedAt;
  const end = running ? now : block.endedAt;
  const duration =
    start !== undefined && end !== undefined ? formatDuration(end - start) : undefined;
  const words: Record<RunStatus, string> = {
    running: duration ? `工作中 · ${duration}` : '工作中',
    completed: duration ? `工作了 ${duration}` : '已完成',
    failed: '失败',
    cancelled: '已停止',
    interrupted: '已中断',
  };
  const status = STATUS_ICONS[block.status];
  return (
    <CollapsibleTrigger className="group flex h-7 w-full cursor-pointer items-center gap-1.5 rounded-md text-caption text-muted transition-colors motion-fast hover:text-fg">
      <ChevronRight className="size-3.5 shrink-0 transition-transform motion-moderate group-data-panel-open:rotate-90 motion-reduce:transition-none" />
      {status && <status.icon className={clsx('size-3.5 shrink-0', status.className)} />}
      <span className="tabular-nums">
        {words[block.status]}
        {block.toolCalls > 0 && ` · ${block.toolCalls} 次调用`}
      </span>
      <span className="h-px flex-1 bg-line" />
    </CollapsibleTrigger>
  );
}

function WorkEntry({
  entry,
  results,
  running,
}: {
  entry: HistoryEntry;
  results: Map<string, ToolResultMessage>;
  running: boolean;
}) {
  const { message } = entry;
  if (message.role === 'assistant')
    return <Reply message={message} results={results} running={running} />;
  if (message.role === 'user') {
    // Guidance the author sent during the Run.
    return (
      <p className="border-l-2 border-line-strong pl-3 whitespace-pre-wrap text-muted">
        {textOf(message.content)}
      </p>
    );
  }
  return null; // Tool results show in the row of their call.
}

/** An assistant reply: its reasoning first, then its text and calls in order. */
function Reply({
  message,
  results,
  running,
  streaming = false,
}: {
  message: AssistantMessage;
  results: Map<string, ToolResultMessage>;
  running: boolean;
  streaming?: boolean;
}) {
  const parts = [
    ...message.content.filter((part) => part.type === 'thinking'),
    ...message.content.filter((part) => part.type !== 'thinking'),
  ];
  const last = parts.at(-1);
  return (
    <div className="flex flex-col gap-2.5">
      {parts.map((part, index) => {
        const live = streaming && part === last;
        if (part.type === 'thinking') {
          if (!part.thinking && !part.redacted) return null;
          // oxlint-disable-next-line react/no-array-index-key -- parts only grow at the end.
          return (
            <Thinking
              key={index}
              text={part.thinking}
              redacted={part.redacted === true}
              live={live}
            />
          );
        }
        if (part.type === 'text') {
          // oxlint-disable-next-line react/no-array-index-key -- parts only grow at the end.
          return part.text ? <Markdown key={index} text={part.text} streaming={live} /> : null;
        }
        return (
          <ToolCallRow key={part.id} call={part} result={results.get(part.id)} running={running} />
        );
      })}
    </div>
  );
}

function Thinking({ text, redacted, live }: { text: string; redacted: boolean; live: boolean }) {
  return (
    <Collapsible>
      <CollapsibleTrigger className="group flex cursor-pointer items-center gap-1.5 self-start text-caption text-muted transition-colors motion-fast hover:text-fg">
        <ChevronRight className="size-3.5 transition-transform motion-moderate group-data-panel-open:rotate-90 motion-reduce:transition-none" />
        {live ? '思考中' : '思考过程'}
        {live && <LoaderCircle className="size-3 animate-spin" />}
      </CollapsibleTrigger>
      <CollapsiblePanel keepMounted={false} className="pt-1.5 pl-5 text-muted">
        {redacted ? <p>（思考内容已由服务方加密）</p> : <Markdown text={text} streaming={live} />}
      </CollapsiblePanel>
    </Collapsible>
  );
}

const CALL_ICONS: Record<CallState, { icon: LucideIcon; className: string }> = {
  running: { icon: LoaderCircle, className: 'animate-spin text-muted' },
  done: { icon: Check, className: 'text-muted' },
  failed: { icon: TriangleAlert, className: 'text-danger' },
  unanswered: { icon: CircleSlash, className: 'text-muted' },
};

/** A tool call, in the words of what it does, opening to its arguments and result. */
function ToolCallRow({
  call,
  result,
  running,
}: {
  call: ToolCall;
  result: ToolResultMessage | undefined;
  running: boolean;
}) {
  const state: CallState = result
    ? result.isError
      ? 'failed'
      : 'done'
    : running
      ? 'running'
      : 'unanswered';
  const detail = callDetail(call);
  const { icon: Icon, className } = CALL_ICONS[state];
  return (
    <Collapsible>
      <CollapsibleTrigger className="group -mx-1.5 flex h-7 w-[calc(100%+0.75rem)] cursor-pointer items-center gap-2 rounded-md px-1.5 text-left transition-colors motion-fast hover:bg-hover">
        <Icon className={clsx('size-3.5 shrink-0', className)} />
        <span className={clsx('shrink-0', state === 'failed' && 'text-danger')}>
          {callLabel(call, state)}
        </span>
        {detail && (
          <span className="min-w-0 truncate font-mono text-caption text-muted">{detail}</span>
        )}
        <span className="ml-auto shrink-0 text-caption text-muted tabular-nums">
          {/* Most calls take milliseconds; only a slow one is worth a duration. */}
          {result?.durationMs !== undefined &&
            result.durationMs >= 1000 &&
            formatDuration(result.durationMs)}
        </span>
        <ChevronRight className="size-3.5 shrink-0 text-muted transition-transform motion-moderate group-data-panel-open:rotate-90 motion-reduce:transition-none" />
      </CollapsibleTrigger>
      <CollapsiblePanel keepMounted={false} className="flex flex-col gap-2 pt-1.5 pb-1">
        <Detail label="参数" text={JSON.stringify(call.arguments, null, 2)} />
        {result && (
          <Detail label={result.isError ? '错误' : '结果'} text={textOf(result.content)} />
        )}
      </CollapsiblePanel>
    </Collapsible>
  );
}

function Detail({ label, text }: { label: string; text: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-caption text-muted">{label}</span>
      <pre className="max-h-64 overflow-auto rounded-lg bg-sunken px-3 py-2 font-mono text-caption whitespace-pre-wrap">
        {text}
      </pre>
    </div>
  );
}

function entryKey(entry: HistoryEntry): string {
  const { message } = entry;
  return `${entry.round}:${message.role}:${message.role === 'toolResult' ? message.toolCallId : message.timestamp}`;
}
