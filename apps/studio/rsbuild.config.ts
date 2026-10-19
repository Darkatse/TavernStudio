import path from 'node:path';
import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginFixtures } from './build/fixtures';

// Studio serves only `/`; everything else it ships lives under `/_studio/`, so
// vendor and data paths stay free for the preview (docs/Architecture.md §4).
const assets = '_studio';
const repo = path.resolve(import.meta.dirname, '../..');

export default defineConfig({
  server: {
    // Vendor and data paths must 404 for real, never fall back to the shell.
    htmlFallback: false,
    // The Preview SW lives under /_studio/ but controls the whole origin.
    headers: { 'Service-Worker-Allowed': '/' },
    // Vendor images are built by `pnpm vendor:st`; deployment ships them separately.
    publicDir: { name: path.join(repo, 'vendors/out'), copyOnBuild: false },
  },
  output: {
    distPath: {
      js: `${assets}/js`,
      jsAsync: `${assets}/js/async`,
      css: `${assets}/css`,
      cssAsync: `${assets}/css/async`,
      svg: `${assets}/svg`,
      font: `${assets}/font`,
      wasm: `${assets}/wasm`,
      image: `${assets}/image`,
      media: `${assets}/media`,
      assets: `${assets}/assets`,
      favicon: assets,
    },
  },
  environments: {
    studio: {
      plugins: [pluginReact({ reactCompiler: true }), pluginFixtures(path.join(repo, 'fixtures'))],
      source: { entry: { index: './src/main.tsx' } },
      html: {
        template: './src/index.html',
        title: 'Tavern Studio',
        favicon: './src/brand/favicon.svg',
        meta: { 'color-scheme': 'light dark' },
      },
    },
    // Scripts that run in the preview: Attach (a classic script, the first in
    // every vendor page) and the Preview SW. Fixed names, one file each, and
    // no dev client: they must not touch the vendor page.
    preview: {
      source: {
        entry: {
          attach: '@tavern-studio/preview/attach',
          'preview-sw': '@tavern-studio/preview/sw',
        },
      },
      output: { filenameHash: false, distPath: { js: assets } },
      splitChunks: false,
      tools: { htmlPlugin: false },
      dev: { hmr: false, liveReload: false },
    },
  },
});
