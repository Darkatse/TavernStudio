import {
  TOOL_RESULTS_ROOT,
  ToolError,
  type AgentWorkspace,
  type WorkspaceRoot,
} from '@tavern-studio/agent';
import { anatomyUrl, vendorUrl } from '@tavern-studio/preview';
import { previewSession } from '../preview/session';
import { getJson, loadVendorFiles } from '../preview/sources';
import { withDatabase } from '../storage/db';
import { loadSkills, skillUrl } from './skills';

const encoder = new TextEncoder();

export function agentWorkspace(project: string, projectRoot: WorkspaceRoot): AgentWorkspace {
  return {
    project: projectRoot,
    skills: skillsRoot,
    knowledge: knowledgeRoot,
    vendor: vendorRoot,
    [TOOL_RESULTS_ROOT]: toolResultsRoot(project),
  };
}

function listedRoot(
  list: () => Promise<ReadonlyMap<string, () => Promise<Uint8Array>>>,
): WorkspaceRoot {
  return {
    async kind(path) {
      const files = await list();
      if (files.has(path)) return 'file';
      return [...files.keys()].some((file) => file.startsWith(`${path}/`))
        ? 'directory'
        : undefined;
    },
    async read(path) {
      const read = (await list()).get(path);
      if (!read) throw new DOMException(`No file ${path}`, 'NotFoundError');
      return read();
    },
    async files(directory) {
      const prefix = directory === '' ? '' : `${directory}/`;
      return [...(await list()).keys()]
        .filter((path) => path.startsWith(prefix))
        .map((path) => path.slice(prefix.length))
        .toSorted();
    },
  };
}

function toolResultsRoot(project: string): WorkspaceRoot {
  return listedRoot(async () => {
    const paths = await withDatabase((database) =>
      database.getAllKeysFromIndex('toolResults', 'project', project),
    );
    return new Map(
      paths.map((path) => [
        path,
        async () => {
          const result = await withDatabase((database) => database.get('toolResults', path));
          if (!result) throw new DOMException(`No tool result at ${path}`, 'NotFoundError');
          return encoder.encode(result.text);
        },
      ]),
    );
  });
}

const skillsRoot = listedRoot(async () => {
  const entries = (await loadSkills()).flatMap((skill) =>
    skill.files.map(
      (file) =>
        [`${skill.folder}/${file}`, () => fetchBytes(skillUrl(skill.folder, file))] as const,
    ),
  );
  return new Map(entries);
});

const KNOWLEDGE = '/_studio/knowledge/';
let knowledge: Promise<Map<string, () => Promise<Uint8Array>>> | undefined;

const knowledgeRoot = listedRoot(() => {
  knowledge ??= knowledgeFiles().catch((error: unknown) => {
    // A failed load is not kept, so the next call tries again.
    knowledge = undefined;
    throw error;
  });
  return knowledge;
});

async function knowledgeFiles(): Promise<Map<string, () => Promise<Uint8Array>>> {
  const response = await fetch(`${KNOWLEDGE}index.json`);
  // Studio publishes no index without a pack (apps/studio/build/published.ts).
  if (response.status === 404) {
    throw new ToolError(
      'workspace.knowledge_unavailable',
      "The knowledge pack has not been built, so knowledge/ is empty: `pnpm knowledge` in Studio's repository builds it.",
    );
  }
  if (!response.ok) throw new Error(`Could not load the knowledge pack: HTTP ${response.status}`);
  const sources = (await response.json()) as string[];
  const paths = await Promise.all(
    sources.map(async (source) => {
      const { files } = await getJson<{ files: Record<string, unknown> }>(
        `${KNOWLEDGE}${encodeURIComponent(source)}/index.json`,
        `knowledge source ${source}`,
      );
      return Object.keys(files).map((file) => `${source}/${file}`);
    }),
  );
  return new Map(
    paths.flat().map((path) => [path, () => fetchBytes(`${KNOWLEDGE}${encodePath(path)}`)]),
  );
}

const vendorRoot = listedRoot(() => {
  const status = previewSession.status;
  if (status.phase !== 'open') {
    throw new ToolError(
      'workspace.vendor_unavailable',
      'The preview has not started a frontend yet, so vendor/ is empty. Try again once it has.',
    );
  }
  return vendorFiles(status.vendor.id);
});

const vendorListings = new Map<string, Promise<Map<string, () => Promise<Uint8Array>>>>();

/** An image's files, listed once: they never change for an id. */
function vendorFiles(id: string): Promise<Map<string, () => Promise<Uint8Array>>> {
  let listing = vendorListings.get(id);
  if (!listing) {
    listing = Promise.all([
      getJson<string[]>(anatomyUrl(id, 'index.json'), `the anatomy of ${id}`),
      loadVendorFiles(id),
    ]).then(([anatomy, source]) => {
      const files = new Map<string, () => Promise<Uint8Array>>();
      for (const file of anatomy) {
        files.set(`anatomy/${file}`, () => fetchBytes(anatomyUrl(id, encodePath(file))));
      }
      for (const path of source) {
        files.set(`src/${path}`, () => fetchBytes(vendorUrl(id, `/${encodePath(path)}`)));
      }
      return files;
    });
    listing.catch(() => vendorListings.delete(id));
    vendorListings.set(id, listing);
  }
  return listing;
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not read ${url}: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}
