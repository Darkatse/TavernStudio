import { clsx } from 'clsx';
import type { CSSProperties, ReactNode } from 'react';
import { BrandMark } from './brand-mark';

/** Inter kerns T against a, and letters in separate boxes are not kerned. */
const PIECES = ['Ta', 'v', 'e', 'r', 'n', ' ', 'S', 't', 'u', 'd', 'i', 'o'];

/**
 * The mark with the name beside it. What stands in the name's place, such as
 * the conversation menu, makes way for the name while the mark is pointed at.
 *
 * The name waits until the mark has shut its eyes, so a pointer passing over
 * changes nothing. Its pieces start pressed together beside the mark and
 * spread to their places over twice the slow tier, whose spring alone covers
 * most of the way in its first quarter. They fade in once the spread is under
 * way, so they are not seen pressed together. Leaving takes twice the slow
 * tier's exit step: the name fades where it stands before it draws back to
 * the mark, for the same reason, and the title comes back once it has faded.
 */
export function Brand({ children }: { children?: ReactNode }) {
  if (children === undefined) {
    return (
      <>
        <BrandMark className="size-5 shrink-0" />
        <span className="pl-2 text-subtitle">Tavern Studio</span>
      </>
    );
  }
  return (
    <>
      <span className="group/brand peer relative flex shrink-0">
        <BrandMark className="size-5" />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-full flex items-center pl-2.5 text-subtitle whitespace-pre"
        >
          {PIECES.map((piece, index) => (
            <span
              key={index}
              // Each piece starts a quarter em nearer than the one before:
              // less than any letter here is wide, so none passes another.
              style={{ '--from': `${-0.75 - 0.25 * index}em` } as CSSProperties}
              className={clsx(
                'inline-block translate-x-(--from) opacity-0 transition-[opacity,translate] ease-exit motion-reduce:translate-x-0',
                '[transition-delay:0s,var(--motion-fast)] duration-[calc(var(--motion-slow-exit)*2)]',
                'group-hover/brand:translate-x-0 group-hover/brand:opacity-100 group-hover/brand:ease-spring-bounce',
                'group-hover/brand:[transition-delay:var(--motion-moderate),var(--motion-fast)]',
                'group-hover/brand:[transition-duration:var(--motion-slow),calc(var(--motion-slow)*2)]',
              )}
            >
              {piece}
            </span>
          ))}
        </span>
      </span>
      <div className="flex min-w-0 transition-[opacity,translate] delay-(--motion-slow-exit) motion-moderate peer-hover:opacity-0 peer-hover:delay-(--motion-fast) peer-hover:duration-(--motion-slow-exit) peer-hover:ease-exit motion-safe:peer-hover:translate-x-1">
        {children}
      </div>
    </>
  );
}
