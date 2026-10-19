import type { Routes } from '../backend';
import { empty, json, ok } from '../http';
import { USER } from '../paths';

/** stats.js keeps the user's stats in `stats.json` at the user's root. */
const STATS = `${USER}/stats.json`;

export const statsRoutes: Routes = {
  // A user without stats reads as none yet; SillyTavern adds entries as chats happen.
  'POST /api/stats/get': ({ data }) => json(JSON.parse(data.readText(STATS) ?? '{}')),

  'POST /api/stats/update': (request) => {
    const stats = request.json();
    if (typeof stats !== 'object' || stats === null) return empty(400);
    request.data.write(STATS, JSON.stringify({ ...stats, timestamp: Date.now() }));
    return ok();
  },
};
