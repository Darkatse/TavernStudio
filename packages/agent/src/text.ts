// Follows TauriTavern's `text_metrics.rs`, `text_lines.rs` and
// `text_search.rs`: a character is a Unicode code point, and lines split on
// `\n` alone.

import { ToolError } from './tool';

export interface TextMetrics {
  chars: number;
  /** Runs of letters and digits; each CJK character is a word of its own. */
  words: number;
}

const ALPHANUMERIC = /[\p{Alphabetic}\p{N}]/u;
const SURROGATE_PAIR = /[\uD800-\uDBFF][\uDC00-\uDFFF]/g;

export function measure(text: string): TextMetrics {
  let chars = 0;
  let words = 0;
  let inWord = false;
  for (const character of text) {
    chars += 1;
    if (isCjkWordUnit(character.codePointAt(0) as number)) {
      words += 1;
      inWord = false;
    } else if (ALPHANUMERIC.test(character)) {
      if (!inWord) words += 1;
      inWord = true;
    } else {
      inWord = false;
    }
  }
  return { chars, words };
}

/** The characters in `text`, as `measure` counts them. */
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

function isCjkWordUnit(code: number): boolean {
  return CJK_WORD_UNITS.some(([first, last]) => code >= first && code <= last);
}

const CJK_WORD_UNITS: readonly (readonly [number, number])[] = [
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
  [0xf900, 0xfaff],
  [0x20000, 0x2a6df],
  [0x2a700, 0x2b73f],
  [0x2b740, 0x2b81f],
  [0x2b820, 0x2ceaf],
  [0x2ceb0, 0x2ebef],
  [0x30000, 0x3134f],
  [0x3040, 0x309f],
  [0x30a0, 0x30ff],
  [0xff66, 0xff9f],
  [0xac00, 0xd7af],
  [0x1100, 0x11ff],
  [0x3130, 0x318f],
];

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

export function selectLines(
  text: string,
  startLine: number,
  lineCount: number | undefined,
  maxLines: number,
  maxChars: number,
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
      selected.push(takeChars(line, maxChars));
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

export interface SearchHit {
  score: number;
  startLine: number;
  endLine: number;
  snippet: string;
}

const MAX_QUERY_TOKENS = 64;

export function textSearch(
  query: string,
  limit: number,
  contextLines: number,
): (text: string) => SearchHit[] {
  const tokens = queryTokens(query);
  const lowercase = tokens.some((token) => /[A-Za-z]/.test(token));
  return (text) => {
    if (tokens.length === 0 || limit === 0 || text.trim() === '') return [];
    const lines = text.split('\n');
    const candidates: { score: number; line: number; startLine: number; endLine: number }[] = [];
    for (const [index, line] of lines.entries()) {
      const score = scoreLine(lowercase ? line.toLowerCase() : line, tokens);
      if (score === undefined) continue;
      candidates.push({
        score,
        line: index + 1,
        startLine: Math.max(index + 1 - contextLines, 1),
        endLine: Math.min(index + 1 + contextLines, lines.length),
      });
    }
    candidates.sort((a, b) => b.score - a.score || a.line - b.line);

    const selected: typeof candidates = [];
    for (const candidate of candidates) {
      if (
        selected.some(
          (hit) => hit.startLine <= candidate.endLine && candidate.startLine <= hit.endLine,
        )
      ) {
        continue;
      }
      selected.push(candidate);
      if (selected.length >= limit) break;
    }
    return selected.map(({ score, startLine, endLine }) => ({
      score,
      startLine,
      endLine,
      snippet: numberLines(lines.slice(startLine - 1, endLine), startLine, endLine),
    }));
  };
}

function queryTokens(query: string): string[] {
  const literal = query.trim().toLowerCase();
  const normalized = splitWords(
    Array.from(literal, (character) =>
      ALPHANUMERIC.test(character) || character === '_' ? character : ' ',
    ).join(''),
  );
  const tokens: string[] = [];
  for (const token of normalized.length > 0 ? normalized : splitWords(literal)) {
    if (tokens.includes(token)) continue;
    tokens.push(token);
    if (tokens.length >= MAX_QUERY_TOKENS) break;
  }
  return tokens;
}

function splitWords(text: string): string[] {
  return text.split(/\s+/).filter((word) => word !== '');
}

function scoreLine(haystack: string, tokens: readonly string[]): number | undefined {
  let total = 0;
  let matched = 0;
  for (const token of tokens) {
    const weight = Math.min(charCount(token), 8);
    total += weight;
    if (haystack.includes(token)) matched += weight;
  }
  return matched === 0 ? undefined : matched / total;
}
