import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completeAnyWord,
  completionKeymap,
} from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, indentOnInput } from '@codemirror/language';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { EditorState, type Extension } from '@codemirror/state';
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from '@codemirror/view';
import { studioTheme } from './theme';

/** CodeMirror's own words in Studio's language. */
export const phrases = EditorState.phrases.of({
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
});

/**
 * The language of a file, by its extension; plain text when Studio has none
 * for it. Each language loads the first time a file needs it, so a theme's
 * CSS and JSON do not bring the JavaScript, HTML and Markdown parsers along.
 */
export async function languageOf(path: string): Promise<Extension> {
  switch (/\.([^./]+)$/.exec(path)?.[1]?.toLowerCase()) {
    case 'css':
      return (await import('@codemirror/lang-css')).css();
    case 'js':
    case 'mjs':
      return (await import('@codemirror/lang-javascript')).javascript();
    case 'json':
      return (await import('@codemirror/lang-json')).json();
    case 'html':
      return (await import('@codemirror/lang-html')).html();
    case 'md':
      return (await import('@codemirror/lang-markdown')).markdown();
    default:
      return [];
  }
}

/**
 * The editing setup every file shares. Tab indents; Esc and then Tab leaves
 * the editor, which CodeMirror's view provides on its own for keyboard users
 * once Tab is bound.
 */
export const editing: Extension = [
  lineNumbers(),
  highlightActiveLineGutter(),
  highlightSpecialChars(),
  history(),
  drawSelection(),
  dropCursor(),
  EditorState.allowMultipleSelections.of(true),
  indentOnInput(),
  bracketMatching(),
  closeBrackets(),
  autocompletion(),
  // Words already in the file complete everywhere, beside each language's own completions.
  EditorState.languageData.of(() => [{ autocomplete: completeAnyWord }]),
  rectangularSelection(),
  crosshairCursor(),
  highlightActiveLine(),
  highlightSelectionMatches(),
  keymap.of([
    ...closeBracketsKeymap,
    ...defaultKeymap,
    ...searchKeymap,
    ...historyKeymap,
    ...completionKeymap,
    indentWithTab,
  ]),
  phrases,
  studioTheme,
];
