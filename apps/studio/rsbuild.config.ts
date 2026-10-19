import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';

// Studio serves only `/`; everything else it ships lives under `/_studio/`, so
// vendor and data paths stay free for the preview (docs/Architecture.md §4).
const assets = '_studio';

export default defineConfig({
  plugins: [pluginReact({ reactCompiler: true })],
  source: {
    entry: { index: './src/main.tsx' },
  },
  html: {
    template: './src/index.html',
    title: 'Tavern Studio',
    favicon: './src/brand/favicon.svg',
    meta: { 'color-scheme': 'light dark' },
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
});
