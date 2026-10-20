import { defineMessages } from '../i18n/messages';

export const shellMessages = defineMessages({
  zh: {
    expandAgent: '展开 Agent',
    collapseAgent: '收起 Agent',
    agentPanel: 'Agent 面板',
    panes: '面板',
    agent: 'Agent',
    preview: '预览',
    code: '代码',
    persistenceFailed: 'Session 未保存，刷新后会丢失预览里的改动',
  },
  en: {
    expandAgent: 'Show Agent',
    collapseAgent: 'Hide Agent',
    agentPanel: 'Agent panel',
    panes: 'Panes',
    agent: 'Agent',
    preview: 'Preview',
    code: 'Code',
    persistenceFailed: "The Session isn't being saved; reloading loses changes made in the preview",
  },
});
