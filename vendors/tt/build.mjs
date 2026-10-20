// A local checkout is only read: the commit is exported with `git archive`
// and built apart from it.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { writeAnatomy } from '../lib/anatomy.mjs';
import {
  describe,
  injectAfterBase,
  OUT,
  run,
  shell,
  TT_RELEASE,
  WORK,
  writeIndex,
} from '../lib/image.mjs';

/** What `pnpm web:build` needs from the repository. */
const SOURCES = [
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'rspack.config.js',
  'src',
  'packages',
];

const args = process.argv.slice(2);
if (args.length !== 0 && args.length !== 2) {
  throw new Error('Usage: node vendors/tt/build.mjs [<checkout> <commit>]');
}
const frontend = args.length === 0 ? await fromRelease() : await fromCheckout(args[0], args[1]);
const id = imageId(frontend.version, frontend.commit);
const image = path.join(OUT, id);

await fs.rm(image, { recursive: true, force: true });
await frontend.copyTo(image);
await injectAfterBase(image, [
  '<script src="/_studio/attach.js"></script>',
  '<script type="module" src="/_studio/web-host.js"></script>',
]);
await writeAnatomy(image, id);
const metadata = await describe(image, {
  id,
  kind: 'tt',
  version: frontend.version,
  label: `TauriTavern ${frontend.version}`,
  commit: frontend.commit,
  source: frontend.source,
});
await writeIndex();
console.log(
  `Built ${id} from ${frontend.source}: ${Object.keys(metadata.files).length} files, ${metadata.extensions.length} built-in extensions`,
);

async function fromRelease() {
  const release = JSON.parse(await fs.readFile(TT_RELEASE, 'utf8'));
  for (const [field, pattern] of [
    ['url', /^https:\/\//],
    ['sha256', /^[0-9a-f]{64}$/],
    ['commit', /^[0-9a-f]{40}$/],
    ['version', /^\d+\.\d+\.\d+$/],
  ]) {
    if (!pattern.test(release[field] ?? '')) {
      throw new Error(`${TT_RELEASE}: "${field}" should match ${pattern}, found ${release[field]}`);
    }
  }
  const files = unzipSync(await download(release.url, release.sha256));
  return {
    version: release.version,
    commit: release.commit,
    source: release.url,
    async copyTo(dir) {
      const root = path.resolve(dir);
      for (const [name, bytes] of Object.entries(files)) {
        if (name.endsWith('/')) continue;
        const target = path.resolve(root, name);
        if (!target.startsWith(root + path.sep)) {
          throw new Error(`The archive's entry ${name} lies outside it`);
        }
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, bytes);
      }
    },
  };
}

async function download(url, sha256) {
  const cached = path.join(WORK, 'downloads', `${sha256}.zip`);
  if (existsSync(cached)) {
    const bytes = await fs.readFile(cached);
    if (digest(bytes) === sha256) return bytes;
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const actual = digest(bytes);
  if (actual !== sha256) throw new Error(`${url} has SHA-256 ${actual}, expected ${sha256}`);
  await fs.mkdir(path.dirname(cached), { recursive: true });
  await fs.writeFile(cached, bytes);
  return bytes;
}

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function imageId(version, commit) {
  return `tt-${version}-${commit.slice(0, 8)}`;
}

async function fromCheckout(checkout, ref) {
  const git = (...gitArgs) =>
    execFileSync('git', ['-C', checkout, ...gitArgs], { encoding: 'utf8' }).trim();
  const commit = git('rev-parse', '--verify', `${ref}^{commit}`);
  const { version } = JSON.parse(git('show', `${commit}:package.json`));
  const work = path.join(WORK, imageId(version, commit));
  const source = path.join(work, 'source');

  if (!existsSync(path.join(source, 'package.json'))) {
    await fs.mkdir(source, { recursive: true });
    const archive = path.join(work, 'source.tar');
    run('git', ['-C', checkout, 'archive', '--format=tar', '-o', archive, commit, ...SOURCES]);
    run('tar', ['-xf', archive, '-C', source]);
  }
  if (!existsSync(path.join(source, 'node_modules'))) {
    shell('pnpm install --frozen-lockfile --ignore-scripts', source);
  }
  if (!existsSync(path.join(source, 'src', 'dist'))) shell('pnpm web:build', source);

  return {
    version,
    commit,
    source: `git:${commit}`,
    copyTo: (dir) => fs.cp(path.join(source, 'src'), dir, { recursive: true }),
  };
}
