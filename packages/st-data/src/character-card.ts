const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const CARD_KEYWORDS = new Set(['chara', 'ccv3']);

interface Chunk {
  type: string;
  data: Uint8Array;
}

/**
 * A `ccv3` text chunk takes precedence over `chara`, as in SillyTavern's
 * character-card-parser.
 */
export function readCharacterCard(png: Uint8Array): string {
  const texts = new Map<string, string>();
  for (const chunk of readChunks(png)) {
    const text = chunk.type === 'tEXt' ? decodeTextChunk(chunk.data) : undefined;
    if (text) texts.set(text.keyword.toLowerCase(), text.text);
  }
  const encoded = texts.get('ccv3') ?? texts.get('chara');
  if (encoded === undefined) {
    throw new Error('The PNG has no character data (no "ccv3" or "chara" text chunk)');
  }
  return decodeBase64Utf8(encoded);
}

/**
 * Embeds character JSON in a PNG card, as SillyTavern's character-card-parser
 * writes it: the old `chara` and `ccv3` chunks go, then `chara` carries the
 * JSON as given and `ccv3` the same card marked as V3, both before IEND.
 * Unlike SillyTavern, the image is not re-encoded, so its other chunks stay.
 */
export function writeCharacterCard(png: Uint8Array, json: string): Uint8Array {
  const chunks = readChunks(png).filter((chunk) => {
    const text = chunk.type === 'tEXt' ? decodeTextChunk(chunk.data) : undefined;
    return !text || !CARD_KEYWORDS.has(text.keyword.toLowerCase());
  });
  const card = [textChunk('chara', encodeBase64Utf8(json))];
  const v3 = asVersion3(json);
  if (v3 !== undefined) card.push(textChunk('ccv3', encodeBase64Utf8(v3)));
  const end = chunks.findIndex((chunk) => chunk.type === 'IEND');
  if (end === -1) throw new Error('The PNG has no IEND chunk');
  chunks.splice(end, 0, ...card);
  return encodeChunks(chunks);
}

/** The card marked as V3, or nothing when the JSON does not parse (SillyTavern skips ccv3 then). */
function asVersion3(json: string): string | undefined {
  try {
    const card = JSON.parse(json) as Record<string, unknown>;
    return JSON.stringify({ ...card, spec: 'chara_card_v3', spec_version: '3.0' });
  } catch {
    return undefined;
  }
}

function readChunks(png: Uint8Array): Chunk[] {
  if (!PNG_SIGNATURE.every((byte, index) => png[index] === byte)) {
    throw new Error('Not a PNG file');
  }
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const latin1 = new TextDecoder('latin1');
  const chunks: Chunk[] = [];
  let offset = PNG_SIGNATURE.length;
  while (offset + 8 <= png.length) {
    const length = view.getUint32(offset);
    const type = latin1.decode(png.subarray(offset + 4, offset + 8));
    chunks.push({ type, data: png.subarray(offset + 8, offset + 8 + length) });
    if (type === 'IEND') break;
    offset += 12 + length;
  }
  return chunks;
}

function encodeChunks(chunks: Chunk[]): Uint8Array {
  const size = chunks.reduce((sum, chunk) => sum + 12 + chunk.data.length, PNG_SIGNATURE.length);
  const png = new Uint8Array(size);
  const view = new DataView(png.buffer);
  png.set(PNG_SIGNATURE);
  let offset = PNG_SIGNATURE.length;
  for (const chunk of chunks) {
    const typed = new Uint8Array(4 + chunk.data.length);
    typed.set(latin1Bytes(chunk.type));
    typed.set(chunk.data, 4);
    view.setUint32(offset, chunk.data.length);
    png.set(typed, offset + 4);
    view.setUint32(offset + 8 + chunk.data.length, crc32(typed));
    offset += 12 + chunk.data.length;
  }
  return png;
}

/** A tEXt chunk is `keyword NUL text`, both Latin-1. */
function decodeTextChunk(data: Uint8Array): { keyword: string; text: string } | undefined {
  const separator = data.indexOf(0);
  if (separator <= 0) return undefined;
  const latin1 = new TextDecoder('latin1');
  return {
    keyword: latin1.decode(data.subarray(0, separator)),
    text: latin1.decode(data.subarray(separator + 1)),
  };
}

function textChunk(keyword: string, text: string): Chunk {
  return { type: 'tEXt', data: latin1Bytes(`${keyword}\0${text}`) };
}

/** Base64 is ASCII, so Latin-1 bytes of these strings are their char codes. */
function latin1Bytes(text: string): Uint8Array {
  return Uint8Array.from(text, (char) => char.charCodeAt(0));
}

function decodeBase64Utf8(encoded: string): string {
  return new TextDecoder().decode(Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0)));
}

function encodeBase64Utf8(text: string): string {
  let binary = '';
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

/** CRC-32 over a chunk's type and data, as PNG requires. */
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
