// Regenerates the anatomy of built vendor images (docs/Knowledge.md §1)
// without rebuilding them. The image builds write it the same way.
//
// Usage: node vendors/anatomy/build.mjs [<id> ...], for example tt@2.3.0+39b053b0;
// every image listed in index.json when no id is given.
// Output: vendors/out/__vendor/anatomy/<id>/.

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
