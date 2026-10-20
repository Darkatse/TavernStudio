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
  RotateCcw,
  TriangleAlert,
  Unplug,
  type LucideIcon,
} from 'lucide-react';
import { memo, useState } from 'react';
import { common } from '../i18n/common';
import { messagesNow, useMessages } from '../i18n/messages';
import { useNow } from '../lib/use-now';
import { previewCapture, useCaptureShared } from '../preview/capture';
import { Button } from '../ui/button';
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from '../ui/collapsible';
import { showToast } from '../ui/toast';
import { Tooltip } from '../ui/tooltip';
import { Markdown } from './markdown';
import { runMessages } from './run-messages';
import { resultsOf, textOf, type RunBlock, type RunStatus } from './runs';
import { callDetail, callLabel, type CallState } from './tool-labels';

export const RunView = memo(function RunView({
  block,
  latest,
  partial,
  onRollback,
}: {
  block: RunBlock;
  latest: boolean;
  partial: AssistantMessage | undefined;
  onRollback: (block: RunBlock) => void;
}) {
  const m = useMessages(runMessages);
  const [open, setOpen] = useState<boolean>();
  const running = block.status === 'running';
  const expanded = open ?? (running || latest);
  const results = resultsOf(block);
  const streamingWork = partial?.content.some((part) => part.type === 'toolCall') ?? false;
  const tail = streamingWork ? block.answer : (partial ?? block.answer);

  return (
    <section
      className={clsx(
        'group/run flex flex-col gap-3 transition-opacity motion-moderate run-block',
        block.undone && 'opacity-55',
      )}
    >
      <div className="relative ml-10 self-end">
        {/* The Checkpoint before this Run: shown on hover, focus and touch. */}
        {block.restorable && (
          <div data-density="compact" className="absolute top-1 right-full mr-1.5">
            <Tooltip content={m.rollBackHere} side="top">
              <Button
                variant="ghost"
                icon
                aria-label={m.rollBackBeforeRun}
                className="opacity-0 transition-opacity motion-fast group-hover/run:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
                onClick={() => onRollback(block)}
              >
                <RotateCcw />
              </Button>
            </Tooltip>
          </div>
        )}
        <p className="rounded-xl bg-sunken px-3.5 py-2 text-prose whitespace-pre-wrap">
          {block.request}
        </p>
      </div>
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
      {block.status === 'failed' && block.failure && <Failure {...block.failure} />}
    </section>
  );
});

function Failure({ code, message }: { code: string; message: string }) {
  const m = useMessages(runMessages);
  const failureAdvice: Partial<Record<string, string>> = m.failureAdvice;
  const advice = failureAdvice[code];
  return (
    <p className="flex items-start gap-2 text-danger">
      <TriangleAlert className="mt-0.5 size-(--size-icon) shrink-0" />
      <span className="flex flex-col gap-0.5">
        <span className="text-pretty">{m.runFailed(advice ?? message)}</span>
        <span className="text-caption text-pretty text-muted">
          {advice && `${message} `}
          <span className="font-mono">{code}</span>
        </span>
      </span>
    </p>
  );
}

const STATUS_ICONS: Partial<Record<RunStatus, { icon: LucideIcon; className: string }>> = {
  running: { icon: LoaderCircle, className: 'animate-spin' },
  failed: { icon: TriangleAlert, className: 'text-danger' },
  cancelled: { icon: CircleSlash, className: '' },
  interrupted: { icon: Unplug, className: '' },
};

function RunBar({ block }: { block: RunBlock }) {
  const m = useMessages(runMessages);
  const c = useMessages(common);
  const running = block.status === 'running';
  const now = useNow(running);
  const start = block.startedAt;
  const end = running ? now : block.endedAt;
  const duration = start !== undefined && end !== undefined ? c.duration(end - start) : undefined;
  const words: Record<RunStatus, string> = {
    running: duration ? m.workingFor(duration) : m.working,
    completed: duration ? m.workedFor(duration) : m.completed,
    failed: m.failedStatus,
    cancelled: m.cancelled,
    interrupted: m.interrupted,
  };
  const status = STATUS_ICONS[block.status];
  return (
    <CollapsibleTrigger className="group flex h-7 w-full cursor-pointer items-center gap-1.5 rounded-md text-caption text-muted transition-colors motion-fast hover:text-fg">
      <ChevronRight className="size-3.5 shrink-0 transition-transform motion-moderate group-data-panel-open:rotate-90 motion-reduce:transition-none" />
      {status && <status.icon className={clsx('size-3.5 shrink-0', status.className)} />}
      <span className="tabular-nums">
        {words[block.status]}
        {block.toolCalls > 0 && ` · ${m.toolCalls(block.toolCalls)}`}
        {block.undone && ` · ${m.runUndone}`}
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
  const m = useMessages(runMessages);
  return (
    <Collapsible>
      <CollapsibleTrigger className="group flex cursor-pointer items-center gap-1.5 self-start text-caption text-muted transition-colors motion-fast hover:text-fg">
        <ChevronRight className="size-3.5 transition-transform motion-moderate group-data-panel-open:rotate-90 motion-reduce:transition-none" />
        {live ? m.thinking : m.thoughts}
        {live && <LoaderCircle className="size-3 animate-spin" />}
      </CollapsibleTrigger>
      <CollapsiblePanel keepMounted={false} className="pt-1.5 pl-5 text-muted">
        {redacted ? <p>{m.thinkingRedacted}</p> : <Markdown text={text} streaming={live} />}
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

function ToolCallRow({
  call,
  result,
  running,
}: {
  call: ToolCall;
  result: ToolResultMessage | undefined;
  running: boolean;
}) {
  const m = useMessages(runMessages);
  const c = useMessages(common);
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
          {callLabel(call, state, m)}
        </span>
        {detail && (
          <span className="min-w-0 truncate font-mono text-caption text-muted">{detail}</span>
        )}
        <span className="ml-auto shrink-0 text-caption text-muted tabular-nums">
          {/* Most calls take milliseconds; only a slow one is worth a duration. */}
          {result?.durationMs !== undefined &&
            result.durationMs >= 1000 &&
            c.duration(result.durationMs)}
        </span>
        <ChevronRight className="size-3.5 shrink-0 text-muted transition-transform motion-moderate group-data-panel-open:rotate-90 motion-reduce:transition-none" />
      </CollapsibleTrigger>
      <CollapsiblePanel keepMounted={false} className="flex flex-col gap-2 pt-1.5 pb-1">
        <Detail label={m.arguments} text={JSON.stringify(call.arguments, null, 2)} />
        {result && (
          <Detail label={result.isError ? m.error : m.result} text={textOf(result.content)} />
        )}
      </CollapsiblePanel>
      {result && <Screenshots result={result} />}
    </Collapsible>
  );
}

function Screenshots({ result }: { result: ToolResultMessage }) {
  const m = useMessages(runMessages);
  const [enlarged, setEnlarged] = useState(false);
  const shared = useCaptureShared();
  const images = result.content.filter((part) => part.type === 'image');
  const method = isRecord(result.details) ? result.details['method'] : undefined;
  if (images.length === 0) {
    // Only the latest Runs keep their screenshots.
    return method === undefined ? null : (
      <p className="pt-1 pb-1 pl-5 text-caption text-muted">{m.screenshotsCleared}</p>
    );
  }
  const fromDom = method === 'snapdom';
  return (
    <div className="flex flex-col items-start gap-1.5 pt-1.5 pb-1 pl-5">
      {images.map((image, index) => (
        <button
          // oxlint-disable-next-line react/no-array-index-key -- a result's images never change.
          key={index}
          type="button"
          aria-label={enlarged ? m.shrinkScreenshot : m.enlargeScreenshot}
          onClick={() => setEnlarged(!enlarged)}
          className="cursor-zoom-in overflow-hidden rounded-lg shadow-control data-[enlarged]:cursor-zoom-out"
          data-enlarged={enlarged || undefined}
        >
          {/* Studio took this image; it is not model output, so it may load. */}
          <img
            src={`data:${image.mimeType};base64,${image.data}`}
            alt={m.screenshot}
            className={clsx('block w-auto', enlarged ? 'max-w-full' : 'max-h-40')}
          />
        </button>
      ))}
      {fromDom && !shared && previewCapture.supported && (
        <p className="flex flex-wrap items-center gap-x-2 text-caption text-muted">
          {m.renderedScreenshot}
          <Button
            variant="ghost"
            className="h-6 px-1.5 text-caption text-fg"
            onClick={() => {
              previewCapture.share().catch((error: unknown) => {
                // Declining the browser's prompt is a choice, not a failure.
                if (error instanceof DOMException && error.name === 'NotAllowedError') return;
                showToast({
                  kind: 'error',
                  title: messagesNow(runMessages).shareCaptureFailed,
                  description: error instanceof Error ? error.message : String(error),
                });
              });
            }}
          >
            {m.shareCapture}
          </Button>
        </p>
      )}
    </div>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
