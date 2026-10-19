import { MessagesSquare, Settings2 } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { BrandMark } from '../brand/brand-mark';
import { useMessages } from '../i18n/messages';
import { settingsMessages } from '../settings/messages';
import type { SettingsSection } from '../settings/settings-dialog';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';
import { EmptyState } from '../ui/empty-state';
import { Tooltip } from '../ui/tooltip';
import { Composer } from './composer';
import type { Conversation } from './conversation';
import { agentMessages } from './messages';
import { useConversation, useConversationState } from './use-conversation';

// The Transcript brings Markdown with it, so it loads with the first Run to show.
const Transcript = lazy(() =>
  import('./transcript').then((module) => ({ default: module.Transcript })),
);
// The settings bring the model list's combobox, so they load when first opened.
const SettingsDialog = lazy(() =>
  import('../settings/settings-dialog').then((module) => ({ default: module.SettingsDialog })),
);

export function AgentPanel() {
  const m = useMessages(agentMessages);
  const settingsText = useMessages(settingsMessages);
  const conversation = useConversation();
  // Undefined until the settings are first opened; they stay mounted from then on, to animate out.
  const [settings, setSettings] = useState<{ open: boolean; section: SettingsSection }>();
  return (
    <aside
      aria-label={m.panel}
      className="flex h-full min-w-0 flex-col overflow-hidden rounded-xl bg-surface shadow-panel"
    >
      <header
        data-density="compact"
        className="flex h-12 shrink-0 items-center gap-2.5 pr-2.5 pl-4"
      >
        <BrandMark className="size-5" />
        <span className="text-subtitle">Tavern Studio</span>
        <Tooltip content={settingsText.settings}>
          <Button
            variant="ghost"
            icon
            className="ml-auto"
            aria-label={settingsText.settings}
            onClick={() => setSettings({ open: true, section: 'general' })}
          >
            <Settings2 />
          </Button>
        </Tooltip>
      </header>
      {conversation ? (
        <ConversationBody key={conversation.id} conversation={conversation} />
      ) : (
        <Welcome description={m.welcomeWithoutProject} />
      )}
      <Composer
        conversation={conversation}
        onOpenSettings={() => setSettings({ open: true, section: 'models' })}
      />
      <Dialog
        open={settings?.open ?? false}
        onOpenChange={(open) => setSettings((current) => current && { ...current, open })}
      >
        {settings && (
          <Suspense>
            <SettingsDialog
              section={settings.section}
              onSectionChange={(section) => setSettings({ open: true, section })}
            />
          </Suspense>
        )}
      </Dialog>
    </aside>
  );
}

function ConversationBody({ conversation }: { conversation: Conversation }) {
  const m = useMessages(agentMessages);
  const state = useConversationState(conversation);
  // Nothing until History is read, so a conversation does not flash the welcome first.
  if (!state.loaded) return <div className="flex-1" />;
  if (state.entries.length === 0 && !state.active) {
    return <Welcome description={m.welcomeToProject} />;
  }
  return (
    <Suspense fallback={<div className="flex-1" />}>
      <Transcript conversation={conversation} />
    </Suspense>
  );
}

function Welcome({ description }: { description: string }) {
  const m = useMessages(agentMessages);
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-8">
      <EmptyState icon={<MessagesSquare />} title={m.welcome} description={description} />
    </div>
  );
}
