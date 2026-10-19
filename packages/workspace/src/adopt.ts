import type { DataReader } from './apply';
import { readDocument, sameContent, unfence } from './documents';
import { getAt, jsonEqual, setAt, type JsonValue, type Pointer } from './json';
import { intendedAt, type FilePlacement, type Placement, type ValuePlacement } from './placements';

/**
 * Where the Session differs from what the project places: a session write on
 * a position the project owns. Echoes of the project's own content are not
 * differences, whatever their bytes (docs/Architecture.md §5).
 */
export type Difference =
  | { kind: 'file'; placement: FilePlacement; session: Uint8Array | undefined }
  | {
      kind: 'value';
      placement: ValuePlacement;
      pointer: Pointer;
      project: JsonValue | undefined;
      session: JsonValue | undefined;
    };

export function findDifferences(
  session: DataReader,
  placements: readonly Placement[],
): Difference[] {
  return placements.flatMap((placement): Difference[] => {
    const bytes = session.read(placement.path);
    if (placement.kind === 'file') {
      return bytes && sameContent(placement.path, bytes, placement.bytes)
        ? []
        : [{ kind: 'file', placement, session: bytes }];
    }
    const document = bytes && readDocument(placement.path, bytes);
    return placement.owned.flatMap((pointer): Difference[] => {
      const project = intendedAt(placement, pointer);
      const value = getAt(document, pointer);
      return jsonEqual(project, value)
        ? []
        : [{ kind: 'value', placement, pointer, project, session: value }];
    });
  });
}

/** A session write that cannot go back through its Mount, named for the author. */
export class AdoptionError extends Error {
  override name = 'AdoptionError';
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Takes a Mount's differences back into its source file: the new content of
 * `placement.source`, or null when the Session deleted a whole file. All the
 * differences belong to one placement, since adopting is per mount point.
 */
export function adopt(differences: readonly Difference[], source: Uint8Array): Uint8Array | null {
  const [first] = differences;
  if (!first) throw new Error('Nothing to adopt');
  if (differences.some((difference) => difference.placement !== first.placement)) {
    throw new Error('Differences from more than one mount point were adopted together');
  }
  if (first.kind === 'file') return first.session ?? null;

  const placement = first.placement;
  if (placement.format === 'text') return encoder.encode(adoptText(placement, first.session));

  const text = decoder.decode(source);
  let document = JSON.parse(text) as JsonValue | undefined;
  for (const difference of differences) {
    if (difference.kind !== 'value') continue;
    const relative = difference.pointer.slice(placement.pointer.length);
    document = setAt(document, relative, difference.session);
  }
  if (document === undefined) {
    throw new AdoptionError(
      `The preview removed ${placement.path}, so ${placement.source} has nothing to keep`,
    );
  }
  return encoder.encode(formatLike(text, document));
}

function adoptText(placement: ValuePlacement, value: JsonValue | undefined): string {
  if (typeof value !== 'string') {
    throw new AdoptionError(
      `The preview wrote a ${value === undefined ? 'missing' : typeof value} value where ${placement.source} expects text`,
    );
  }
  if (placement.fence === undefined) return value;
  const inner = unfence(value, placement.fence);
  if (inner === undefined) {
    throw new AdoptionError(
      `The preview wrote text that is not a \`\`\`${placement.fence} code block, so it cannot go back into ${placement.source}`,
    );
  }
  return inner;
}

/** JSON in the author's own indentation, keeping a final newline if the file had one. */
function formatLike(original: string, document: JsonValue): string {
  const indent = /\n([ \t]+)\S/.exec(original)?.[1] ?? '  ';
  const ending = original.endsWith('\n') ? '\n' : '';
  return `${JSON.stringify(document, null, indent)}${ending}`;
}
