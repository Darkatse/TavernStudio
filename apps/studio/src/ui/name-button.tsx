import { clsx } from 'clsx';
import { ChevronDown } from 'lucide-react';
import { Button, type ButtonProps } from './button';

export type NameButtonProps = Omit<ButtonProps, 'children'> & {
  name: string;
  /** The name being typed, while it is renamed in place. */
  draft?: string | undefined;
};

/**
 * The name of what a menu acts on, such as the project or the conversation,
 * opening that menu. Unlike other buttons it gives way in a crowded header:
 * the name truncates before the controls beside it are pushed out.
 *
 * While renamed, it holds the name field's place, as wide as the name or the
 * draft, whichever is wider. It hides its own name at once and lets the
 * chevron fade.
 */
export function NameButton({ name, draft, ...props }: NameButtonProps) {
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
