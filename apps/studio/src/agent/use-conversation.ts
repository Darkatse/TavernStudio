import { useSyncExternalStore } from 'react';
import { useCurrentProject } from '../project/use-project';
import type { Conversation, ConversationState } from './conversation';
import { Conversations, type ConversationsState } from './conversations';

const projects = new Map<string, Conversations>();

/** None until a project is open. */
export function useConversations(): Conversations | undefined {
  const project = useCurrentProject();
  if (!project) return undefined;
  let conversations = projects.get(project.record.id);
  if (!conversations) {
    conversations = new Conversations(project);
    projects.set(project.record.id, conversations);
    void conversations.load();
  }
  return conversations;
}

export function useConversationsState(conversations: Conversations): ConversationsState {
  return useSyncExternalStore(conversations.subscribe, () => conversations.state);
}

/** The conversation the Agent panel shows. */
export function useConversation(): Conversation | undefined {
  const conversations = useConversations();
  return useSyncExternalStore(
    conversations?.subscribe ?? noSubscription,
    () => conversations?.state.current,
  );
}

export function useConversationState(conversation: Conversation): ConversationState {
  return useSyncExternalStore(conversation.subscribe, () => conversation.state);
}

const noSubscription = () => () => {};
