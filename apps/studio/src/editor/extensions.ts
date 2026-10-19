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
 * CodeMirror's own words (the search panel, completions, announcements) in
 * Studio's language. A state takes the language Studio speaks when it is
 * created; `phrasesNow` brings it to a language chosen since. A view redraws
 * itself when its state's phrases change.
 */
export const phrases: Extension = StateField.define<Phrases>({
  create: () => messagesNow(editorMessages).phrases,
  update: (value, transaction) => {
    for (const effect of transaction.effects) if (effect.is(setPhrases)) return effect.value;
    return value;
  },
  provide: (field) => EditorState.phrases.from(field),
});

/** The effect that gives a state CodeMirror's words in the language Studio speaks now. */
export function phrasesNow(): StateEffect<Phrases> {
  return setPhrases.of(messagesNow(editorMessages).phrases);
}

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
