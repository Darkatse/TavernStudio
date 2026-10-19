import { parseChat, serializeChat } from '@tavern-studio/st-data';
import type { Routes } from '../backend';
import type { DataDirectory } from '../data-directory';
import { json, text } from '../http';
import { dirs, sanitize } from '../paths';

interface ChatSave {
  chat?: unknown;
  force?: unknown;
}

interface RecentRequest {
  pinned?: unknown;
  metadata?: unknown;
}

/** The chat file a request names: `<character>/<file_name>.jsonl` under chats/. */
function chatPath(body: unknown): { character: string; path: string } {
  const character = (text(body, 'avatar_url') ?? '').replace('.png', '');
  const file = sanitize(`${text(body, 'file_name') ?? ''}.jsonl`);
  return { character, path: `${dirs.chats}/${character}/${file}` };
}

export const chatRoutes: Routes = {
  'POST /api/chats/get': (request) => {
    const body = request.json();
    const { character, path } = chatPath(body);
    if (!request.data.directories(dirs.chats).includes(character) || !text(body, 'file_name')) {
      return json({});
    }
    return json(parseChat(request.data.readText(path) ?? ''));
  },

  'POST /api/chats/save': (request) => {
    const body = request.json();
    const { chat, force } = body as ChatSave;
    if (!Array.isArray(chat)) {
      return json({ error: "The request's body.chat is not an array." }, 400);
    }
    const { path } = chatPath(body);
    if (!force && !isIntact(request.data, path, chat[0])) {
      return json({ error: 'integrity' }, 400);
    }
    request.data.write(path, serializeChat(chat));
    return json({ ok: true });
  },

  'POST /api/chats/recent': (request) => {
    const body = request.json();
    const { metadata, pinned: pins } = body as RecentRequest;
    const pinned = Array.isArray(pins) ? (pins as { file_name?: string; avatar?: string }[]) : [];
    const files = request.data
      .files(dirs.characters)
      .filter((file) => file.endsWith('.png'))
      .flatMap((avatar) => {
        const dir = `${dirs.chats}/${avatar.replace('.png', '')}`;
        return request.data
          .files(dir)
          .filter((file) => file.endsWith('.jsonl'))
          .map((file) => ({ avatar, file, path: `${dir}/${file}` }));
      });
    const isPinned = (entry: (typeof files)[number]) =>
      pinned.some((pin) => pin.file_name === entry.file && pin.avatar === entry.avatar);
    const modified = (entry: (typeof files)[number]) =>
      request.data.stat(entry.path)?.modified ?? 0;
    const max =
      Number.parseInt(text(body, 'max') ?? String(Number.MAX_SAFE_INTEGER), 10) + pinned.length;

    const recent = files
      .toSorted((a, b) => Number(isPinned(b)) - Number(isPinned(a)) || modified(b) - modified(a))
      .slice(0, max);
    return json(
      recent.map((entry) =>
        chatInfo(request.data, entry.path, Boolean(metadata), { avatar: entry.avatar }),
      ),
    );
  },

  // One character's chats. ST answers `{ error: true }` when the character has
  // no chat directory yet; an empty list says the same without the ambiguity
  // (docs/Vendors.md §2).
  'POST /api/characters/chats': (request) => {
    const body = request.json();
    const character = (text(body, 'avatar_url') ?? '').replace('.png', '');
    const dir = `${dirs.chats}/${character}`;
    const files = request.data.files(dir).filter((file) => file.endsWith('.jsonl'));
    if ((body as { simple?: unknown }).simple) {
      return json(
        files.map((file) => ({ file_name: file, file_id: file.replace(/\.jsonl$/, '') })),
      );
    }
    const metadata = Boolean((body as { metadata?: unknown }).metadata);
    return json(files.map((file) => chatInfo(request.data, `${dir}/${file}`, metadata)));
  },
};

/**
 * A chat may be overwritten unless the stored header carries a different
 * integrity slug (chats.js checkChatIntegrity).
 */
function isIntact(data: DataDirectory, path: string, header: unknown): boolean {
  const slug = integrityOf(header);
  const existing = data.readText(path);
  if (!slug || !existing) return true;
  const [stored] = parseChat(existing.split('\n', 1)[0] ?? '');
  // A non-empty file without a readable header may be damaged: require `force`.
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return false;
  const storedSlug = integrityOf(stored);
  return !storedSlug || storedSlug === slug;
}

function integrityOf(header: unknown): unknown {
  return (header as { chat_metadata?: { integrity?: unknown } } | undefined)?.chat_metadata
    ?.integrity;
}

/** Summary of one chat file (chats.js getChatInfo), with the caller's extra fields. */
function chatInfo(
  data: DataDirectory,
  path: string,
  withMetadata: boolean,
  extra: { avatar?: string } = {},
) {
  const stat = data.stat(path);
  const items = parseChat(data.readText(path) ?? '');
  const header = items[0] as { chat_metadata?: unknown } | undefined;
  const last = items.at(-1) as { mes?: string; send_date?: string } | undefined;
  const fileName = path.slice(path.lastIndexOf('/') + 1);
  return {
    match: true,
    file_id: fileName.replace(/\.jsonl$/, ''),
    file_name: fileName,
    file_size: formatBytes(stat?.size ?? 0),
    chat_items: Math.max(items.length - 1, 0),
    mes: items.length > 1 ? last?.mes || '[The message is empty]' : '[The chat is empty]',
    last_mes: last?.send_date ?? stat?.modified ?? 0,
    ...extra,
    ...(withMetadata && header?.chat_metadata ? { chat_metadata: header.chat_metadata } : {}),
  };
}

/** Byte counts as the `bytes` package formats them, for example `3.44KB`. */
function formatBytes(size: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = size;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${unit === 0 ? value : Number(value.toFixed(2))}${units[unit]}`;
}
