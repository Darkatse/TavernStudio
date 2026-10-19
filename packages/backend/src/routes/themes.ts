import type { Routes } from '../backend';
import { empty, ok, text } from '../http';
import { dirs, sanitize } from '../paths';

export const themeRoutes: Routes = {
  'POST /api/themes/save': (request) => {
    const theme = request.json();
    const name = text(theme, 'name');
    if (!name) return empty(400);
    request.data.write(
      `${dirs.themes}/${sanitize(`${name}.json`)}`,
      JSON.stringify(theme, null, 4),
    );
    return ok();
  },
};
