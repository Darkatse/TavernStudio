import type { Routes } from '../backend';
import { empty, json, plain, text } from '../http';
import { dirs, sanitize } from '../paths';

const worldPath = (name: string) => `${dirs.worlds}/${sanitize(`${name}.json`)}`;

export const worldRoutes: Routes = {
  // A missing lorebook reads as an empty one (worldinfo.js readWorldInfoFile with allowDummy).
  'POST /api/worldinfo/get': (request) => {
    const name = text(request.json(), 'name');
    if (!name) return empty(400);
    const content = request.data.readText(worldPath(name));
    return content ? json(JSON.parse(content)) : json({ entries: {} });
  },

  'POST /api/worldinfo/edit': (request) => {
    const body = request.json() as { data?: unknown };
    const name = text(body, 'name');
    if (!name) return plain('World file must have a name', 400);
    if (typeof body.data !== 'object' || body.data === null || !('entries' in body.data)) {
      return plain('Is not a valid world info file', 400);
    }
    request.data.write(worldPath(name), JSON.stringify(body.data, null, 4));
    return json({ ok: true });
  },
};
