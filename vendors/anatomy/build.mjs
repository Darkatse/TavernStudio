import fs from 'node:fs/promises';
import path from 'node:path';
import { writeAnatomy } from '../lib/anatomy.mjs';
import { OUT } from '../lib/image.mjs';

const built = JSON.parse(await fs.readFile(path.join(OUT, 'index.json'), 'utf8')).map(
  (image) => image.id,
);
const ids = process.argv.slice(2);
for (const id of ids.length ? ids : built) {
  if (!built.includes(id)) throw new Error(`${id} is not a built image: ${built.join(', ')}`);
  await writeAnatomy(path.join(OUT, id), id);
}
