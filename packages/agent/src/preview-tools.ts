import { ToolError, type Tool } from './tool';

/** What the `preview.*` tools control: the View the author is looking at. */
export interface PreviewControl {
  /** The frontends the preview can run, by the names `preview.configure` takes. */
  vendors: readonly string[];
  /** The devices it can present, likewise. */
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
}

/** The preview tools (docs/Agent.md §4). */
export function previewTools(preview: PreviewControl): Tool[] {
  return [
    {
      id: 'preview.reload',
      description:
        'Reload the preview and wait until the frontend has started again. Saved project files reach the preview by themselves; reload when a change only takes effect at startup, such as a script that runs once, or to see the page as a fresh visitor would. Refs from earlier app.snapshot calls no longer apply afterwards.',
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
      description: `Switch what the preview runs: the frontend, the device, or both, then wait until it has started. Use it to check the project on another frontend or screen size. Switching the frontend starts a fresh preview Session from the same sample data and project files; changes made inside the preview are not carried over. Refs from earlier app.snapshot calls no longer apply afterwards.`,
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
            'preview.configure: give vendor, device or both',
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
 * Waits for the preview to start. A preview that does not is a fact for the
 * model to report, so it comes back as a tool error; a cancelled Run is not.
 */
async function untilStarted(start: () => Promise<void>, signal: AbortSignal): Promise<void> {
  try {
    await start();
  } catch (error) {
    if (signal.aborted) throw error;
    throw new ToolError(
      'preview.not_started',
      `The preview did not start: ${error instanceof Error ? error.message : String(error)}. app.read_logs may show why.`,
    );
  }
}

function choice(value: unknown, allowed: readonly string[], name: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new ToolError(
      'tool.invalid_arguments',
      `preview.configure: ${name} must be one of ${allowed.join(', ')}`,
    );
  }
  return value;
}

function elapsed(started: number): string {
  return `${((performance.now() - started) / 1000).toFixed(1)} s`;
}
