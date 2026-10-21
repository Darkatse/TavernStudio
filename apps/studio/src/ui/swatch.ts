/** CSS-wide keywords and `currentcolor` pass for any color, yet name none. */
const NO_COLOR = /^\s*(?:inherit|initial|unset|revert|revert-layer|currentcolor)\s*$/i;
/** Any value with one of these parses as a color, whatever it resolves to. */
const SUBSTITUTED = /\b(?:var|env|attr)\(/i;

/**
 * Whether a text is a whole color with a value of its own, the kind a swatch
 * shows beside it, as with `rgba(23, 23, 23, 0.85)` or `#fff`. A swatch is a
 * dot with the `swatch` utility whose `color` is that text.
 */
export function isColor(text: string): boolean {
  return CSS.supports('color', text) && !NO_COLOR.test(text) && !SUBSTITUTED.test(text);
}
