import { defineMessages } from '../i18n/messages';
import type { ProjectTemplate } from './templates';

interface TemplateText {
  /** The kind of work alone, as the welcome's cards name it. */
  kind: string;
  description: string;
  action: string;
  /** The new project's name; one another project has gets a number. */
  name: string;
}

export const projectMessages = defineMessages({
  zh: {
    templates: {
      theme: {
        kind: '主题',
        description: '配色、字体和界面样式',
        action: '新建主题项目',
        name: '我的主题',
      },
      extension: {
        kind: '扩展',
        description: '给 SillyTavern 添加功能',
        action: '新建扩展项目',
        name: '我的扩展',
      },
    } satisfies Record<ProjectTemplate['folder'], TemplateText>,
    createFailed: '项目没能新建',
    /** As the save dialog lists the kinds of file. */
    fileTypes: {
      project: 'Studio 项目',
      theme: 'SillyTavern 主题',
      extension: 'SillyTavern 扩展',
    },
  },
  en: {
    templates: {
      theme: {
        kind: 'Theme',
        description: 'Colors, fonts and the look of the interface',
        action: 'New theme project',
        name: 'My theme',
      },
      extension: {
        kind: 'Extension',
        description: 'New features for SillyTavern',
        action: 'New extension project',
        name: 'My extension',
      },
    },
    createFailed: "Couldn't create the project",
    fileTypes: {
      project: 'Studio project',
      theme: 'SillyTavern theme',
      extension: 'SillyTavern extension',
    },
  },
});
