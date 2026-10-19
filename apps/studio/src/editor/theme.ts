import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { tags } from '@lezer/highlight';

/*
 * Studio's look for CodeMirror. Every color is a token from styles/index.css,
 * so switching between light and dark needs no reconfiguring: the variables
 * change and the editor follows (docs/UI.md §3).
 */

const accentWash = (percent: number) =>
  `color-mix(in oklch, var(--color-accent) ${percent}%, transparent)`;

/** The syntax tokens and the Lezer tags each covers, as styles/index.css lists them. */
const highlightStyle = HighlightStyle.define([
  {
    tag: [tags.keyword, tags.operatorKeyword, tags.modifier],
    color: 'var(--color-syntax-keyword)',
  },
  {
    tag: [tags.string, tags.special(tags.string), tags.regexp, tags.attributeValue],
    color: 'var(--color-syntax-string)',
  },
  {
    tag: [tags.number, tags.bool, tags.null, tags.atom, tags.unit, tags.color],
    color: 'var(--color-syntax-number)',
  },
  { tag: [tags.comment, tags.meta], color: 'var(--color-syntax-comment)' },
  { tag: tags.propertyName, color: 'var(--color-syntax-property)' },
  {
    tag: [tags.tagName, tags.className, tags.labelName, tags.typeName],
    color: 'var(--color-syntax-tag)',
  },
  { tag: tags.attributeName, color: 'var(--color-syntax-attribute)' },
  {
    tag: [tags.variableName, tags.function(tags.variableName), tags.function(tags.propertyName)],
    color: 'var(--color-syntax-variable)',
  },
  {
    tag: [tags.punctuation, tags.bracket, tags.separator, tags.operator],
    color: 'var(--color-syntax-punctuation)',
  },
  { tag: tags.invalid, color: 'var(--color-syntax-invalid)' },
  // Markdown structure: weight and style only, color stays with the text.
  { tag: tags.heading, fontWeight: 'var(--font-weight-semibold)' },
  { tag: tags.strong, fontWeight: 'var(--font-weight-bold)' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: [tags.link, tags.url], color: 'var(--color-syntax-string)' },
  { tag: tags.monospace, color: 'var(--color-syntax-string)' },
  { tag: tags.quote, color: 'var(--color-syntax-comment)' },
]);

const theme = EditorView.theme({
  '&': {
    height: '100%',
    color: 'var(--color-fg)',
    backgroundColor: 'var(--color-surface)',
    fontSize: 'var(--text-body)',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'var(--font-mono)',
    lineHeight: 'var(--text-body--line-height)',
  },
  '.cm-content': { caretColor: 'var(--color-fg)', paddingBlock: '8px' },
  '.cm-line': { paddingInline: '4px 16px' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--color-fg)', borderLeftWidth: '1.5px' },
  '.cm-selectionBackground': { backgroundColor: 'var(--color-selected)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
    backgroundColor: accentWash(28),
  },
  '.cm-activeLine': { backgroundColor: 'var(--color-hover)' },
  '.cm-gutters': {
    backgroundColor: 'var(--color-surface)',
    color: 'var(--color-muted)',
    border: 'none',
  },
  '.cm-lineNumbers .cm-gutterElement': { paddingInline: '16px 8px' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--color-hover)', color: 'var(--color-fg)' },
  '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
    backgroundColor: 'var(--color-selected)',
    outline: '1px solid var(--color-line-strong)',
  },
  '.cm-nonmatchingBracket, &.cm-focused .cm-nonmatchingBracket': {
    backgroundColor: 'transparent',
    color: 'var(--color-syntax-invalid)',
  },
  '.cm-selectionMatch': { backgroundColor: 'var(--color-selected)' },
  '.cm-searchMatch': {
    backgroundColor: accentWash(20),
    outline: `1px solid ${accentWash(45)}`,
  },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: accentWash(45) },
  '.cm-specialChar': { color: 'var(--color-syntax-invalid)' },

  // The search panel, in Studio's controls.
  '.cm-panels': { backgroundColor: 'var(--color-sunken)', color: 'var(--color-fg)' },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--color-line)' },
  '.cm-panels.cm-panels-bottom': { borderTop: '1px solid var(--color-line)' },
  '.cm-search': {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 36px 6px 8px',
    fontFamily: 'var(--font-sans)',
    fontSize: 'var(--text-caption)',
  },
  '.cm-search br': { display: 'none' },
  '.cm-search label': { display: 'inline-flex', alignItems: 'center', gap: '4px', margin: '0' },
  '.cm-search input[type=checkbox]': { accentColor: 'var(--color-primary)', margin: '0' },
  '.cm-textfield': {
    height: '26px',
    margin: '0',
    padding: '0 8px',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    backgroundColor: 'var(--color-surface)',
    color: 'var(--color-fg)',
    boxShadow: 'var(--shadow-control)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-caption)',
    outline: 'none',
  },
  '.cm-textfield:focus-visible': { boxShadow: 'var(--shadow-focus)' },
  '.cm-button': {
    height: '26px',
    margin: '0',
    padding: '0 8px',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    backgroundImage: 'none',
    backgroundColor: 'var(--color-surface)',
    color: 'var(--color-fg)',
    boxShadow: 'var(--shadow-control)',
    fontFamily: 'var(--font-sans)',
    fontSize: 'var(--text-caption)',
  },
  '.cm-button:hover': { backgroundColor: 'var(--color-hover)' },
  '.cm-button:active': { backgroundImage: 'none', backgroundColor: 'var(--color-selected)' },
  '.cm-search button[name=close]': {
    top: '8px',
    right: '10px',
    color: 'var(--color-muted)',
    fontSize: 'var(--text-title)',
  },

  // Tooltips and completions float like Studio's other popups.
  '.cm-tooltip': {
    border: 'none',
    borderRadius: 'var(--radius-lg)',
    backgroundColor: 'var(--color-raised)',
    color: 'var(--color-fg)',
    boxShadow: 'var(--shadow-popover)',
    overflow: 'hidden',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul': {
    padding: '4px',
    fontFamily: 'var(--font-mono)',
    maxHeight: '15em',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li': {
    padding: '2px 8px',
    borderRadius: 'var(--radius-sm)',
    lineHeight: 'var(--text-body--line-height)',
  },
  '.cm-tooltip-autocomplete ul li[aria-selected]': {
    backgroundColor: 'var(--color-selected)',
    color: 'var(--color-fg)',
  },
  '.cm-completionMatchedText': {
    textDecoration: 'none',
    fontWeight: 'var(--font-weight-semibold)',
  },
  '.cm-completionDetail': { color: 'var(--color-muted)', fontStyle: 'normal' },
  '.cm-completionIcon': { color: 'var(--color-muted)', opacity: '1' },

  // Diffs (docs/UI.md §3): low-chroma rows, and a sign on every changed line,
  // with removed text struck through, so color is never the only cue.
  '.cm-changedLine': { backgroundColor: 'var(--color-diff-add)' },
  '.cm-deletedChunk': { backgroundColor: 'var(--color-diff-del)', paddingLeft: '0' },
  '.cm-changedLine, .cm-deletedChunk .cm-deletedLine': { position: 'relative' },
  '.cm-changedLine::before, .cm-deletedChunk .cm-deletedLine::before': {
    position: 'absolute',
    left: '6px',
  },
  '.cm-changedLine::before': { content: '"+"', color: 'var(--color-diff-add-fg)' },
  '.cm-deletedChunk .cm-deletedLine::before': {
    content: '"−"',
    color: 'var(--color-diff-del-fg)',
  },
  // Every line of a diff leaves room for the sign, so text stays aligned.
  '&.cm-merge-b .cm-line, .cm-deletedChunk .cm-deletedLine': { paddingLeft: '20px' },
  '&.cm-merge-b .cm-changedText': {
    background: 'none',
    color: 'var(--color-diff-add-fg)',
    textDecoration: 'underline',
    textUnderlineOffset: '3px',
  },
  '.cm-deletedChunk .cm-deletedText': {
    background: 'none',
    color: 'var(--color-diff-del-fg)',
    textDecoration: 'line-through',
  },
  '.cm-collapsedLines': {
    padding: '2px 20px',
    background: 'var(--color-sunken)',
    color: 'var(--color-muted)',
    fontFamily: 'var(--font-sans)',
    fontSize: 'var(--text-caption)',
  },
  '.cm-collapsedLines:hover': { color: 'var(--color-fg)' },

  // iOS Safari zooms into editable text below 16px on focus.
  '@media (pointer: coarse)': { '.cm-content, .cm-gutters': { fontSize: 'max(16px, 1em)' } },
});

/** The theme and syntax colors, shared by the editor and the read-only diffs. */
export const studioTheme = [theme, syntaxHighlighting(highlightStyle)];
