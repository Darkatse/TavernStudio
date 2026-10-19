import type { Routes } from '../backend';
import { empty, json } from '../http';

export const systemRoutes: Routes = {
  'GET /csrf-token': () => json({ token: 'tavern-studio' }),

  // The frontend reads the version from the second `:` field of `agent`.
  'GET /version': ({ vendor }) =>
    json({
      agent: `SillyTavern:${vendor.version}:TavernStudio`,
      pkgVersion: vendor.version,
      gitRevision: null,
      gitBranch: null,
      commitDate: null,
      isLatest: true,
    }),

  'POST /api/ping': () => empty(204),

  // Studio never hands provider keys to the vendor page.
  'POST /api/secrets/read': () => json({}),
};
