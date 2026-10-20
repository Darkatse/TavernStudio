import { useMessages } from '../i18n/messages';
import { useCurrentRecord } from '../project/use-project';
import { NameButton, type NameButtonProps } from '../ui/name-button';
import { workbenchMessages } from './messages';

/** It stays on the first screen to stand in while the project menu loads. */
export function ProjectButton(props: Omit<NameButtonProps, 'name'>) {
  const m = useMessages(workbenchMessages);
  const record = useCurrentRecord();
  return <NameButton name={record?.name ?? m.noProject} {...props} />;
}
