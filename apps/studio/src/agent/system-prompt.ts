import { modelToolName } from '@tavern-studio/agent';
import { MANIFEST } from '@tavern-studio/workspace';
import { previewSession } from '../preview/session';
import type { Project } from '../project/project';

const decoder = new TextDecoder();
const PROJECT_NOTES = 'AGENTS.md';

/**
 * The system prompt (docs/Agent.md §6): what the preview runs, the project's
 * studio.json and its own notes. Everything else the Agent reads when it
 * needs it, through the workspace tools.
 */
export async function systemPrompt(project: Project): Promise<string> {
  const status = previewSession.status;
  const [manifest, notes] = await Promise.all([
    readText(project, MANIFEST),
    readText(project, PROJECT_NOTES),
  ]);
  const sections = [
    `You are the Agent of Tavern Studio, where authors make themes, frontend cards, regex beautification, Tavern Helper scripts and extensions for SillyTavern and TauriTavern. You change the author's project only through its files, and see the result in a live preview of the real frontend. Reply in the language the author writes in.`,
    `Workspace: project/ holds the author's files and is writable. tool-results/ holds long results of your own tool calls. Read a file with ${modelToolName('workspace.read_file')} before you change it.`,
    `Preview: ${status.phase === 'open' ? status.vendor.label : 'not running'}. ${MANIFEST} mounts project files into the frontend's data, so a saved change reaches the preview by itself.`,
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
