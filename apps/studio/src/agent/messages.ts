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
    welcomeReady: '描述你想要的效果，Agent 会修改文件、查看预览，反复调整到满意为止。',
    setup: {
      stepsLeft: (count: number): string =>
        count === 1 ? '还差一步就能开始。' : '开始之前还有两步。',
      project: '新建项目',
      projectHint: '选一种作品，文件和预览会准备好。',
      model: '连接模型',
      modelHint: '填入你自己的模型服务和 API Key，Agent 在浏览器里直接请求它。',
      connect: '连接模型',
      enterKey: (endpoint: string) => `填写 ${endpoint} 的 API Key`,
      done: '已完成',
    },
    suggestionsLabel: '可以这样开始',
    /** By what the project places: a project with a theme gets the theme's. */
    suggestions: {
      theme: [
        '把配色改成暖色调的深色主题',
        '让消息气泡更圆润，加一点柔和的阴影',
        '调大正文字号，让行距更舒展',
      ],
      extension: [
        '在每条消息旁加一个复制按钮',
        '在扩展设置里加一个隐藏头像的开关',
        '在输入框上方显示当前聊天的总字数',
      ],
    } satisfies Record<ProjectExport['kind'], readonly string[]>,

    message: '给 Agent 的消息',
    placeholder: '描述你想要的效果…',
    guidancePlaceholder: '补充说明，会在下一步交给 Agent…',
    send: '发送',
    sendGuidance: '补充给 Agent',
    stop: '停止',
    guidance: '待交给 Agent 的补充',
    noKey: '未填写 Key',
    noProject: '先新建一个项目，就能发送了。',
    notLoaded: '对话记录还没有读取',
    modelMissing: '先连接一个模型，就能发送了。',
    keyMissing: (endpoint: string) => `先填写 ${endpoint} 的 API Key，就能发送了。`,
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
    welcomeReady:
      "Describe what you want. The Agent edits the files, checks the preview and keeps refining until it's right.",
    setup: {
      stepsLeft: (count: number) =>
        count === 1 ? 'One step to go.' : 'Two steps before you start.',
      project: 'Create a project',
      projectHint: 'Pick what to make. Studio sets up its files and preview.',
      model: 'Connect a model',
      modelHint:
        'Add your own model service and API Key. The Agent calls it straight from the browser.',
      connect: 'Connect model',
      enterKey: (endpoint: string) => `Enter the API Key for ${endpoint}`,
      done: 'Done',
    },
    suggestionsLabel: 'Try asking',
    suggestions: {
      theme: [
        'Turn the colors into a warm dark theme',
        'Round the message bubbles and add a soft shadow',
        'Make the body text larger, with more line spacing',
      ],
      extension: [
        'Add a copy button beside each message',
        'Add a setting that hides avatars',
        "Show the chat's total word count above the input box",
      ],
    },

    message: 'Message to the Agent',
    placeholder: 'Describe what you want…',
    guidancePlaceholder: "Add guidance for the Agent's next step…",
    send: 'Send',
    sendGuidance: 'Add guidance',
    stop: 'Stop',
    guidance: 'Guidance waiting for the Agent',
    noKey: 'No API Key',
    noProject: 'Create a project, then you can send.',
    notLoaded: "The conversation hasn't loaded yet",
    modelMissing: 'Connect a model, then you can send.',
    keyMissing: (endpoint: string) => `Enter the API Key for ${endpoint}, then you can send.`,
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

export type AgentText = (typeof agentMessages)[Locale];
