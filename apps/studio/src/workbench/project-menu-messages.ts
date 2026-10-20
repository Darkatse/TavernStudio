import { MANIFEST } from '@tavern-studio/workspace';
import { formatNumber } from '../i18n/common';
import type { Locale } from '../i18n/locale';
import { defineMessages } from '../i18n/messages';
import type { ProjectNameProblem } from '../project/projects';

/** Loads with the project menu, after the first screen. */
export const projectMenuMessages = defineMessages({
  zh: {
    import: '导入项目…',
    rename: '重命名项目',
    projectName: '项目名称',
    nameProblem: {
      empty: () => '名称不能为空',
      taken: (name: string) => `已有名为 ${name} 的项目`,
    } satisfies Record<ProjectNameProblem, (name: string) => string>,
    export: '导出项目',
    saved: '项目已保存',
    downloaded: '项目已下载',
    imported: '项目已导入',
    failed: {
      open: '打开项目失败',
      rename: '重命名项目失败',
      export: '导出项目失败',
      import: '导入项目失败',
    },
    archive: {
      notZip: (detail: string) => `无法读取这个 zip：${detail}`,
      notProject: `不是 Studio 项目：缺少 ${MANIFEST}`,
      unsafePaths: (paths: string) => `这些路径不能用：${paths}`,
      caseClash: (pairs: string) => `这些文件名只差大小写：${pairs}`,
      pair: (one: string, other: string) => `${one} 与 ${other}`,
      separator: '；',
      more: (listed: string, count: number) => `${listed}，另有 ${formatNumber(count)} 处`,
    },
  },
  en: {
    import: 'Import project…',
    rename: 'Rename project',
    projectName: 'Project name',
    nameProblem: {
      empty: () => "Name can't be empty",
      taken: (name: string) => `A project named ${name} already exists`,
    },
    export: 'Export project',
    saved: 'Project saved',
    downloaded: 'Project downloaded',
    imported: 'Project imported',
    failed: {
      open: "Couldn't open the project",
      rename: "Couldn't rename the project",
      export: "Couldn't export the project",
      import: "Couldn't import the project",
    },
    archive: {
      notZip: (detail: string) => `Can't read this zip: ${detail}`,
      notProject: `Not a Studio project: ${MANIFEST} is missing`,
      unsafePaths: (paths: string) => `These paths can't be used: ${paths}`,
      caseClash: (pairs: string) => `These file names differ only in case: ${pairs}`,
      pair: (one: string, other: string) => `${one} and ${other}`,
      separator: '; ',
      more: (listed: string, count: number) => `${listed}, and ${formatNumber(count)} more`,
    },
  },
});

export type ProjectMenuText = (typeof projectMenuMessages)[Locale];
