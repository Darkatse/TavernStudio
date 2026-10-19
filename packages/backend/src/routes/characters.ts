import { humanizedDateTime, readCharacterCard } from '@tavern-studio/st-data';
import type { Routes } from '../backend';
import type { DataDirectory } from '../data-directory';
import { empty, json, text } from '../http';
import { dirs } from '../paths';

type Card = Record<string, unknown>;

export const characterRoutes: Routes = {
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
