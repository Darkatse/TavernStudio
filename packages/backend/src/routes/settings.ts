import type { Routes } from '../backend';
import type { DataDirectory } from '../data-directory';
import { empty, json } from '../http';
import { byName, dirs, USER } from '../paths';

const SETTINGS = `${USER}/settings.json`;

export const settingsRoutes: Routes = {
  'POST /api/settings/get': ({ data }) => {
    const settings = data.readText(SETTINGS);
    if (settings === undefined) return empty(500);

    const kobold = readPresets(data, dirs.koboldAI);
    const novel = readPresets(data, dirs.novelAI);
    const openai = readPresets(data, dirs.openAI);
    const textgen = readPresets(data, dirs.textGen);

    return json({
      settings,
      koboldai_settings: kobold.contents,
      koboldai_setting_names: kobold.names,
      world_names: data
        .files(dirs.worlds)
        .filter((file) => file.toLowerCase().endsWith('.json'))
        .toSorted(byName)
        .map(withoutExtension),
      novelai_settings: novel.contents,
      novelai_setting_names: novel.names,
      openai_settings: openai.contents,
      openai_setting_names: openai.names,
      textgenerationwebui_presets: textgen.contents,
      textgenerationwebui_preset_names: textgen.names,
      themes: readParsed(data, dirs.themes),
      movingUIPresets: readParsed(data, dirs.movingUI),
      quickReplyPresets: readParsed(data, dirs.quickReplies),
      instruct: readParsed(data, dirs.instruct),
      context: readParsed(data, dirs.context),
      sysprompt: readParsed(data, dirs.sysprompt),
      reasoning: readParsed(data, dirs.reasoning),
      // Extension versions are pinned by the Session, so nothing updates itself.
      enable_extensions: true,
      enable_extensions_auto_update: false,
      enable_accounts: false,
      request_compression: { enabled: false, minPayloadSize: 0, maxPayloadSize: 0, timeout: 0 },
    });
  },

  'POST /api/settings/save': (request) => {
    request.data.write(SETTINGS, JSON.stringify(request.json(), null, 4));
    return json({ result: 'ok' });
  },
};

/** Preset files as raw JSON text, sorted by name (settings.js readPresetsFromDirectory). */
function readPresets(data: DataDirectory, dir: string) {
  const contents: string[] = [];
  const names: string[] = [];
  for (const file of data.files(dir).toSorted(byName)) {
    if (!file.endsWith('.json')) continue;
    const text = data.readText(`${dir}/${file}`) ?? '';
    if (!isJson(text)) continue;
    contents.push(text);
    names.push(withoutExtension(file));
  }
  return { contents, names };
}

/** Parsed JSON files in code-unit order (settings.js readAndParseFromDirectory). */
function readParsed(data: DataDirectory, dir: string): unknown[] {
  return data
    .files(dir)
    .filter((file) => file.endsWith('.json'))
    .toSorted()
    .flatMap((file) => {
      const text = data.readText(`${dir}/${file}`) ?? '';
      return isJson(text) ? [JSON.parse(text) as unknown] : [];
    });
}

function isJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

function withoutExtension(file: string): string {
  return file.replace(/\.[^/.]+$/, '');
}
