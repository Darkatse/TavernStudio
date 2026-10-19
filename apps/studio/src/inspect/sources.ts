import { dataPathForUrl, type ThemeAnatomy } from '@tavern-studio/preview';
import { elementPath } from '@tavern-studio/preview/inspect';
import { formatPointer, type Placement, type Pointer } from '@tavern-studio/workspace';

const SETTINGS = 'default-user/settings.json';

/** Names use the Agent's workspace paths. */
export interface SourceNamer {
  sheet(sheet: CSSStyleSheet, line: number | undefined): string;
  attribute(element: Element, property: string): string;
}

export interface SourceContext {
  placements: readonly Placement[];
  anatomy: ThemeAnatomy;
  /** The files of the vendor image, by their path below its root. */
  vendorFiles: ReadonlySet<string>;
}

/**
 * Mounts place text verbatim, so a line in the sheet is a line in the project
 * file, one more when fenced.
 */
export function sourceNamer({ placements, anatomy, vendorFiles }: SourceContext): SourceNamer {
  const fields = Object.entries(anatomy.fields);
  const fieldOfElement = new Map(
    fields.flatMap(([key, field]) => (field.element ? [[field.element, key] as const] : [])),
  );
  const fieldsOfVariable = new Map<string, string[]>();
  for (const [key, field] of fields) {
    for (const name of field.cssVariables) {
      fieldsOfVariable.set(name, [...(fieldsOfVariable.get(name) ?? []), key]);
    }
  }

  const located = (path: string, pointer: Pointer | undefined, line: number | undefined) => {
    const where = inProject(placements, path, pointer);
    const at = (offset: number) => (line === undefined ? '' : `:${line + offset}`);
    if (where?.pointer) return `project/${where.file}#${formatPointer(where.pointer)}`;
    if (where) return `project/${where.file}${at(where.offset)}`;
    const data = pointer ? `${path}#${formatPointer(pointer)}` : path;
    return `the preview's data ${data}${at(0)}, which the project does not place`;
  };

  const themeField = (key: string, line?: number) =>
    `power_user.${key}, ${located(SETTINGS, ['power_user', key], line)}`;

  return {
    sheet(sheet, line) {
      // The owner lives in the page's realm, where Studio's Element is another class.
      const owner = sheet.ownerNode as Element | null;
      const lineText = line === undefined ? '' : `:${line}`;
      if (owner?.localName === 'style') {
        const field = owner.id ? fieldOfElement.get(`#${owner.id}`) : undefined;
        if (field) return themeField(field, line);
        const parent = owner.parentElement;
        const where = owner.id ? `<style id="${owner.id}">` : '<style>';
        return `${where} in ${parent ? elementPath(parent) : 'the page'}, added to the page as it ran${lineText}`;
      }
      if (sheet.href) {
        const url = new URL(sheet.href);
        const data = dataPathForUrl(url);
        if (data) return located(data, undefined, line);
        const file = decodeURIComponent(url.pathname).replace(/^\//, '');
        if (vendorFiles.has(file)) return `vendor/src/${file}${lineText}`;
        return `${url.href}${lineText}`;
      }
      return 'a stylesheet built by script';
    },
    attribute(element, property) {
      const keys = fieldsOfVariable.get(property);
      if (element === element.ownerDocument.documentElement && keys) {
        return `the style attribute of <html>, which the frontend sets from ${keys.map((key) => themeField(key)).join('; ')}`;
      }
      return `the style attribute of ${elementPath(element)}`;
    },
  };
}

/** A JSON Mount writes only the keys it holds, so another Mount may write beside it. */
function inProject(
  placements: readonly Placement[],
  path: string,
  pointer: Pointer | undefined,
): { file: string; offset: number; pointer?: Pointer } | undefined {
  for (const placement of placements) {
    if (placement.path !== path) continue;
    if (placement.kind === 'file') {
      if (!pointer) return { file: placement.source, offset: 0 };
      continue;
    }
    if (!pointer || !placement.owned.some((owned) => startsWith(pointer, owned))) continue;
    if (placement.format === 'json') {
      return {
        file: placement.source,
        offset: 0,
        pointer: pointer.slice(placement.pointer.length),
      };
    }
    // Text is the value at the Mount's pointer; a fence adds one line before it.
    return { file: placement.source, offset: placement.fence === undefined ? 0 : 1 };
  }
  return undefined;
}

function startsWith(pointer: Pointer, prefix: Pointer): boolean {
  return (
    prefix.length <= pointer.length && prefix.every((token, index) => pointer[index] === token)
  );
}
