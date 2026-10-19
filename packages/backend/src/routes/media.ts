import type { Routes } from '../backend';
import type { DataDirectory } from '../data-directory';
import { json, text } from '../http';
import { byName, dirs, isImage, USER } from '../paths';

const IMAGE_METADATA = `${USER}/image-metadata.json`;

interface MetadataIndex {
  version: number;
  images: Record<string, { isAnimated?: boolean; folderIds?: string[] }>;
  folders?: unknown[];
}

export const mediaRoutes: Routes = {
  'POST /api/avatars/get': ({ data }) => json(images(data, dirs.avatars)),

  // `isAnimated` comes from the stored metadata index; Studio does not inspect
  // image files to generate it.
  'POST /api/backgrounds/all': ({ data }) => {
    const index = readMetadataIndex(data);
    return json({
      images: images(data, dirs.backgrounds).map((filename) => ({
        filename,
        isAnimated: index.images[`backgrounds/${filename}`]?.isAnimated ?? false,
      })),
      config: { width: 160, height: 90 },
    });
  },

  'POST /api/backgrounds/folders': ({ data }) => {
    const index = readMetadataIndex(data);
    const imageFolderMap: Record<string, string[]> = {};
    for (const [path, meta] of Object.entries(index.images)) {
      if (meta.folderIds?.length) imageFolderMap[path.split('/').pop() ?? path] = meta.folderIds;
    }
    return json({ folders: index.folders ?? [], imageFolderMap });
  },

  'POST /api/image-metadata/all': (request) => {
    const index = readMetadataIndex(request.data);
    const prefix = text(request.json(), 'prefix');
    if (!prefix) return json(index);
    const matching = Object.entries(index.images).filter(([path]) => path.startsWith(prefix));
    return json({ version: index.version, images: Object.fromEntries(matching) });
  },

  'GET /api/sprites/get': ({ data, url }) => {
    const name = url.searchParams.get('name') ?? '';
    const dir = `${dirs.characters}/${name}`;
    return json(
      images(data, dir).map((file) => {
        const base = file.replace(/\.[^.]+$/, '').toLowerCase();
        return {
          label: /^(.+?)(?:[-\\.].*?)?$/.exec(base)?.[1] ?? base,
          path: `/characters/${encodeURIComponent(name)}/${encodeURIComponent(file)}`,
        };
      }),
    );
  },

  'POST /api/groups/all': ({ data }) =>
    json(
      data
        .files(dirs.groups)
        .filter((file) => file.endsWith('.json'))
        .map((file) => JSON.parse(data.readText(`${dirs.groups}/${file}`) ?? '{}') as unknown),
    ),

  'POST /api/sd/comfy/workflows': ({ data }) =>
    json(
      data
        .files(dirs.comfyWorkflows)
        .filter((file) => file.endsWith('.json'))
        .toSorted(byName),
    ),
};

function images(data: DataDirectory, dir: string): string[] {
  return data.files(dir).filter(isImage).toSorted(byName);
}

function readMetadataIndex(data: DataDirectory): MetadataIndex {
  const content = data.readText(IMAGE_METADATA);
  return content ? (JSON.parse(content) as MetadataIndex) : { version: 1, images: {}, folders: [] };
}
