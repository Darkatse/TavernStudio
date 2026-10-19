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
import { EditorState, StateEffect, StateField, type Extension } from '@codemirror/state';
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
import { messagesNow } from '../i18n/messages';
import { editorMessages, type Phrases } from './messages';
import { studioTheme } from './theme';

const setPhrases = StateEffect.define<Phrases>();

/**
 * A state keeps the language it was created in until `phrasesNow` brings it
 * to one chosen since.
 */
export const phrases: Extension = StateField.define<Phrases>({
  create: () => messagesNow(editorMessages).phrases,
  update: (value, transaction) => {
    for (const effect of transaction.effects) if (effect.is(setPhrases)) return effect.value;
    return value;
  },
  provide: (field) => EditorState.phrases.from(field),
});

export function phrasesNow(): StateEffect<Phrases> {
  return setPhrases.of(messagesNow(editorMessages).phrases);
}

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
 * Tab indents; Esc and then Tab leaves the editor, which CodeMirror's view
 * provides on its own for keyboard users once Tab is bound.
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
