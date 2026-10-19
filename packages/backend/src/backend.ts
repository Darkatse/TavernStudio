import type { DataDirectory } from './data-directory';
import { json, type BackendBody, type BackendRequest, type BackendResponse } from './http';
import { createReplay, type Replay } from './replay';
import { characterRoutes } from './routes/characters';
import { chatRoutes } from './routes/chats';
import { extensionRoutes } from './routes/extensions';
import { generationRoutes } from './routes/generation';
import { mediaRoutes } from './routes/media';
import { quickReplyRoutes } from './routes/quick-replies';
import { settingsRoutes } from './routes/settings';
import { statsRoutes } from './routes/stats';
import { systemRoutes } from './routes/system';
import { themeRoutes } from './routes/themes';
import { tokenizerRoutes } from './routes/tokenizers';
import { worldRoutes } from './routes/worlds';

export interface VendorInfo {
  id: string;
  version: string;
  /** Built-in extensions shipped in the vendor image. */
  extensions: readonly string[];
}

export interface RequestContext {
  data: DataDirectory;
  vendor: VendorInfo;
  /** What it plays next is Session state. */
  replay: Replay;
  url: URL;
  params: Record<string, string>;
  body: BackendBody;
  /** An empty body reads as `{}`, as with Express. */
  json(): unknown;
}

export type Handler = (context: RequestContext) => BackendResponse | Promise<BackendResponse>;

/** Routes keyed by `METHOD /path`. A `:name` segment matches one path segment. */
export type Routes = Record<string, Handler>;

export interface SessionBackend {
  handle(request: BackendRequest): BackendResponse | Promise<BackendResponse>;
}

const ROUTES: Routes = {
  ...systemRoutes,
  ...settingsRoutes,
  ...extensionRoutes,
  ...characterRoutes,
  ...chatRoutes,
  ...mediaRoutes,
  ...quickReplyRoutes,
  ...themeRoutes,
  ...worldRoutes,
  ...tokenizerRoutes,
  ...generationRoutes,
  ...statsRoutes,
};

const decoder = new TextDecoder();

/** Endpoints outside the implemented set answer 501, never a guessed value. */
export function createSessionBackend(data: DataDirectory, vendor: VendorInfo): SessionBackend {
  const routes = compile(ROUTES);
  const replay = createReplay(data);

  return {
    handle(request) {
      const url = new URL(request.url, 'http://session');
      const match = routes.find((route) => route.matches(request.method, url.pathname));
      if (!match) {
        return json(
          {
            error: 'Not implemented by the Tavern Studio session backend',
            endpoint: `${request.method} ${url.pathname}`,
          },
          501,
        );
      }
      return match.handler({
        data,
        vendor,
        replay,
        url,
        params: match.params(url.pathname),
        body: request.body,
        json: () => parseJson(request.body),
      });
    },
  };
}

function parseJson(body: BackendBody): unknown {
  if (body === null) return {};
  if (typeof body === 'object' && 'kind' in body)
    throw new Error('Expected a JSON body, got multipart form data');
  const text = typeof body === 'string' ? body : decoder.decode(body);
  return text.trim() === '' ? {} : JSON.parse(text);
}

interface CompiledRoute {
  handler: Handler;
  matches(method: string, path: string): boolean;
  params(path: string): Record<string, string>;
}

const paramCount = (key: string) => key.split(':').length;

/** Exact routes are tried before routes with `:name` segments. */
function compile(routes: Routes): CompiledRoute[] {
  const entries = Object.entries(routes).toSorted(([a], [b]) => paramCount(a) - paramCount(b));
  return entries.map(([key, handler]) => {
    const [method, pattern = ''] = key.split(' ');
    const segments = pattern.split('/');
    return {
      handler,
      matches: (requestMethod, path) => {
        const parts = path.split('/');
        return (
          requestMethod.toUpperCase() === method &&
          parts.length === segments.length &&
          segments.every((segment, i) => segment.startsWith(':') || segment === parts[i])
        );
      },
      params: (path) => {
        const parts = path.split('/');
        return Object.fromEntries(
          segments.flatMap((segment, i) =>
            segment.startsWith(':') ? [[segment.slice(1), decodeURIComponent(parts[i] ?? '')]] : [],
          ),
        );
      },
    };
  });
}
