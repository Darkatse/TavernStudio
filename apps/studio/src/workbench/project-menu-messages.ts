import { MANIFEST } from '@tavern-studio/workspace';
import { formatNumber } from '../i18n/common';
import type { Locale } from '../i18n/locale';
import { defineMessages } from '../i18n/messages';

/** The project menu's text. It loads with the menu, after the first screen. */
export const projectMenuMessages = defineMessages({
  zh: {
    import: '导入项目…',
    export: '导出项目',
    saved: '项目已保存',
    downloaded: '项目已交给浏览器下载',
    archived: (file: string) => `${file}，可在这里导入，或在别处解压编辑。`,
    imported: '项目已导入',
    failed: {
      open: '项目没能打开',
      export: '项目没能导出',
      import: '项目没能导入',
    },
    /** Why an archive cannot become a project (project/archive.ts). */
    archive: {
      notZip: (detail: string) => `这个文件不是能读的 zip：${detail}`,
      notProject: `这个 zip 里没有 ${MANIFEST}，不是 Studio 项目。`,
      unsafePaths: (paths: string) => `这些路径会落到项目之外或无法使用：${paths}`,
      caseClash: (pairs: string) =>
        `这些文件名只有大小写不同，在 Windows 和 macOS 上是同一个文件：${pairs}`,
      pair: (one: string, other: string) => `${one} 与 ${other}`,
      separator: '；',
      more: (listed: string, count: number) => `${listed}，另有 ${formatNumber(count)} 处`,
    },
  },
  en: {
    import: 'Import project…',
    export: 'Export project',
    saved: 'Project saved',
    downloaded: 'Project downloaded',
    archived: (file: string) =>
      `${file} can be imported into Studio, or unzipped and edited elsewhere.`,
    imported: 'Project imported',
    failed: {
      open: "Couldn't open the project",
      export: "Couldn't export the project",
      import: "Couldn't import the project",
    },
    archive: {
      notZip: (detail: string) => `This file isn't a readable zip: ${detail}`,
      notProject: `This zip has no ${MANIFEST}, so it isn't a Studio project.`,
      unsafePaths: (paths: string) =>
        `These paths would land outside the project or can't be used: ${paths}`,
      caseClash: (pairs: string) =>
        `These file names differ only in case, which makes them one file on Windows and macOS: ${pairs}`,
      pair: (one: string, other: string) => `${one} and ${other}`,
      separator: '; ',
      more: (listed: string, count: number) => `${listed}, and ${formatNumber(count)} more`,
    },
  },
});

export type ProjectMenuText = (typeof projectMenuMessages)[Locale];
