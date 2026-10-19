import { evaluateTool, interactTool, readLogsTool, snapshotTool } from '@tauritavern/app-use';
import type { JsonValue } from '@tavern-studio/workspace';
import { modelToolName, ToolError, type JsonObject, type Tool, type ToolResult } from './tool';

/** The preview page the `app.*` tools act on, with app-use running in its realm. */
export interface AppPage {
  snapshot(run: string, args: JsonObject): JsonValue;
  interact(run: string, args: JsonObject): JsonValue;
  /** Runs an async function body in the page's realm and resolves to its result. */
  evaluate(run: string, code: string): Promise<unknown>;
}

/** A runtime record of the preview: an uncaught error, a rejection, console.error, a failed load. */
export interface AppLogEntry {
  timestampMs: number;
  level: 'warn' | 'error';
  message: string;
  /** The script and position, when known. */
  source?: string;
  /** `page` for the vendor page, otherwise the iframe's id or name. */
  frame: string;
}

/** What the app gives the `app.*` tools: the page, and what was recorded in it. */
export interface AppSurface {
  /**
   * The page once the preview shows the project as it is now: a change the
   * Run just wrote may still be reaching it, through a reload even. Rejects
   * when the preview does not start.
   */
  page(signal: AbortSignal): Promise<AppPage>;
  logs(): readonly AppLogEntry[];
}

const LOG_LEVELS = ['debug', 'info', 'warn', 'error'];
const EVALUATE = modelToolName(evaluateTool.name);
const READ_LOGS = modelToolName(readLogsTool.name);

/**
 * The page tools of TauriTavern's in-app assistant (docs/Agent.md §4), with
 * app-use's own definitions, so the contract is the same in both places. A
 * failure in the page is the model's to act on, as TT's extension tools
 * report it.
 */
export function appTools(surface: AppSurface): Tool[] {
  const page = async (signal: AbortSignal): Promise<AppPage> => {
    try {
      return await surface.page(signal);
    } catch (error) {
      if (signal.aborted) throw error;
      throw new ToolError(
        'app.page_not_ready',
        `The preview did not start: ${messageOf(error)}. No UI action was performed; ${READ_LOGS} may show why.`,
      );
    }
  };

  return [
    {
      id: snapshotTool.name,
      description: `${snapshotTool.description}
This is the live preview of the author's project in the real frontend. Studio's own interface is not part of it.`,
      inputSchema: snapshotTool.inputSchema,
      run: async (input, { run, signal }) => {
        const current = await page(signal);
        return fromPage(() => current.snapshot(run, input));
      },
    },
    {
      id: interactTool.name,
      description: interactTool.description,
      inputSchema: interactTool.inputSchema,
      run: async (input, { run, signal }) => {
        const current = await page(signal);
        return fromPage(() => current.interact(run, input));
      },
    },
    {
      id: evaluateTool.name,
      description: `${evaluateTool.description}
The page is SillyTavern or TauriTavern: SillyTavern.getContext() is the frontend's context, and on TauriTavern window.__TAURITAVERN__.api is its public API. What the code changes lands in the preview Session, not in the project; to keep a change, write it to the project's files.`,
      inputSchema: evaluateTool.inputSchema,
      run: async (input, { run, signal }) => {
        const code = input['code'];
        if (typeof code !== 'string' || code.trim() === '') {
          throw new ToolError(
            'tool.invalid_arguments',
            `${EVALUATE}: code must be a non-empty string`,
          );
        }
        const current = await page(signal);
        return fromPage(() => current.evaluate(run, code));
      },
    },
    {
      id: readLogsTool.name,
      description: `${readLogsTool.description}
Returns entries with timestampMs, level, message, the source position when known, and frame: page for the preview page, otherwise the iframe. Studio records warnings and errors only: uncaught errors, unhandled rejections, console.error, failed resource loads and requests the preview could not answer. Entries outlast reloads.`,
      inputSchema: readLogsTool.inputSchema,
      run: (input) => {
        const limit = input['limit'] ?? 30;
        if (typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
          throw new ToolError(
            'tool.invalid_arguments',
            `${READ_LOGS}: limit must be an integer between 1 and 100`,
          );
        }
        const levels = input['levels'];
        if (
          levels !== undefined &&
          (!Array.isArray(levels) ||
            levels.some((level) => typeof level !== 'string' || !LOG_LEVELS.includes(level)))
        ) {
          throw new ToolError(
            'tool.invalid_arguments',
            `${READ_LOGS}: levels must contain only debug, info, warn or error`,
          );
        }
        const wanted = levels === undefined ? undefined : new Set(levels);
        const entries = surface
          .logs()
          .filter((entry) => wanted === undefined || wanted.has(entry.level))
          .slice(-limit);
        return Promise.resolve({ text: JSON.stringify({ entries }) });
      },
    },
  ];
}

/**
 * A page result as the model reads it, as TauriTavern passes an extension
 * tool's value: a string as it is, anything else as JSON.
 */
async function fromPage(call: () => unknown): Promise<ToolResult> {
  let value: unknown;
  try {
    value = await call();
  } catch (error) {
    if (error instanceof ToolError) throw error;
    // Errors come from the page's realm, so `instanceof Error` cannot be relied on.
    throw new ToolError('app.tool_error', messageOf(error));
  }
  if (typeof value === 'string') return { text: value };
  let text: string | undefined;
  try {
    text = JSON.stringify(value ?? null);
  } catch (error) {
    throw new ToolError('app.result_not_json', `The result is not plain JSON: ${messageOf(error)}`);
  }
  if (text === undefined) {
    throw new ToolError(
      'app.result_not_json',
      'The result is not plain JSON: return data, not a function or symbol',
    );
  }
  return { text };
}

function messageOf(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error)
    return String(error.message);
  return String(error);
}
