import { defineMessages } from '../i18n/messages';

export const adoptionMessages = defineMessages({
  zh: {
    title: '待采纳的修改',
    allDone: '都处理完了',
    inSync: '项目与预览一致。',
    intro:
      '这些修改是在预览里做的，目前只在 Session 中。采纳会写回项目文件；丢弃会让预览回到项目里的内容。',
    from: (source: string) => `来自 ${source}`,
    adopt: '采纳',
    discard: '丢弃',
    failed: '没能完成',
    discardTitle: '丢弃 Session 里的修改？',
    discardWarning: (source: string) => `预览会回到 ${source} 的内容，下列修改随之丢失，不能撤销。`,
    fileDeleted: '预览删除了这个文件。',
    contentsDiffer: '内容不同。',
    valueDeleted: '预览删除了这个值。',
    changesTo: (path: string) => `${path} 的修改`,

    wholeValue: '（整个值）',
    path: '路径',
    project: '项目',
    session: 'Session',
    projectValue: '项目：',
    sessionValue: 'Session：',
    none: '无',
  },
  en: {
    title: 'Changes to adopt',
    allDone: 'All caught up',
    inSync: 'The project matches the preview.',
    intro:
      'These changes were made in the preview and so far live only in the Session. Adopting writes them back to the project files; discarding returns the preview to what the project holds.',
    from: (source: string) => `From ${source}`,
    adopt: 'Adopt',
    discard: 'Discard',
    failed: "Couldn't finish",
    discardTitle: 'Discard the changes in the Session?',
    discardWarning: (source: string) =>
      `The preview goes back to the content of ${source}, and these changes are lost. This can't be undone.`,
    fileDeleted: 'The preview deleted this file.',
    contentsDiffer: 'The contents differ.',
    valueDeleted: 'The preview deleted this value.',
    changesTo: (path: string) => `Changes to ${path}`,

    wholeValue: '(whole value)',
    path: 'Path',
    project: 'Project',
    session: 'Session',
    projectValue: 'Project: ',
    sessionValue: 'Session: ',
    none: 'None',
  },
});
