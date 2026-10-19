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
      /** The vendor's name once it is known. */
      vendor: (label: string | undefined) => (label ? `启动 ${label}` : '启动前端'),
      failed: '预览启动失败',
      elsewhere: '已在另一个标签页打开',
      elsewhereDetail:
        '同一时间只有一个标签页运行预览。回到这里继续时，另一个标签页会先保存再交出预览。',
      continueHere: '在这里继续',
    },
    noProject: '未打开项目',
    codeView: {
      empty: '尚未打开项目',
      emptyDetail: '从模板新建一个项目，文件会显示在这里，改动即时出现在预览中。',
      loading: '正在载入编辑器',
    },
    exports: {
      export: '导出',
      label: (item: ProjectExport) =>
        item.kind === 'theme' ? '导出主题' : `导出扩展 ${item.name}`,
      theme: {
        hint: '导出为 SillyTavern 主题',
        saved: '主题已保存',
        downloaded: '主题已交给浏览器下载',
        failed: '主题没能导出',
        next: (file: string) => `${file}，可在 SillyTavern 的主题设置里导入。`,
      },
      extension: {
        hint: '导出为扩展的 zip',
        saved: '扩展已保存',
        downloaded: '扩展已交给浏览器下载',
        failed: '扩展没能导出',
        next: (file: string) =>
          `${file}，解压到 data/default-user/extensions/，重新载入后即可使用。`,
      },
      /** A description, followed by how many changes in the preview the export leaves out. */
      pending: (description: string, count: number) =>
        count > 0
          ? `${description}预览里还有 ${formatNumber(count)} 处待采纳的修改，没有包含在内。`
          : description,
    },
    adoption: {
      label: '待采纳',
      count: (count: number) => `待采纳 ${count}`,
      loading: '正在载入待采纳的修改',
      overwritten: '项目改动覆盖了预览里尚未采纳的修改',
      overwrittenDetail: (values: string) => `这些值换成了项目里的内容：${values}`,
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
      elsewhere: 'The preview is open in another tab',
      elsewhereDetail:
        'Only one tab runs the preview at a time. Continue here, and the other tab saves its work before handing the preview over.',
      continueHere: 'Continue here',
    },
    noProject: 'No project',
    codeView: {
      empty: 'No project open',
      emptyDetail:
        'Start a project from a template. Its files show up here, and your changes appear in the preview right away.',
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
        next: (file: string) => `${file} is ready to import in SillyTavern's theme settings.`,
      },
      extension: {
        hint: 'Export as an extension zip',
        saved: 'Extension saved',
        downloaded: 'Extension downloaded',
        failed: "Couldn't export the extension",
        next: (file: string) =>
          `Unzip ${file} into data/default-user/extensions/ and reload to use it.`,
      },
      pending: (description: string, count: number) =>
        count > 0
          ? `${description} ${plural(count, 'change', 'changes')} still to adopt in the preview ${count === 1 ? "isn't" : "aren't"} included.`
          : description,
    },
    adoption: {
      label: 'To adopt',
      count: (count: number) => `To adopt ${count}`,
      loading: 'Loading changes to adopt',
      overwritten: "A project change overwrote preview changes you hadn't adopted",
      overwrittenDetail: (values: string) =>
        `The project's content replaced these values: ${values}`,
      deleted: '(deleted)',
      separator: '; ',
    },
  },
});
