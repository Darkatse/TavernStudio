import path from 'node:path';
import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginPublished } from './build/published';

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
      plugins: [
        pluginReact({ reactCompiler: true }),
        pluginPublished(path.join(repo, 'fixtures'), 'fixtures'),
        pluginPublished(path.join(repo, 'templates'), 'templates'),
      ],
      source: { entry: { index: './src/main.tsx' } },
      // Dev tooling lives under `/__` and hot updates under `/_studio/`, the
      // paths the Preview SW leaves to the dev server.
      dev: { lazyCompilation: { entries: false, imports: true, prefix: '/__rspack/lazy' } },
      tools: {
        rspack: {
          output: {
            hotUpdateMainFilename: `${assets}/hot/[runtime].[fullhash].hot-update.json`,
            hotUpdateChunkFilename: `${assets}/hot/[id].[fullhash].hot-update.js`,
          },
          // pi-ai probes for credential files through a variable `import()` of
          // node:fs; in a browser it fails and pi-ai catches it.
          ignoreWarnings: [
            { module: /pi-ai[\\/]dist[\\/]auth[\\/]context\.js$/, message: /Critical dependency/ },
          ],
        },
      },
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
    // Installs TauriTavern's Web Host in a TT vendor page. It must be an ES
    // module with a static import of the vendor's own install.js, so that it
    // runs, with the host ready, before TT's init.js (docs/Vendors.md §3).
    'web-host': {
      source: { entry: { 'web-host': '@tavern-studio/preview/web-host' } },
      output: {
        module: true,
        filenameHash: false,
        distPath: { js: assets },
        externals: { '/tauri/web-host/install.js': 'module /tauri/web-host/install.js' },
      },
      splitChunks: false,
      tools: { htmlPlugin: false },
      dev: { hmr: false, liveReload: false },
    },
  },
});
