import { Fragment } from 'react';

/**
 * A path or mount point that wraps after its separators (`/`, `#`) instead of
 * inside a name, when it has to wrap at all.
 */
export function PathText({ path }: { path: string }) {
  return path.split(/(?<=[/#])/).map((part, index) => (
    <Fragment key={index}>
      {index > 0 && <wbr />}
      {part}
    </Fragment>
  ));
}
