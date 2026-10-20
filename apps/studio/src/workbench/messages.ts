import type { DeviceId } from '../preview/devices';
import type { ProjectExport } from '../project/export';
import { formatNumber, plural } from '../i18n/common';
import { defineMessages } from '../i18n/messages';

export const workbenchMessages = defineMessages({
  zh: {
    workbench: '工作台',
    views: '视图',
    preview: '预览',
    code: '代码',
    devices: '设备',
    device: { desktop: '桌面', mobile: '移动' } satisfies Record<DeviceId, string>,
    frontends: '前端',
    reloadPreview: '重新载入预览',
    startup: {
      steps: '预览启动进度',
      worker: '准备预览服务',
      data: '载入样板与扩展',
      vendor: (label: string | undefined) => (label ? `启动 ${label}` : '启动前端'),
      failed: '预览启动失败',
      elsewhere: 'Studio 已在另一个标签页打开',
      continueHere: '在这里继续',
    },
    noProject: '未打开项目',
    codeView: {
      empty: '未打开项目',
      loading: '正在载入编辑器',
    },
    exports: {
      export: '导出',
      label: (item: ProjectExport) =>
        item.kind === 'theme' ? '导出主题' : `导出扩展 ${item.name}`,
      theme: {
        hint: '导出为 SillyTavern 主题',
        saved: '主题已保存',
        downloaded: '主题已下载',
        failed: '导出主题失败',
        next: (file: string) => file,
      },
      extension: {
        hint: '导出为扩展 zip',
        saved: '扩展已保存',
        downloaded: '扩展已下载',
        failed: '导出扩展失败',
        next: (file: string) => `${file}，解压到 SillyTavern 的 data/default-user/extensions/`,
      },
      pending: (description: string, count: number) =>
        count > 0 ? `${description}。未包含 ${formatNumber(count)} 处待采纳的修改` : description,
    },
    adoption: {
      label: '待采纳',
      count: (count: number) => `待采纳 ${count}`,
      loading: '正在载入待采纳的修改',
      overwritten: '未采纳的修改被覆盖了',
      deleted: '（已删除）',
      separator: '；',
    },
  },
  en: {
    workbench: 'Workbench',
    views: 'Views',
    preview: 'Preview',
    code: 'Code',
    devices: 'Device',
    device: { desktop: 'Desktop', mobile: 'Mobile' },
    frontends: 'Frontend',
    reloadPreview: 'Reload preview',
    startup: {
      steps: 'Preview startup',
      worker: 'Preparing preview service',
      data: 'Loading fixture and extensions',
      vendor: (label: string | undefined) => (label ? `Starting ${label}` : 'Starting frontend'),
      failed: 'The preview failed to start',
      elsewhere: 'Studio is open in another tab',
      continueHere: 'Continue here',
    },
    noProject: 'No project',
    codeView: {
      empty: 'No project open',
      loading: 'Loading editor',
    },
    exports: {
      export: 'Export',
      label: (item: ProjectExport) =>
        item.kind === 'theme' ? 'Export theme' : `Export extension ${item.name}`,
      theme: {
        hint: 'Export as a SillyTavern theme',
        saved: 'Theme saved',
        downloaded: 'Theme downloaded',
        failed: "Couldn't export the theme",
        next: (file: string) => file,
      },
      extension: {
        hint: 'Export as an extension zip',
        saved: 'Extension saved',
        downloaded: 'Extension downloaded',
        failed: "Couldn't export the extension",
        next: (file: string) => `Unzip ${file} into SillyTavern's data/default-user/extensions/`,
      },
      pending: (description: string, count: number) =>
        count > 0
          ? `${description}. Leaves out ${plural(count, 'change', 'changes')} still to adopt`
          : description,
    },
    adoption: {
      label: 'To adopt',
      count: (count: number) => `To adopt ${count}`,
      loading: 'Loading changes to adopt',
      overwritten: "Changes you hadn't adopted were overwritten",
      deleted: '(deleted)',
      separator: '; ',
    },
  },
});
