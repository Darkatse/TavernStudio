import type { ImageContent } from '@earendil-works/pi-ai';
import { interactTool, readLogsTool, snapshotTool } from '@tauritavern/app-use';
import { optionalBoolean } from './arguments';
import { elementTarget, TARGET_PROPERTIES, type ElementTarget } from './element-target';
import { modelToolName, ToolError, type Tool } from './tool';

export interface PreviewControl {
  vendors: readonly string[];
  devices: readonly string[];
  /** The View now, in a line: the frontend, the device and its viewport. */
  describe(): string;
  /**
   * Switches the frontend, the device or both, and resolves once the new View
   * is ready. A frontend switch starts a new Session on the same Snapshot.
   */
  configure(change: { vendor?: string; device?: string }, signal: AbortSignal): Promise<void>;
  /** Reloads the View and resolves once it is ready again. */
  reload(signal: AbortSignal): Promise<void>;
  /**
   * A screenshot of the View, or of one element of it, once the preview shows
   * the project as it is now. A ref is one of the Run's own snapshot. With
   * `marks`, the refs of the Run's latest snapshot page are numbered on it.
   */
  capture(
    run: string,
    target: ElementTarget | undefined,
    options: { marks: boolean },
    signal: AbortSignal,
  ): Promise<Screenshot>;
}

export interface Screenshot {
  image: ImageContent;
  width: number;
  height: number;
  /**
   * `element-capture` is what the browser paints. `snapdom` renders the page
   * from its DOM, with known distortions, when the author has not shared the
   * tab for Element Capture or the preview is not on screen.
   */
  method: 'element-capture' | 'snapdom';
  /** The degradations snapdom recorded. */
  warnings: readonly string[];
  /** With marks: the snapshot page they come from, and how many of its refs are on the image. */
  marks?: { page: string; drawn: number; refs: number };
}

/** `capture` was asked for marks, and the Run has taken no snapshot page to number. */
export class NoSnapshotError extends Error {
  override name = 'NoSnapshotError';
}

const STYLES = modelToolName('inspect.styles');
const AUDIT = modelToolName('inspect.audit');
const SNAPSHOT = modelToolName(snapshotTool.name);
const INTERACT = modelToolName(interactTool.name);
const READ_LOGS = modelToolName(readLogsTool.name);
const CONFIGURE = modelToolName('preview.configure');

const SNAPDOM_DISTORTIONS = `It was rendered from the DOM (snapdom), not taken from the screen: background layers may be missing or darker, <q> quotes may appear twice and text may wrap differently. Judge those with ${STYLES} and ${AUDIT}, not from this image.`;

export function previewTools(preview: PreviewControl, { images }: { images: boolean }): Tool[] {
  const capture: Tool = {
    id: 'preview.capture',
    description: `Take a screenshot of the preview as the author sees it, or of one element, to judge the look as a whole: balance, spacing, layout. When a number matters, such as a color, a contrast or a size, read it with ${STYLES} or ${AUDIT} instead. Omit ref and selector for the whole page. The result says how the screenshot was taken.
With marks, the refs of your latest ${SNAPSHOT} page are boxed and labelled on the image, so what you see can be matched to refs for ${INTERACT} and ${STYLES}. Studio draws the marks over the image; they are not part of the page.`,
    inputSchema: {
      type: 'object',
      properties: {
        ...TARGET_PROPERTIES,
        marks: {
          type: 'boolean',
          description: `Box and label the refs of the latest ${SNAPSHOT} page on the image. Call ${SNAPSHOT} first.`,
        },
      },
      additionalProperties: false,
    },
    async run(input, { run, signal }) {
      const target = elementTarget(input, 'preview.capture', { optional: true });
      const marks = optionalBoolean(input, 'marks') ?? false;
      let shot: Screenshot;
      try {
        shot = await preview.capture(run, target, { marks }, signal);
      } catch (error) {
        if (signal.aborted) throw error;
        if (error instanceof NoSnapshotError) {
          throw new ToolError(
            'preview.no_snapshot',
            `Marks number the refs of the latest ${SNAPSHOT} page, and this Run has none yet. Call ${SNAPSHOT} first.`,
          );
        }
        throw new ToolError(
          'preview.capture_failed',
          error instanceof Error ? error.message : String(error),
        );
      }
      const element = target && ('ref' in target ? target.ref : target.selector);
      const subject =
        element === undefined ? preview.describe() : `${element} in ${preview.describe()}`;
      const lines = [`Screenshot of ${subject}, ${shot.width}×${shot.height}.`];
      if (shot.marks) {
        const { page, drawn, refs } = shot.marks;
        const example = `e1 is ${page}:e1`;
        lines.push(
          `Marks label ${drawn} of the ${refs} refs of snapshot page ${page} by their part after the colon: ${example}. The others are outside the image, around all of it, or no longer shown.`,
        );
      }
      if (shot.method === 'snapdom') lines.push(SNAPDOM_DISTORTIONS);
      if (shot.warnings.length > 0) lines.push(`snapdom noted: ${shot.warnings.join(', ')}.`);
      return {
        text: lines.join('\n'),
        images: [shot.image],
        details: { method: shot.method },
      };
    },
  };
  return [
    ...(images ? [capture] : []),
    {
      id: 'preview.reload',
      description: `Reload the preview and wait until the frontend has started again. Saved project files reach the preview by themselves; reload when a change only takes effect at startup, such as a script that runs once, or to see the page as a fresh visitor would. Refs from earlier ${SNAPSHOT} calls no longer apply afterwards.`,
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      async run(_input, { signal }) {
        const started = performance.now();
        await untilStarted(() => preview.reload(signal), signal);
        return {
          text: `Reloaded in ${elapsed(started)}. The preview shows ${preview.describe()}.`,
        };
      },
    },
    {
      id: 'preview.configure',
      description: `Switch what the preview runs: the frontend, the device, or both, then wait until it has started. Use it to check the project on another frontend or screen size. Switching the frontend starts a fresh preview Session from the same sample data and project files; changes made inside the preview are not carried over. Refs from earlier ${SNAPSHOT} calls no longer apply afterwards.`,
      inputSchema: {
        type: 'object',
        properties: {
          vendor: {
            type: 'string',
            enum: [...preview.vendors],
            description: 'The frontend: st for SillyTavern, tt for TauriTavern. Omit to keep it.',
          },
          device: {
            type: 'string',
            enum: [...preview.devices],
            description: 'The device whose viewport and identity the page sees. Omit to keep it.',
          },
        },
        additionalProperties: false,
      },
      async run(input, { signal }) {
        const vendor = choice(input['vendor'], preview.vendors, 'vendor');
        const device = choice(input['device'], preview.devices, 'device');
        if (vendor === undefined && device === undefined) {
          throw new ToolError(
            'tool.invalid_arguments',
            `${CONFIGURE}: give vendor, device or both`,
          );
        }
        const started = performance.now();
        const change = {
          ...(vendor === undefined ? {} : { vendor }),
          ...(device === undefined ? {} : { device }),
        };
        await untilStarted(() => preview.configure(change, signal), signal);
        return {
          text: `The preview now shows ${preview.describe()}, ready in ${elapsed(started)}.`,
        };
      },
    },
  ];
}

/**
 * A preview that does not start is a fact for the model to report, so it
 * comes back as a tool error; a cancelled Run is not.
 */
async function untilStarted(start: () => Promise<void>, signal: AbortSignal): Promise<void> {
  try {
    await start();
  } catch (error) {
    if (signal.aborted) throw error;
    throw new ToolError(
      'preview.not_started',
      `The preview did not start: ${error instanceof Error ? error.message : String(error)}. ${READ_LOGS} may show why.`,
    );
  }
}

function choice(value: unknown, allowed: readonly string[], name: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new ToolError(
      'tool.invalid_arguments',
      `${CONFIGURE}: ${name} must be one of ${allowed.join(', ')}`,
    );
  }
  return value;
}

function elapsed(started: number): string {
  return `${((performance.now() - started) / 1000).toFixed(1)} s`;
}
