// Follows TauriTavern's `text_lines.rs`: a character is a Unicode code point,
// and lines split on `\n` alone.

import { ToolError } from './tool';

const SURROGATE_PAIR = /[\uD800-\uDBFF][\uDC00-\uDFFF]/g;

/** The characters in `text`: Unicode code points. */
export function charCount(text: string): number {
  return text.length - (text.match(SURROGATE_PAIR)?.length ?? 0);
}

export function takeChars(text: string, count: number): string {
  let end = 0;
  let taken = 0;
  for (const character of text) {
    if (taken === count) break;
    end += character.length;
    taken += 1;
  }
  return text.slice(0, end);
}

/** `1 line`, `2 lines`: the model reads English. */
export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

export function countLines(text: string): number {
  return text === '' ? 0 : text.split('\n').length;
}

export function numberLines(lines: readonly string[], startLine: number, endLine: number): string {
  const width = String(endLine).length;
  return lines
    .map((line, index) => `${String(startLine + index).padStart(width)} | ${line}`)
    .join('\n');
}

export interface LineSelection {
  content: string;
  totalLines: number;
  /** 0 for empty text, as is `endLine`. */
  startLine: number;
  endLine: number;
  /** The first line alone exceeds the character limit, so `content` is its beginning. */
  lineTruncated: boolean;
}

/** A first line alone longer than `maxChars` shows only its first `longLineChars`. */
export function selectLines(
  text: string,
  startLine: number,
  lineCount: number | undefined,
  maxLines: number,
  maxChars: number,
  longLineChars: number,
): LineSelection {
  if (startLine === 0) throw new ToolError(INVALID_LINE_RANGE, 'start_line must be >= 1');
  if (lineCount === 0) throw new ToolError(INVALID_LINE_RANGE, 'line_count must be >= 1');
  const lines = text === '' ? [] : text.split('\n');
  if (startLine > Math.max(lines.length, 1)) {
    throw new ToolError(
      INVALID_LINE_RANGE,
      `start_line ${startLine} is beyond total lines ${lines.length}`,
    );
  }
  if (lines.length === 0) {
    return { content: '', totalLines: 0, startLine: 0, endLine: 0, lineTruncated: false };
  }

  const requestedEnd =
    lineCount === undefined ? lines.length : Math.min(startLine + lineCount - 1, lines.length);
  const selected: string[] = [];
  let chars = 0;
  let lineTruncated = false;
  for (const line of lines.slice(startLine - 1, Math.min(startLine + maxLines - 1, requestedEnd))) {
    const separator = selected.length > 0 ? 1 : 0;
    const lineChars = charCount(line);
    if (chars + separator + lineChars <= maxChars) {
      selected.push(line);
      chars += separator + lineChars;
      continue;
    }
    if (selected.length === 0) {
      selected.push(takeChars(line, longLineChars));
      lineTruncated = true;
    }
    break;
  }
  return {
    content: selected.join('\n'),
    totalLines: lines.length,
    startLine,
    endLine: startLine + selected.length - 1,
    lineTruncated,
  };
}

const INVALID_LINE_RANGE = 'workspace.invalid_line_range';

export function isPartial(selection: LineSelection): boolean {
  return (
    selection.lineTruncated || selection.startLine > 1 || selection.endLine < selection.totalLines
  );
}
