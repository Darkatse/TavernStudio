import { unifiedMergeView } from '@codemirror/merge';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { useEffect, useRef } from 'react';
import { languageOf, phrases } from '../editor/extensions';
import { studioTheme } from '../editor/theme';
import { useMessages } from '../i18n/messages';
import { adoptionMessages } from './messages';

export interface TextDiffProps {
  original: string;
  changed: string;
  path: string;
}

/**
 * A change of Studio's language builds it again, with its label and
 * CodeMirror's words in the new language.
 */
export function TextDiff({ original, changed, path }: TextDiffProps) {
  const { changesTo } = useMessages(adoptionMessages);
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const parent = host.current;
    if (!parent) return;
    let view: EditorView | undefined;
    let gone = false;
    void languageOf(path).then((language) => {
      if (gone) return;
      view = new EditorView({
        parent,
        state: EditorState.create({
          doc: changed,
          extensions: [
            EditorState.readOnly.of(true),
            EditorView.editable.of(false),
            EditorView.lineWrapping,
            EditorView.contentAttributes.of({ 'aria-label': changesTo(path) }),
            language,
            phrases,
            studioTheme,
            unifiedMergeView({
              original,
              mergeControls: false,
              gutter: false,
              collapseUnchanged: {},
            }),
          ],
        }),
      });
    });
    return () => {
      gone = true;
      view?.destroy();
    };
  }, [original, changed, path, changesTo]);

  return (
    <div ref={host} className="overflow-hidden rounded-lg shadow-[0_0_0_1px_var(--color-line)]" />
  );
}
