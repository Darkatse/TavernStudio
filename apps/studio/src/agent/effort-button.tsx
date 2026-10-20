import type { ModelThinkingLevel } from '@tavern-studio/agent';
import { clsx } from 'clsx';
import { Lightbulb } from 'lucide-react';
import { useMessages } from '../i18n/messages';
import { Button, type ButtonProps } from '../ui/button';
import { effortMessages } from './effort-messages';

const EFFORTS = [
  'off',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
] as const satisfies readonly ModelThinkingLevel[];

export type EffortButtonProps = Omit<ButtonProps, 'children'> & { effort: ModelThinkingLevel };

/**
 * Only the current label takes up room, so the button fits it; the others lie
 * over it, out of the flow, and a change rolls the new one in: up as the
 * effort rises, down as it falls. The bulb fills as the effort rises.
 */
export function EffortButton({ effort, ...props }: EffortButtonProps) {
  const m = useMessages(effortMessages);
  const at = EFFORTS.indexOf(effort);
  return (
    <Button
      variant="ghost"
      aria-label={m.current(m.levels[effort])}
      className="shrink-0 gap-1 px-1.5 text-caption"
      {...props}
    >
      <span aria-hidden="true" className="grid *:col-start-1 *:row-start-1">
        <Lightbulb />
        <Lightbulb
          fill="currentColor"
          stroke="none"
          className="transition-opacity motion-moderate"
          style={{ opacity: at / (EFFORTS.length - 1) }}
        />
      </span>
      <span aria-hidden="true" className="relative">
        {EFFORTS.map((level, index) => (
          <span
            key={level}
            className={clsx(
              'block transition-[opacity,translate]',
              index === at ? 'motion-moderate' : 'absolute top-0 left-0 opacity-0 motion-fast-exit',
              index < at && 'translate-y-(--motion-fold-offset)',
              index > at && '-translate-y-(--motion-fold-offset)',
            )}
          >
            {m.levels[level]}
          </span>
        ))}
      </span>
    </Button>
  );
}
