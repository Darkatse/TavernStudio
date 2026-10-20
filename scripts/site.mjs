import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OUT as VENDOR_IMAGES } from '../vendors/lib/image.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const studio = path.join(repo, 'apps/studio/dist');
const site = path.join(repo, 'site');

const IMMUTABLE = 'Cache-Control: public, max-age=31536000, immutable';

for (const [file, what] of [
  [path.join(studio, 'index.html'), 'Studio build (pnpm build)'],
  [path.join(studio, '_studio/knowledge'), 'knowledge pack (pnpm knowledge, before the build)'],
  [path.join(VENDOR_IMAGES, 'index.json'), 'vendor images (pnpm vendor:st, pnpm vendor:tt)'],
]) {
  if (!existsSync(file)) throw new Error(`The site needs the ${what}: ${file} is missing`);
}
const images = JSON.parse(await fs.readFile(path.join(VENDOR_IMAGES, 'index.json'), 'utf8'));
for (const kind of ['st', 'tt']) {
  if (!images.some((image) => image.kind === kind)) {
    throw new Error(`The site needs a ${kind} vendor image; ${VENDOR_IMAGES} has none`);
  }
}

await fs.rm(site, { recursive: true, force: true });
await fs.cp(studio, site, { recursive: true });
await fs.cp(VENDOR_IMAGES, path.join(site, '__vendor'), { recursive: true });

// Hashed names and an image's files never change under the same URL; the
// image's index.html, which Studio writes into, is revalidated by the Preview SW.
const rules = [
  ['/_studio/preview-sw.js', ['Service-Worker-Allowed: /']],
  ...['js', 'css', 'font'].map((folder) => [`/_studio/${folder}/*`, [IMMUTABLE]]),
  ...images.map((image) => [`/__vendor/${image.id}/*`, [IMMUTABLE]]),
];
await fs.writeFile(
  path.join(site, '_headers'),
  `${rules.map(([url, headers]) => [url, ...headers.map((header) => `  ${header}`)].join('\n')).join('\n\n')}\n`,
);
// Paths map to files exactly (html_handling "none"), so the shell needs its own route.
await fs.writeFile(path.join(site, '_redirects'), '/ /index.html 200\n');

console.log(`Assembled site/ with ${images.map((image) => image.id).join(', ')}`);
