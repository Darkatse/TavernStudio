import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { writeAnatomy } from '../lib/anatomy.mjs';
import { describe, injectAfterBase, OUT, run, shell, WORK, writeIndex } from '../lib/image.mjs';

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error('Usage: node vendors/st/build.mjs <version>, for example 1.19.0');
}

const id = `st@${version}`;
const work = path.join(WORK, id);
const pkg = path.join(work, 'package');
const image = path.join(OUT, id);

async function fetchRelease() {
  if (existsSync(path.join(pkg, 'package.json'))) return;
  await fs.mkdir(work, { recursive: true });
  shell(`npm pack sillytavern@${version} --pack-destination .`, work);
  run('tar', ['-xzf', `sillytavern-${version}.tgz`], work);

  // npm never publishes package-lock.json; take it from the release tag.
  const url = `https://raw.githubusercontent.com/SillyTavern/SillyTavern/${version}/package-lock.json`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Lockfile ${url}: HTTP ${response.status}`);
  const lockfile = await response.text();
  const lockVersion = JSON.parse(lockfile).version;
  if (lockVersion !== version)
    throw new Error(`Lockfile is for ${lockVersion}, expected ${version}`);
  await fs.writeFile(path.join(pkg, 'package-lock.json'), lockfile);
}

async function buildLibrary() {
  const dist = path.join(pkg, 'dist', '_webpack');
  if (!existsSync(dist)) {
    if (!existsSync(path.join(pkg, 'node_modules'))) {
      shell('npm ci --omit=dev --ignore-scripts --no-audit --no-fund', pkg);
    }
    run('node', ['docker/build-lib.js'], pkg);
  }
  const [cache] = await fs.readdir(dist);
  if (!cache) throw new Error(`No webpack output under ${dist}`);
  return path.join(dist, cache, 'output');
}

async function assemble(libraryDir) {
  await fs.rm(image, { recursive: true, force: true });
  await fs.cp(path.join(pkg, 'public'), image, { recursive: true });
  for (const file of await fs.readdir(libraryDir)) {
    await fs.copyFile(path.join(libraryDir, file), path.join(image, file));
  }
  await injectAfterBase(image, ['<script src="/_studio/attach.js"></script>']);
}

await fetchRelease();
await assemble(await buildLibrary());
await writeAnatomy(image, id);
const metadata = await describe(image, {
  id,
  kind: 'st',
  version,
  label: `SillyTavern ${version}`,
  source: `npm:sillytavern@${version}`,
});
await writeIndex();
console.log(
  `Built ${id}: ${Object.keys(metadata.files).length} files, ${metadata.extensions.length} built-in extensions`,
);
