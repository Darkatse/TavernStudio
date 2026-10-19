import { MessagesSquare, Settings2 } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { BrandMark } from '../brand/brand-mark';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';
import { EmptyState } from '../ui/empty-state';
import { Tooltip } from '../ui/tooltip';
import { Composer } from './composer';
import type { Conversation } from './conversation';
import { useConversation, useConversationState } from './use-conversation';

// The Transcript brings Markdown with it, so it loads with the first Run to show.
const Transcript = lazy(() =>
  import('./transcript').then((module) => ({ default: module.Transcript })),
);
// The settings bring the model list's combobox, so they load when first opened.
const SettingsDialog = lazy(() =>
  import('./settings-dialog').then((module) => ({ default: module.SettingsDialog })),
);

export function AgentPanel() {
  const conversation = useConversation();
  // Undefined until the settings are first opened; they stay mounted from then on, to animate out.
  const [settingsOpen, setSettingsOpen] = useState<boolean>();
  return (
    <aside
      aria-label="Agent"
      className="flex h-full min-w-0 flex-col overflow-hidden rounded-xl bg-surface shadow-panel"
    >
      <header
        data-density="compact"
        className="flex h-12 shrink-0 items-center gap-2.5 pr-2.5 pl-4"
      >
        <BrandMark className="size-5" />
        <span className="text-subtitle">Tavern Studio</span>
        <Tooltip content="模型设置">
          <Button
            variant="ghost"
            icon
            className="ml-auto"
            aria-label="模型设置"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 />
          </Button>
        </Tooltip>
      </header>
      {conversation ? (
        <ConversationBody key={conversation.id} conversation={conversation} />
      ) : (
        <Welcome description="新建一个项目，再描述你想要的主题、前端卡或脚本。" />
      )}
      <Composer conversation={conversation} onOpenSettings={() => setSettingsOpen(true)} />
      <Dialog open={settingsOpen ?? false} onOpenChange={setSettingsOpen}>
        {settingsOpen !== undefined && (
          <Suspense>
            <SettingsDialog />
          </Suspense>
        )}
      </Dialog>
    </aside>
  );
}

function ConversationBody({ conversation }: { conversation: Conversation }) {
  const state = useConversationState(conversation);
  // Nothing until History is read, so a conversation does not flash the welcome
  // first; reading and loading take well under the 300 ms that needs a hint.
  if (!state.loaded) return <div className="flex-1" />;
  if (state.entries.length === 0 && !state.active) {
    return (
      <Welcome description="描述你想要的主题、前端卡或脚本。Agent 会修改文件、查看预览，反复调整到满意为止。" />
    );
  }
  return (
    <Suspense fallback={<div className="flex-1" />}>
      <Transcript conversation={conversation} />
    </Suspense>
  );
}

function Welcome({ description }: { description: string }) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-8">
      <EmptyState icon={<MessagesSquare />} title="想做点什么？" description={description} />
    </div>
  );
}
