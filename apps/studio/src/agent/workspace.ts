import {
  TOOL_RESULTS_ROOT,
  ToolError,
  type AgentWorkspace,
  type WorkspaceRoot,
} from '@tavern-studio/agent';
import { VENDOR_IMAGES } from '@tavern-studio/preview';
import { previewSession } from '../preview/session';
import { getJson, loadVendorFiles } from '../preview/sources';
import { db } from '../storage/db';
import { loadSkills, skillUrl } from './skills';

const encoder = new TextEncoder();

/**
 * The Agent's view of files (docs/Agent.md §3): the project, writable through
 * the Run's Checkpoint, and read-only beside it the Skills, the knowledge
 * pack, the frontend the preview runs, and the long results of the Agent's
 * own tool calls.
 */
export function agentWorkspace(project: string, projectRoot: WorkspaceRoot): AgentWorkspace {
  return {
    project: projectRoot,
    skills: skillsRoot,
    knowledge: knowledgeRoot,
    vendor: vendorRoot,
    [TOOL_RESULTS_ROOT]: toolResultsRoot(project),
  };
}

/**
 * A read-only root over a list of file paths: folders are what the paths
 * pass through, and each file is read when asked for.
 */
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

/** The long results stored for the project's Runs (`tool-results/<run>/…`). */
function toolResultsRoot(project: string): WorkspaceRoot {
  return listedRoot(async () => {
    const paths = await (await db).getAllKeysFromIndex('toolResults', 'project', project);
    return new Map(
      paths.map((path) => [
        path,
        async () => {
          const result = await (await db).get('toolResults', path);
          if (!result) throw new DOMException(`No tool result at ${path}`, 'NotFoundError');
          return encoder.encode(result.text);
        },
      ]),
    );
  });
}

/** Every published Skill, by folder: `skills/st-theme/SKILL.md`. */
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

/**
 * The knowledge pack (docs/Knowledge.md §1): upstream documents and types,
 * one directory per source, whose source.json names its repository, version
 * and license. `pnpm knowledge` builds it; it is listed once.
 */
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

/**
 * The frontend the preview runs (docs/Knowledge.md §1): its anatomy under
 * `anatomy/` and its source under `src/`. It follows the preview to another
 * frontend.
 */
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
      getJson<string[]>(`${VENDOR_IMAGES}anatomy/${id}/index.json`, `the anatomy of ${id}`),
      loadVendorFiles(id),
    ]).then(([anatomy, source]) => {
      const files = new Map<string, () => Promise<Uint8Array>>();
      for (const file of anatomy) {
        files.set(`anatomy/${file}`, () => fetchBytes(`${VENDOR_IMAGES}anatomy/${id}/${file}`));
      }
      for (const path of source) {
        files.set(`src/${path}`, () => fetchBytes(`${VENDOR_IMAGES}${id}/${encodePath(path)}`));
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
