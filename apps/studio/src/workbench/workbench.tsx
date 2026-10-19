import { Code2, Eye, Monitor, Smartphone } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { SegmentedControl, type SegmentedOption } from '../ui/segmented-control';
import { Tab, Tabs, TabsList, TabsPanel } from '../ui/tabs';
import { CodeView } from './code-view';
import { DeviceStage } from './device-stage';
import { devices, type DeviceId } from './devices';

export type WorkbenchView = 'preview' | 'code';

const deviceOptions: SegmentedOption<DeviceId>[] = [
  { value: 'desktop', label: devices.desktop.label, icon: <Monitor /> },
  { value: 'mobile', label: devices.mobile.label, icon: <Smartphone /> },
];

function isWorkbenchView(value: unknown): value is WorkbenchView {
  return value === 'preview' || value === 'code';
}

export interface WorkbenchProps {
  view: WorkbenchView;
  onViewChange: (view: WorkbenchView) => void;
  /** Controls placed before the view tabs. */
  leading?: ReactNode;
  /** Hidden where the shell switches views itself (mobile navigation). */
  showViewTabs?: boolean;
  /** Device shown first; the shell matches it to the screen Studio runs on. */
  initialDevice?: DeviceId;
}

/**
 * Preview and code side by side as tabs. Both panels stay mounted: switching
 * views must not tear down the running preview or the editor state.
 */
export function Workbench({
  view,
  onViewChange,
  leading,
  showViewTabs = true,
  initialDevice = 'desktop',
}: WorkbenchProps) {
  const [deviceId, setDeviceId] = useState(initialDevice);

  return (
    <section
      aria-label="工作台"
      className="flex h-full min-w-0 flex-col overflow-hidden rounded-xl bg-surface shadow-panel"
    >
      <Tabs
        value={view}
        onValueChange={(next) => {
          if (isWorkbenchView(next)) onViewChange(next);
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <header
          data-density="compact"
          className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-2.5"
        >
          {leading}
          {showViewTabs && (
            <TabsList label="视图">
              <Tab value="preview">
                <Eye />
                预览
              </Tab>
              <Tab value="code">
                <Code2 />
                代码
              </Tab>
            </TabsList>
          )}
          {view === 'preview' && (
            <div className="ml-auto">
              <SegmentedControl
                label="设备"
                value={deviceId}
                options={deviceOptions}
                onChange={setDeviceId}
              />
            </div>
          )}
        </header>
        <TabsPanel value="preview" keepMounted className="flex min-h-0 flex-1">
          <DeviceStage device={devices[deviceId]} />
        </TabsPanel>
        <TabsPanel value="code" keepMounted className="flex min-h-0 flex-1">
          <CodeView />
        </TabsPanel>
      </Tabs>
    </section>
  );
}
