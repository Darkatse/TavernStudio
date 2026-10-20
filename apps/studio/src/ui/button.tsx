import { Button as BaseButton } from '@base-ui/react/button';
import { clsx } from 'clsx';

const variants = {
  primary: 'bg-primary text-primary-fg not-data-disabled:hover:bg-primary/85',
  // Raised, as a popover is: dark mode lightens each layer, and a button on a
  // popover painted in the panel's color would look sunk into it.
  secondary: 'bg-raised text-fg shadow-control not-data-disabled:hover:bg-hover',
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
 * disabled. Its layout defaults have no specificity, so a `className` that
 * sets the same property wins wherever the stylesheet puts it.
 */
export function Button({ variant = 'secondary', icon = false, className, ...props }: ButtonProps) {
  return (
    <BaseButton
      focusableWhenDisabled
      className={clsx(
        'inline-flex cursor-pointer items-center justify-center rounded-md font-medium whitespace-nowrap transition-[background-color,color,box-shadow] motion-fast select-none data-disabled:cursor-not-allowed data-disabled:opacity-45 [&_svg]:size-(--size-icon) [&_svg]:shrink-0',
        variants[variant],
        '[:where(&)]:h-(--size-control) [:where(&)]:shrink-0 [:where(&)]:gap-1.5',
        icon ? '[:where(&)]:w-(--size-control)' : '[:where(&)]:px-3',
        className,
      )}
      {...props}
    />
  );
}
