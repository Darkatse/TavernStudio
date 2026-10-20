import type { Locale } from '../i18n/locale';
import { defineMessages } from '../i18n/messages';

export const conversationMenuMessages = defineMessages({
  zh: {
    title: '对话标题',
    titleEmpty: '标题不能为空',
    running: '进行中',
    rename: '重命名',
    remove: '删除对话',
    removeTitle: (title: string) => `删除「${title}」？`,
    removeDescription: '对话里的消息会被删除，项目文件不变。',
  },
  en: {
    title: 'Conversation title',
    titleEmpty: 'The title cannot be empty',
    running: 'Running',
    rename: 'Rename',
    remove: 'Delete conversation',
    removeTitle: (title: string) => `Delete “${title}”?`,
    removeDescription: "The conversation's messages are deleted. Project files stay as they are.",
  },
});

export type ConversationMenuText = (typeof conversationMenuMessages)[Locale];
