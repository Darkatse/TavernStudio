import { clsx } from 'clsx';
import { Bot, Code2, Eye, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Group, Panel, Separator, usePanelRef } from 'react-resizable-panels';
import { AgentPanel } from '../agent/agent-panel';
import { BrandMark } from '../brand/brand-mark';
import { useMediaQuery } from '../lib/use-media-query';
import { startStudio } from '../project/projects';
import { Button } from '../ui/button';
import { SegmentedControl, type SegmentedOption } from '../ui/segmented-control';
import { Tooltip } from '../ui/tooltip';
import { Workbench, type WorkbenchView } from '../workbench/workbench';

/**
 * The workspace: Agent beside the workbench on wide screens, one pane at a
 * time on narrow ones. Panes stay mounted when hidden, so the preview keeps
 * running while the Agent or the code is shown.
 */
export function Shell() {
  const wide = useMediaQuery('(min-width: 768px)');
  const [view, setView] = useState<WorkbenchView>('preview');
  useEffect(() => {
    void startStudio();
  }, []);

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

function WideShell({ view, onViewChange }: ShellLayoutProps) {
  const agent = usePanelRef();
  const [agentCollapsed, setAgentCollapsed] = useState(false);

  const agentToggle = (
    <Tooltip content={agentCollapsed ? '展开 Agent' : '收起 Agent'}>
      <Button
        variant="ghost"
        icon
        aria-label="Agent 面板"
        aria-controls="agent"
        aria-expanded={!agentCollapsed}
        onClick={() => (agentCollapsed ? agent.current?.expand() : agent.current?.collapse())}
      >
        {agentCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
      </Button>
    </Tooltip>
  );

  return (
    // Collapsed, the separator alone keeps the left gap equal to the right one.
    <div className={clsx('h-dvh p-2', agentCollapsed && 'pl-0')}>
      <Group orientation="horizontal" className="h-full">
        <Panel
          id="agent"
          panelRef={agent}
          defaultSize={380}
          minSize={320}
          maxSize="50%"
          collapsible
          groupResizeBehavior="preserve-pixel-size"
          onResize={(size) => setAgentCollapsed(size.inPixels === 0)}
        >
          <AgentPanel />
        </Panel>
        <Separator className="group flex w-2 items-center justify-center outline-none">
          <span className="h-10 w-0.5 rounded-full bg-line-strong opacity-0 transition-[opacity,background-color] motion-fast group-hover:opacity-100 group-focus-visible:bg-accent group-focus-visible:opacity-100 group-data-[separator=active]:bg-accent group-data-[separator=active]:opacity-100" />
        </Separator>
        <Panel id="workbench" minSize={420}>
          <Workbench view={view} onViewChange={onViewChange} leading={agentToggle} />
        </Panel>
      </Group>
    </div>
  );
}

type NarrowPane = 'agent' | WorkbenchView;

const narrowPanes: SegmentedOption<NarrowPane>[] = [
  { value: 'agent', label: 'Agent', icon: <Bot /> },
  { value: 'preview', label: '预览', icon: <Eye /> },
  { value: 'code', label: '代码', icon: <Code2 /> },
];

function NarrowShell({ view, onViewChange }: ShellLayoutProps) {
  const [agentShown, setAgentShown] = useState(false);

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
          label="面板"
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
