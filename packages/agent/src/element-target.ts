import type { ElementTarget } from '@tauritavern/app-use';
import { modelToolName, ToolError, type JsonObject } from './tool';

const SNAPSHOT = modelToolName('app.snapshot');

export type { ElementTarget };

/**
 * How the preview and inspect tools name one element of the page: as
 * `app.interact` does, by a ref of the latest `app.snapshot` page or by a CSS
 * selector matching exactly one observable element, optionally within a ref.
 */
export const TARGET_PROPERTIES: JsonObject = {
  ref: {
    type: 'string',
    description: `A ref from the latest ${SNAPSHOT} page, for example s42:e27. Cannot be combined with selector or root.`,
  },
  selector: {
    type: 'string',
    description:
      'A CSS selector matching exactly one observable element. Searches the main document, or within root when given. Cannot be combined with ref.',
  },
  root: {
    type: 'string',
    description: `Optional scope for selector: a ref from the latest ${SNAPSHOT} page, such as an iframe to search inside. Requires selector.`,
  },
};

/**
 * The element a call of the tool `tool` (its id) names, or undefined when it
 * names none and `optional` allows that.
 */
export function elementTarget(
  input: JsonObject,
  tool: string,
  { optional }: { optional: boolean },
): ElementTarget | undefined {
  const name = modelToolName(tool);
  const text = (key: string) => {
    const value = input[key];
    if (value === undefined) return undefined;
    if (typeof value !== 'string' || value.trim() === '') {
      throw new ToolError('tool.invalid_arguments', `${name}: ${key} must be a non-empty string`);
    }
    return value.trim();
  };
  const ref = text('ref');
  const selector = text('selector');
  const root = text('root');
  if (ref !== undefined && (selector !== undefined || root !== undefined)) {
    throw new ToolError(
      'tool.invalid_arguments',
      `${name}: give ref alone, or selector with an optional root`,
    );
  }
  if (root !== undefined && selector === undefined) {
    throw new ToolError(
      'tool.invalid_arguments',
      `${name}: root scopes a selector; give selector too`,
    );
  }
  if (ref !== undefined) return { ref };
  if (selector !== undefined) return root === undefined ? { selector } : { selector, root };
  if (optional) return undefined;
  throw new ToolError('tool.invalid_arguments', `${name}: name the element by ref or selector`);
}
