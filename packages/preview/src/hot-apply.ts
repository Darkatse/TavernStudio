import { jsonEqual, type DataChange, type JsonValue } from '@tavern-studio/workspace';
import { dataPathForUrl } from './routes';

/**
 * How a vendor image applies each theme field, from the image's anatomy
 * (vendors/lib/anatomy.mjs, `theme.json`): the control that sets it, the CSS
 * variables it drives, and the element whose content it becomes. A field
 * without a control has no hot-apply entry: changing it reloads the View.
 */
export interface ThemeAnatomy {
  fields: Record<
    string,
    { control: ThemeControl | null; cssVariables: string[]; element: string | null }
  >;
}

export interface ThemeControl {
  selector: string;
  /** What the control is, such as `color` or `range`; a colour control keeps the colour in its own form. */
  kind: string;
  /** A property to assign (`value`, `checked`) or an attribute to set (a color picker's `color`). */
  write: { property: string } | { attribute: string };
  /** The event the vendor's handler listens for; null when writing raises it already. */
  dispatch: string | null;
  /**
   * The event the handler waits for before it applies the value, such as a
   * slider's `mouseup`; without it the value is stored but not shown yet.
   */
  commit: string | null;
}

const SETTINGS = 'default-user/settings.json';
/** A user's extension folder, which names the extension: `third-party/<folder>`. */
const EXTENSION_FOLDER = /^default-user\/extensions\/([^/]+)\//;
/** How long a page may take to load a stylesheet again before the View reloads instead. */
const STYLESHEET_WAIT_MS = 5000;
/** Gives a stylesheet loaded again a URL of its own. The Preview SW ignores the query. */
const RELOAD_PARAM = 'studio-reload';

/** The theme field a change sets, when it sets one: `settings.json#/power_user/<field>`. */
function themeField(change: DataChange): string | undefined {
  const [object, field, ...rest] = change.pointer ?? [];
  return change.path === SETTINGS && object === 'power_user' && rest.length === 0
    ? field
    : undefined;
}

/**
 * The stylesheet a page loaded from a data file through an extension's
 * manifest. SillyTavern and TauriTavern both load it as
 * `<link id="third-party_<folder>-css">` (their `sanitizeSelector` of
 * `third-party/<folder>-css`), at a URL the Preview SW maps to that file;
 * TauriTavern may add a query of its own. Undefined for any other file, such
 * as a stylesheet the manifest does not name, or one that has not loaded.
 */
function extensionStylesheet(page: Window, path: string): HTMLLinkElement | undefined {
  const folder = EXTENSION_FOLDER.exec(path)?.[1];
  if (folder === undefined) return undefined;
  const link = page.document.getElementById(
    `third-party/${folder}-css`.replaceAll(/[^a-z0-9_-]/gi, '_'),
  );
  return link instanceof (page as typeof window).HTMLLinkElement &&
    link.sheet !== null &&
    dataPathForUrl(new URL(link.href)) === path
    ? link
    : undefined;
}

/**
 * Whether every change has a hot-apply entry in every page
 * (docs/Architecture.md §5), by data path:
 * - a theme field with a control, set to a value a control can hold. The
 *   page's control takes it, and the page saves it;
 * - a whole extension stylesheet the page loaded through its manifest. No
 *   page writes such a file: Studio writes it, and the page loads it again.
 */
export function canHotApply(
  pages: readonly Window[],
  anatomy: ThemeAnatomy,
  changes: readonly DataChange[],
): boolean {
  return changes.every((change) => {
    const field = themeField(change);
    if (field !== undefined) return isScalar(change.value) && !!anatomy.fields[field]?.control;
    return (
      change.pointer === undefined &&
      pages.every((page) => extensionStylesheet(page, change.path) !== undefined)
    );
  });
}

/** What a hot-apply did to a page. */
export interface HotApplied {
  /** Changes the page did not take; the caller then reloads, since a reload is the authority. */
  missed: DataChange[];
  /**
   * The values it took, as the vendor now holds and will save them: a
   * colour control keeps a colour in its own form, `#ffcc00` as
   * `rgba(255, 204, 0, 1)` for instance.
   */
  held: DataChange[];
}

/**
 * Brings a running vendor page to the changes `canHotApply` accepted. Theme
 * values go through the page's own controls, as the author would set them
 * by hand, and are read back; the vendor's handlers then save them. Whole
 * stylesheets, which Studio has written and published, load again in place.
 */
export async function hotApply(
  page: Window,
  anatomy: ThemeAnatomy,
  changes: readonly DataChange[],
): Promise<HotApplied> {
  const values = changes.filter((change) => change.pointer !== undefined);
  const files = changes.filter((change) => change.pointer === undefined);
  const applied = applyValues(page, anatomy, values);
  const loaded = await Promise.all(files.map((change) => reloadStylesheet(page, change.path)));
  applied.missed.push(...files.filter((_, index) => !loaded[index]));
  return applied;
}

/**
 * Loads an extension's stylesheet again in place: the same element at a new
 * URL, so the cascade keeps its order. Chromium keeps the old sheet applied
 * until the new one has loaded, so nothing shows unstyled in between.
 * Resolves to whether it loaded.
 */
function reloadStylesheet(page: Window, path: string): Promise<boolean> {
  const link = extensionStylesheet(page, path);
  if (!link) return Promise.resolve(false);
  const url = new URL(link.href);
  url.searchParams.set(RELOAD_PARAM, crypto.randomUUID());
  return new Promise((resolve) => {
    const listening = new (page as typeof window).AbortController();
    const settle = (loaded: boolean) => {
      listening.abort();
      clearTimeout(timer);
      resolve(loaded);
    };
    const timer = setTimeout(() => settle(false), STYLESHEET_WAIT_MS);
    link.addEventListener('load', () => settle(true), { signal: listening.signal });
    link.addEventListener('error', () => settle(false), { signal: listening.signal });
    link.href = url.href;
  });
}

/** Sets theme values through the page's own controls and reads them back. */
function applyValues(
  page: Window,
  anatomy: ThemeAnatomy,
  changes: readonly DataChange[],
): HotApplied {
  for (const change of changes) {
    const control = anatomy.fields[themeField(change) ?? '']?.control;
    const element = control && page.document.querySelector(control.selector);
    if (!control || !element || !isScalar(change.value)) continue;
    const value = change.value;
    if ('attribute' in control.write) {
      element.setAttribute(control.write.attribute, String(value));
    } else {
      Object.assign(element, {
        [control.write.property]:
          control.write.property === 'checked' ? Boolean(value) : String(value),
      });
    }
    for (const type of [control.dispatch, control.commit]) {
      if (type) element.dispatchEvent(new (page as typeof window).Event(type, { bubbles: true }));
    }
  }
  const settings = vendorSettings(page);
  const applied: HotApplied = { missed: [], held: [] };
  for (const change of changes) {
    const field = themeField(change) ?? '';
    const held = settings?.[field];
    const taken =
      jsonEqual(held, change.value) ||
      (anatomy.fields[field]?.control?.kind === 'color' && sameColor(page, held, change.value));
    if (taken && held !== undefined) applied.held.push({ ...change, value: held });
    else applied.missed.push(change);
  }
  return applied;
}

/** Whether two values name the same colour, as the page's own canvas reads them. */
function sameColor(page: Window, a: JsonValue | undefined, b: JsonValue | undefined): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const context = page.document.createElement('canvas').getContext('2d');
  if (!context) return false;
  // A value the canvas does not take leaves the previous style, so try it over two.
  const normal = (value: string) => {
    context.fillStyle = '#000';
    context.fillStyle = value;
    const overBlack = context.fillStyle;
    context.fillStyle = '#fff';
    context.fillStyle = value;
    return overBlack === context.fillStyle ? overBlack : undefined;
  };
  const left = normal(a);
  return left !== undefined && left === normal(b);
}

function isScalar(value: JsonValue | undefined): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

/** `power_user` as the vendor holds it in memory. */
function vendorSettings(page: Window): Record<string, JsonValue> | undefined {
  const context = (
    page as Window & {
      SillyTavern?: { getContext(): { powerUserSettings?: Record<string, JsonValue> } };
    }
  ).SillyTavern?.getContext();
  return context?.powerUserSettings;
}
