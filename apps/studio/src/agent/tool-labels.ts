import type { ToolCall } from '@tavern-studio/agent';
import type { RunText } from './run-messages';

/**
 * How the Transcript names a tool call: what it does, in the present while it
 * runs and in the past once done, so the state is in the words and not only
 * in the icon (docs/UI.md §3, status). A call that failed or got no result,
 * because its Run stopped first, names the action and how it ended. The
 * words of each tool, by the name the model calls it, are in messages.ts.
 */
const LABELS: Partial<Record<string, keyof RunText['calls']>> = {
  workspace_list_files: 'listFiles',
  workspace_search_files: 'search',
  workspace_read_file: 'read',
  workspace_write_file: 'write',
  workspace_edit_file: 'edit',
  app_snapshot: 'snapshot',
  app_interact: 'interact',
  app_evaluate: 'evaluate',
  app_read_logs: 'readLogs',
  preview_capture: 'capture',
  preview_reload: 'reload',
  preview_configure: 'configure',
  inspect_styles: 'styles',
  inspect_audit: 'audit',
};

export type CallState = 'running' | 'done' | 'failed' | 'unanswered';

export function callLabel(call: ToolCall, state: CallState, m: RunText): string {
  const tool = LABELS[call.name];
  if (!tool) return call.name;
  const labels = m.calls[tool];
  switch (state) {
    case 'running':
      return labels.running;
    case 'done':
      return labels.done;
    case 'failed':
      return m.callFailed(labels.action);
    case 'unanswered':
      return m.callUnanswered(labels.action);
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
