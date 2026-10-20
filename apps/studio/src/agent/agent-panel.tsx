import { Settings2, SquarePen } from 'lucide-react';
import {
  lazy,
  Suspense,
  useDeferredValue,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
import { BrandMark } from '../brand/brand-mark';
import { useMessages } from '../i18n/messages';
import { settingsMessages } from '../settings/messages';
import type { SettingsSection } from '../settings/settings-dialog';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';
import { Tooltip } from '../ui/tooltip';
import { Composer } from './composer';
import type { Conversation } from './conversation';
import { ConversationButton } from './conversation-button';
import { agentMessages } from './messages';
import { useConversation, useConversations, useConversationState } from './use-conversation';
import { Welcome } from './welcome';

// The Transcript brings Markdown with it, so it loads once a first message is being written.
const loadTranscript = () => import('./transcript');
const Transcript = lazy(() => loadTranscript().then((module) => ({ default: module.Transcript })));
const prefetchTranscript = () => void loadTranscript();
// The settings bring the model list's combobox, so they load when first wanted.
const loadSettings = () => import('../settings/settings-dialog');
const SettingsDialog = lazy(() =>
  loadSettings().then((module) => ({ default: module.SettingsDialog })),
);
const prefetchSettings = () => void loadSettings();
const ConversationMenu = lazy(() =>
  import('./conversation-menu').then((module) => ({ default: module.ConversationMenu })),
);

export function AgentPanel() {
  const m = useMessages(agentMessages);
  const settingsText = useMessages(settingsMessages);
  const conversations = useConversations();
  const conversation = useConversation();
  // Undefined until the settings are first opened; they stay mounted from then on, to animate out.
  const [settings, setSettings] = useState<{ open: boolean; section: SettingsSection }>();
  const [, startTransition] = useTransition();
  // In a transition the dialog stays shut until its code is in, then opens with
  // its content in one commit: no empty fallback swallows its entrance.
  const openSettings = (section: SettingsSection) =>
    startTransition(() => setSettings({ open: true, section }));
  const [draft, setDraft] = useState('');
  const writeDraft = (next: string) => {
    setDraft(next);
    prefetchTranscript();
  };
  const field = useRef<HTMLTextAreaElement>(null);
  const openModels = () => openSettings('models');
  const welcome = (
    <Welcome
      onSuggest={(request) => {
        writeDraft(request);
        field.current?.focus();
      }}
      onOpenModels={openModels}
    />
  );
  return (
    <aside
      aria-label={m.panel}
      className="flex h-full min-w-0 flex-col overflow-hidden rounded-xl bg-surface shadow-panel"
    >
      <header
        data-density="compact"
        className="flex h-12 shrink-0 items-center gap-0.5 pr-2.5 pl-4"
      >
        <BrandMark className="size-5 shrink-0" />
        {conversations ? (
          <Suspense fallback={<ConversationButton conversations={conversations} />}>
            <ConversationMenu conversations={conversations} />
          </Suspense>
        ) : (
          <span className="pl-2 text-subtitle">Tavern Studio</span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          {conversations && (
            <Tooltip content={m.newConversation}>
              <Button
                variant="ghost"
                icon
                aria-label={m.newConversation}
                onClick={() => conversations.startNew()}
              >
                <SquarePen />
              </Button>
            </Tooltip>
          )}
          <Tooltip content={settingsText.settings}>
            <Button
              variant="ghost"
              icon
              aria-label={settingsText.settings}
              onPointerEnter={prefetchSettings}
              onFocus={prefetchSettings}
              onClick={() => openSettings('general')}
            >
              <Settings2 />
            </Button>
          </Tooltip>
        </div>
      </header>
      {conversation ? (
        <ConversationBody key={conversation.id} conversation={conversation} welcome={welcome} />
      ) : (
        welcome
      )}
      <Composer
        ref={field}
        conversation={conversation}
        draft={draft}
        onDraftChange={writeDraft}
        onOpenModels={openModels}
      />
      <Dialog
        open={settings?.open ?? false}
        onOpenChange={(open) => setSettings((current) => current && { ...current, open })}
      >
        <Suspense>
          {settings && (
            <SettingsDialog
              section={settings.section}
              onSectionChange={(section) => setSettings({ open: true, section })}
            />
          )}
        </Suspense>
      </Dialog>
    </aside>
  );
}

function ConversationBody({
  conversation,
  welcome,
}: {
  conversation: Conversation;
  welcome: ReactNode;
}) {
  const state = useConversationState(conversation);
  // Nothing until History is read, so a conversation does not flash the welcome first.
  const body: Body = !state.loaded
    ? 'reading'
    : state.entries.length === 0 && !state.active
      ? 'welcome'
      : 'transcript';
  // Deferred, a change keeps what is shown until the Transcript's code is in.
  const shown = useDeferredValue(body, 'reading');
  const views: Record<Body, ReactNode> = {
    reading: <div className="flex-1" />,
    welcome,
    transcript: <Transcript conversation={conversation} />,
  };
  return <Suspense>{views[shown]}</Suspense>;
}

type Body = 'reading' | 'welcome' | 'transcript';
