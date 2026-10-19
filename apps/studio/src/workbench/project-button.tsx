import { ChevronDown } from 'lucide-react';
import { useMessages } from '../i18n/messages';
import { useCurrentProject } from '../project/use-project';
import { Button, type ButtonProps } from '../ui/button';
import { workbenchMessages } from './messages';

/**
 * The open project's name, the button that opens the project menu. It stays
 * on the first screen to stand in while the menu loads. Unlike other buttons
 * it gives way in a crowded header: the name truncates before the controls
 * beside it are pushed out.
 */
export function ProjectButton(props: Omit<ButtonProps, 'children'>) {
  const m = useMessages(workbenchMessages);
  const project = useCurrentProject();
  return (
    <Button variant="ghost" className="max-w-52 min-w-0 shrink! gap-1 px-2" {...props}>
      <span className="truncate">{project?.record.name ?? m.noProject}</span>
      <ChevronDown className="text-muted" />
    </Button>
  );
}
