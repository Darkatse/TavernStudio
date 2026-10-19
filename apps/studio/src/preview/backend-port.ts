import type { BackendRequest, BackendResponse, SessionBackend } from '@tavern-studio/backend';
import type { DiagnosticEntry, WebHostRequest, WebHostResponse } from '@tavern-studio/preview';

type Report = (entry: DiagnosticEntry) => void;

export function answer(
  backend: SessionBackend,
  request: BackendRequest,
  report: Report,
): BackendResponse | Promise<BackendResponse> {
  const failed = (error: unknown): BackendResponse => {
    reportFailure(report, `${request.method} ${request.url}`, error);
    return {
      status: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: String(error) }),
    };
  };
  const inspect = (response: BackendResponse): BackendResponse => {
    if (response.status === 501) {
      report({
        level: 'warning',
        kind: 'request',
        message: `${request.method} ${request.url} is not implemented`,
        frame: 'backend',
        time: Date.now(),
      });
    }
    return response;
  };
  try {
    const result = backend.handle(request);
    return result instanceof Promise ? result.then(inspect, failed) : inspect(result);
  } catch (error) {
    return failed(error);
  }
}

/**
 * The Web Host's backend port is synchronous, answered with text or, for
 * streamed generation, a stream. A response without a body reads as empty
 * text, since an error status needs text for its message.
 */
export function answerSync(
  backend: SessionBackend,
  request: WebHostRequest,
  report: Report,
): WebHostResponse {
  const { method, url, headers } = request;
  const body =
    typeof request.body === 'object' && request.body !== null
      ? {
          kind: 'form' as const,
          entries: request.body.entries.map(([name, value]) => [name, value] as [string, string]),
        }
      : request.body;
  const response = answer(backend, { method, url, headers: { ...headers }, body }, report);
  if (response instanceof Promise) {
    throw new Error(`${method} ${url} has no synchronous handler for the Web Host`);
  }
  if (response.body instanceof Uint8Array) {
    throw new Error(`${method} ${url} answered with bytes; the Web Host takes text or a stream`);
  }
  return { status: response.status, headers: response.headers, body: response.body ?? '' };
}

export function reportFailure(report: Report, what: string, error: unknown): void {
  report({
    level: 'error',
    kind: 'request',
    message: `${what} failed: ${error instanceof Error ? error.message : String(error)}`,
    ...(error instanceof Error && error.stack ? { stack: error.stack } : {}),
    frame: 'backend',
    time: Date.now(),
  });
}
