import { syntaxTree } from '@codemirror/language';
import type { Range } from '@codemirror/state';
import {
  Decoration,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type EditorView,
  type ViewUpdate,
} from '@codemirror/view';
import { isColor } from '../ui/swatch';

class Swatch extends WidgetType {
  constructor(readonly color: string) {
    super();
  }

  override eq(other: Swatch): boolean {
    return other.color === this.color;
  }

  toDOM(): HTMLElement {
    const swatch = document.createElement('span');
    swatch.className = 'swatch cm-swatch';
    swatch.style.color = this.color;
    swatch.ariaHidden = 'true';
    return swatch;
  }
}

/**
 * A color is a CSS value, or what a JSON or JavaScript string says. A CSS
 * call counts only as a whole, as `rgb(…)` does and `url(…)` does not.
 */
function swatches(view: EditorView): DecorationSet {
  const { state } = view;
  const widgets: Range<Decoration>[] = [];
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        let text: string;
        switch (node.name) {
          case 'ColorLiteral':
          case 'ValueName':
            text = state.sliceDoc(node.from, node.to);
            break;
          case 'CallExpression':
            // A JavaScript call starts with its function's name, not a Callee.
            if (node.node.firstChild?.name !== 'Callee') return;
            text = state.sliceDoc(node.from, node.to);
            break;
          case 'String':
            text = state.sliceDoc(node.from + 1, node.to - 1);
            break;
          default:
            return;
        }
        if (!isColor(text)) return;
        widgets.push(Decoration.widget({ widget: new Swatch(text), side: -1 }).range(node.from));
        // The arguments of a color are not colors of their own.
        return false;
      },
    });
  }
  return Decoration.set(widgets);
}

/** A swatch before every color in view, as in the values of a change to adopt. */
export const colorSwatches = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = swatches(view);
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        syntaxTree(update.startState) !== syntaxTree(update.state)
      ) {
        this.decorations = swatches(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);
