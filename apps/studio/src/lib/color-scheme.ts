/** Follow the system, or keep Studio light or dark whatever the system says. */
export type ColorScheme = 'system' | 'light' | 'dark';

/**
 * The manual scheme lives in a cookie, the one preference that must be known
 * before the first frame: index.html reads it with an inline script, which
 * IndexedDB could not serve in time. Losing it only means following the
 * system again (docs/UI.md §3).
 */
const COOKIE = 'studio-scheme';

export function readColorScheme(): ColorScheme {
  const scheme = new RegExp(`(?:^|; )${COOKIE}=(light|dark)(?:;|$)`).exec(document.cookie)?.[1];
  return scheme === 'light' || scheme === 'dark' ? scheme : 'system';
}

/** Keeps the author's choice and applies it. */
export function setColorScheme(scheme: ColorScheme): void {
  const attributes = '; Path=/; SameSite=Strict';
  document.cookie =
    scheme === 'system'
      ? `${COOKIE}=${attributes}; Max-Age=0`
      : `${COOKIE}=${scheme}${attributes}; Max-Age=31536000`;
  applyColorScheme(scheme);
}

/**
 * Switches Studio's color scheme. The tokens read `data-theme` on <html>
 * (styles/index.css); without it they follow `prefers-color-scheme`.
 */
export function applyColorScheme(scheme: ColorScheme): void {
  freezeTransitions();
  const root = document.documentElement;
  if (scheme === 'system') delete root.dataset.theme;
  else root.dataset.theme = scheme;
}

// A system switch recolors Studio just the same while it follows the system.
// The change event runs before the frame restyles, so it can freeze in time.
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', freezeTransitions);

/**
 * Turns every transition off for the frame that applies a new scheme, so all
 * colors change at once instead of element by element (docs/UI.md §3).
 * Transitions come back one frame later, after the new colors are styled, so
 * nothing is left to animate.
 */
function freezeTransitions() {
  const freeze = document.createElement('style');
  freeze.textContent = '*, *::before, *::after { transition: none !important; }';
  document.head.append(freeze);
  requestAnimationFrame(() => requestAnimationFrame(() => freeze.remove()));
}
