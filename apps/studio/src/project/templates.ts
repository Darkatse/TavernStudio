import { Palette, Puzzle, type LucideIcon } from 'lucide-react';

/** Each `folder` is a folder under templates/. */
export const PROJECT_TEMPLATES = [
  { folder: 'theme', icon: Palette },
  { folder: 'extension', icon: Puzzle },
] as const satisfies readonly { folder: string; icon: LucideIcon }[];

export type ProjectTemplate = (typeof PROJECT_TEMPLATES)[number];
