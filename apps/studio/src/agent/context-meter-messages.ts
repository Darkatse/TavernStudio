import { defineMessages } from '../i18n/messages';

export const contextMeterMessages = defineMessages({
  zh: {
    label: (share: string) => `上下文 ${share}`,
    used: (tokens: string, window: string) => `上下文 ${tokens} / ${window} tokens`,
    detail: (tokens: string, window: string, at: number) =>
      `已用 ${tokens} / ${window} tokens，达到 ${at}% 时自动压缩。`,
    compactNow: '立即压缩',
    settings: '调整自动压缩…',
  },
  en: {
    label: (share: string) => `Context ${share}`,
    used: (tokens: string, window: string) => `Context ${tokens} / ${window} tokens`,
    detail: (tokens: string, window: string, at: number) =>
      `${tokens} of ${window} tokens used. Compacts by itself at ${at}%.`,
    compactNow: 'Compact now',
    settings: 'Auto-compaction settings…',
  },
});
