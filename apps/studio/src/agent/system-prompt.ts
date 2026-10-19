import { modelToolName } from '@tavern-studio/agent';
import { MANIFEST } from '@tavern-studio/workspace';
import type { Project } from '../project/project';
import { describePreview } from './preview-surface';
import { loadSkills } from './skills';

const decoder = new TextDecoder();
const PROJECT_NOTES = 'AGENTS.md';

export async function systemPrompt(project: Project): Promise<string> {
  const [manifest, notes, skills] = await Promise.all([
    readText(project, MANIFEST),
    readText(project, PROJECT_NOTES),
    loadSkills(),
  ]);
  const sections = [
    `You are the Agent of Tavern Studio, where authors make themes, frontend cards, regex beautification, Tavern Helper scripts and extensions for SillyTavern and TauriTavern. You change the author's project only through its files, and see the result in a live preview of the real frontend. Reply in the language the author writes in.`,
    `Workspace: project/ holds the author's files and is writable. Read-only beside it: skills/ holds Skills; knowledge/ holds upstream documentation and type definitions (SillyTavern, Tavern Helper, MVU, the character card specs, TauriTavern), one directory per source, whose source.json names its repository, version and license; vendor/ holds the frontend the preview runs, its anatomy generated from its source under vendor/anatomy/ and the source itself under vendor/src/; tool-results/ holds long results of your own tool calls. Read a file with ${modelToolName('workspace.read_file')} before you change it.`,
    skills.length === 0
      ? undefined
      : `Skills: read a Skill's SKILL.md before work it covers.\n${skills
          .map((skill) => `- ${skill.name} (skills/${skill.folder}/SKILL.md): ${skill.description}`)
          .join('\n')}`,
    `Preview: ${describePreview()}. ${MANIFEST} mounts project files into the frontend's data, so a saved change reaches the preview by itself.`,
    manifest === undefined ? undefined : `project/${MANIFEST}:\n${manifest}`,
    notes === undefined
      ? undefined
      : `project/${PROJECT_NOTES} (the project's own notes):\n${notes}`,
    'When the task is done, answer the author without calling a tool.',
  ];
  return sections.filter((section) => section !== undefined).join('\n\n');
}

async function readText(project: Project, path: string): Promise<string | undefined> {
  if ((await project.store.kind(path)) !== 'file') return undefined;
  return decoder.decode(await project.store.read(path));
}
