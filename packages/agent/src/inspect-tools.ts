import { interactTool } from '@tauritavern/app-use';
import type { JsonValue } from '@tavern-studio/workspace';
import { elementTarget, TARGET_PROPERTIES, type ElementTarget } from './element-target';
import { modelToolName, ToolError, type Tool, type ToolResult } from './tool';

/** What the `inspect.*` tools read: the styles and layout of the preview page (docs/Agent.md §4). */
export interface InspectSurface {
  /**
   * The cascade of one element: the rules matching it, where each comes from,
   * and why each property has its value.
   */
  styles(
    run: string,
    target: ElementTarget,
    properties: readonly string[] | undefined,
    signal: AbortSignal,
  ): Promise<JsonValue>;
  /** Deterministic checks over the part of the page in view, or of one region of it. */
  audit(run: string, target: ElementTarget | undefined, signal: AbortSignal): Promise<JsonValue>;
}

/** Explained when the call names none. */
export const DEFAULT_STYLE_PROPERTIES = [
  'color',
  'background-color',
  'background-image',
  'font-family',
  'font-size',
  'opacity',
];

const INTERACT = modelToolName(interactTool.name);
const STYLES = modelToolName('inspect.styles');

/**
 * The inspect tools (docs/Agent.md §4): numbers and sources read from the
 * running page, where a screenshot would leave the model to guess.
 */
export function inspectTools(surface: InspectSurface): Tool[] {
  return [
    {
      id: 'inspect.styles',
      description: `Explain an element's styles in the live preview: the CSS rules that match it, in the order they apply, and for each property its computed value, the declaration that sets it and those it overrides, or the ancestor it inherits from. Every rule names its source: a project file and line, reached through the project's Mounts; a file under vendor/src/ and its line; or what added it to the page. Custom properties used by those values are explained too: SillyTavern sets its theme colors as custom properties on <html> from theme fields, and their source names the field and the project file that holds it.
Use it to find the rule to change and the line it is on before editing CSS. SillyTavern rewrites a <style> inside a chat message: it prefixes the selectors with .mes_text and renames classes to custom-*. Pseudo-elements, @container rules and animations are not covered.`,
      inputSchema: {
        type: 'object',
        properties: {
          ...TARGET_PROPERTIES,
          properties: {
            type: 'array',
            items: { type: 'string' },
            description: `CSS properties to explain, such as color or padding-left; a shorthand stands for its longhands. Default: ${DEFAULT_STYLE_PROPERTIES.join(', ')}.`,
          },
        },
        additionalProperties: false,
      },
      async run(input, { run, signal }) {
        const target = elementTarget(input, 'inspect.styles', { optional: false });
        const properties = input['properties'];
        if (
          properties !== undefined &&
          (!Array.isArray(properties) ||
            properties.length === 0 ||
            properties.some((property) => typeof property !== 'string' || property.trim() === ''))
        ) {
          throw new ToolError(
            'tool.invalid_arguments',
            `${STYLES}: properties must be a non-empty list of CSS property names`,
          );
        }
        const names = (properties as string[] | undefined)?.map((property) =>
          property.trim().toLowerCase(),
        );
        return fromPage(signal, () => surface.styles(run, target as ElementTarget, names, signal));
      },
    },
    {
      id: 'inspect.audit',
      description: `Check what the preview shows with numbers instead of judging a screenshot: text contrast against the background actually behind it (WCAG 2: 4.5:1, or 3:1 for large text); content clipped by its box or spilling out of it; content passing the right edge of the page, scrollable or cut off; controls covered by another element or overlapping each other; and text or controls with no size. It checks what is in view, in the page or in one region of it; naming an iframe, such as a frontend card, checks the document inside it.
Findings name elements by a CSS selector that matches only them within their own document, to pass to ${STYLES} or ${INTERACT}; for a region inside a frame the report names the frame. Frames inside the region are not entered: the report lists them, each to be checked on its own. Where an image, a gradient or a backdrop filter shows through translucent layers, contrast is a range from the darkest to the lightest backdrop it could paint, and the finding says so.`,
      inputSchema: {
        type: 'object',
        properties: TARGET_PROPERTIES,
        additionalProperties: false,
      },
      run(input, { run, signal }) {
        const target = elementTarget(input, 'inspect.audit', { optional: true });
        return fromPage(signal, () => surface.audit(run, target, signal));
      },
    },
  ];
}

/** A page result as JSON; a failure in the page is the model's to act on. */
async function fromPage(signal: AbortSignal, read: () => Promise<JsonValue>): Promise<ToolResult> {
  try {
    return { text: JSON.stringify(await read()) };
  } catch (error) {
    if (signal.aborted || error instanceof ToolError) throw error;
    // Errors may come from the page's realm, so `instanceof Error` cannot be relied on.
    const message =
      typeof error === 'object' && error !== null && 'message' in error
        ? String(error.message)
        : String(error);
    throw new ToolError('inspect.failed', message);
  }
}
