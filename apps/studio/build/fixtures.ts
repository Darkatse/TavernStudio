import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { RsbuildPlugin } from '@rsbuild/core';

/**
 * Serves every fixture under fixtures/ at /_studio/fixtures/<name>/, plus an
 * index.json listing each file with its size and SHA-256. Studio loads a
 * fixture through the index; the hash is the file's identity in a Snapshot.
 */
export function pluginFixtures(root: string): RsbuildPlugin {
  return {
    name: 'tavern-studio:fixtures',
    setup(api) {
      api.processAssets(
        { stage: 'additional', environments: ['studio'] },
        ({ compilation, sources }) => {
          compilation.contextDependencies.add(root);
          for (const fixture of fs.readdirSync(root, { withFileTypes: true })) {
            if (!fixture.isDirectory()) continue;
            const dir = path.join(root, fixture.name);
            const files: Record<string, { size: number; sha256: string }> = {};
            for (const file of walk(dir)) {
              const bytes = fs.readFileSync(path.join(dir, file));
              files[file] = {
                size: bytes.length,
                sha256: createHash('sha256').update(bytes).digest('hex'),
              };
              compilation.emitAsset(
                `_studio/fixtures/${fixture.name}/${file}`,
                new sources.RawSource(bytes),
              );
            }
            compilation.emitAsset(
              `_studio/fixtures/${fixture.name}/index.json`,
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
