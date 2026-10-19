// Builds a TauriTavern vendor image (docs/Vendors.md §1).
//
// Until TauriTavern publishes its web distribution (its plan T5), the image is
// built from a commit of a TauriTavern checkout. The checkout is only read:
// `git archive` exports the commit, its lockfile installs the dependencies,
// and its own `pnpm web:build` builds the bundles. The image is the exported
// src/, with two scripts injected once into index.html after <base href="/">:
// Attach, then the module that installs TauriTavern's Web Host.
//
// Usage: node vendors/tt/build.mjs <checkout> <commit>
// Output: vendors/out/__vendor/tt@<version>+<commit>/ and its .json, and its
// anatomy in anatomy/tt@<version>+<commit>/; index.json lists every built
// image. Exports and installs are cached in vendors/.work/.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { writeAnatomy } from '../lib/anatomy.mjs';
import { describe, injectAfterBase, OUT, run, shell, WORK, writeIndex } from '../lib/image.mjs';

/** What `pnpm web:build` needs from the repository. */
const SOURCES = [
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'rspack.config.js',
  'src',
  'packages',
];

const [checkout, ref] = process.argv.slice(2);
if (!checkout || !ref) {
  throw new Error('Usage: node vendors/tt/build.mjs <checkout> <commit>');
}
const git = (...args) =>
  execFileSync('git', ['-C', checkout, ...args], { encoding: 'utf8' }).trim();

const commit = git('rev-parse', '--verify', `${ref}^{commit}`).slice(0, 8);
const { version } = JSON.parse(git('show', `${commit}:package.json`));
const id = `tt@${version}+${commit}`;
const work = path.join(WORK, id);
const source = path.join(work, 'source');
const image = path.join(OUT, id);

async function exportCommit() {
  if (existsSync(path.join(source, 'package.json'))) return;
  await fs.mkdir(source, { recursive: true });
  const archive = path.join(work, 'source.tar');
  run('git', ['-C', checkout, 'archive', '--format=tar', '-o', archive, commit, ...SOURCES]);
  run('tar', ['-xf', archive, '-C', source]);
}

function buildBundles() {
  if (!existsSync(path.join(source, 'node_modules'))) {
    shell('pnpm install --frozen-lockfile --ignore-scripts', source);
  }
  if (!existsSync(path.join(source, 'src', 'dist'))) shell('pnpm web:build', source);
}

async function assemble() {
  await fs.rm(image, { recursive: true, force: true });
  await fs.cp(path.join(source, 'src'), image, { recursive: true });
  await injectAfterBase(image, [
    '<script src="/_studio/attach.js"></script>',
    '<script type="module" src="/_studio/web-host.js"></script>',
  ]);
}

await exportCommit();
buildBundles();
await assemble();
await writeAnatomy(image, id);
const metadata = await describe(image, {
  id,
  kind: 'tt',
  version,
  label: `TauriTavern ${version}`,
  source: `git:${commit}`,
});
await writeIndex();
console.log(
  `Built ${id}: ${Object.keys(metadata.files).length} files, ${metadata.extensions.length} built-in extensions`,
);
