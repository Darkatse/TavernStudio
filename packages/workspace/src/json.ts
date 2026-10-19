export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;
export interface JsonObject {
  [key: string]: JsonValue;
}

/** A JSON Pointer (RFC 6901) as its reference tokens; `[]` is the whole document. */
export type Pointer = readonly string[];

export function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function jsonEqual(a: JsonValue | undefined, b: JsonValue | undefined): boolean {
  if (a === b) return true;
  if (Array.isArray(a)) {
    return (
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, index) => jsonEqual(item, b[index]))
    );
  }
  if (isJsonObject(a) && isJsonObject(b)) {
    const keys = Object.keys(a);
    return (
      keys.length === Object.keys(b).length &&
      keys.every((key) => Object.hasOwn(b, key) && jsonEqual(a[key], b[key]))
    );
  }
  return false;
}

/** JSON Merge Patch (RFC 7386). */
export function mergePatch(target: JsonValue | undefined, patch: JsonValue): JsonValue {
  if (!isJsonObject(patch)) return patch;
  const result: JsonObject = isJsonObject(target) ? { ...target } : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete result[key];
    else result[key] = mergePatch(result[key], value);
  }
  return result;
}

export function parsePointer(text: string): Pointer {
  if (text === '') return [];
  if (!text.startsWith('/'))
    throw new Error(`"${text}" is not a JSON Pointer: it must start with "/"`);
  return text
    .slice(1)
    .split('/')
    .map((token) => token.replaceAll('~1', '/').replaceAll('~0', '~'));
}

export function formatPointer(pointer: Pointer): string {
  return pointer.map((token) => `/${token.replaceAll('~', '~0').replaceAll('/', '~1')}`).join('');
}

export function isPrefix(prefix: Pointer, pointer: Pointer): boolean {
  return (
    prefix.length <= pointer.length && prefix.every((token, index) => token === pointer[index])
  );
}

export function getAt(document: JsonValue | undefined, pointer: Pointer): JsonValue | undefined {
  let value = document;
  for (const token of pointer) {
    if (Array.isArray(value)) {
      const index = arrayIndex(value, token, false);
      value = index === undefined ? undefined : value[index];
    } else if (isJsonObject(value)) {
      value = Object.hasOwn(value, token) ? value[token] : undefined;
    } else {
      return undefined;
    }
  }
  return value;
}

/**
 * The document with the value at `pointer` replaced, or removed when `value`
 * is undefined. Missing objects on the way are created; an array on the way
 * must already hold the indexed element, since a Mount never grows arrays.
 */
export function setAt(
  document: JsonValue | undefined,
  pointer: Pointer,
  value: JsonValue | undefined,
): JsonValue | undefined {
  const [token, ...rest] = pointer;
  if (token === undefined) return value;
  if (Array.isArray(document)) {
    const index = arrayIndex(document, token, true);
    const next = setAt(document[index], rest, value);
    if (next === undefined) throw new Error(`Cannot remove array element ${token} through a Mount`);
    return document.with(index, next);
  }
  const object = isJsonObject(document) ? { ...document } : {};
  const next = setAt(object[token], rest, value);
  if (next === undefined) delete object[token];
  else object[token] = next;
  return object;
}

function arrayIndex(array: JsonValue[], token: string, required: true): number;
function arrayIndex(array: JsonValue[], token: string, required: false): number | undefined;
function arrayIndex(array: JsonValue[], token: string, required: boolean): number | undefined {
  const index = /^(0|[1-9]\d*)$/.test(token) ? Number(token) : -1;
  if (index >= 0 && index < array.length) return index;
  if (required) throw new Error(`Array index "${token}" is out of range (length ${array.length})`);
  return undefined;
}
