import type { VendorKind } from '@tavern-studio/preview';
import { Code2, Eye, Monitor, RotateCw, Smartphone } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { previewSession, type SessionStatus } from '../preview/session';
import {
  useDevice,
  useSessionStatus,
  useVendorChoice,
  useViewGeneration,
} from '../preview/use-session';
import { Button } from '../ui/button';
import { SegmentedControl, type SegmentedOption } from '../ui/segmented-control';
import { Tab, Tabs, TabsList, TabsPanel } from '../ui/tabs';
import { Tooltip } from '../ui/tooltip';
import { AdoptionButton } from './adoption-button';
import { CodeView } from './code-view';
import { DeviceStage } from './device-stage';
import { ExportButton } from './export-button';
import { devices, type DeviceId } from '../preview/devices';

export type WorkbenchView = 'preview' | 'code';

const deviceOptions: SegmentedOption<DeviceId>[] = [
  { value: 'desktop', label: devices.desktop.label, icon: <Monitor /> },
  { value: 'mobile', label: devices.mobile.label, icon: <Smartphone /> },
];

const vendorKindLabels: Record<VendorKind, string> = { st: 'ST', tt: 'TT' };

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
  /** The device to present when this layout appears; the shell matches it to the screen. */
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
  const deviceId = useDevice();
  useEffect(() => void previewSession.selectDevice(initialDevice), [initialDevice]);
  const generation = useViewGeneration();
  const session = useSessionStatus();

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
          <div className="ml-auto flex items-center gap-1.5">
            <AdoptionButton />
            <ExportButton />
            {view === 'preview' && (
              <>
                <VendorSwitch session={session} />
                <SegmentedControl
                  label="设备"
                  value={deviceId}
                  options={deviceOptions}
                  onChange={(id) => void previewSession.selectDevice(id)}
                />
                <Tooltip content="重新载入预览">
                  <Button
                    variant="ghost"
                    icon
                    aria-label="重新载入预览"
                    disabled={session.phase !== 'open'}
                    onClick={() => void previewSession.reload()}
                  >
                    <RotateCw
                      className="transition-[rotate] motion-slow motion-reduce:transition-none"
                      style={{ rotate: `${generation * 360}deg` }}
                    />
                  </Button>
                </Tooltip>
              </>
            )}
          </div>
        </header>
        <TabsPanel value="preview" keepMounted className="flex min-h-0 flex-1">
          <DeviceStage device={devices[deviceId]} generation={generation} />
        </TabsPanel>
        <TabsPanel value="code" keepMounted className="flex min-h-0 flex-1">
          <CodeView shown={view === 'code'} />
        </TabsPanel>
      </Tabs>
    </section>
  );
}

/**
 * Switches between frontends. ST and TT never run side by side (docs/Architecture.md
 * §3), and a switch opens a new Session, so it waits while one is opening.
 */
function VendorSwitch({ session }: { session: SessionStatus }) {
  const { images, selected } = useVendorChoice();
  // One choice per frontend: the last built image of each kind.
  const choices = [...new Map(images.map((image) => [image.kind, image])).values()];
  if (choices.length < 2 || selected === undefined) return null;

  return (
    <SegmentedControl
      label="前端"
      value={selected}
      options={choices.map((image) => ({ value: image.id, label: vendorKindLabels[image.kind] }))}
      disabled={session.phase === 'opening'}
      onChange={(id) => void previewSession.selectVendor(id)}
    />
  );
}
