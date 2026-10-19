import type { JsonValue, Pointer } from '@tavern-studio/workspace';
import { clsx } from 'clsx';
import { useMessages } from '../i18n/messages';
import { adoptionMessages } from './messages';

export interface ValueRow {
  /** The field, relative to the mount point. */
  pointer: Pointer;
  project: JsonValue | undefined;
  session: JsonValue | undefined;
}

/** A field's path for reading: its tokens joined by `/`; `whole` when it is the whole value. */
export function fieldName(pointer: Pointer, whole: string): string {
  return pointer.length === 0 ? whole : pointer.join('/');
}

/**
 * JSON fields that differ, as a table of path, project value and session
 * value. The project value is what adopting replaces, so it reads as removed
 * and the session's as added. A narrow panel stacks each field.
 */
export function ValueTable({ rows }: { rows: readonly ValueRow[] }) {
  const m = useMessages(adoptionMessages);
  return (
    <table className="w-full border-separate border-spacing-0 text-caption @max-sm:block">
      <thead className="text-left text-muted @max-sm:sr-only">
        <tr>
          <th className="pb-1 font-normal">{m.path}</th>
          <th className="pb-1 font-normal">{m.project}</th>
          <th className="pb-1 font-normal">{m.session}</th>
        </tr>
      </thead>
      <tbody className="@max-sm:flex @max-sm:flex-col @max-sm:gap-2">
        {rows.map((row) => (
          <tr key={row.pointer.join('/')} className="@max-sm:flex @max-sm:flex-col @max-sm:gap-0.5">
            <th
              scope="row"
              className="py-0.5 pr-3 text-left align-top font-mono font-normal break-all"
            >
              {fieldName(row.pointer, m.wholeValue)}
            </th>
            <td className="py-0.5 pr-1 align-top">
              <Value value={row.project} side="project" />
            </td>
            <td className="py-0.5 align-top">
              <Value value={row.session} side="session" />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Value({ value, side }: { value: JsonValue | undefined; side: 'project' | 'session' }) {
  const m = useMessages(adoptionMessages);
  const removed = side === 'project';
  const text =
    value === undefined ? undefined : typeof value === 'string' ? value : JSON.stringify(value);
  return (
    <span
      className={clsx(
        'flex items-start gap-1.5 rounded-sm px-1.5 py-0.5 font-mono',
        removed ? 'bg-diff-del text-diff-del-fg' : 'bg-diff-add text-diff-add-fg',
      )}
    >
      <span aria-hidden="true">{removed ? '−' : '+'}</span>
      <span className="sr-only">{removed ? m.projectValue : m.sessionValue}</span>
      {typeof value === 'string' && isColor(value) && <Swatch color={value} />}
      {text === undefined ? (
        <span className="font-sans italic">{m.none}</span>
      ) : (
        <span className={clsx('min-w-0 break-all', removed && 'line-through')}>{text}</span>
      )}
    </span>
  );
}

/** Any value the browser reads as a CSS color, whatever the field. */
function isColor(value: string): boolean {
  return value.trim() !== '' && CSS.supports('color', value);
}

function Swatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className="mt-0.5 size-3 shrink-0 rounded-full shadow-[inset_0_0_0_1px_var(--color-line-strong)]"
      style={{ background: color }}
    />
  );
}
