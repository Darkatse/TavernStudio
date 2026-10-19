import { defineMessages } from '../i18n/messages';

export const settingsMessages = defineMessages({
  zh: {
    settings: '设置',
    sections: '设置分类',
    general: '通用',
    models: '模型',
    appearance: '外观',
    followSystem: '跟随系统',
    light: '浅色',
    dark: '深色',
    language: '语言',
    followBrowser: '跟随浏览器',
    languageHint: '预览里的 SillyTavern 和 TauriTavern 按它们自己的语言设置显示。',
    storage: '存储',
    storageUsage: (size: string) =>
      `Studio 在这个浏览器里占用 ${size}。只有最近 20 次运行保留截图和长结果；Checkpoint 每个项目最多保留 100 MB，超出时从最早的清理。`,
  },
  en: {
    settings: 'Settings',
    sections: 'Settings sections',
    general: 'General',
    models: 'Models',
    appearance: 'Appearance',
    followSystem: 'System',
    light: 'Light',
    dark: 'Dark',
    language: 'Language',
    followBrowser: 'Browser',
    languageHint: 'SillyTavern and TauriTavern in the preview follow their own language setting.',
    storage: 'Storage',
    storageUsage: (size: string) =>
      `Studio uses ${size} in this browser. Only the latest 20 Runs keep screenshots and long results; each project's Checkpoint keeps up to 100 MB and clears the oldest first.`,
  },
});
