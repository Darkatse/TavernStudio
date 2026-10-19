import type { JsonValue } from '@tavern-studio/workspace';
import type { ReadState } from './read-state';

export type JsonObject = { [key: string]: JsonValue };

/**
 * A tool the Agent can call (docs/Agent.md §4). Its id groups by dot, as in
 * TauriTavern; the model sees the dots as underscores, since OpenAI and
 * Anthropic allow no dots in tool names.
 */
export interface Tool {
  /** For example `workspace.read_file`. */
  id: string;
  /** Model-facing; names other tools by `modelToolName`. */
  description: string;
  /** A JSON Schema object. */
  inputSchema: JsonObject;
  /** Runs with arguments already normalized to an object (see `normalizeArguments`). */
  run(input: JsonObject, context: ToolContext): Promise<ToolResult>;
}

export interface ToolContext {
  /** Aborts when the Run is cancelled. */
  signal: AbortSignal;
  /** What this Run has read and written, for compare-and-swap writes. */
  reads: ReadState;
}

/** What a tool returns to the model. */
export interface ToolResult {
  text: string;
}

/**
 * A mistake the model can correct, such as a stale file or a bad range. It
 * goes back to the model as an error result with its code, as in TauriTavern
 * (`workspace.write_stale_file`, …). Any other error ends the Run.
 */
export class ToolError extends Error {
  override name = 'ToolError';
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/** The name a model calls a tool by: the id with dots as underscores. */
export function modelToolName(id: string): string {
  return id.replaceAll('.', '_');
}
