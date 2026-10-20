import { useEffect, useState, type ReactNode } from 'react';
import { formatNumber } from '../i18n/common';
import {
  LANGUAGE_NAMES,
  setLocaleChoice,
  useLocaleChoice,
  type LocaleChoice,
} from '../i18n/locale';
import { useMessages } from '../i18n/messages';
import { readColorScheme, setColorScheme, type ColorScheme } from '../lib/color-scheme';
import { SegmentedControl } from '../ui/segmented-control';
import { settingsMessages } from './messages';

export function GeneralSettings() {
  const m = useMessages(settingsMessages);
  const [scheme, setScheme] = useState(readColorScheme);
  const locale = useLocaleChoice();

  return (
    <div className="flex flex-col gap-5">
      <Setting title={m.appearance}>
        <SegmentedControl<ColorScheme>
          label={m.appearance}
          value={scheme}
          options={[
            { value: 'system', label: m.followSystem },
            { value: 'light', label: m.light },
            { value: 'dark', label: m.dark },
          ]}
          onChange={(next) => {
            setScheme(next);
            setColorScheme(next);
          }}
        />
      </Setting>
      <Setting title={m.language}>
        <SegmentedControl<LocaleChoice>
          label={m.language}
          value={locale}
          options={[
            { value: 'system', label: m.followBrowser },
            { value: 'zh', label: LANGUAGE_NAMES.zh },
            { value: 'en', label: LANGUAGE_NAMES.en },
          ]}
          onChange={setLocaleChoice}
        />
      </Setting>
      <StorageUsage />
    </div>
  );
}

function StorageUsage() {
  const m = useMessages(settingsMessages);
  const [usage, setUsage] = useState<number>();
  useEffect(() => {
    void navigator.storage.estimate().then((estimate) => setUsage(estimate.usage));
  }, []);
  return (
    <Setting title={m.storage}>
      {/* No loading text: the estimate arrives before one would show. */}
      {usage !== undefined && (
        <p className="text-caption text-muted">{m.storageUsage(formatSize(usage))}</p>
      )}
    </Setting>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return formatNumber(Math.max(1, Math.round(bytes / 1024)), {
      style: 'unit',
      unit: 'kilobyte',
    });
  }
  return formatNumber(bytes / 1024 / 1024, {
    style: 'unit',
    unit: 'megabyte',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function Setting({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col items-start gap-1.5">
      <h3 className="text-caption font-medium">{title}</h3>
      {children}
    </section>
  );
}
