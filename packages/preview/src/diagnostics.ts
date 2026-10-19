import type { DiagnosticEntry } from './host';
import type { Realm } from './realm';

type Report = (entry: DiagnosticEntry) => void;

/**
 * Collects what goes wrong in one realm of the preview: uncaught errors,
 * unhandled rejections, failed resource loads and console.error. Studio's
 * diagnostics view and the Agent's app.read_logs read the same entries
 * (docs/Architecture.md §5).
 */
const time = () => Date.now();

export function installDiagnostics(win: Realm, report: Report): void {
  const frame = frameName(win);

  win.addEventListener(
    'error',
    (event) => {
      const target = event.target;
      if (target instanceof win.Element && target !== win.document.documentElement) {
        const source = target.getAttribute('src') ?? target.getAttribute('href') ?? '';
        // SillyTavern's markup has <img src=""> placeholders that fail by design.
        if (source) {
          report({
            level: 'error',
            kind: 'resource',
            message: `Failed to load <${target.localName}> ${source}`,
            url: source,
            frame,
            time: time(),
          });
        }
        return;
      }
      const error = event.error as unknown;
      report({
        level: 'error',
        kind: 'error',
        message: event.message,
        ...stackOf(error),
        url: event.filename,
        line: event.lineno,
        column: event.colno,
        frame,
        time: time(),
      });
    },
    true,
  );

  win.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason as unknown;
    report({
      level: 'error',
      kind: 'rejection',
      message: messageOf(reason),
      ...stackOf(reason),
      frame,
      time: time(),
    });
  });

  const consoleError = win.console.error.bind(win.console);
  win.console.error = (...args: unknown[]) => {
    consoleError(...args);
    const error = args.find(isError);
    report({
      level: 'error',
      kind: 'console',
      message: args.map(messageOf).join(' '),
      ...stackOf(error),
      frame,
      time: time(),
    });
  };
}

/** `page` for the vendor page, otherwise the frame's id or name. */
export function frameName(win: Realm): string {
  const element = win.frameElement;
  if (!element || element.ownerDocument.defaultView === win.top) return 'page';
  return element.id || element.getAttribute('name') || 'iframe';
}

/** Errors from any realm: frames have their own Error constructor. */
function isError(value: unknown): value is Error {
  return Object.prototype.toString.call(value) === '[object Error]';
}

function messageOf(value: unknown): string {
  if (isError(value)) return `${value.name}: ${value.message}`;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function stackOf(value: unknown): { stack?: string } {
  return isError(value) && value.stack ? { stack: value.stack } : {};
}
