import type { Locale } from '../i18n/locale';
import { defineMessages } from '../i18n/messages';
import type { ConversationFailure } from './conversation';

/**
 * The Agent panel's own text: the panel and the composer, on the first
 * screen. The Transcript's is in run-messages.ts and the model settings' in
 * model-settings-messages.ts, each loading with its part.
 */
export const agentMessages = defineMessages({
  zh: {
    // The panel
    panel: 'Agent',
    welcome: '想做点什么？',
    welcomeWithoutProject: '新建一个项目，再描述你想要的主题、前端卡或脚本。',
    welcomeToProject:
      '描述你想要的主题、前端卡或脚本。Agent 会修改文件、查看预览，反复调整到满意为止。',

    // The composer
    message: '给 Agent 的消息',
    placeholder: '描述你想要的效果…',
    guidancePlaceholder: '补充说明，会在下一步交给 Agent…',
    send: '发送',
    sendGuidance: '补充给 Agent',
    stop: '停止',
    guidance: '待交给 Agent 的补充',
    noModel: '未配置模型',
    noKey: '未填写 Key',
    noProject: '打开项目后即可对话',
    notLoaded: '对话记录还没有读取',
    modelMissing: '还没有选择模型。在设置里添加一个模型服务。',
    keyMissing: (endpoint: string) => `${endpoint} 还没有填写 API Key。`,
    /** What failed, followed by the error's own words. */
    failed: {
      load: (error: string) => `对话记录未能读取：${error}`,
      start: (error: string) => `Agent 未能启动：${error}`,
      rollback: (error: string) => `回滚没有完成，可以撤销已还原的部分：${error}`,
      prune: (error: string) => `Checkpoint 未能清理：${error}`,
      save: (error: string) => `对话记录未能保存，刷新后会丢失：${error}`,
    } satisfies Record<ConversationFailure, (error: string) => string>,
  },
  en: {
    panel: 'Agent',
    welcome: 'What do you want to make?',
    welcomeWithoutProject:
      'Create a project, then describe the theme, frontend card or script you want.',
    welcomeToProject:
      "Describe the theme, frontend card or script you want. The Agent edits the files, checks the preview and keeps refining until it's right.",

    message: 'Message to the Agent',
    placeholder: 'Describe what you want…',
    guidancePlaceholder: "Add guidance for the Agent's next step…",
    send: 'Send',
    sendGuidance: 'Add guidance',
    stop: 'Stop',
    guidance: 'Guidance waiting for the Agent',
    noModel: 'No model set up',
    noKey: 'No API Key',
    noProject: 'Open a project to talk to the Agent',
    notLoaded: "The conversation hasn't loaded yet",
    modelMissing: 'No model selected. Add a model service in settings.',
    keyMissing: (endpoint: string) => `${endpoint} needs an API Key.`,
    failed: {
      load: (error: string) => `Couldn't read the conversation: ${error}`,
      start: (error: string) => `The Agent couldn't start: ${error}`,
      rollback: (error: string) =>
        `The rollback didn't finish. You can undo what it already restored: ${error}`,
      prune: (error: string) => `Couldn't clear old Checkpoints: ${error}`,
      save: (error: string) =>
        `Couldn't save the conversation, so reloading the page will lose it: ${error}`,
    },
  },
});

/** The Agent panel's text in one language, for helpers that word things for a component. */
export type AgentText = (typeof agentMessages)[Locale];
