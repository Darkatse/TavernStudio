import {
  DEFAULT_STYLE_PROPERTIES,
  NoSnapshotError,
  type AppLogEntry,
  type AppSurface,
  type InspectSurface,
  type PreviewControl,
  type Screenshot,
} from '@tavern-studio/agent';
import { CAPTURE_IMAGE, type DiagnosticEntry } from '@tavern-studio/preview';
import { auditRegion } from '@tavern-studio/preview/inspect';
import { sourceNamer } from '../inspect/sources';
import { inspectStyles } from '../inspect/styles';
import {
  drawMarks,
  previewCapture,
  rectInPage,
  type Mark,
  type PreviewShot,
} from '../preview/capture';
import { devices, isDeviceId } from '../preview/devices';
import { previewSession, type PreviewPage } from '../preview/session';
import { loadVendorFiles, type VendorImage } from '../preview/sources';
import type { Project } from '../project/project';

/** How long the preview may take to start before a tool gives up on it. */
const START_TIMEOUT_MS = 60_000;

/** The View now, in a line: the frontend, the device and its viewport. */
export function describePreview(): string {
  const status = previewSession.status;
  const device = devices[previewSession.device];
  const vendor = status.phase === 'open' ? status.vendor.label : 'no frontend yet';
  return `${vendor} on ${device.id} (${device.viewport.width}×${device.viewport.height})`;
}

/**
 * The preview as the Agent's tools see it while it works on a project
 * (docs/Architecture.md §5): the page the author is looking at, what Attach
 * recorded in it, and the way the workbench switches and reloads it. What
 * looks at the page first waits for the preview to show the project as it is
 * now, since the Run's own writes may still be reaching it.
 */
export function agentPreview(project: Project): {
  surface: AppSurface;
  control: PreviewControl;
  inspect: InspectSurface;
} {
  const caughtUp = async (signal: AbortSignal) => {
    await project.placed();
    return started(signal);
  };
  const surface: AppSurface = {
    async page(signal) {
      const { agent } = await caughtUp(signal);
      return {
        snapshot: (run, args) => agent.snapshot(run, args),
        interact: (run, args) => agent.interact(run, args),
        evaluate: (run, code) => agent.evaluate(run, code),
      };
    },
    logs() {
      // Storage entries are Studio's own, not the page's.
      return previewSession.diagnostics.filter((entry) => entry.kind !== 'storage').map(logEntry);
    },
  };
  const control: PreviewControl = {
    vendors: [...imagesByKind().keys()],
    devices: Object.keys(devices),
    describe: describePreview,
    async configure({ vendor, device }, signal) {
      if (device !== undefined) {
        if (!isDeviceId(device)) throw new Error(`No device ${device}`);
        await previewSession.selectDevice(device);
      }
      if (vendor !== undefined) {
        const image = imagesByKind().get(vendor);
        if (!image) throw new Error(`No ${vendor} image is built`);
        await previewSession.selectVendor(image.id);
      }
      await caughtUp(signal);
    },
    async reload(signal) {
      await previewSession.reload();
      await caughtUp(signal);
    },
    capture: async (run, target, { marks }, signal) => {
      const page = await caughtUp(signal);
      const element = target && page.agent.resolve(run, target);
      const marked = marks ? snapshotMarks(page, run) : undefined;
      return screenshot(await previewCapture.take(element), marked);
    },
  };
  const inspect: InspectSurface = {
    async styles(run, target, properties, signal) {
      const page = await caughtUp(signal);
      const element = page.agent.resolve(run, target);
      const { anatomy, placements, status } = previewSession;
      const pageWindow = page.frame.contentWindow;
      if (!anatomy || !pageWindow || status.phase !== 'open') {
        throw new Error('The preview is still starting');
      }
      const namer = sourceNamer({
        anatomy,
        placements,
        vendorFiles: await loadVendorFiles(status.vendor.id),
      });
      return inspectStyles(pageWindow, element, properties ?? DEFAULT_STYLE_PROPERTIES, namer);
    },
    async audit(run, target, signal) {
      const page = await caughtUp(signal);
      const pageWindow = page.frame.contentWindow;
      if (!pageWindow) throw new Error('The preview frame has no page');
      const root = target ? page.agent.resolve(run, target) : pageWindow.document.documentElement;
      return auditRegion(pageWindow, root);
    },
  };
  return { surface, control, inspect };
}

/**
 * The refs of the Run's latest snapshot page as marks, each at its element's
 * box. A ref whose element is gone or hidden since the snapshot has no mark.
 */
function snapshotMarks(
  page: PreviewPage,
  run: string,
): { page: string; refs: number; marks: Mark[] } {
  const refs = page.agent.refs(run);
  const [first] = refs;
  if (first === undefined) throw new NoSnapshotError();
  const view = page.frame.contentWindow;
  if (!view) throw new Error('The preview frame has no page');
  const marks = refs.flatMap((ref) => {
    let element: Element;
    try {
      element = page.agent.resolve(run, { ref });
    } catch {
      // Removed or hidden since the snapshot: the result counts it as not shown.
      return [];
    }
    return [{ label: ref.slice(ref.indexOf(':') + 1), rect: rectInPage(element, view) }];
  });
  return { page: first.slice(0, first.indexOf(':')), refs: refs.length, marks };
}

async function screenshot(
  shot: PreviewShot,
  marked?: { page: string; refs: number; marks: Mark[] },
): Promise<Screenshot> {
  const drawn = marked ? await drawMarks(shot, marked.marks) : undefined;
  const blob = drawn?.blob ?? shot.blob;
  const bitmap = await createImageBitmap(blob);
  const { width, height } = bitmap;
  bitmap.close();
  return {
    // Both ways of taking a screenshot encode it the same way.
    image: { type: 'image', data: await base64(blob), mimeType: CAPTURE_IMAGE.mimeType },
    width,
    height,
    method: shot.method,
    warnings: shot.warnings,
    ...(marked && drawn
      ? { marks: { page: marked.page, refs: marked.refs, drawn: drawn.drawn } }
      : {}),
  };
}

async function base64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  // In slices, since an argument list has a length limit.
  for (let at = 0; at < bytes.length; at += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  }
  return btoa(binary);
}

/** One image per frontend, the last built, as the workbench's switch offers them. */
function imagesByKind(): Map<string, VendorImage> {
  return new Map(previewSession.vendors.images.map((image) => [image.kind, image]));
}

function started(signal: AbortSignal): Promise<PreviewPage> {
  return previewSession.whenPage(AbortSignal.any([signal, AbortSignal.timeout(START_TIMEOUT_MS)]));
}

function logEntry(entry: DiagnosticEntry): AppLogEntry {
  const position = [entry.url, entry.line, entry.column].filter((part) => part !== undefined);
  return {
    timestampMs: entry.time,
    level: entry.level === 'warning' ? 'warn' : 'error',
    message: entry.message,
    ...(position.length > 0 ? { source: position.join(':') } : {}),
    frame: entry.frame,
  };
}
