// Builds a SillyTavern vendor image (docs/Vendors.md §1).
//
// The image is the npm release's public/ directory, with two changes:
// - /lib.js is prebuilt by ST's own webpack setup (docker/build-lib.js), with
//   dependencies pinned by the upstream lockfile of the same tag;
// - Attach is injected once into index.html, right after <base href="/">.
//
// Usage: node vendors/st/build.mjs <version>
// Output: vendors/out/__vendor/st@<version>/ and st@<version>.json; index.json
// lists every built image. Downloads and installs are cached in vendors/.work/.

import { execFileSync, execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ANCHOR = '<base href="/">';
const ATTACH = '<script src="/_studio/attach.js"></script>';

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error('Usage: node vendors/st/build.mjs <version>, for example 1.19.0');
}

const id = `st@${version}`;
const vendorsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const work = path.join(vendorsDir, '.work', id);
const pkg = path.join(work, 'package');
const out = path.join(vendorsDir, 'out', '__vendor');
const image = path.join(out, id);

function run(command, args, cwd) {
  execFileSync(command, args, { cwd, stdio: 'inherit' });
}

// npm is a shell script on Windows, so it goes through the shell. Every
// argument here is a fixed word or the validated version.
function npm(args, cwd) {
  execSync(`npm ${args.join(' ')}`, { cwd, stdio: 'inherit' });
}

async function fetchRelease() {
  if (existsSync(path.join(pkg, 'package.json'))) return;
  await fs.mkdir(work, { recursive: true });
  npm(['pack', `sillytavern@${version}`, '--pack-destination', '.'], work);
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
      npm(['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], pkg);
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

  const indexPath = path.join(image, 'index.html');
  const html = await fs.readFile(indexPath, 'utf8');
  const anchors = html.split(ANCHOR).length - 1;
  if (anchors !== 1)
    throw new Error(`Expected ${ANCHOR} exactly once in index.html, found ${anchors}`);
  await fs.writeFile(indexPath, html.replace(ANCHOR, `${ANCHOR}\n    ${ATTACH}`));
}

async function listFiles(dir, base = dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? listFiles(full, base) : [path.relative(base, full)];
    }),
  );
  return files.flat().map((file) => file.split(path.sep).join('/'));
}

async function describe() {
  const files = {};
  for (const file of (await listFiles(image)).toSorted()) {
    const bytes = await fs.readFile(path.join(image, file));
    files[file] = createHash('sha256').update(bytes).digest('hex');
  }
  const extensions = Object.keys(files)
    .map((file) => /^scripts\/extensions\/([^/]+)\/manifest\.json$/.exec(file)?.[1])
    .filter(Boolean);

  const metadata = {
    id,
    kind: 'st',
    version,
    label: `SillyTavern ${version}`,
    source: `npm:sillytavern@${version}`,
    extensions,
    files,
  };
  await fs.writeFile(path.join(out, `${id}.json`), `${JSON.stringify(metadata, null, 2)}\n`);
  return metadata;
}

async function writeIndex() {
  const images = [];
  for (const file of (await fs.readdir(out)).toSorted()) {
    if (!file.endsWith('.json') || file === 'index.json') continue;
    const built = JSON.parse(await fs.readFile(path.join(out, file), 'utf8'));
    images.push({ id: built.id, kind: built.kind, version: built.version, label: built.label });
  }
  await fs.writeFile(path.join(out, 'index.json'), `${JSON.stringify(images, null, 2)}\n`);
}

await fetchRelease();
const libraryDir = await buildLibrary();
await assemble(libraryDir);
const metadata = await describe();
await writeIndex();
console.log(
  `Built ${id}: ${Object.keys(metadata.files).length} files, ${metadata.extensions.length} built-in extensions`,
);
