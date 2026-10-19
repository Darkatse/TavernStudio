import { Palette, Puzzle, type LucideIcon } from 'lucide-react';

/**
 * A template a project starts from (templates/README.md). Every entry that
 * starts a project lists these, in this order.
 */
export interface ProjectTemplate {
  /** Its folder under templates/. */
  folder: string;
  /** What the entry that starts one says. */
  action: string;
  /** The new project's name; one another project has gets a number. */
  name: string;
  icon: LucideIcon;
}

export const PROJECT_TEMPLATES: readonly ProjectTemplate[] = [
  { folder: 'theme', action: '新建主题项目', name: '我的主题', icon: Palette },
  { folder: 'extension', action: '新建扩展项目', name: '我的扩展', icon: Puzzle },
];
