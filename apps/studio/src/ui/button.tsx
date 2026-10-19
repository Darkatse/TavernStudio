import { Button as BaseButton } from '@base-ui/react/button';
import { clsx } from 'clsx';

const variants = {
  primary: 'bg-primary text-primary-fg not-data-disabled:hover:bg-primary/85',
  secondary: 'bg-surface text-fg shadow-control not-data-disabled:hover:bg-hover',
  ghost: 'text-muted not-data-disabled:hover:bg-hover not-data-disabled:hover:text-fg',
};

export type ButtonVariant = keyof typeof variants;

export type ButtonProps = Omit<BaseButton.Props, 'className'> & {
  variant?: ButtonVariant;
  /** A square button holding one icon. Give it an `aria-label`. */
  icon?: boolean;
  /** Layout only. Visual differences belong in a variant. */
  className?: string;
};

/**
 * Disabled buttons stay focusable so a tooltip can explain why they are
 * disabled.
 */
export function Button({ variant = 'secondary', icon = false, className, ...props }: ButtonProps) {
  return (
    <BaseButton
      focusableWhenDisabled
      className={clsx(
        'inline-flex h-(--size-control) shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-[background-color,color,box-shadow] motion-fast select-none data-disabled:cursor-not-allowed data-disabled:opacity-45 [&_svg]:size-(--size-icon) [&_svg]:shrink-0',
        variants[variant],
        icon ? 'w-(--size-control)' : 'px-3',
        className,
      )}
      {...props}
    />
  );
}
