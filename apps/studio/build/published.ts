import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { RsbuildPlugin } from '@rsbuild/core';

/**
 * Serves every directory under `root` (fixtures/, templates/) at
 * /_studio/<base>/<name>/, plus an index.json listing each file with its size
 * and SHA-256. Studio loads such a directory through its index; for a fixture
 * the hash is the file's identity in a Snapshot.
 */
export function pluginPublished(root: string, base: string): RsbuildPlugin {
  return {
    name: `tavern-studio:published:${base}`,
    setup(api) {
      api.processAssets(
        { stage: 'additional', environments: ['studio'] },
        ({ compilation, sources }) => {
          // The directory for added and removed files, each file for its content.
          compilation.contextDependencies.add(root);
          for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue;
            const dir = path.join(root, entry.name);
            const files: Record<string, { size: number; sha256: string }> = {};
            for (const file of walk(dir)) {
              const full = path.join(dir, file);
              compilation.fileDependencies.add(full);
              const bytes = fs.readFileSync(full);
              files[file] = {
                size: bytes.length,
                sha256: createHash('sha256').update(bytes).digest('hex'),
              };
              compilation.emitAsset(
                `_studio/${base}/${entry.name}/${file}`,
                new sources.RawSource(bytes),
              );
            }
            compilation.emitAsset(
              `_studio/${base}/${entry.name}/index.json`,
              new sources.RawSource(JSON.stringify({ files })),
            );
          }
        },
      );
    },
  };
}

function walk(dir: string, base = dir): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full, base);
    return [path.relative(base, full).split(path.sep).join('/')];
  });
}
