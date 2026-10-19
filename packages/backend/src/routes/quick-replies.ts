import type { Routes } from '../backend';
import { empty, text } from '../http';
import { dirs, sanitize } from '../paths';

export const quickReplyRoutes: Routes = {
  'POST /api/quick-replies/save': (request) => {
    const set = request.json();
    const name = text(set, 'name');
    if (!name) return empty(400);
    request.data.write(
      `${dirs.quickReplies}/${sanitize(`${name}.json`)}`,
      JSON.stringify(set, null, 4),
    );
    return empty(200);
  },

  'POST /api/quick-replies/delete': (request) => {
    const name = text(request.json(), 'name');
    if (!name) return empty(400);
    request.data.delete(`${dirs.quickReplies}/${sanitize(`${name}.json`)}`);
    return empty(200);
  },
};
