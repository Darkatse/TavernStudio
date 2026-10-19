import { getJson } from '../preview/sources';

export interface Skill {
  /** The folder's name, which is also the Skill's `name`. */
  folder: string;
  name: string;
  description: string;
  /** Its files, relative to the folder. */
  files: readonly string[];
}

const SKILLS = '/_studio/skills/';
const decoder = new TextDecoder();
let skills: Promise<Skill[]> | undefined;

export function loadSkills(): Promise<Skill[]> {
  skills ??= loadAll().catch((error: unknown) => {
    // A failed load is not kept, so the next Run tries again.
    skills = undefined;
    throw error;
  });
  return skills;
}

export function skillUrl(folder: string, path: string): string {
  return `${SKILLS}${[folder, ...path.split('/')].map(encodeURIComponent).join('/')}`;
}

async function loadAll(): Promise<Skill[]> {
  const folders = await getJson<string[]>(`${SKILLS}index.json`, 'the Skills');
  return Promise.all(
    folders.map(async (folder) => {
      const index = await getJson<{ files: Record<string, unknown> }>(
        `${SKILLS}${encodeURIComponent(folder)}/index.json`,
        `Skill ${folder}`,
      );
      const response = await fetch(skillUrl(folder, 'SKILL.md'));
      if (!response.ok) throw new Error(`Skill ${folder} has no SKILL.md: HTTP ${response.status}`);
      const { name, description } = frontMatter(
        folder,
        decoder.decode(await response.arrayBuffer()),
      );
      if (name !== folder)
        throw new Error(`Skill ${folder} is named ${name}; a Skill's folder is its name`);
      return { folder, name, description, files: Object.keys(index.files).toSorted() };
    }),
  );
}

/** SKILL.md's format keeps `name` and `description` each on one line of the front matter. */
function frontMatter(folder: string, text: string): { name: string; description: string } {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1];
  const field = (key: string) =>
    block && new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(block)?.[1]?.trim();
  const name = field('name');
  const description = field('description');
  if (!name || !description) {
    throw new Error(`Skill ${folder}: SKILL.md needs a name and a description in its front matter`);
  }
  return { name, description };
}
