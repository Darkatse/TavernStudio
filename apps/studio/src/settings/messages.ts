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
    storage: '存储',
    storageUsage: (size: string) => `已用 ${size}`,
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
    storage: 'Storage',
    storageUsage: (size: string) => `${size} used`,
  },
});
