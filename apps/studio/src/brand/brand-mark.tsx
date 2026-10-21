import { clsx } from 'clsx';
import { useId } from 'react';

const EYES = [
  { x: 9.775, y: 11.315 },
  { x: 16.065, y: 10.205 },
];

/** It blinks when pointed at. */
export function BrandMark({ className }: { className?: string }) {
  const eyes = useId();
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={clsx('group/mark', className)}>
      <mask id={eyes}>
        <rect width="24" height="24" fill="white" />
        {EYES.map(({ x, y }) => (
          // Tilted by the group: a transform property on the eye would replace the attribute.
          <g key={x} transform={`rotate(-10 ${x} ${y})`}>
            <ellipse
              cx={x}
              cy={y}
              rx="1.87"
              ry="2.53"
              className="origin-center [transform-box:fill-box] group-hover/mark:animate-blink"
            />
          </g>
        ))}
      </mask>
      <path
        d="M1.6 12.53A6.61 6.61 0 0 1 6.96 4.88L14.34 3.58A6.61 6.61 0 0 1 21.99 8.94L22.4 11.22A6.61 6.61 0 0 1 17.04 18.87L9.66 20.17A6.61 6.61 0 0 1 2.01 14.81ZM2.54 11.48L2.67 4.94A1.43 1.43 0 0 1 4.87 3.76L9.02 6.42ZM12.93 5.73L15.92 1.81A1.43 1.43 0 0 1 18.39 2.16L20.76 8.26ZM4.67 17.25L13.41 16.71L8.45 22.38A1.1 1.1 0 0 1 6.6 22.06Z"
        mask={`url(#${eyes})`}
        className="fill-accent"
      />
    </svg>
  );
}
