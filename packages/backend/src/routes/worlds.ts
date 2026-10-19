import type { Routes } from '../backend';
import { empty, json, text } from '../http';
import { dirs, sanitize } from '../paths';

export const worldRoutes: Routes = {
  // A missing lorebook reads as an empty one (worldinfo.js readWorldInfoFile with allowDummy).
  'POST /api/worldinfo/get': (request) => {
    const name = text(request.json(), 'name');
    if (!name) return empty(400);
    const content = request.data.readText(`${dirs.worlds}/${sanitize(`${name}.json`)}`);
    return content ? json(JSON.parse(content)) : json({ entries: {} });
  },
};
