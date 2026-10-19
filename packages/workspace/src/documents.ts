import { readCharacterCard, writeCharacterCard } from '@tavern-studio/st-data';
import { jsonEqual, type JsonValue } from './json';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function hasDocument(path: string): boolean {
  return /\.json$/i.test(path) || isCard(path);
}

function isCard(path: string): boolean {
  return /^[^/]+\/characters\/[^/]+\.png$/i.test(path);
}

export function readDocument(path: string, bytes: Uint8Array): JsonValue {
  const text = isCard(path) ? readCharacterCard(bytes) : decoder.decode(bytes);
  try {
    return JSON.parse(text) as JsonValue;
  } catch (error) {
    throw new Error(`${path} does not hold valid JSON: ${(error as Error).message}`, {
      cause: error,
    });
  }
}

/**
 * Serializes a document the way SillyTavern writes the file: JSON data files
 * with four-space indentation, card JSON compact inside the existing image.
 */
export function writeDocument(
  path: string,
  original: Uint8Array | undefined,
  document: JsonValue,
): Uint8Array {
  if (!isCard(path)) return encoder.encode(JSON.stringify(document, null, 4));
  if (!original) throw new Error(`${path} does not exist, so there is no card to write into`);
  return writeCharacterCard(original, JSON.stringify(document));
}

/** A vendor reformatting a file or re-encoding a card's image changes nothing. */
export function sameContent(path: string, a: Uint8Array, b: Uint8Array): boolean {
  if (bytesEqual(a, b)) return true;
  return hasDocument(path) && jsonEqual(readDocument(path, a), readDocument(path, b));
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, index) => byte === b[index]);
}

/**
 * The text's own final newline is folded into the fence, so
 * `unfence(fence(text))` is the text ending in one newline.
 */
export function fence(text: string, language: string): string {
  return `\`\`\`${language}\n${text.replace(/\n$/, '')}\n\`\`\``;
}

/** Undefined when `block` was not made by `fence`. */
export function unfence(block: string, language: string): string | undefined {
  const open = `\`\`\`${language}\n`;
  if (!block.startsWith(open) || !block.endsWith('\n```')) return undefined;
  return block.slice(open.length, -'```'.length);
}
