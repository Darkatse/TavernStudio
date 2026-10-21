import { CAPTURE_IMAGE } from '@tavern-studio/preview';
import { base64 } from '../lib/base64';
import type { MediaKind } from './kinds';

export interface DecodedImage {
  width: number;
  height: number;
}

export async function imageSize(bytes: Uint8Array, kind: MediaKind): Promise<DecodedImage> {
  const bitmap = await createImageBitmap(
    new Blob([new Uint8Array(bytes)], { type: kind.mimeType }),
  );
  const { width, height } = bitmap;
  bitmap.close();
  return { width, height };
}

/**
 * The image as a model takes it: no wider or taller than a screenshot is
 * sent. A JPEG stays one; other formats may hold transparency, so PNG.
 */
export async function imageForModel(
  bytes: Uint8Array,
  kind: MediaKind,
): Promise<{
  natural: DecodedImage;
  data: string;
  mimeType: string;
  width: number;
  height: number;
}> {
  const bitmap = await createImageBitmap(
    new Blob([new Uint8Array(bytes)], { type: kind.mimeType }),
  );
  const natural = { width: bitmap.width, height: bitmap.height };
  const scale = Math.min(1, CAPTURE_IMAGE.maxWidth / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const mimeType = kind.mimeType === 'image/jpeg' ? CAPTURE_IMAGE.mimeType : 'image/png';
  const blob = await canvas.convertToBlob({ type: mimeType, quality: CAPTURE_IMAGE.quality });
  return { natural, data: await base64(blob), mimeType, width, height };
}
