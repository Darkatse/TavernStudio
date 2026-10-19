// Builds the knowledge pack (docs/Knowledge.md §3).
//
// Each source declared in sources.mjs becomes one directory, out/<id>/: its
// files at a pinned commit, at their paths in the repository, with the
// upstream LICENSE at the root, and source.json naming the repository, ref,
// license, attribution and policy that cover every file there. Studio
// publishes out/ at /_studio/knowledge/ (apps/studio/build/published.ts),
// where each directory's index.json lists its files' sizes and SHA-256.
//
// Files come from jsDelivr, each checked against the SHA-256 jsDelivr lists
// for it, and are cached in .work/. The TauriTavern docs follow the TT vendor
// image instead: they are read from a TauriTavern checkout at the image's
// commit, as vendors/tt/build.mjs reads it, since that commit need not be on
// GitHub.
//
// Usage: node knowledge/build.mjs [<id>...] [--tt-checkout <dir>]
// Without ids every source is built. A source's directory is replaced whole,
// or left as it was when anything fails or nothing changed.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { OUT as VENDOR_IMAGES } from '../vendors/lib/image.mjs';
import { SOURCES } from './sources.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
/** Downloads, kept between builds, and each directory while it is assembled. */
const WORK = path.join(ROOT, '.work');
const OUT = path.join(ROOT, 'out');

/**
 * What a line of each license's text begins with, by SPDX id: its title, or
 * for MIT, whose text has none, the opening of its grant.
 */
const LICENSE_MARKS = {
  'AGPL-3.0': 'GNU AFFERO GENERAL PUBLIC LICENSE',
  MIT: 'Permission is hereby granted, free of charge, to any person',
  'PolyForm-Noncommercial-1.0.0': '# PolyForm Noncommercial License 1.0.0',
};
/** Written beside a source's files, by this build and by Studio's publishing. */
const RESERVED = ['source.json', 'index.json'];
const DOWNLOADS_AT_ONCE = 6;
const utf8 = new TextDecoder('utf-8', { fatal: true });

const { values: options, positionals: ids } = parseArgs({
  allowPositionals: true,
  options: { 'tt-checkout': { type: 'string' } },
});
for (const id of ids) {
  if (!SOURCES.some((source) => source.id === id)) {
    const known = SOURCES.map((source) => source.id).join(', ');
    throw new Error(`Unknown source ${id}; sources.mjs declares ${known}`);
  }
}
const selected = ids.length === 0 ? SOURCES : SOURCES.filter((source) => ids.includes(source.id));
if (selected.some((source) => source.vendorImage) && !options['tt-checkout']) {
  throw new Error('Source tt is read from a TauriTavern checkout: pass --tt-checkout <dir>');
}

for (const source of selected) {
  const { files, provenance } = await collect(source);
  const output = new Map(files).set(
    'source.json',
    Buffer.from(`${JSON.stringify(provenance, null, 2)}\n`),
  );
  const done = (await replaceOutput(source.id, output)) ? 'Built' : 'Up to date:';
  console.log(`${done} knowledge/out/${source.id}, ${files.size} files at ${provenance.ref}`);
}

/** A source's files by path, checked, and the source.json that covers them. */
async function collect(source) {
  if (!['verbatim', 'link'].includes(source.policy)) {
    throw new Error(`${source.id}: unknown policy ${source.policy}`);
  }
  const provenance = (ref, refName, licenseEvidence) => ({
    repository: `https://github.com/${source.repository}`,
    ref,
    refName,
    license: source.license,
    ...(licenseEvidence && { licenseEvidence }),
    attribution: source.attribution,
    policy: source.policy,
  });

  if (source.policy === 'link') {
    const summary = await fs.readFile(path.join(ROOT, source.summary));
    decode(source.id, 'summary.md', summary);
    return {
      files: new Map([['summary.md', summary]]),
      provenance: provenance(source.ref, source.refName),
    };
  }

  const origin = source.vendorImage
    ? ttImage(options['tt-checkout'])
    : { refName: source.refName, ...jsDelivr(source.repository, source.ref) };
  const files = new Map();
  await eachLimited(select(source, origin.ref, await origin.paths()), async (file) => {
    const bytes = await origin.read(file);
    decode(source.id, file, bytes);
    files.set(file, bytes);
  });
  for (const name of RESERVED) {
    if (files.has(name)) {
      throw new Error(`${source.id}: the repository's ${name} would be replaced`);
    }
  }

  let evidence;
  if (source.licenseFrom) {
    const owner = SOURCES.find((other) => other.id === source.licenseFrom);
    if (!owner?.ref) throw new Error(`${source.id}: licenseFrom names no pinned source`);
    if (files.has('LICENSE')) {
      throw new Error(`${source.id}: has a LICENSE of its own, yet takes ${owner.id}'s`);
    }
    files.set('LICENSE', await jsDelivr(owner.repository, owner.ref).read('LICENSE'));
    const { path: file, text } = source.licenseEvidence;
    if (!decode(source.id, file, await origin.read(file)).includes(text)) {
      throw new Error(
        `${source.id}: ${file} at ${origin.ref} does not say "${text}"; check its license before pinning this ref`,
      );
    }
    evidence = `The repository has no LICENSE; ${file} at this ref says "${text}". LICENSE here is the text of https://github.com/${owner.repository} at ${owner.ref}.`;
  }
  checkLicense(source, origin.ref, files.get('LICENSE'));
  return { files, provenance: provenance(origin.ref, origin.refName, evidence) };
}

/**
 * Fails unless the LICENSE is the declared license's text, known by its mark:
 * a source relicensed at some commit is refused at the commits before it.
 */
function checkLicense(source, ref, bytes) {
  const mark = LICENSE_MARKS[source.license];
  if (!mark) throw new Error(`${source.id}: no mark known for license ${source.license}`);
  if (!bytes) {
    throw new Error(`${source.id}: no LICENSE at the root; include it, or name licenseFrom`);
  }
  const lines = decode(source.id, 'LICENSE', bytes)
    .split('\n')
    .map((line) => line.trim());
  if (!lines.some((line) => line.startsWith(mark))) {
    const found = lines.find((line) => line !== '');
    throw new Error(
      `${source.id}: LICENSE at ${ref} begins "${found}" and has no line beginning "${mark}" (${source.license}); check its license before pinning this ref`,
    );
  }
}

/** The paths a source selects; every include pattern must match a file. */
function select(source, ref, paths) {
  const include = source.include.map(globRegExp);
  const exclude = (source.exclude ?? []).map(globRegExp);
  for (const [index, pattern] of include.entries()) {
    if (!paths.some((file) => pattern.test(file))) {
      throw new Error(`${source.id}: ${source.include[index]} matches no file at ${ref}`);
    }
  }
  return paths
    .filter((file) => include.some((p) => p.test(file)) && !exclude.some((p) => p.test(file)))
    .toSorted();
}

/**
 * A glob as a RegExp, the same on every platform: `**` stands for any number
 * of directories, `*` for any part of one name. Neither matches a name that
 * starts with a dot unless the pattern spells the dot, so `**\/*.md` leaves
 * out `.github/`.
 */
function globRegExp(glob) {
  const parts = glob.split('/');
  const source = parts.map((part, index) => {
    const last = index === parts.length - 1;
    if (part === '**') return last ? '[^./][^/]*(?:/[^./][^/]*)*' : '(?:[^./][^/]*/)*';
    const name = part.replace(/[.+?^$()|[\]{}\\]/g, '\\$&').replaceAll('*', '[^/]*');
    return `${part.startsWith('*') ? '(?!\\.)' : ''}${name}${last ? '' : '/'}`;
  });
  return new RegExp(`^${source.join('')}$`);
}

/** A file's text; the Agent reads only text, so anything else stops the build. */
function decode(id, file, bytes) {
  try {
    return utf8.decode(bytes);
  } catch {
    throw new Error(`${id}: ${file} is not UTF-8 text; exclude it in knowledge/sources.mjs`);
  }
}

/** A GitHub repository at a commit, through jsDelivr, cached in .work/. */
function jsDelivr(repository, ref) {
  const cache = path.join(WORK, ...repository.split('/'), ref);
  let listing;
  const hashes = () => (listing ??= loadListing());

  /** The repository's files, by path, with their SHA-256 in base64. */
  async function loadListing() {
    const url = `https://data.jsdelivr.com/v1/packages/gh/${repository}@${ref}?structure=flat`;
    const file = path.join(cache, 'listing.json');
    const cached = existsSync(file);
    const text = cached ? await fs.readFile(file, 'utf8') : (await download(url)).toString('utf8');
    const { files } = JSON.parse(text);
    if (!Array.isArray(files)) throw new Error(`${url} lists no files`);
    if (!cached) {
      await fs.mkdir(cache, { recursive: true });
      await fs.writeFile(file, text);
    }
    return new Map(files.map(({ name, hash }) => [name.replace(/^\//, ''), hash]));
  }

  return {
    ref,
    async paths() {
      return [...(await hashes()).keys()];
    },
    async read(file) {
      const expected = (await hashes()).get(file);
      if (expected === undefined) throw new Error(`${repository}@${ref} has no ${file}`);
      const cached = path.join(cache, 'files', ...file.split('/'));
      // A download cut short fails the check and is fetched again.
      if (existsSync(cached)) {
        const bytes = await fs.readFile(cached);
        if (sha256(bytes) === expected) return bytes;
      }
      const url = `https://cdn.jsdelivr.net/gh/${repository}@${ref}/${file.split('/').map(encodeURIComponent).join('/')}`;
      const bytes = await download(url);
      if (sha256(bytes) !== expected) {
        throw new Error(`${url} does not match the SHA-256 jsDelivr lists for it`);
      }
      await fs.mkdir(path.dirname(cached), { recursive: true });
      await fs.writeFile(cached, bytes);
      return bytes;
    },
  };
}

/**
 * TauriTavern at the commit of the one TT vendor image, read from a
 * checkout. Git checks its own objects, so there is no listing to check
 * against; the bytes are the repository's, as GitHub serves them.
 */
function ttImage(checkout) {
  const git = (args, encoding) =>
    execFileSync('git', ['-C', checkout, ...args], { encoding, maxBuffer: 256 * 1024 * 1024 });
  const images = readJson(
    path.join(VENDOR_IMAGES, 'index.json'),
    'the vendor images (build one with `pnpm vendor:tt <checkout> <commit>`)',
  ).filter((image) => image.kind === 'tt');
  if (images.length !== 1) {
    throw new Error(
      `knowledge/tt follows the TauriTavern vendor image, so exactly one must be built; found ${images.map((image) => image.id).join(', ') || 'none'}`,
    );
  }
  const [{ id }] = images;
  const { source } = readJson(path.join(VENDOR_IMAGES, `${id}.json`), `vendor image ${id}`);
  const commit = /^git:([0-9a-f]+)$/.exec(source)?.[1];
  if (!commit) throw new Error(`Vendor image ${id} was not built from a commit: ${source}`);
  const ref = git(['rev-parse', '--verify', `${commit}^{commit}`], 'utf8').trim();
  return {
    ref,
    refName: id,
    async paths() {
      return git(['ls-tree', '-r', '-z', '--name-only', ref], 'utf8').split('\0').filter(Boolean);
    },
    async read(file) {
      return git(['cat-file', 'blob', `${ref}:${file}`]);
    },
  };
}

/**
 * Writes a source's directory aside, then swaps it in for the old one, unless
 * the old one holds exactly these files. Resolves to whether it was replaced.
 */
async function replaceOutput(id, files) {
  const target = path.join(OUT, id);
  if (await holds(target, files)) return false;
  const staging = path.join(WORK, 'staging', id);
  const previous = path.join(WORK, 'staging', `${id}.previous`);
  await fs.rm(staging, { recursive: true, force: true });
  await fs.rm(previous, { recursive: true, force: true });
  for (const [file, bytes] of files) {
    const written = path.join(staging, ...file.split('/'));
    await fs.mkdir(path.dirname(written), { recursive: true });
    await fs.writeFile(written, bytes);
  }

  await fs.mkdir(OUT, { recursive: true });
  if (existsSync(target)) {
    try {
      await fs.rename(target, previous);
    } catch (error) {
      throw new Error(
        `Could not move knowledge/out/${id} aside (${error.code}); it is left as it was, and the new one is in .work/staging/${id}. On Windows a running dev server holds the directories it publishes: stop it, and run again.`,
        { cause: error },
      );
    }
  }
  await fs.rename(staging, target);
  await fs.rm(previous, { recursive: true, force: true });
  return true;
}

/** Whether a directory holds exactly these files, byte for byte. */
async function holds(directory, files) {
  if (!existsSync(directory)) return false;
  const present = (await fs.readdir(directory, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(directory, path.join(entry.parentPath, entry.name)));
  if (present.length !== files.size) return false;
  for (const file of present) {
    const bytes = files.get(file.split(path.sep).join('/'));
    if (!bytes?.equals(await fs.readFile(path.join(directory, file)))) return false;
  }
  return true;
}

async function download(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not download ${url}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('base64');
}

function readJson(file, what) {
  if (!existsSync(file)) throw new Error(`No ${what}: ${file} does not exist`);
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** Runs `task` on each item, a few at a time. */
async function eachLimited(items, task) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: DOWNLOADS_AT_ONCE }, async () => {
      for (let item = queue.shift(); item !== undefined; item = queue.shift()) await task(item);
    }),
  );
}
