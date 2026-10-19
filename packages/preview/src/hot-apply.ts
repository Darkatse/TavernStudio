import { jsonEqual, type DataChange, type JsonValue } from '@tavern-studio/workspace';

/**
 * How a vendor image sets each theme field through its own control, from the
 * image's anatomy (vendors/lib/anatomy.mjs, `theme.json`). A field without a
 * control has no hot-apply entry: changing it reloads the View.
 */
export interface ThemeAnatomy {
  fields: Record<string, { control: ThemeControl | null }>;
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

/** The theme field a change sets, when it sets one: `settings.json#/power_user/<field>`. */
function themeField(change: DataChange): string | undefined {
  const [object, field, ...rest] = change.pointer ?? [];
  return change.path === SETTINGS && object === 'power_user' && rest.length === 0
    ? field
    : undefined;
}

/**
 * Whether every change has a hot-apply entry (docs/Architecture.md §5): a
 * theme field with a control, set to a value a control can hold.
 */
export function canHotApply(anatomy: ThemeAnatomy, changes: readonly DataChange[]): boolean {
  return changes.every((change) => {
    const field = themeField(change);
    return field !== undefined && isScalar(change.value) && !!anatomy.fields[field]?.control;
  });
}

/** What a hot-apply did to a page. */
export interface HotApplied {
  /** Changes the vendor did not take; the caller then reloads, since a reload is the authority. */
  missed: DataChange[];
  /**
   * The changes it took, with the value as the vendor now holds and will
   * save it: a colour control keeps a colour in its own form, `#ffcc00` as
   * `rgba(255, 204, 0, 1)` for instance.
   */
  held: DataChange[];
}

/**
 * Brings a running vendor page to the changed values through its own
 * controls, as the author would by hand, and reads its settings back. The
 * vendor's handlers then save the values themselves.
 */
export function hotApply(
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
