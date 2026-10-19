import { describe, expect, test } from '@rstest/core';
import { readCharacterCard, writeCharacterCard } from '@tavern-studio/st-data';
import {
  adopt,
  AdoptionError,
  applyPlacements,
  findDifferences,
  MountError,
  parseManifest,
  resolveMounts,
  type Difference,
  type Placement,
  type ProjectReader,
} from './index';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const SETTINGS = 'default-user/settings.json';

type Files = Record<string, string | Uint8Array>;

function bytes(content: string | Uint8Array): Uint8Array {
  return typeof content === 'string' ? encoder.encode(content) : content;
}

function project(files: Files): ProjectReader {
  const paths = Object.keys(files);
  return {
    kind: (path) =>
      Promise.resolve(
        path in files
          ? 'file'
          : paths.some((file) => file.startsWith(`${path}/`))
            ? 'directory'
            : undefined,
      ),
    read: (path) => Promise.resolve(bytes(files[path] ?? '')),
    files: (directory) =>
      Promise.resolve(
        paths
          .filter((file) => file.startsWith(`${directory}/`))
          .map((file) => file.slice(directory.length + 1)),
      ),
  };
}

class Data {
  readonly files: Map<string, Uint8Array>;
  constructor(files: Files | Map<string, Uint8Array>) {
    this.files =
      files instanceof Map
        ? new Map(files)
        : new Map(Object.entries(files).map(([path, content]) => [path, bytes(content)]));
  }
  read(path: string) {
    return this.files.get(path);
  }
  json(path: string): unknown {
    return JSON.parse(decoder.decode(this.files.get(path)));
  }
  with(writes: Map<string, Uint8Array | null>): Data {
    const next = new Data(this.files);
    for (const [path, content] of writes) {
      if (content === null) next.files.delete(path);
      else next.files.set(path, content);
    }
    return next;
  }
}

async function placements(files: Files): Promise<Placement[]> {
  const manifest = parseManifest(decoder.decode(bytes(files['studio.json'] ?? '')));
  return resolveMounts(manifest, project(files));
}

function compose(fixture: Data, placed: Placement[]): Data {
  return fixture.with(applyPlacements(fixture, fixture, [], placed).writes);
}

const fixture = new Data({
  [SETTINGS]: JSON.stringify(
    {
      firstRun: false,
      power_user: {
        theme: 'Default',
        main_text_color: 'rgba(1, 1, 1, 1)',
        custom_css: '',
        chat_width: 50,
      },
    },
    null,
    4,
  ),
});

const theme: Files = {
  'studio.json': JSON.stringify({
    fixture: 'showcase',
    mounts: [
      { from: 'theme.json', to: `${SETTINGS}#/power_user` },
      { from: 'theme.css', to: `${SETTINGS}#/power_user/custom_css` },
    ],
  }),
  'theme.json':
    '{\n  "theme": "Bamboo",\n  "main_text_color": "rgba(10, 20, 30, 1)",\n  "blur_strength": 5\n}\n',
  'theme.css': 'body { color: red; }\n',
};

/** SillyTavern saving settings: the whole file again, as it holds it in memory. */
function vendorSaves(data: Data, change: (settings: any) => void): Data {
  const settings = data.json(SETTINGS) as any;
  change(settings);
  return data.with(new Map([[SETTINGS, encoder.encode(JSON.stringify(settings, null, 2))]]));
}

describe('Mounts', () => {
  test('place only the positions the project writes', async () => {
    const snapshot = compose(fixture, await placements(theme));
    expect(snapshot.json(SETTINGS)).toEqual({
      firstRun: false,
      power_user: {
        theme: 'Bamboo',
        main_text_color: 'rgba(10, 20, 30, 1)',
        custom_css: 'body { color: red; }\n',
        chat_width: 50,
        blur_strength: 5,
      },
    });
  });

  test('a vendor rewriting the file is an echo; a change to an owned key is a difference', async () => {
    const placed = await placements(theme);
    const snapshot = compose(fixture, placed);
    const echoed = vendorSaves(snapshot, (settings) => {
      settings.power_user.chat_width = 70;
      settings.power_user.new_default = true;
    });
    expect(findDifferences(echoed, placed)).toEqual([]);

    const tweaked = vendorSaves(echoed, (settings) => {
      settings.power_user.main_text_color = 'rgba(200, 0, 0, 1)';
    });
    expect(
      findDifferences(tweaked, placed).map((difference) =>
        difference.kind === 'value' ? [difference.pointer.join('/'), difference.session] : [],
      ),
    ).toEqual([['power_user/main_text_color', 'rgba(200, 0, 0, 1)']]);
  });

  test('a project change keeps session writes and returns released keys to the fixture', async () => {
    const before = await placements(theme);
    const session = vendorSaves(compose(fixture, before), (settings) => {
      settings.power_user.chat_width = 70;
    });
    const after = await placements({
      ...theme,
      'theme.json': '{ "theme": "Bamboo", "main_text_color": "red" }',
    });

    const updated = session.with(applyPlacements(fixture, session, before, after).writes);
    expect(updated.json(SETTINGS)).toEqual(
      vendorSaves(compose(fixture, after), (settings) => {
        settings.power_user.chat_width = 70;
      }).json(SETTINGS),
    );
    expect((updated.json(SETTINGS) as any).power_user).not.toHaveProperty('blur_strength');
  });

  test('a change to one mount point keeps session writes on another, and reports what moved', async () => {
    const before = await placements(theme);
    const session = vendorSaves(compose(fixture, before), (settings) => {
      settings.power_user.main_text_color = 'rgba(200, 0, 0, 1)';
    });
    const after = await placements({ ...theme, 'theme.css': 'body { color: green; }\n' });

    const { writes, changes } = applyPlacements(fixture, session, before, after);
    expect((session.with(writes).json(SETTINGS) as any).power_user).toMatchObject({
      main_text_color: 'rgba(200, 0, 0, 1)',
      custom_css: 'body { color: green; }\n',
    });
    expect(changes).toEqual([
      { path: SETTINGS, pointer: ['power_user', 'custom_css'], value: 'body { color: green; }\n' },
    ]);
    expect(applyPlacements(fixture, session.with(writes), after, after)).toEqual({
      writes: new Map(),
      changes: [],
    });
  });

  test('adopting differences writes them back until the project matches the Session', async () => {
    const placed = await placements(theme);
    const session = vendorSaves(compose(fixture, placed), (settings) => {
      settings.power_user.main_text_color = 'rgba(200, 0, 0, 1)';
      settings.power_user.custom_css = 'body { color: blue; }\n';
    });

    const adopted: Files = { ...theme };
    const byMount = Map.groupBy(
      findDifferences(session, placed),
      (difference) => difference.placement,
    );
    for (const [placement, differences] of byMount) {
      const written = adopt(differences, bytes(adopted[placement.source] ?? ''));
      if (written) adopted[placement.source] = written;
    }

    expect(findDifferences(session, await placements(adopted))).toEqual([]);
    expect(decoder.decode(bytes(adopted['theme.json'] ?? ''))).toBe(
      '{\n  "theme": "Bamboo",\n  "main_text_color": "rgba(200, 0, 0, 1)",\n  "blur_strength": 5\n}\n',
    );
  });

  test('fenced text round-trips, and text that lost its fence cannot be adopted', async () => {
    const regex = 'default-user/regex.json';
    const files: Files = {
      'studio.json': JSON.stringify({
        fixture: 'showcase',
        mounts: [{ from: 'card.html', to: `${regex}#/replaceString`, fence: 'html' }],
      }),
      'card.html': '<body>\n  <p>Status</p>\n</body>\n',
    };
    const placed = await placements(files);
    const snapshot = compose(new Data({ [regex]: '{"replaceString": ""}' }), placed);
    expect(snapshot.json(regex)).toEqual({
      replaceString: '```html\n<body>\n  <p>Status</p>\n</body>\n```',
    });
    expect(findDifferences(snapshot, placed)).toEqual([]);

    const write = (value: string) =>
      snapshot.with(new Map([[regex, encoder.encode(JSON.stringify({ replaceString: value }))]]));
    const [edited] = findDifferences(write('```html\n<body>Hi</body>\n```'), placed) as [
      Difference,
    ];
    expect(decoder.decode(adopt([edited], bytes(files['card.html'] ?? '')) ?? undefined)).toBe(
      '<body>Hi</body>\n',
    );

    const [unfenced] = findDifferences(write('<body>Hi</body>'), placed) as [Difference];
    expect(() => adopt([unfenced], bytes(files['card.html'] ?? ''))).toThrow(AdoptionError);
  });

  test('a pointer reaches into a character card, and re-encoding the card is no difference', async () => {
    const card = 'default-user/characters/Ada.png';
    const png = writeCharacterCard(
      minimalPng(),
      JSON.stringify({ data: { name: 'Ada', extensions: {} } }),
    );
    const files: Files = {
      'studio.json': JSON.stringify({
        fixture: 'showcase',
        mounts: [{ from: 'scripts.json', to: `${card}#/data/extensions/tavern_helper/scripts` }],
      }),
      'scripts.json': '[{ "type": "script", "name": "Clock" }]',
    };
    const placed = await placements(files);
    const snapshot = compose(new Data({ [card]: png }), placed);
    expect(JSON.parse(readCharacterCard(snapshot.read(card) ?? png)).data).toEqual({
      name: 'Ada',
      extensions: { tavern_helper: { scripts: [{ type: 'script', name: 'Clock' }] } },
    });

    const reencoded = writeCharacterCard(
      minimalPng(),
      JSON.stringify(JSON.parse(readCharacterCard(snapshot.read(card) ?? png)), null, 1),
    );
    expect(findDifferences(snapshot.with(new Map([[card, reencoded]])), placed)).toEqual([]);
  });

  test('a folder mount places its files, and the fixture returns when it goes away', async () => {
    const extension = 'default-user/extensions/Clock';
    const files: Files = {
      'studio.json': JSON.stringify({
        fixture: 'showcase',
        mounts: [
          { from: 'manifest.json', to: `${extension}/manifest.json` },
          { from: 'dist', to: `${extension}/dist` },
        ],
      }),
      'manifest.json': '{ "js": "dist/index.js" }',
      'dist/index.js': 'console.log(1);',
      'dist/style.css': 'body {}',
    };
    const placed = await placements(files);
    const snapshot = compose(fixture, placed);
    expect([...snapshot.files.keys()].toSorted()).toEqual([
      `${extension}/dist/index.js`,
      `${extension}/dist/style.css`,
      `${extension}/manifest.json`,
      SETTINGS,
    ]);
    expect([
      ...snapshot.with(applyPlacements(fixture, snapshot, placed, []).writes).files.keys(),
    ]).toEqual([SETTINGS]);
  });

  test('two Mounts writing the same position are refused', async () => {
    const overlapping = { ...theme, 'theme.json': '{ "theme": "Bamboo", "custom_css": "" }' };
    await expect(placements(overlapping)).rejects.toThrow(MountError);
    await expect(placements(overlapping)).rejects.toThrow(
      /both write default-user\/settings\.json#\/power_user\/custom_css/,
    );
  });
});

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** The smallest PNG a card can live in: a 1×1 header and the end. */
function minimalPng(): Uint8Array {
  return Uint8Array.from([
    ...PNG_SIGNATURE,
    ...pngChunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]),
    ...pngChunk('IEND', []),
  ]);
}

/** Length, type and data; the reader does not check the CRC, so it stays zero. */
function pngChunk(type: string, data: number[]): number[] {
  return [0, 0, 0, data.length, ...encoder.encode(type), ...data, 0, 0, 0, 0];
}
