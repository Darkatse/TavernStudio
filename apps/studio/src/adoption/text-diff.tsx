import { unifiedMergeView } from '@codemirror/merge';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { useEffect, useRef } from 'react';
import { languageOf, phrases } from '../editor/extensions';
import { studioTheme } from '../editor/theme';

export interface TextDiffProps {
  /** The project's text. */
  original: string;
  /** The Session's text. */
  changed: string;
  /** The project file, which picks the syntax. */
  path: string;
}

/**
 * Text from the project against the Session's, as one read-only document:
 * `@codemirror/merge`'s unified view, with unchanged stretches folded away.
 */
export function TextDiff({ original, changed, path }: TextDiffProps) {
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
            EditorView.contentAttributes.of({ 'aria-label': `${path} 的修改` }),
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
  }, [original, changed, path]);

  return (
    <div ref={host} className="overflow-hidden rounded-lg shadow-[0_0_0_1px_var(--color-line)]" />
  );
}
