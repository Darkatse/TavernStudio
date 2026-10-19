/**
 * A theme file as SillyTavern's `getThemeObject` writes it: the name first,
 * then each theme field from `power_user`, in the frontend's own order. The
 * fields are the frontend's: TauriTavern has a few more than SillyTavern. A
 * field `power_user` lacks is left out, as JSON drops it there too.
 */
export function themeFile(
  name: string,
  powerUser: Readonly<Record<string, unknown>>,
  fields: readonly string[],
): Record<string, unknown> {
  const theme: Record<string, unknown> = { name };
  for (const field of fields) {
    if (Object.hasOwn(powerUser, field) && powerUser[field] !== undefined) {
      theme[field] = powerUser[field];
    }
  }
  return theme;
}
