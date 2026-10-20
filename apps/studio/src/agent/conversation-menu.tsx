import { Check, PencilLine, SquarePen, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { formatWhen } from '../i18n/common';
import { useMessages } from '../i18n/messages';
import type { ConversationRecord } from '../storage/db';
import { AlertDialog, AlertDialogContent } from '../ui/alert-dialog';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '../ui/menu';
import { NameField, useRenaming } from '../ui/name-field';
import { ConversationButton } from './conversation-button';
import { conversationMenuMessages } from './conversation-menu-messages';
import type { Conversations } from './conversations';
import { agentMessages } from './messages';
import { titleProblem } from './titles';
import { useConversationsState } from './use-conversation';

export function ConversationMenu({ conversations }: { conversations: Conversations }) {
  const m = useMessages(conversationMenuMessages);
  const agent = useMessages(agentMessages);
  const state = useConversationsState(conversations);
  const trigger = useRef<HTMLButtonElement>(null);
  const current = state.records.find((record) => record.id === state.current.id);
  const renaming = useRenaming({
    trigger,
    check: titleProblem,
    commit: (title) => {
      if (current && title.trim() !== current.title) conversations.rename(current.id, title);
    },
  });
  // The conversation stays named while the confirmation closes.
  const [removing, setRemoving] = useState<ConversationRecord>();
  const [confirming, setConfirming] = useState(false);

  return (
    // As the project menu: the field lies over the button, which keeps its
    // place, its size and the menu's anchor.
    <span className="relative flex min-w-0 shrink font-medium [&_input]:transition-colors [&_input]:motion-moderate [&_input]:starting:text-muted">
      <Menu>
        <MenuTrigger
          ref={trigger}
          render={<ConversationButton conversations={conversations} draft={renaming.draft} />}
        />
        <MenuContent finalFocus={renaming.returnsFocus}>
          <MenuItem icon={<SquarePen />} onClick={() => conversations.startNew()}>
            {agent.newConversation}
          </MenuItem>
          {state.records.length > 0 && <MenuSeparator />}
          {state.records.map((record) => (
            <MenuItem
              key={record.id}
              icon={record.id === current?.id ? <Check /> : <span className="size-(--size-icon)" />}
              onClick={() => {
                if (record.id !== state.current.id) conversations.open(record.id);
              }}
            >
              <span className="truncate">{record.title}</span>
              <span className="ml-auto shrink-0 pl-4 text-caption text-muted tabular-nums">
                {state.running === record.id ? m.running : formatWhen(record.usedAt)}
              </span>
            </MenuItem>
          ))}
          {current && (
            <>
              <MenuSeparator />
              <MenuItem icon={<PencilLine />} onClick={() => renaming.start(current.title)}>
                {m.rename}
              </MenuItem>
              <MenuItem
                icon={<Trash2 />}
                disabled={state.running === current.id}
                onClick={() => {
                  setRemoving(current);
                  setConfirming(true);
                }}
              >
                {m.remove}
              </MenuItem>
            </>
          )}
        </MenuContent>
      </Menu>
      {renaming.field && (
        // Inset like the button's text, so the title stays where it was.
        <span className="absolute inset-0 flex items-center pr-0.5 pl-2">
          <NameField
            naming={{ ...renaming.field, problem: renaming.field.problem && m.titleEmpty }}
            label={m.title}
            className="flex-1"
          />
        </span>
      )}
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        {removing && (
          <AlertDialogContent
            title={m.removeTitle(removing.title)}
            description={m.removeDescription}
            action={m.remove}
            onAction={() => conversations.remove(removing.id)}
          />
        )}
      </AlertDialog>
    </span>
  );
}
