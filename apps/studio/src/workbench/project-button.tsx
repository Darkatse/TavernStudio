import { clsx } from 'clsx';
import { ChevronDown } from 'lucide-react';
import { useMessages } from '../i18n/messages';
import { useCurrentRecord } from '../project/use-project';
import { Button, type ButtonProps } from '../ui/button';
import { workbenchMessages } from './messages';

export type ProjectButtonProps = Omit<ButtonProps, 'children'> & {
  /** The name being typed, while the project is renamed. */
  draft?: string | undefined;
};

/**
 * It stays on the first screen to stand in while the project menu loads.
 * Unlike other buttons it gives way in a crowded header: the name truncates
 * before the controls beside it are pushed out.
 *
 * While the project is renamed it holds the name field's place, as wide as
 * the name or the draft, whichever is wider. It hides its own name at once
 * and lets the chevron fade.
 */
export function ProjectButton({ draft, ...props }: ProjectButtonProps) {
  const m = useMessages(workbenchMessages);
  const record = useCurrentRecord();
  const name = record?.name ?? m.noProject;
  return (
    <Button
      variant="ghost"
      inert={draft !== undefined}
      className="max-w-52 min-w-0 shrink gap-1 px-2"
      {...props}
    >
      {draft === undefined ? (
        <span className="truncate">{name}</span>
      ) : (
        <span className="grid min-w-0 opacity-0 *:col-start-1 *:row-start-1 *:truncate *:whitespace-pre">
          <span>{name}</span>
          <span>{draft}</span>
        </span>
      )}
      <ChevronDown
        className={clsx(
          'text-muted transition-opacity motion-moderate',
          draft !== undefined && 'opacity-0',
        )}
      />
    </Button>
  );
}
