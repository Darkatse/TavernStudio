import { useMessages } from '../i18n/messages';
import { NameButton, type NameButtonProps } from '../ui/name-button';
import type { Conversations } from './conversations';
import { agentMessages } from './messages';
import { useConversationsState } from './use-conversation';

/** It stays on the first screen to stand in while the conversation menu loads. */
export function ConversationButton({
  conversations,
  ...props
}: Omit<NameButtonProps, 'name'> & { conversations: Conversations }) {
  const m = useMessages(agentMessages);
  const state = useConversationsState(conversations);
  const record = state.records.find((each) => each.id === state.current.id);
  return <NameButton name={record?.title ?? m.newConversation} {...props} />;
}
