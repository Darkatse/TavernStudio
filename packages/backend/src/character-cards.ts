/**
 * How SillyTavern builds and merges character cards on the server
 * (src/endpoints/characters.js and its validator), so edits made in the
 * preview are stored exactly as SillyTavern would store them.
 */
import { humanizedDateTime } from '@tavern-studio/st-data';

export type Card = Record<string, unknown>;

/** A card's fields as the edit form sends them; repeated fields arrive as arrays. */
export type CardFields = Record<string, string | string[]>;

/** A lorebook file as worldinfo.js stores it. */
export interface WorldFile {
  entries?: Record<string, Record<string, unknown>>;
  originalData?: unknown;
}

const one = (fields: CardFields, name: string): string | undefined => {
  const value = fields[name];
  return Array.isArray(value) ? value.at(-1) : value;
};

const tags = (value: string | string[] | undefined): string[] =>
  typeof value === 'string'
    ? value
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
    : (value ?? []);

/**
 * The card an edit produces (characters.js charaFormatData): the stored JSON
 * keeps every field SillyTavern does not manage, the form sets the rest.
 * `readWorld` returns the linked lorebook, or nothing when it cannot be read.
 */
export function formatCharacter(
  fields: CardFields,
  readWorld: (name: string) => WorldFile | undefined,
): Card {
  const text = (name: string) => one(fields, name) || '';
  const card = parseObject(one(fields, 'json_data'));
  delete card['json_data'];
  const name = one(fields, 'ch_name');
  const talkativeness = one(fields, 'talkativeness') || 0.5;
  const fav = one(fields, 'fav') === 'true';
  const greetings = fields['alternate_greetings'];
  const depth = Number(one(fields, 'depth_prompt_depth'));
  const world = one(fields, 'world');

  Object.assign(card, {
    name,
    description: text('description'),
    personality: text('personality'),
    scenario: text('scenario'),
    first_mes: text('first_mes'),
    mes_example: text('mes_example'),
    creatorcomment: text('creator_notes'),
    avatar: 'none',
    chat: `${name} - ${humanizedDateTime()}`,
    talkativeness,
    fav,
    tags: tags(fields['tags']),
    spec: 'chara_card_v2',
    spec_version: '2.0',
  });
  const data = (card['data'] = parseObject(card['data']));
  Object.assign(data, {
    name,
    description: text('description'),
    personality: text('personality'),
    scenario: text('scenario'),
    first_mes: text('first_mes'),
    mes_example: text('mes_example'),
    creator_notes: text('creator_notes'),
    system_prompt: text('system_prompt'),
    post_history_instructions: text('post_history_instructions'),
    tags: tags(fields['tags']),
    creator: text('creator'),
    character_version: text('character_version'),
    alternate_greetings: Array.isArray(greetings) ? greetings : greetings ? [greetings] : [],
  });
  const extensions = (data['extensions'] = parseObject(data['extensions']));
  Object.assign(extensions, {
    talkativeness,
    fav,
    world: world || '',
    depth_prompt: {
      prompt: one(fields, 'depth_prompt_prompt') ?? '',
      depth: Number.isNaN(depth) ? 4 : depth,
      role: one(fields, 'depth_prompt_role') ?? 'system',
    },
  });

  if (world) {
    const file = readWorld(world);
    if (file?.originalData) data['character_book'] = file.originalData;
    if (file?.entries) data['character_book'] = worldToCharacterBook(world, file.entries);
  }
  const extra = one(fields, 'extensions');
  if (extra) {
    const parsed = tryParse(extra);
    if (parsed !== undefined) data['extensions'] = deepMerge(extensions, parsed);
  }
  return card;
}

/**
 * A merge update applied to a stored card (characters.js
 * mergeCharacterUpdate): `json_data` is ignored on both sides, and a value
 * of `__@@UNSET@@__` removes the key.
 */
export function mergeCharacter(stored: Card, update: Card): Card {
  const patch = structuredClone(update);
  delete patch['json_data'];
  const base = { ...stored };
  delete base['json_data'];
  const merged = deepMerge(base, patch) as Card;
  removeUnset(merged, patch);
  return merged;
}

/** The field that fails SillyTavern's card validator, or nothing when the card is V1, V2 or V3. */
export function invalidCardField(card: Card): string | undefined {
  const v1 = firstMissing(card, [
    'name',
    'description',
    'personality',
    'scenario',
    'first_mes',
    'mes_example',
  ]);
  if (v1 === undefined) return undefined;
  if (invalidV2(card) === undefined) return undefined;
  // Like the validator's lastValidationError: the field of the last spec tried.
  return invalidV3(card);
}

function invalidV2(card: Card): string | undefined {
  if (card['spec'] !== 'chara_card_v2') return 'spec';
  if (card['spec_version'] !== '2.0') return 'spec_version';
  const data = card['data'] as Card | undefined;
  if (!data) return 'No tavern card data found';
  const missing = firstMissing(data, [
    'name',
    'description',
    'personality',
    'scenario',
    'first_mes',
    'mes_example',
    'creator_notes',
    'system_prompt',
    'post_history_instructions',
    'alternate_greetings',
    'tags',
    'creator',
    'character_version',
    'extensions',
  ]);
  if (missing !== undefined) return `data.${missing}`;
  if (!Array.isArray(data['alternate_greetings']) || !Array.isArray(data['tags'])) return 'data';
  if (typeof data['extensions'] !== 'object') return 'data';
  const book = data['character_book'] as Card | undefined;
  if (!book) return undefined;
  const bookMissing = firstMissing(book, ['extensions', 'entries']);
  if (bookMissing !== undefined) return `data.character_book.${bookMissing}`;
  return Array.isArray(book['entries']) && typeof book['extensions'] === 'object'
    ? undefined
    : 'data.character_book';
}

function invalidV3(card: Card): string | undefined {
  if (card['spec'] !== 'chara_card_v3') return 'spec';
  const version = Number(card['spec_version']);
  if (version < 3 || version >= 4) return 'spec_version';
  const data = card['data'];
  return typeof data === 'object' && data !== null ? undefined : 'No tavern card data found';
}

function firstMissing(value: Card, fields: string[]): string | undefined {
  return fields.find((field) => !Object.hasOwn(value, field));
}

/** A lorebook as a card's character_book (characters.js convertWorldInfoToCharacterBook). */
function worldToCharacterBook(name: string, entries: Record<string, Record<string, unknown>>) {
  return {
    name,
    entries: Object.values(entries).map((entry) => ({
      id: entry['uid'],
      keys: entry['key'],
      secondary_keys: entry['keysecondary'],
      comment: entry['comment'],
      content: entry['content'],
      constant: entry['constant'],
      selective: entry['selective'],
      insertion_order: entry['order'],
      enabled: !entry['disable'],
      position: entry['position'] == 0 ? 'before_char' : 'after_char',
      use_regex: true,
      extensions: {
        ...(entry['extensions'] as Card | undefined),
        position: entry['position'],
        exclude_recursion: entry['excludeRecursion'],
        display_index: entry['displayIndex'],
        probability: entry['probability'] ?? null,
        useProbability: entry['useProbability'] ?? false,
        depth: entry['depth'] ?? 4,
        selectiveLogic: entry['selectiveLogic'] ?? 0,
        outlet_name: entry['outletName'] ?? '',
        group: entry['group'] ?? '',
        group_override: entry['groupOverride'] ?? false,
        group_weight: entry['groupWeight'] ?? null,
        prevent_recursion: entry['preventRecursion'] ?? false,
        delay_until_recursion: entry['delayUntilRecursion'] ?? false,
        scan_depth: entry['scanDepth'] ?? null,
        match_whole_words: entry['matchWholeWords'] ?? null,
        use_group_scoring: entry['useGroupScoring'] ?? false,
        case_sensitive: entry['caseSensitive'] ?? null,
        automation_id: entry['automationId'] ?? '',
        role: entry['role'] ?? 0,
        vectorized: entry['vectorized'] ?? false,
        sticky: entry['sticky'] ?? null,
        cooldown: entry['cooldown'] ?? null,
        delay: entry['delay'] ?? null,
        match_persona_description: entry['matchPersonaDescription'] ?? false,
        match_character_description: entry['matchCharacterDescription'] ?? false,
        match_character_personality: entry['matchCharacterPersonality'] ?? false,
        match_character_depth_prompt: entry['matchCharacterDepthPrompt'] ?? false,
        match_scenario: entry['matchScenario'] ?? false,
        match_creator_notes: entry['matchCreatorNotes'] ?? false,
        triggers: entry['triggers'] ?? [],
        ignore_budget: entry['ignoreBudget'] ?? false,
      },
    })),
  };
}

const isObject = (value: unknown): value is Card =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * SillyTavern's own deepMerge (src/util.js): objects merge key by key;
 * arrays, scalars and null replace; a source object over a missing key is
 * taken as it is.
 */
function deepMerge(target: unknown, source: unknown): unknown {
  const output: Card = { ...(target as Card) };
  if (isObject(target) && isObject(source)) {
    for (const key of Object.keys(source)) {
      output[key] =
        isObject(source[key]) && key in target ? deepMerge(target[key], source[key]) : source[key];
    }
  }
  return output;
}

const UNSET = '__@@UNSET@@__';

function removeUnset(target: Card, source: Card): void {
  for (const [key, value] of Object.entries(source)) {
    if (value === UNSET) delete target[key];
    else if (isObject(value) && isObject(target[key])) removeUnset(target[key], value);
  }
}

function parseObject(value: unknown): Card {
  const parsed = typeof value === 'string' ? tryParse(value) : value;
  return isObject(parsed) ? parsed : {};
}

function tryParse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}
