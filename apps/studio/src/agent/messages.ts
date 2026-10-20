import type { Locale } from '../i18n/locale';
import { defineMessages } from '../i18n/messages';
import type { ProjectExport } from '../project/export';
import type { ConversationFailure } from './conversation';

/**
 * Only the first screen's text: the Transcript's is in run-messages.ts and the
 * model settings' in model-settings-messages.ts, each loading with its part.
 */
export const agentMessages = defineMessages({
  zh: {
    panel: 'Agent',
    welcome: '想做点什么？',
    setup: {
      project: '新建项目',
      model: '连接模型',
      enterKey: (endpoint: string) => `填写 ${endpoint} 的 API Key`,
      done: '已完成',
    },
    suggestionsLabel: '例如',
    /** By what the project places: a project with a theme gets the theme's. */
    suggestions: {
      theme: ['换成暖色调的深色配色', '消息气泡改圆一点，加柔和的阴影', '正文字号调大，行距放宽'],
      extension: ['每条消息旁加一个复制按钮', '加一个隐藏头像的开关', '输入框上方显示聊天总字数'],
    } satisfies Record<ProjectExport['kind'], readonly string[]>,

    message: '给 Agent 的消息',
    placeholder: '描述你想要的效果…',
    guidancePlaceholder: '补充说明…',
    send: '发送',
    sendGuidance: '发送补充说明',
    stop: '停止',
    guidance: '排队中的补充说明',
    noKey: '未填写 Key',
    noProject: '先新建项目',
    notLoaded: '正在读取对话',
    modelMissing: '先连接模型',
    keyMissing: (endpoint: string) => `先填写 ${endpoint} 的 API Key`,
    failed: {
      load: (error: string) => `读取对话失败：${error}`,
      start: (error: string) => `Agent 启动失败：${error}`,
      rollback: (error: string) => `回滚未完成，可以撤销已恢复的部分：${error}`,
      prune: (error: string) => `清理 Checkpoint 失败：${error}`,
      save: (error: string) => `保存对话失败，刷新页面会丢失：${error}`,
    } satisfies Record<ConversationFailure, (error: string) => string>,
  },
  en: {
    panel: 'Agent',
    welcome: 'What do you want to make?',
    setup: {
      project: 'Create a project',
      model: 'Connect a model',
      enterKey: (endpoint: string) => `Enter the API Key for ${endpoint}`,
      done: 'Done',
    },
    suggestionsLabel: 'For example',
    suggestions: {
      theme: [
        'Switch to warm, dark colors',
        'Rounder message bubbles with a soft shadow',
        'Larger body text with more line spacing',
      ],
      extension: [
        'A copy button beside each message',
        'A switch that hides avatars',
        "The chat's word count above the input box",
      ],
    },

    message: 'Message to the Agent',
    placeholder: 'Describe what you want…',
    guidancePlaceholder: 'Add guidance…',
    send: 'Send',
    sendGuidance: 'Send guidance',
    stop: 'Stop',
    guidance: 'Queued guidance',
    noKey: 'No API Key',
    noProject: 'Create a project first',
    notLoaded: 'Loading the conversation',
    modelMissing: 'Connect a model first',
    keyMissing: (endpoint: string) => `Enter the API Key for ${endpoint} first`,
    failed: {
      load: (error: string) => `Couldn't load the conversation: ${error}`,
      start: (error: string) => `The Agent couldn't start: ${error}`,
      rollback: (error: string) =>
        `The rollback didn't finish. You can undo what it restored: ${error}`,
      prune: (error: string) => `Couldn't clear old Checkpoints: ${error}`,
      save: (error: string) =>
        `Couldn't save the conversation. Reloading the page will lose it: ${error}`,
    },
  },
});

export type AgentText = (typeof agentMessages)[Locale];
