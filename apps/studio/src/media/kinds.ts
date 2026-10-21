/** An image or a font, told by the signature its bytes start with, not by its name. */
export interface MediaKind {
  kind: 'image' | 'font';
  /** As people name it: PNG, WOFF2. */
  format: string;
  mimeType: string;
  /** The `format()` hint of an `@font-face` source. */
  fontFormat?: string;
}

/** SVG is text, and opens in the editor as its source. */
export function mediaKind(bytes: Uint8Array): MediaKind | undefined {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  const starts = (...signature: number[]) =>
    signature.every((byte, index) => bytes[index] === byte);
  if (starts(0x89, 0x50, 0x4e, 0x47)) return image('PNG', 'image/png');
  if (starts(0xff, 0xd8, 0xff)) return image('JPEG', 'image/jpeg');
  if (ascii(0, 4) === 'GIF8') return image('GIF', 'image/gif');
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return image('WebP', 'image/webp');
  if (ascii(4, 8) === 'ftyp' && /^avi[fs]$/.test(ascii(8, 12))) return image('AVIF', 'image/avif');
  if (ascii(0, 2) === 'BM') return image('BMP', 'image/bmp');
  if (starts(0x00, 0x00, 0x01, 0x00)) return image('ICO', 'image/x-icon');
  if (ascii(0, 4) === 'wOF2') return font('WOFF2', 'font/woff2', 'woff2');
  if (ascii(0, 4) === 'wOFF') return font('WOFF', 'font/woff', 'woff');
  if (ascii(0, 4) === 'OTTO') return font('OpenType', 'font/otf', 'opentype');
  if (starts(0x00, 0x01, 0x00, 0x00) || ascii(0, 4) === 'true') {
    return font('TrueType', 'font/ttf', 'truetype');
  }
  if (ascii(0, 4) === 'ttcf') return font('TrueType collection', 'font/collection', 'collection');
  return undefined;
}

function image(format: string, mimeType: string): MediaKind {
  return { kind: 'image', format, mimeType };
}

function font(format: string, mimeType: string, fontFormat: string): MediaKind {
  return { kind: 'font', format, mimeType, fontFormat };
}

export function byteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
