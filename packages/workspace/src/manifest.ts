import { isJsonObject, parsePointer, type JsonValue, type Pointer } from './json';

export const MANIFEST = 'studio.json';

export interface ProjectManifest {
  fixture: string;
  mounts: Mount[];
}

export interface Mount {
  /** A project file or directory. */
  from: string;
  to: MountPoint;
  /** Wraps text in a Markdown code block of this language before it is mounted. */
  fence?: string;
}

export interface MountPoint {
  path: string;
  pointer?: Pointer;
}

/** A problem with a project's manifest or its Mounts, named by what the author wrote. */
export class MountError extends Error {
  override name = 'MountError';
}

export function parseManifest(text: string): ProjectManifest {
  let parsed: JsonValue;
  try {
    parsed = JSON.parse(text) as JsonValue;
  } catch (error) {
    throw new MountError(`${MANIFEST} is not valid JSON: ${(error as Error).message}`, {
      cause: error,
    });
  }
  if (!isJsonObject(parsed)) throw new MountError(`${MANIFEST} must be a JSON object`);
  const { fixture, mounts } = parsed;
  if (typeof fixture !== 'string' || fixture === '') {
    throw new MountError(`${MANIFEST}: "fixture" must name a fixture`);
  }
  if (!Array.isArray(mounts)) throw new MountError(`${MANIFEST}: "mounts" must be an array`);
  return { fixture, mounts: mounts.map((mount, index) => parseMount(mount, index)) };
}

function parseMount(value: JsonValue, index: number): Mount {
  const where = `${MANIFEST}: mount ${index + 1}`;
  if (!isJsonObject(value)) throw new MountError(`${where} must be an object`);
  const { from, to, fence } = value;
  if (typeof from !== 'string' || !isRelativePath(from)) {
    throw new MountError(`${where}: "from" must be a relative path inside the project`);
  }
  if (typeof to !== 'string') throw new MountError(`${where}: "to" must be a data path`);
  const hash = to.indexOf('#');
  const path = hash === -1 ? to : to.slice(0, hash);
  if (!isRelativePath(path)) {
    throw new MountError(`${where}: "${path}" must be a data path relative to the data root`);
  }
  let pointer: Pointer | undefined;
  if (hash !== -1) {
    try {
      pointer = parsePointer(to.slice(hash + 1));
    } catch (error) {
      throw new MountError(`${where}: ${(error as Error).message}`, { cause: error });
    }
  }
  if (fence !== undefined && (typeof fence !== 'string' || !/^[\w+-]*$/.test(fence))) {
    throw new MountError(`${where}: "fence" must be a code block language, such as "html"`);
  }
  if (fence !== undefined && pointer === undefined) {
    throw new MountError(`${where}: "fence" applies to text mounted at a JSON Pointer`);
  }
  return {
    from,
    to: pointer === undefined ? { path } : { path, pointer },
    ...(fence === undefined ? {} : { fence }),
  };
}

/**
 * A POSIX path below some root: no leading slash, no empty, `.` or `..`
 * segments, and no control characters, which no file system names a file by.
 */
export function isRelativePath(path: string): boolean {
  return (
    path !== '' &&
    !path.includes('\\') &&
    // oxlint-disable-next-line no-control-regex -- control characters are what this refuses.
    !/[\u0000-\u001f\u007f]/.test(path) &&
    path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..')
  );
}
