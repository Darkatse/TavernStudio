import type { JsonValue } from '@tavern-studio/workspace';
import { ToolError, type JsonObject } from './tool';
import { parseWorkspacePath } from './workspace';

const INVALID_ARGUMENTS = 'tool.invalid_arguments';
const QUOTED_CHARS = 200;

/** Decodes a tool call's arguments as TauriTavern's `ToolArguments` does. */
export function normalizeArguments(raw: unknown): JsonObject {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== 'string') {
    if (isObject(raw)) return raw as JsonObject;
    throw invalidArguments(JSON.stringify(raw));
  }
  if (raw.trim() === '') return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw invalidArguments(raw);
  }
  if (parsed === null) return {};
  if (isObject(parsed)) return parsed as JsonObject;
  throw invalidArguments(raw);
}

function isObject(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidArguments(raw: string): ToolError {
  const characters = Array.from(raw);
  const quoted =
    characters.length > QUOTED_CHARS ? `${characters.slice(0, QUOTED_CHARS).join('')}…` : raw;
  return new ToolError(
    INVALID_ARGUMENTS,
    `arguments must be a JSON object; send \`{}\` when the call takes no arguments. Received: \`${quoted}\``,
  );
}

// The argument readers below follow TauriTavern's `agent_tools/common.rs`.

export function requiredTrimmedString(args: JsonObject, key: string): string {
  const value = args[key];
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (trimmed === '') throw new ToolError(INVALID_ARGUMENTS, `${key} is required`);
  return trimmed;
}

export function requiredRawString(args: JsonObject, key: string): string {
  const value = args[key];
  if (typeof value !== 'string') throw new ToolError(INVALID_ARGUMENTS, `${key} is required`);
  return value;
}

export function optionalCount(args: JsonObject, key: string): number | undefined {
  const value: JsonValue | undefined = args[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new ToolError(INVALID_ARGUMENTS, `${key} must be a non-negative integer`);
  }
  return value;
}

export function optionalBoolean(args: JsonObject, key: string): boolean | undefined {
  const value = args[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') {
    throw new ToolError(INVALID_ARGUMENTS, `${key} must be a boolean`);
  }
  return value;
}

export function ensureOnlyArguments(args: JsonObject, allowed: readonly string[]): void {
  const unknown = Object.keys(args).find((key) => !allowed.includes(key));
  if (unknown !== undefined) throw new ToolError(INVALID_ARGUMENTS, `${unknown} is not supported`);
}

/** undefined means the whole workspace. */
export function optionalListPath(args: JsonObject, key: string): string | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new ToolError(INVALID_ARGUMENTS, `${key} must be a string`);
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === '.' || trimmed === './') return undefined;
  return parseWorkspacePath(trimmed, INVALID_ARGUMENTS);
}
