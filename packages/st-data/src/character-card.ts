const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Reads the character JSON embedded in a PNG card. A `ccv3` text chunk takes
 * precedence over `chara`, as in SillyTavern's character-card-parser.
 */
export function readCharacterCard(png: Uint8Array): string {
  const chunks = readTextChunks(png);
  const encoded = chunks.get('ccv3') ?? chunks.get('chara');
  if (encoded === undefined) {
    throw new Error('The PNG has no character data (no "ccv3" or "chara" text chunk)');
  }
  return decodeBase64Utf8(encoded);
}

/** tEXt chunks by lower-cased keyword. Keyword and text are Latin-1. */
function readTextChunks(png: Uint8Array): Map<string, string> {
  if (!PNG_SIGNATURE.every((byte, index) => png[index] === byte)) {
    throw new Error('Not a PNG file');
  }
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const latin1 = new TextDecoder('latin1');
  const chunks = new Map<string, string>();

  let offset = PNG_SIGNATURE.length;
  while (offset + 8 <= png.length) {
    const length = view.getUint32(offset);
    const type = latin1.decode(png.subarray(offset + 4, offset + 8));
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'tEXt') {
      const separator = data.indexOf(0);
      if (separator > 0) {
        const keyword = latin1.decode(data.subarray(0, separator)).toLowerCase();
        chunks.set(keyword, latin1.decode(data.subarray(separator + 1)));
      }
    }
    if (type === 'IEND') break;
    offset += 12 + length;
  }
  return chunks;
}

function decodeBase64Utf8(encoded: string): string {
  const binary = atob(encoded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
