import type { DataDirectory } from './data-directory';

export const REPLAY_PATH = 'replay.json';
export const REPLAY_POSITION_PATH = 'replay-position.json';

export interface Reply {
  content: string;
  reasoning?: string;
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
      const positionText = data.readText(REPLAY_POSITION_PATH);
      let played = 0;
      if (positionText !== undefined) {
        try {
          const position: unknown = JSON.parse(positionText);
          if (
            typeof position !== 'object' ||
            position === null ||
            !('played' in position) ||
            typeof position.played !== 'number' ||
            !Number.isInteger(position.played) ||
            position.played < 0
          ) {
            throw new Error('Expected an object with a non-negative integer played');
          }
          played = position.played;
        } catch (cause) {
          throw new Error(`Invalid Replay position in ${REPLAY_POSITION_PATH}: ${positionText}`, {
            cause,
          });
        }
      }
      const reply = replies[played];
      if (!reply) {
        throw new ReplayError(`Replay has played all ${replies.length} replies of this Session`);
      }
      data.write(REPLAY_POSITION_PATH, JSON.stringify({ played: played + 1 }));
      return reply;
    },
  };
}

/** Replay has nothing to play: the generation answers with this message. */
export class ReplayError extends Error {
  override name = 'ReplayError';
}
