import { jsonEqual, type DataChange, type JsonValue } from '@tavern-studio/workspace';
import type { VendorKind } from './host';

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
 * Data a vendor saves only if it still is what the page loaded. TauriTavern's
 * Web Host checks settings.json against the revision the page read, so a
 * change Studio writes under a running TauriTavern page makes every later
 * save of that page fail. Such a change reaches the page through a reload,
 * after the page has saved on exit.
 */
const GUARDED: Record<VendorKind, ReadonlySet<string>> = {
  st: new Set(),
  tt: new Set([SETTINGS]),
};

/**
 * Whether every change has a hot-apply entry (docs/Architecture.md §5): a
 * theme field with a control, set to a value a control can hold, in data the
 * vendor does not guard.
 */
export function canHotApply(
  anatomy: ThemeAnatomy,
  vendor: VendorKind,
  changes: readonly DataChange[],
): boolean {
  return changes.every((change) => {
    const field = themeField(change);
    return (
      field !== undefined &&
      !GUARDED[vendor].has(change.path) &&
      isScalar(change.value) &&
      !!anatomy.fields[field]?.control
    );
  });
}

/**
 * Brings a running vendor page to the changed values through its own
 * controls, as the author would by hand, and reads its settings back.
 * Returns the changes the vendor did not take; the caller then reloads,
 * since a reload is the authority a hot-apply must match.
 */
export function hotApply(
  page: Window,
  anatomy: ThemeAnatomy,
  changes: readonly DataChange[],
): DataChange[] {
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
  return changes.filter((change) => !jsonEqual(settings?.[themeField(change) ?? ''], change.value));
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
