import type { ImageContent } from '@earendil-works/pi-ai';
import type { JsonValue } from '@tavern-studio/workspace';
import type { ReadState } from './read-state';

export type JsonObject = { [key: string]: JsonValue };

/**
 * Its id groups by dot, as in TauriTavern; the model sees the dots as
 * underscores, since OpenAI and Anthropic allow no dots in tool names.
 */
export interface Tool {
  id: string;
  /** Model-facing; names other tools by `modelToolName`. */
  description: string;
  /** A JSON Schema object. */
  inputSchema: JsonObject;
  run(input: JsonObject, context: ToolContext): Promise<ToolResult>;
}

export interface ToolContext {
  run: string;
  signal: AbortSignal;
  reads: ReadState;
}

export interface ToolResult {
  text: string;
  /**
   * Screenshots, after the text. pi-ai moves them into a user message for
   * APIs that take images only there.
   */
  images?: ImageContent[];
  /** For the Transcript, never sent to the model. */
  details?: JsonObject;
}

/**
 * A mistake the model can correct. It goes back to the model as an error
 * result with its code, as in TauriTavern; any other error ends the Run.
 */
export class ToolError extends Error {
  override name = 'ToolError';
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export function modelToolName(id: string): string {
  return id.replaceAll('.', '_');
}
