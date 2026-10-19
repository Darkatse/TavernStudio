import { defineMessages } from '../i18n/messages';

/** CodeMirror's own words, keyed by its English phrase. */
export type Phrases = Readonly<Record<string, string>>;

export const editorMessages = defineMessages<{ phrases: Phrases }>({
  zh: {
    phrases: {
      Find: '查找',
      Replace: '替换',
      next: '下一个',
      previous: '上一个',
      all: '全部',
      'match case': '区分大小写',
      regexp: '正则',
      'by word': '全词',
      replace: '替换',
      'replace all': '全部替换',
      close: '关闭',
      'current match': '当前匹配',
      'on line': '所在行',
      'replaced $ matches': '已替换 $ 处',
      'replaced match on line $': '已替换第 $ 行的匹配',
      'Go to line': '跳到行',
      go: '跳转',
      Completions: '补全',
      'Selection deleted': '已删除所选内容',
      'Control character': '控制字符',
      'folded code': '折叠的代码',
      unfold: '展开',
      to: '至',
      '$ unchanged lines': '$ 行未改动',
    },
  },
  // CodeMirror speaks English by itself.
  en: { phrases: {} },
});
