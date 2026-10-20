import { clsx } from 'clsx';
import { Bot, Code2, Eye } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Group, Panel, Separator, usePanelRef } from 'react-resizable-panels';
import { AgentPanel } from '../agent/agent-panel';
import { BrandMark } from '../brand/brand-mark';
import { messagesNow, useMessages } from '../i18n/messages';
import { useMediaQuery } from '../lib/use-media-query';
import { startStudio } from '../project/projects';
import { usePersistenceError } from '../preview/use-session';
import { Button } from '../ui/button';
import { SegmentedControl, type SegmentedOption } from '../ui/segmented-control';
import { Tooltip } from '../ui/tooltip';
import { showToast } from '../ui/toast';
import { Workbench, type WorkbenchView } from '../workbench/workbench';
import { shellMessages } from './messages';

/**
 * Panes stay mounted when hidden, so the preview keeps running while the
 * Agent or the code is shown.
 */
export function Shell() {
  const wide = useMediaQuery('(min-width: 768px)');
  const [view, setView] = useState<WorkbenchView>('preview');
  useEffect(() => {
    void startStudio();
  }, []);
  const persistenceError = usePersistenceError();
  useEffect(() => {
    if (persistenceError === undefined) return;
    showToast({
      kind: 'error',
      title: messagesNow(shellMessages).persistenceFailed,
      description: persistenceError,
    });
  }, [persistenceError]);

  return wide ? (
    <WideShell view={view} onViewChange={setView} />
  ) : (
    <NarrowShell view={view} onViewChange={setView} />
  );
}

interface ShellLayoutProps {
  view: WorkbenchView;
  onViewChange: (view: WorkbenchView) => void;
}

/**
 * The Agent column also carries the 8px gap to the window's edge, so the row
 * keeps its width when the column closes and the gap goes with the column.
 */
const AGENT_WIDTH = 380 + 8;
const AGENT_MIN_WIDTH = 320 + 8;

function WideShell({ view, onViewChange }: ShellLayoutProps) {
  const m = useMessages(shellMessages);
  const agent = usePanelRef();
  const agentColumn = useRef<HTMLDivElement>(null);
  const workbenchColumn = useRef<HTMLDivElement>(null);
  const [agentCollapsed, setAgentCollapsed] = useState(false);
  // The share of the row the Agent takes when shown. It keeps that width
  // while its column opens or closes around it, so nothing in it rewraps.
  const [agentShare, setAgentShare] = useState<number>();

  const toggleAgent = () => {
    glide([agentColumn.current!, workbenchColumn.current!], agentCollapsed);
    if (agentCollapsed) agent.current?.expand();
    else agent.current?.collapse();
  };

  const agentToggle = (
    <Tooltip content={agentCollapsed ? m.expandAgent : m.collapseAgent}>
      <Button
        variant="ghost"
        icon
        aria-label={m.agentPanel}
        aria-controls="agent"
        aria-expanded={!agentCollapsed}
        onClick={toggleAgent}
      >
        <AgentToggleIcon collapsed={agentCollapsed} />
      </Button>
    </Tooltip>
  );

  return (
    <div className="h-dvh py-2 pr-2">
      {/* A container, so the Agent's width can be given in the row's width. */}
      <Group
        orientation="horizontal"
        className="@container h-full"
        onLayoutChange={(layout) => {
          const share = layout.agent!;
          setAgentCollapsed(share === 0);
          if (share > 0) setAgentShare(share);
        }}
      >
        <Panel
          id="agent"
          panelRef={agent}
          elementRef={agentColumn}
          className="relative"
          defaultSize={AGENT_WIDTH}
          minSize={AGENT_MIN_WIDTH}
          maxSize="50%"
          collapsible
          groupResizeBehavior="preserve-pixel-size"
        >
          <div
            inert={agentCollapsed}
            className="absolute inset-y-0 right-0 pl-2"
            style={{
              // The row less the separator, which is w-2.
              width:
                agentShare === undefined
                  ? '100%'
                  : `calc((100cqw - var(--spacing) * 2) * ${agentShare / 100})`,
            }}
          >
            <AgentPanel />
          </div>
        </Panel>
        <Separator className="group flex w-2 items-center justify-center outline-none">
          <span className="h-10 w-0.5 rounded-full bg-line-strong opacity-0 transition-[opacity,background-color] motion-fast group-hover:opacity-100 group-focus-visible:bg-accent group-focus-visible:opacity-100 group-data-[separator=active]:bg-accent group-data-[separator=active]:opacity-100" />
        </Separator>
        <Panel id="workbench" elementRef={workbenchColumn} minSize={420}>
          <Workbench view={view} onViewChange={onViewChange} leading={agentToggle} />
        </Panel>
      </Group>
    </div>
  );
}

/**
 * The panel library sets the columns' flex-grow at once. Each is animated from
 * where it was to where the library puts it, on one timing, so the boundary
 * moves while the two still fill the row. The animations end on their own, so
 * a drag or a window resize after them is not held back.
 */
function glide(columns: readonly HTMLElement[], opening: boolean) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const tokens = getComputedStyle(document.documentElement);
  // The minifier may rewrite a duration from ms to s.
  const milliseconds = (token: string) => {
    const time = tokens.getPropertyValue(token).trim();
    return parseFloat(time) * (time.endsWith('ms') ? 1 : 1000);
  };
  // The slow tier: a column is the largest thing that moves.
  const timing = opening
    ? {
        duration: milliseconds('--motion-slow'),
        easing: tokens.getPropertyValue('--ease-spring-bounce'),
      }
    : {
        duration: milliseconds('--motion-slow-exit'),
        easing: tokens.getPropertyValue('--ease-exit'),
      };
  for (const column of columns) {
    const from = getComputedStyle(column).flexGrow;
    for (const running of column.getAnimations()) running.cancel();
    // Without an end keyframe, the animation runs to the value the library sets.
    column.animate([{ flexGrow: from, offset: 0 }], timing);
  }
}

/** Lucide's PanelLeftClose (ISC), whose arrow turns over into PanelLeftOpen's. */
function AgentToggleIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M9 3v18" />
      {/* Turned about (15, 12), it lands on PanelLeftOpen's arrow. */}
      <path
        d="m16 15-3-3 3-3"
        className={clsx(
          'origin-[62.5%_50%] transition-transform motion-moderate [transform-box:view-box] motion-reduce:transition-none',
          collapsed && 'rotate-180',
        )}
      />
    </svg>
  );
}

type NarrowPane = 'agent' | WorkbenchView;

function NarrowShell({ view, onViewChange }: ShellLayoutProps) {
  const m = useMessages(shellMessages);
  const [agentShown, setAgentShown] = useState(false);
  const narrowPanes: SegmentedOption<NarrowPane>[] = [
    { value: 'agent', label: m.agent, icon: <Bot /> },
    { value: 'preview', label: m.preview, icon: <Eye /> },
    { value: 'code', label: m.code, icon: <Code2 /> },
  ];

  return (
    <div className="flex h-dvh flex-col gap-2 p-2 pb-[max(--spacing(2),env(safe-area-inset-bottom))]">
      <div hidden={!agentShown} className="min-h-0 flex-1">
        <AgentPanel />
      </div>
      <div hidden={agentShown} className="min-h-0 flex-1">
        <Workbench
          view={view}
          onViewChange={onViewChange}
          leading={<BrandMark className="mx-1.5 size-5" />}
          showViewTabs={false}
          initialDevice="mobile"
        />
      </div>
      <nav>
        <SegmentedControl
          label={m.panes}
          fill
          value={agentShown ? 'agent' : view}
          options={narrowPanes}
          onChange={(pane) => {
            setAgentShown(pane === 'agent');
            if (pane !== 'agent') onViewChange(pane);
          }}
        />
      </nav>
    </div>
  );
}
