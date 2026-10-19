import path from 'node:path';
import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginPublished } from './build/published';

// Studio serves only `/`; everything else it ships lives under `/_studio/`, so
// vendor and data paths stay free for the preview.
const assets = '_studio';
const repo = path.resolve(import.meta.dirname, '../..');

export default defineConfig({
  server: {
    // Vendor and data paths must 404 for real, never fall back to the shell.
    htmlFallback: false,
    // The Preview SW lives under /_studio/ but controls the whole origin.
    headers: { 'Service-Worker-Allowed': '/' },
    // Deployment ships the vendor images separately.
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
        pluginPublished(path.join(repo, 'skills'), 'skills'),
        // A build without knowledge/out/, such as CI's, ships no pack, and the
        // Agent's knowledge/ says how to build one.
        pluginPublished(path.join(repo, 'knowledge/out'), 'knowledge'),
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
          // pi-ai reaches Node built-ins through a variable `import()`, on
          // purpose, so that bundlers leave them alone; it only runs them under
          // Node, or catches their failure.
          ignoreWarnings: [
            { module: /@earendil-works[\\/]pi-ai[\\/]dist[\\/]/, message: /Critical dependency/ },
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
    // web-host's static import of the vendor's own install.js runs it, with
    // the host ready, before TauriTavern's init.js.
    'page-modules': {
      source: {
        entry: {
          'web-host': '@tavern-studio/preview/web-host',
          capture: '@tavern-studio/preview/capture',
        },
      },
      output: {
        module: true,
        filenameHash: false,
        distPath: { js: assets },
        externals: { '/tauri/web-host/install.js': 'module /tauri/web-host/install.js' },
      },
      splitChunks: false,
      // Entries keep their exports, so a page can import what a module offers.
      tools: { htmlPlugin: false, rspack: { output: { library: { type: 'module' } } } },
      dev: { hmr: false, liveReload: false },
    },
  },
});
