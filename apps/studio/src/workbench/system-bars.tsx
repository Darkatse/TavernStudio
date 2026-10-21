import { clsx } from 'clsx';
import { useEffect, useState } from 'react';
import type { Device } from '../preview/devices';
import {
  observeEdgeColors,
  wantsDarkGlyphs,
  type EdgeColors,
  type Rgb,
} from '../preview/edge-colors';

/**
 * The status bar and home indicator around a page that is up. They only show
 * the screen's proportions. Each takes the color of the page's edge beside it,
 * and its glyphs are dark or light by that color.
 *
 * Drawn after iOS 27 on an iPhone 17, in its points, as measured on Apple's
 * simulator, without the Dynamic Island; the shapes are Studio's own, fitted
 * to those captures.
 */
export function SystemBars({ page, insets }: { page: Window; insets: Device['insets'] }) {
  const [colors, setColors] = useState<EdgeColors>();
  useEffect(() => observeEdgeColors(page, insets, setColors), [page, insets]);
  return (
    <>
      <svg
        aria-hidden="true"
        viewBox={`0 0 ${WIDTH} ${insets.top}`}
        className={clsx('absolute inset-x-0 top-0', glyphs(colors?.top))}
        style={{ height: insets.top, backgroundColor: fill(colors?.top) }}
      >
        <text
          x="72.5"
          y="38.5"
          textAnchor="middle"
          fontFamily="system-ui"
          fontSize="17.5"
          fontWeight="640"
          fill="currentColor"
        >
          9:41
        </text>
        <g fill="currentColor">
          <rect x="284.67" y="33.33" width="3.67" height="6.33" rx="1.83" />
          <rect x="290.33" y="31" width="3.67" height="8.67" rx="1.83" />
          <rect x="296" y="28.67" width="3.67" height="11" rx="1.83" />
          <rect x="301.67" y="26" width="3.67" height="13.67" rx="1.83" />
          <path
            d="M322.83 39.65L320.44 36.7A3.8 3.8 0 0 1 325.22 36.7Z"
            stroke="currentColor"
            strokeWidth="0.83"
            strokeLinejoin="round"
          />
          <path
            d="M318.27 33.56A6.5 6.5 0 0 1 327.39 33.56M314.77 30A11.5 11.5 0 0 1 330.89 30"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.63"
            strokeLinecap="round"
          />
          <rect x="340.67" y="25.33" width="26.4" height="13.67" rx="4.33" />
          <path d="M367.64 29.78A2.03 2.39 0 0 1 367.64 34.56Z" />
        </g>
      </svg>
      <svg
        aria-hidden="true"
        viewBox={`0 0 ${WIDTH} ${insets.bottom}`}
        className={clsx('absolute inset-x-0 bottom-0', glyphs(colors?.bottom))}
        style={{ height: insets.bottom, backgroundColor: fill(colors?.bottom) }}
      >
        <rect x="134" y={insets.bottom - 13} width="134" height="5" rx="2.5" fill="currentColor" />
      </svg>
    </>
  );
}

/** The screen the bars are drawn for is this many points wide. */
const WIDTH = 402;

function fill(color: Rgb | undefined): string | undefined {
  return color && `rgb(${color.join(' ')})`;
}

function glyphs(color: Rgb | undefined): string {
  return color === undefined || wantsDarkGlyphs(color) ? 'text-system-dark' : 'text-system-light';
}
