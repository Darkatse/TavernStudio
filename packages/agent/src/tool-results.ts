import { sha256 } from '@tavern-studio/workspace';
import { charCount, takeChars } from './text';
import { modelToolName } from './tool';
import { READ_FILE, SEARCH_FILES, TOOL_RESULTS_ROOT } from './workspace';

/**
 * TauriTavern stores only external tools' results, past 50,000 characters by
 * default, since its own tools bound their output. Here every result counts,
 * so the limit stays above the longest `read_file` result (80,000 characters
 * plus line numbers): a stored result read back is never stored again.
 */
export const RESULT_INLINE_CHAR_LIMIT = 100_000;

/** Stored lines are cut at this length, so a reader can address any part by line. */
const STORED_LINE_CHARS = 3_000;

export interface ToolResultStore {
  /** `path` is relative to the `tool-results/` root. */
  put(path: string, text: string): Promise<void>;
}

export interface ToolCallOrigin {
  runId: string;
  round: number;
  callId: string;
}

export interface ModelResult {
  text: string;
  /** The workspace path of the stored result, when it was too long to inline. */
  storedAt?: string;
}

/**
 * A long result is stored at `tool-results/<run>/round-<NNN>-call_<hash>.txt`,
 * as TauriTavern names it.
 */
export async function resultForModel(
  text: string,
  origin: ToolCallOrigin,
  store: ToolResultStore,
): Promise<ModelResult> {
  const chars = charCount(text);
  if (chars <= RESULT_INLINE_CHAR_LIMIT) return { text };

  // The call id comes from the model provider; its hash makes a safe name.
  const callHash = (await sha256(new TextEncoder().encode(origin.callId))).slice(0, 16);
  const name = `${origin.runId}/round-${String(origin.round).padStart(3, '0')}-call_${callHash}.txt`;
  const storedAt = `${TOOL_RESULTS_ROOT}/${name}`;
  await store.put(name, lineAddressable(text));

  const preview = takeChars(text, STORED_LINE_CHARS);
  return {
    text: [
      `This tool result is too large to include in full (${chars} characters). The full result is saved at \`${storedAt}\`.`,
      `Use ${modelToolName(READ_FILE)} with this path to read the full result. If the reader returns another preview, continue from the next line it indicates.`,
      `Use ${modelToolName(SEARCH_FILES)} on the same path to find specific text.`,
      '',
      '## Prefix preview',
      '',
      `The following is at most ${STORED_LINE_CHARS} Unicode characters from the beginning of the result and is not the complete result.`,
      '',
      preview,
    ].join('\n'),
    storedAt,
  };
}

function lineAddressable(text: string): string {
  const chunk = new RegExp(`[\\s\\S]{1,${STORED_LINE_CHARS}}`, 'gu');
  return text
    .split('\n')
    .map((line) => line.match(chunk)?.join('\n') ?? '')
    .join('\n');
}
