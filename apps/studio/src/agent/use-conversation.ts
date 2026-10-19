import { useSyncExternalStore } from 'react';
import { useCurrentProject } from '../project/use-project';
import { Conversation, type ConversationState } from './conversation';

const conversations = new Map<string, Conversation>();

export function useConversation(): Conversation | undefined {
  const project = useCurrentProject();
  if (!project) return undefined;
  let conversation = conversations.get(project.record.id);
  if (!conversation) {
    conversation = new Conversation(project);
    conversations.set(project.record.id, conversation);
    void conversation.load();
  }
  return conversation;
}

export function useConversationState(conversation: Conversation): ConversationState {
  return useSyncExternalStore(conversation.subscribe, () => conversation.state);
}
