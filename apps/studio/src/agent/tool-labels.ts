import type { ToolCall } from '@tavern-studio/agent';

/**
 * How the Transcript names a tool call: what it does, in the present while it
 * runs and in the past once done, so the state is in the words and not only
 * in the icon (docs/UI.md §3, status).
 */
const LABELS: Record<string, { running: string; done: string; failed: string }> = {
  workspace_list_files: { running: '正在列出文件', done: '列出了文件', failed: '列出文件失败' },
  workspace_search_files: { running: '正在搜索', done: '搜索了', failed: '搜索失败' },
  workspace_read_file: { running: '正在读取', done: '读取了', failed: '读取失败' },
  workspace_write_file: { running: '正在写入', done: '写入了', failed: '写入失败' },
  workspace_edit_file: { running: '正在编辑', done: '编辑了', failed: '编辑失败' },
  app_snapshot: { running: '正在观察页面', done: '观察了页面', failed: '观察页面失败' },
  app_interact: { running: '正在操作页面', done: '操作了页面', failed: '操作页面失败' },
  app_evaluate: {
    running: '正在页面中运行代码',
    done: '在页面中运行了代码',
    failed: '运行代码失败',
  },
  app_read_logs: { running: '正在读取日志', done: '读取了日志', failed: '读取日志失败' },
  preview_capture: { running: '正在截图', done: '截了图', failed: '截图失败' },
  preview_reload: { running: '正在重载预览', done: '重载了预览', failed: '重载预览失败' },
  preview_configure: { running: '正在切换预览', done: '切换了预览', failed: '切换预览失败' },
};

export type CallState = 'running' | 'done' | 'failed' | 'unanswered';

export function callLabel(call: ToolCall, state: CallState): string {
  const labels = LABELS[call.name];
  if (!labels) return call.name;
  return state === 'running' ? labels.running : state === 'failed' ? labels.failed : labels.done;
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
