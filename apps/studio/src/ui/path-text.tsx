import { Fragment } from 'react';

export function PathText({ path }: { path: string }) {
  return path.split(/(?<=[/#])/).map((part, index) => (
    <Fragment key={index}>
      {index > 0 && <wbr />}
      {part}
    </Fragment>
  ));
}
