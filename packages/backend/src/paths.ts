/** The single user of a Session's data directory, as in SillyTavern without accounts. */
export const USER = 'default-user';

/** User directories, named as in SillyTavern's src/constants.js. */
export const dirs = {
  characters: `${USER}/characters`,
  chats: `${USER}/chats`,
  backgrounds: `${USER}/backgrounds`,
  avatars: `${USER}/User Avatars`,
  worlds: `${USER}/worlds`,
  groups: `${USER}/groups`,
  themes: `${USER}/themes`,
  movingUI: `${USER}/movingUI`,
  quickReplies: `${USER}/QuickReplies`,
  instruct: `${USER}/instruct`,
  context: `${USER}/context`,
  sysprompt: `${USER}/sysprompt`,
  reasoning: `${USER}/reasoning`,
  koboldAI: `${USER}/KoboldAI Settings`,
  novelAI: `${USER}/NovelAI Settings`,
  openAI: `${USER}/OpenAI Settings`,
  textGen: `${USER}/TextGen Settings`,
  comfyWorkflows: `${USER}/user/workflows`,
  extensions: `${USER}/extensions`,
} as const;

const IMAGE = /\.(png|jpe?g|gif|webp|avif|bmp|svg|ico|tiff?)$/i;

export function isImage(name: string): boolean {
  return IMAGE.test(name);
}

/**
 * Strips characters that are not allowed in file names, like the
 * sanitize-filename package SillyTavern uses for user-supplied names.
 */
export function sanitize(name: string): string {
  // oxlint-disable-next-line no-control-regex -- control characters are exactly what is removed
  return name.replace(/[/?<>\\:*|"\u0000-\u001f\u0080-\u009f]/g, '').replace(/^\.+$/, '');
}

export const byName = (a: string, b: string) => a.localeCompare(b);
