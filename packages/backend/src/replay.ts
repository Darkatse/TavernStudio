import type { DataDirectory } from './data-directory';

export const REPLAY_PATH = 'replay.json';
/** Session data at the data root, which no URL serves: it persists and resets with the Session. */
const POSITION_PATH = 'replay-position.json';

export interface Reply {
  content: string;
  reasoning?: string;
}

interface Position {
  played: number;
}

export interface Replay {
  /** Throws when the fixture has none left. */
  next(): Reply;
}

export function createReplay(data: DataDirectory): Replay {
  return {
    next() {
      const text = data.readText(REPLAY_PATH);
      if (text === undefined) throw new ReplayError('This fixture has no Replay (replay.json)');
      const { replies } = JSON.parse(text) as { replies: Reply[] };
      const position = data.readText(POSITION_PATH);
      const played = position === undefined ? 0 : (JSON.parse(position) as Position).played;
      const reply = replies[played];
      if (!reply) {
        throw new ReplayError(`Replay has played all ${replies.length} replies of this Session`);
      }
      data.write(POSITION_PATH, JSON.stringify({ played: played + 1 } satisfies Position));
      return reply;
    },
  };
}

/** Replay has nothing to play: the generation answers with this message. */
export class ReplayError extends Error {
  override name = 'ReplayError';
}
