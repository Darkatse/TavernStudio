import { Palette, Puzzle, type LucideIcon } from 'lucide-react';

/**
 * The templates a project starts from (templates/README.md), each by its
 * folder under templates/. Every entry that starts a project lists these, in
 * this order; what the entry says and the new project's name are Studio's
 * text, in project/messages.ts by folder.
 */
export const PROJECT_TEMPLATES = [
  { folder: 'theme', icon: Palette },
  { folder: 'extension', icon: Puzzle },
] as const satisfies readonly { folder: string; icon: LucideIcon }[];

export type ProjectTemplate = (typeof PROJECT_TEMPLATES)[number];
