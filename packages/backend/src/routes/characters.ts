import { humanizedDateTime, readCharacterCard, writeCharacterCard } from '@tavern-studio/st-data';
import type { Routes } from '../backend';
import {
  formatCharacter,
  invalidCardField,
  mergeCharacter,
  type Card,
  type CardFields,
  type WorldFile,
} from '../character-cards';
import type { DataDirectory } from '../data-directory';
import { empty, json, ok, plain, text, type BackendBody } from '../http';
import { dirs, isFileName, sanitize } from '../paths';

export const characterRoutes: Routes = {
  // characters.js /edit. Studio does not change images, so an uploaded avatar is refused.
  'POST /api/characters/edit': ({ data, body }) => {
    const fields = formFields(body);
    if (fields === 'avatar') {
      return json({ error: 'Tavern Studio does not change character avatars' }, 501);
    }
    const avatar = one(fields['avatar_url']);
    if (!avatar || !isFileName(avatar)) return empty(400);
    const name = one(fields['ch_name']);
    if (!name || name === '.') return plain('Error: invalid name.', 400);

    const card = formatCharacter(fields, (world) => readWorld(data, world));
    card['chat'] = one(fields['chat']);
    card['create_date'] = one(fields['create_date']);
    writeCard(data, avatar, JSON.stringify(card));
    return ok();
  },

  // characters.js /merge-attributes, single and bulk.
  'POST /api/characters/merge-attributes': (request) => {
    const { data } = request;
    const update = request.json() as Card;
    if (Array.isArray(update['avatars'])) return mergeMany(data, update);
    const avatar = update['avatar'];
    if (typeof avatar !== 'string' || !isFileName(avatar)) return empty(400);
    try {
      const error = mergeOne(data, avatar, update);
      if (error === undefined) return ok();
      return json({ message: `Validation failed for ${avatar}`, error }, 400);
    } catch (error) {
      return json(
        { message: 'Unexpected error while saving character.', error: String(error) },
        500,
      );
    }
  },

  'POST /api/characters/all': ({ data }) =>
    json(
      data
        .files(dirs.characters)
        .filter((file) => file.endsWith('.png'))
        .map((avatar) => readCharacter(data, avatar)),
    ),

  'POST /api/characters/get': (request) => {
    const avatar = text(request.json(), 'avatar_url');
    if (!avatar || !request.data.has(`${dirs.characters}/${avatar}`)) return empty(404);
    return json(readCharacter(request.data, avatar));
  },
};

/** Returns the failing field, if any. */
function mergeOne(data: DataDirectory, avatar: string, update: Card): string | undefined {
  const bytes = data.read(`${dirs.characters}/${avatar}`);
  if (!bytes) throw new Error(`Character ${avatar} is missing`);
  const card = mergeCharacter(JSON.parse(readCharacterCard(bytes)) as Card, update);
  const invalid = invalidCardField(card);
  if (invalid === undefined) writeCard(data, avatar, JSON.stringify(card));
  return invalid;
}

/** Bulk mode: `avatars` lists the cards, all of them when empty; `filter.path` must exist on a card. */
function mergeMany(data: DataDirectory, request: Card): ReturnType<typeof json> {
  const {
    avatars,
    data: update,
    filter,
  } = request as {
    avatars: unknown[];
    data: unknown;
    filter?: { path?: unknown };
  };
  if (typeof update !== 'object' || update === null || Array.isArray(update)) {
    return json({ message: 'No valid update data provided.' }, 400);
  }
  for (const avatar of avatars) {
    if (
      typeof avatar !== 'string' ||
      !isFileName(avatar) ||
      !avatar.toLowerCase().endsWith('.png')
    ) {
      return json({ message: `Invalid avatar filename: ${String(avatar)}` }, 400);
    }
  }
  const targets =
    avatars.length > 0
      ? (avatars as string[])
      : data.files(dirs.characters).filter((file) => file.toLowerCase().endsWith('.png'));
  const path = typeof filter?.path === 'string' ? filter.path : undefined;
  const result = { updated: [] as string[], skipped: [] as string[], failed: [] as string[] };
  for (const avatar of targets) {
    try {
      const bytes = data.read(`${dirs.characters}/${avatar}`);
      if (!bytes) throw new Error(`Character ${avatar} is missing`);
      const stored = JSON.parse(readCharacterCard(bytes)) as Card;
      if (path !== undefined && getPath(stored, path) === undefined) {
        result.skipped.push(avatar);
        continue;
      }
      const merged = mergeCharacter(stored, update as Card);
      if (invalidCardField(merged) !== undefined) {
        result.failed.push(avatar);
        continue;
      }
      writeCard(data, avatar, JSON.stringify(merged));
      result.updated.push(avatar);
    } catch {
      result.failed.push(avatar);
    }
  }
  return json(result);
}

function writeCard(data: DataDirectory, avatar: string, card: string): void {
  const path = `${dirs.characters}/${avatar}`;
  const bytes = data.read(path);
  if (!bytes) throw new Error(`Character ${avatar} is missing`);
  data.write(path, writeCharacterCard(bytes, card));
}

/** The lorebook a card links to; one that cannot be read leaves the card without a book. */
function readWorld(data: DataDirectory, name: string): WorldFile | undefined {
  try {
    const content = data.readText(`${dirs.worlds}/${sanitize(`${name}.json`)}`);
    return content ? (JSON.parse(content) as WorldFile) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Text fields of a multipart body, a repeated field as an array (as
 * multer's append-field gives SillyTavern). An empty file input is no file;
 * a chosen file returns `'avatar'`.
 */
function formFields(body: BackendBody): CardFields | 'avatar' {
  if (typeof body !== 'object' || body === null || !('kind' in body)) {
    throw new Error('Expected a multipart form body');
  }
  const fields: CardFields = {};
  for (const [name, value] of body.entries) {
    if (typeof value !== 'string') {
      if (value.bytes.length > 0) return 'avatar';
      continue;
    }
    const previous = fields[name];
    fields[name] =
      previous === undefined
        ? value
        : [...(Array.isArray(previous) ? previous : [previous]), value];
  }
  return fields;
}

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value.at(-1) : value);

/** One character as characters.js processCharacter returns it (never shallow). */
function readCharacter(data: DataDirectory, avatar: string): Card {
  const path = `${dirs.characters}/${avatar}`;
  const bytes = data.read(path);
  const stat = data.stat(path);
  if (!bytes || !stat) throw new Error(`Character ${avatar} is missing`);

  const jsonData = readCharacterCard(bytes);
  const card = JSON.parse(jsonData) as Card;
  if (card['spec'] === undefined) {
    throw new Error(`${avatar} is a V1 character card; Studio reads V2 and V3 cards only`);
  }

  const character = readFromV2(card);
  const chats = chatStats(data, `${dirs.chats}/${avatar.replace('.png', '')}`);
  return Object.assign(character, {
    avatar,
    json_data: jsonData,
    date_added: stat.modified,
    create_date: card['create_date'] || new Date(Math.round(stat.modified)).toISOString(),
    chat_size: chats.size,
    date_last_chat: chats.lastModified,
    data_size: dataSize(card['data']),
  });
}

const V2_FIELDS: Record<string, string> = {
  name: 'name',
  description: 'description',
  personality: 'personality',
  scenario: 'scenario',
  first_mes: 'first_mes',
  mes_example: 'mes_example',
  talkativeness: 'extensions.talkativeness',
  fav: 'extensions.fav',
  tags: 'tags',
};

const V2_DEFAULTS: Record<string, unknown> = {
  'extensions.talkativeness': 0.5,
  'extensions.fav': false,
};

/** Hoists V2 `data` fields to the top level (characters.js readFromV2). */
function readFromV2(card: Card): Card {
  const character: Card = { ...card };
  delete character['json_data'];
  const data = card['data'];
  if (typeof data === 'object' && data !== null) {
    for (const [field, v2Path] of Object.entries(V2_FIELDS)) {
      const value = getPath(data, v2Path);
      if (value !== undefined) character[field] = value;
      else if (v2Path in V2_DEFAULTS) character[field] = V2_DEFAULTS[v2Path];
    }
  }
  character['chat'] ??= `${String(character['name'])} - ${humanizedDateTime()}`;
  return character;
}

function getPath(value: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (current, key) =>
        typeof current === 'object' && current !== null
          ? (current as Record<string, unknown>)[key]
          : undefined,
      value,
    );
}

/** Total string length of the card data (characters.js calculateDataSize). */
function dataSize(data: unknown): number {
  if (typeof data !== 'object' || data === null) return 0;
  return Object.values(data).reduce<number>((sum, value) => sum + String(value).length, 0);
}

function chatStats(data: DataDirectory, dir: string) {
  let size = 0;
  let lastModified = 0;
  for (const file of data.files(dir)) {
    const stat = data.stat(`${dir}/${file}`);
    if (!stat) continue;
    size += stat.size;
    lastModified = Math.max(lastModified, stat.modified);
  }
  return { size, lastModified };
}
