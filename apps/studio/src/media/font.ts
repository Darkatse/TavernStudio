import { BLANK_FONT_WOFF } from '@tavern-studio/preview/inspect';
import { base64 } from '../lib/base64';

export type ScriptId = 'latin' | 'digits' | 'chinese' | 'punctuation' | 'kana';

/**
 * Characters of each kind of text a theme shows, to tell how much of it a
 * font covers; `name` is how the Agent reads it.
 */
export const SCRIPTS: readonly { id: ScriptId; name: string; text: string }[] = [
  {
    id: 'latin',
    name: 'Latin letters',
    text: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  },
  { id: 'digits', name: 'digits', text: '0123456789' },
  {
    id: 'chinese',
    name: 'common Chinese characters',
    text: '的一是不了人我在有他这中大来上国个到说们为子和你地出道也时年得就那要下以生会自着去之过家学对可里后小么心多天而能好都然没日于起还发成事只作当想看文无开手十用主行方又如前所本见经头面公同三已老从动两长知民样现分将外但身些与高意进把法此实回二理美点月明其种声全工己话儿者向情部正名定女问力机给等几很业最间新什打便位因重被走电四第门相次东政海口使教西再平真听世气信北少关并内加化由却代军产入先山五太水万市眼体别处总才场师书比住员九笑性通目华报立马命张活难神数件安表原车白应路期叫死常提感金何更反合放做系计或司利受光王果亲界及今京务制解各任至清物台象记边共风战干接它许八特觉望直服毛林题建南度统色字请交爱让认算论百吃义科怎元社术结六功指思非流每青管夫连远资队跟带花快条院变联言权往展该领传近留红治决周保达办运武半候七必城父强步完革深区即求品士转量空甚众技轻程告江语英基派满式李息写呢识极令黄德收脸钱党倒未持取设始版双历越史商片容研像找友孩站广改议形委早房音火际则首单据导影失拿网香似斯专石若兵弟谁校读志飞观争究包组造落视济喜离虽坏兴切团夜',
  },
  { id: 'punctuation', name: 'Chinese punctuation', text: '，。！？、；：「」『』（）《》“”‘’…—' },
  {
    id: 'kana',
    name: 'Japanese kana',
    text: 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんアイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン',
  },
];

export interface SpecimenLine {
  /** CSS pixels. */
  size: number;
  text: string;
}

/** Lines a specimen shows, from the name down to the small print. */
export const SPECIMEN: readonly SpecimenLine[] = [
  { size: 64, text: 'Tavern Studio 酒馆' },
  { size: 36, text: 'The quick brown fox jumps over the lazy dog.' },
  { size: 36, text: '天地玄黄，宇宙洪荒。日月盈昃，辰宿列张。' },
  { size: 32, text: '0123456789 「你好，旅人」…' },
  { size: 28, text: 'あいうえお アイウエオ' },
];

/** Characters the font has no glyph for fall to it, and take no space. */
export const BLANK_FAMILY = 'Studio Probe Blank';

export interface Coverage {
  id: ScriptId;
  name: string;
  covered: number;
  total: number;
}

let blank: Promise<void> | undefined;
let next = 0;

/**
 * Lends the font to Studio's own document under a family of its own, with
 * the blank font behind it, until it is released.
 */
export async function lendFont(
  bytes: Uint8Array,
): Promise<{ family: string; release: () => void }> {
  blank ??= new FontFace(BLANK_FAMILY, decoded(BLANK_FONT_WOFF))
    .load()
    .then((face) => void document.fonts.add(face));
  const family = `Studio Media ${++next}`;
  const face = new FontFace(family, new Uint8Array(bytes).buffer);
  await Promise.all([face.load(), blank]);
  document.fonts.add(face);
  return { family, release: () => void document.fonts.delete(face) };
}

/** Lends the font for as long as `use` runs. */
export async function withFont<T>(
  bytes: Uint8Array,
  use: (family: string) => T | Promise<T>,
): Promise<T> {
  const { family, release } = await lendFont(bytes);
  try {
    return await use(family);
  } finally {
    release();
  }
}

/** How many characters of each script the family has glyphs for. */
export function coverage(family: string): Coverage[] {
  const context = measuring(family, 32);
  return SCRIPTS.map(({ id, name, text }) => {
    const characters = [...new Set(text)];
    return {
      id,
      name,
      covered: characters.filter((character) => context.measureText(character).width > 0).length,
      total: characters.length,
    };
  });
}

/** The specimen's lines the family draws any character of. */
export function specimenLines(family: string): readonly SpecimenLine[] {
  return SPECIMEN.filter(
    (line) => measuring(family, line.size).measureText(line.text.replaceAll(/\s/g, '')).width > 0,
  );
}

/** The specimen as an image, dark on white, for a model to look at; none when no line is drawn. */
export async function specimenForModel(
  family: string,
): Promise<{ data: string; mimeType: string; width: number; height: number } | undefined> {
  const padding = 32;
  const lines = specimenLines(family).map((line) => ({
    ...line,
    width: measuring(family, line.size).measureText(line.text).width,
  }));
  if (lines.length === 0) return undefined;
  const width = Math.ceil(
    Math.min(1280, Math.max(...lines.map((line) => line.width)) + padding * 2),
  );
  const height = Math.ceil(lines.reduce((sum, line) => sum + line.size * 1.5, padding * 2));
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No 2D canvas');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.fillStyle = '#1a1a1a';
  context.textBaseline = 'alphabetic';
  let y = padding;
  for (const line of lines) {
    y += line.size * 1.2;
    context.font = `${line.size}px "${family}", "${BLANK_FAMILY}"`;
    context.fillText(line.text, padding, y);
    y += line.size * 0.3;
  }
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return { data: await base64(blob), mimeType: 'image/png', width, height };
}

let measurer: CanvasRenderingContext2D | null | undefined;

function measuring(family: string, size: number): CanvasRenderingContext2D {
  measurer ??= document.createElement('canvas').getContext('2d');
  if (!measurer) throw new Error('No 2D canvas');
  measurer.font = `${size}px "${family}", "${BLANK_FAMILY}"`;
  return measurer;
}

function decoded(base64Text: string): ArrayBuffer {
  const binary = atob(base64Text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}
