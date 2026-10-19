import { ChevronDown } from 'lucide-react';
import { useCurrentProject } from '../project/use-project';
import { Button, type ButtonProps } from '../ui/button';

/**
 * The open project's name, the button that opens the project menu. It stays
 * on the first screen to stand in while the menu loads.
 */
export function ProjectButton(props: Omit<ButtonProps, 'children'>) {
  const project = useCurrentProject();
  return (
    <Button variant="ghost" className="max-w-52 min-w-0 gap-1 px-2" {...props}>
      <span className="truncate">{project?.record.name ?? '未打开项目'}</span>
      <ChevronDown className="text-muted" />
    </Button>
  );
}
