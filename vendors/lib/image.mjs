import { execFileSync, execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const vendorsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const WORK = path.join(vendorsDir, '.work');
/** Served as /__vendor/ by Studio's dev server. */
export const OUT = path.join(vendorsDir, 'out', '__vendor');
/** The TauriTavern release Studio is pinned to. */
export const TT_RELEASE = path.join(vendorsDir, 'tt', 'release.json');

const ANCHOR = '<base href="/">';

export function run(command, args, cwd) {
  execFileSync(command, args, { cwd, stdio: 'inherit' });
}

/**
 * npm and pnpm are shell scripts on Windows, so they go through the shell.
 * Callers pass only fixed words and validated values.
 */
export function shell(command, cwd) {
  execSync(command, { cwd, stdio: 'inherit' });
}

/** The injected scripts have to run before any vendor script. */
export async function injectAfterBase(image, scripts) {
  const indexPath = path.join(image, 'index.html');
  const html = await fs.readFile(indexPath, 'utf8');
  const anchors = html.split(ANCHOR).length - 1;
  if (anchors !== 1) {
    throw new Error(`Expected ${ANCHOR} exactly once in index.html, found ${anchors}`);
  }
  const injected = scripts.map((script) => `\n    ${script}`).join('');
  await fs.writeFile(indexPath, html.replace(ANCHOR, `${ANCHOR}${injected}`));
}

export async function describe(image, identity) {
  const files = {};
  for (const file of (await listFiles(image)).toSorted()) {
    const bytes = await fs.readFile(path.join(image, file));
    files[file] = createHash('sha256').update(bytes).digest('hex');
  }
  const extensions = Object.keys(files)
    .map((file) => /^scripts\/extensions\/([^/]+)\/manifest\.json$/.exec(file)?.[1])
    .filter(Boolean);
  const metadata = { ...identity, extensions, files };
  await fs.writeFile(
    path.join(OUT, `${identity.id}.json`),
    `${JSON.stringify(metadata, null, 2)}\n`,
  );
  return metadata;
}

export async function writeIndex() {
  const images = [];
  for (const file of (await fs.readdir(OUT)).toSorted()) {
    if (!file.endsWith('.json') || file === 'index.json') continue;
    const built = JSON.parse(await fs.readFile(path.join(OUT, file), 'utf8'));
    images.push({ id: built.id, kind: built.kind, version: built.version, label: built.label });
  }
  await fs.writeFile(path.join(OUT, 'index.json'), `${JSON.stringify(images, null, 2)}\n`);
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
