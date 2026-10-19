import type { DataDirectory } from './data-directory';

/**
 * Replay (docs/Architecture.md §2): the assistant replies a Fixture carries
 * in `replay.json`, which the generation endpoint plays back in order, one
 * per generation. A Session that has played them all says so instead of
 * repeating one, and a fixture without Replay cannot generate.
 */
export const REPLAY_PATH = 'replay.json';

export interface Reply {
  content: string;
  /** Shown as the reply's reasoning when the frontend displays it. */
  reasoning?: string;
}

export interface Replay {
  /** The next reply. Throws when the fixture has none left. */
  next(): Reply;
}

export function createReplay(data: DataDirectory): Replay {
  let played = 0;
  return {
    next() {
      const text = data.readText(REPLAY_PATH);
      if (text === undefined) throw new ReplayError('This fixture has no Replay (replay.json)');
      const { replies } = JSON.parse(text) as { replies: Reply[] };
      const reply = replies[played];
      if (!reply) {
        throw new ReplayError(`Replay has played all ${replies.length} replies of this Session`);
      }
      played++;
      return reply;
    },
  };
}

/** Replay has nothing to play: the generation answers with this message. */
export class ReplayError extends Error {
  override name = 'ReplayError';
}
