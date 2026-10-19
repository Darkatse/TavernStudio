import type { ToolCall } from '@tavern-studio/agent';

/**
 * How the Transcript names a tool call: what it does, in the present while it
 * runs and in the past once done, so the state is in the words and not only
 * in the icon (docs/UI.md §3, status). A call that failed or got no result,
 * because its Run stopped first, names the action and how it ended.
 */
const LABELS: Record<string, { running: string; done: string; action: string }> = {
  workspace_list_files: { running: '正在列出文件', done: '列出了文件', action: '列出文件' },
  workspace_search_files: { running: '正在搜索', done: '搜索了', action: '搜索' },
  workspace_read_file: { running: '正在读取', done: '读取了', action: '读取' },
  workspace_write_file: { running: '正在写入', done: '写入了', action: '写入' },
  workspace_edit_file: { running: '正在编辑', done: '编辑了', action: '编辑' },
  app_snapshot: { running: '正在观察页面', done: '观察了页面', action: '观察页面' },
  app_interact: { running: '正在操作页面', done: '操作了页面', action: '操作页面' },
  app_evaluate: { running: '正在页面中运行代码', done: '在页面中运行了代码', action: '运行代码' },
  app_read_logs: { running: '正在读取日志', done: '读取了日志', action: '读取日志' },
  preview_capture: { running: '正在截图', done: '截了图', action: '截图' },
  preview_reload: { running: '正在重载预览', done: '重载了预览', action: '重载预览' },
  preview_configure: { running: '正在切换预览', done: '切换了预览', action: '切换预览' },
  inspect_styles: { running: '正在查看样式来源', done: '查看了样式来源', action: '查看样式来源' },
  inspect_audit: { running: '正在检查页面', done: '检查了页面', action: '检查页面' },
};

export type CallState = 'running' | 'done' | 'failed' | 'unanswered';

export function callLabel(call: ToolCall, state: CallState): string {
  const labels = LABELS[call.name];
  if (!labels) return call.name;
  switch (state) {
    case 'running':
      return labels.running;
    case 'done':
      return labels.done;
    case 'failed':
      return `${labels.action}失败`;
    case 'unanswered':
      return `${labels.action}未完成`;
  }
}

/** The one argument that tells calls apart, such as the path, as TauriTavern picks it. */
export function callDetail(call: ToolCall): string | undefined {
  for (const key of ['path', 'query', 'selector', 'code', 'ref']) {
    const value = call.arguments[key];
    if (typeof value === 'string' && value.trim() !== '')
      return value.replaceAll(/\s+/g, ' ').trim();
  }
  return undefined;
}
