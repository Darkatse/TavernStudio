import { ModelSettings } from '../agent/model-settings';
import { useMessages } from '../i18n/messages';
import { DialogContent } from '../ui/dialog';
import { Tab, Tabs, TabsList, TabsPanel } from '../ui/tabs';
import { GeneralSettings } from './general-settings';
import { settingsMessages } from './messages';

export type SettingsSection = 'general' | 'models';

function isSection(value: unknown): value is SettingsSection {
  return value === 'general' || value === 'models';
}

export function SettingsDialog({
  section,
  onSectionChange,
}: {
  section: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
}) {
  const m = useMessages(settingsMessages);
  return (
    <DialogContent size="lg" title={m.settings}>
      <Tabs
        value={section}
        onValueChange={(next) => {
          if (isSection(next)) onSectionChange(next);
        }}
        className="flex flex-col gap-4"
      >
        <div className="self-start">
          <TabsList label={m.sections}>
            <Tab value="general">{m.general}</Tab>
            <Tab value="models">{m.models}</Tab>
          </TabsList>
        </div>
        <TabsPanel value="general">
          <GeneralSettings />
        </TabsPanel>
        <TabsPanel value="models" className="flex flex-col gap-4">
          <ModelSettings />
        </TabsPanel>
      </Tabs>
    </DialogContent>
  );
}
