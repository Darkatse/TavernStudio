import type { ModelThinkingLevel } from '@tavern-studio/agent';
import { defineMessages } from '../i18n/messages';

export const effortMessages = defineMessages({
  zh: {
    label: '推理强度',
    current: (level: string) => `推理强度：${level}`,
    running: 'Run 结束后可以调整推理强度',
    loading: '正在读取模型支持的推理强度',
    levels: {
      off: '关闭',
      minimal: '极低',
      low: '低',
      medium: '中',
      high: '高',
      xhigh: '超高',
      max: '极高',
    } satisfies Record<ModelThinkingLevel, string>,
  },
  en: {
    label: 'Reasoning effort',
    current: (level: string) => `Reasoning effort: ${level}`,
    running: 'Change the reasoning effort once the Run ends',
    loading: 'Loading the efforts the model takes',
    levels: {
      off: 'Off',
      minimal: 'Minimum',
      low: 'Low',
      medium: 'Medium',
      high: 'High',
      xhigh: 'Extra high',
      max: 'Maximum',
    },
  },
});
