import type { MediaReader } from '@tavern-studio/agent';
import { coverage, specimenForModel, withFont, type Coverage } from '../media/font';
import { imageForModel, imageSize } from '../media/image';
import { byteSize, mediaKind } from '../media/kinds';
import { previewSession } from '../preview/session';
import { previewUrlOf } from '../project/mount-points';

const PROJECT = 'project/';

/** Images and fonts in the workspace, as the Agent reads them. */
export const agentMedia: MediaReader = {
  async read(path, bytes, { image }) {
    const kind = mediaKind(bytes);
    if (!kind) return undefined;
    const url = path.startsWith(PROJECT)
      ? previewUrlOf(previewSession.placements, path.slice(PROJECT.length))
      : undefined;
    const where = url
      ? `The preview serves it at ${url}.`
      : path.startsWith(PROJECT)
        ? 'No Mount places it, so the preview does not have it: put it in a folder a Mount places, such as assets/ in a theme project.'
        : '';
    const about = `${path}: ${kind.format} ${kind.kind}, ${byteSize(bytes.length)}`;

    if (kind.kind === 'image') {
      if (!image) {
        const { width, height } = await imageSize(bytes, kind);
        return {
          text: `${about}, ${width}×${height}. ${where} This model cannot see images, so the picture is not shown.`,
        };
      }
      const shown = await imageForModel(bytes, kind);
      const scaled =
        shown.width === shown.natural.width
          ? ''
          : ` It is shown at ${shown.width}×${shown.height}.`;
      return {
        text: `${about}, ${shown.natural.width}×${shown.natural.height}. ${where}${scaled}`,
        image: { type: 'image', data: shown.data, mimeType: shown.mimeType },
      };
    }

    try {
      return await withFont(bytes, async (family) => {
        const use = url
          ? ` Use it with @font-face { font-family: "A name of your choice"; src: url("${url}") format("${kind.fontFormat}"); }.`
          : '';
        const text = `${about}. It has glyphs for ${covered(coverage(family))}. ${where}${use}`;
        const specimen = image ? await specimenForModel(family) : undefined;
        if (!specimen) return { text };
        return {
          text: `${text} A specimen follows; characters it has no glyph for are left blank.`,
          image: { type: 'image', data: specimen.data, mimeType: specimen.mimeType },
        };
      });
    } catch (error) {
      return {
        text: `${about}, but it cannot be opened as a font: ${error instanceof Error ? error.message : String(error)}.`,
      };
    }
  },
};

function covered(list: readonly Coverage[]): string {
  return list.map(({ name, covered: count, total }) => `${name} ${count}/${total}`).join(', ');
}
