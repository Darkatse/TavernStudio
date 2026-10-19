import { languageTag } from './locale';
import { defineMessages } from './messages';

/**
 * Words many parts of the interface share, so each says them the same way.
 * A word that belongs to one feature stays with that feature.
 */
export const common = defineMessages({
  zh: {
    cancel: '取消',
    close: '关闭',
    retry: '重试',
    save: '保存',
    delete: '删除',
    rename: '重命名',
    copy: '复制',
    loading: '正在载入',
    /** A span of time in milliseconds, as "8 秒" or "1 分 2 秒". */
    duration: (ms: number) => {
      const seconds = wholeSeconds(ms);
      if (seconds === 0) return '不到 1 秒';
      if (seconds < 60) return `${seconds} 秒`;
      return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
    },
  },
  en: {
    cancel: 'Cancel',
    close: 'Close',
    retry: 'Retry',
    save: 'Save',
    delete: 'Delete',
    rename: 'Rename',
    copy: 'Copy',
    loading: 'Loading',
    duration: (ms: number) => {
      const seconds = wholeSeconds(ms);
      if (seconds === 0) return 'under 1 s';
      if (seconds < 60) return `${seconds} s`;
      return `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
    },
  },
});

function wholeSeconds(ms: number): number {
  return Math.max(0, Math.round(ms / 1000));
}

/** A number as Studio's language writes it, with Intl's options for units and percentages. */
export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(languageTag(), options).format(value);
}

/**
 * The English noun for a count: `1 file`, `2 files`. Chinese has no plural,
 * so only English messages use it.
 */
export function plural(count: number, one: string, other: string): string {
  return `${formatNumber(count)} ${count === 1 ? one : other}`;
}
