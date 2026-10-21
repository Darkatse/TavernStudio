import { formatNumber, plural } from '../i18n/common';
import type { Locale } from '../i18n/locale';
import { defineMessages } from '../i18n/messages';
import type { RunStatus } from './runs';

/** Token counts, in the reader's numerals: 152K, 15万. */
const COMPACT: Intl.NumberFormatOptions = { notation: 'compact', maximumFractionDigits: 1 };

export const runMessages = defineMessages({
  zh: {
    conversation: '与 Agent 的对话',
    jumpToLatest: '回到最新',
    /** Said once when a Run ends. */
    announcement: {
      completed: 'Agent 已完成',
      failed: 'Agent 运行失败',
      cancelled: 'Agent 已停止',
    } satisfies Partial<Record<RunStatus, string>>,

    rollBackHere: '回滚到此处',
    rollBackBeforeRun: '回滚到这次运行之前',
    runFailed: (reason: string) => `运行失败：${reason}`,
    failureAdvice: {
      'agent.output_truncated': '回复超出了最大输出长度，可以在模型设置里调高。',
      'agent.compaction_failed': '压缩上下文时没能写出交接摘要。',
      'agent.context_full': '压缩之后上下文仍然太长，可以开一个新对话继续。',
    },
    compacting: '正在压缩上下文',
    compacted: '压缩了上下文',
    compactedTokens: (before: number, after: number) =>
      `${formatNumber(before, COMPACT)} → ${formatNumber(after, COMPACT)}`,
    working: '工作中',
    workingFor: (duration: string) => `工作中 · ${duration}`,
    // A space only between Chinese and a number: "工作了 8 秒", "工作了不到 1 秒".
    workedFor: (duration: string) => `工作了${/^\d/.test(duration) ? ' ' : ''}${duration}`,
    completed: '已完成',
    failedStatus: '失败',
    cancelled: '已停止',
    interrupted: '已中断',
    toolCalls: (count: number) => `${formatNumber(count)} 次调用`,
    runUndone: '已回滚',
    thinking: '思考中',
    thoughts: '思考过程',
    thinkingRedacted: '（思考内容已加密）',
    arguments: '参数',
    result: '结果',
    error: '错误',
    /** `action` is what a failed or unanswered call names. */
    calls: {
      listFiles: { running: '正在列出文件', done: '列出了文件', action: '列出文件' },
      search: { running: '正在搜索', done: '搜索了', action: '搜索' },
      read: { running: '正在读取', done: '读取了', action: '读取' },
      write: { running: '正在写入', done: '写入了', action: '写入' },
      edit: { running: '正在编辑', done: '编辑了', action: '编辑' },
      snapshot: { running: '正在观察页面', done: '观察了页面', action: '观察页面' },
      interact: { running: '正在操作页面', done: '操作了页面', action: '操作页面' },
      evaluate: { running: '正在页面中运行代码', done: '在页面中运行了代码', action: '运行代码' },
      readLogs: { running: '正在读取日志', done: '读取了日志', action: '读取日志' },
      capture: { running: '正在截图', done: '截了图', action: '截图' },
      reload: { running: '正在重载预览', done: '重载了预览', action: '重载预览' },
      configure: { running: '正在切换预览', done: '切换了预览', action: '切换预览' },
      styles: { running: '正在查看样式来源', done: '查看了样式来源', action: '查看样式来源' },
      audit: { running: '正在检查页面', done: '检查了页面', action: '检查页面' },
    },
    callFailed: (action: string) => `${action}失败`,
    /** A call without a result, because its Run stopped first. */
    callUnanswered: (action: string) => `${action}未完成`,
    screenshotsCleared: '截图已清理',
    viewScreenshot: '查看大图',
    screenshot: '预览截图',
    renderedScreenshot: '近似截图，可能失真。',
    shareCapture: '开启精确截图',
    shareCaptureFailed: '开启精确截图失败',

    cannotRollBack: '无法回滚',
    understood: '知道了',
    undoRollbackTitle: '撤销这次回滚？',
    undoRollbackDescription: '文件回到回滚之前的内容。',
    undoRollback: '撤销回滚',
    rollBackTitle: '回滚到这次运行之前？',
    rollBackDescription: '项目文件恢复到这次运行之前，之后的运行不再计入对话。可以撤销。',
    rollBackElsewhereDescription: (runs: number) =>
      `项目文件恢复到这次运行之前，之后的运行不再计入对话，其中 ${formatNumber(runs)} 次在其他对话里。可以撤销。`,
    affectedFiles: '受影响的文件',
    changedLater: '之后有改动',
    fileChange: { remove: '删除', recreate: '重新创建', restore: '还原' },
    conflictNote: '回滚会覆盖"之后有改动"的文件。',
    /** Around the request of the Run rolled back to, which shortens to fit. */
    rolledBackTo: { prefix: '回滚到「', suffix: '」之前' },
    undidRollback: '撤销回滚',
    rolledBack: '回滚',
    files: (count: number) => `${formatNumber(count)} 个文件`,
    rollbackUndone: '已回滚',
    undo: '撤销',
  },
  en: {
    conversation: 'Conversation with the Agent',
    jumpToLatest: 'Jump to latest',
    announcement: {
      completed: 'Agent finished',
      failed: 'Agent failed',
      cancelled: 'Agent stopped',
    },

    rollBackHere: 'Roll back to here',
    rollBackBeforeRun: 'Roll back to before this Run',
    runFailed: (reason: string) => `Run failed: ${reason}`,
    failureAdvice: {
      'agent.output_truncated':
        'The reply went past the max output. You can raise it in model settings.',
      'agent.compaction_failed': "Compacting the context didn't produce a handoff.",
      'agent.context_full':
        'The context is still too long after compaction. You can continue in a new conversation.',
    },
    compacting: 'Compacting the context',
    compacted: 'Compacted the context',
    compactedTokens: (before: number, after: number) =>
      `${formatNumber(before, COMPACT)} → ${formatNumber(after, COMPACT)}`,
    working: 'Working',
    workingFor: (duration: string) => `Working · ${duration}`,
    workedFor: (duration: string) => `Worked for ${duration}`,
    completed: 'Done',
    failedStatus: 'Failed',
    cancelled: 'Stopped',
    interrupted: 'Interrupted',
    toolCalls: (count: number) => plural(count, 'call', 'calls'),
    runUndone: 'Rolled back',
    thinking: 'Thinking',
    thoughts: 'Thought process',
    thinkingRedacted: '(Thinking encrypted)',
    arguments: 'Arguments',
    result: 'Result',
    error: 'Error',
    // English builds a failed or unanswered call's words from the action's -ing form.
    calls: {
      listFiles: { running: 'Listing files', done: 'Listed files', action: 'listing files' },
      search: { running: 'Searching', done: 'Searched', action: 'searching' },
      read: { running: 'Reading', done: 'Read', action: 'reading' },
      write: { running: 'Writing', done: 'Wrote', action: 'writing' },
      edit: { running: 'Editing', done: 'Edited', action: 'editing' },
      snapshot: {
        running: 'Looking at the page',
        done: 'Looked at the page',
        action: 'looking at the page',
      },
      interact: {
        running: 'Interacting with the page',
        done: 'Interacted with the page',
        action: 'interacting with the page',
      },
      evaluate: {
        running: 'Running code in the page',
        done: 'Ran code in the page',
        action: 'running code',
      },
      readLogs: { running: 'Reading logs', done: 'Read logs', action: 'reading logs' },
      capture: {
        running: 'Taking a screenshot',
        done: 'Took a screenshot',
        action: 'taking a screenshot',
      },
      reload: {
        running: 'Reloading the preview',
        done: 'Reloaded the preview',
        action: 'reloading the preview',
      },
      configure: {
        running: 'Switching the preview',
        done: 'Switched the preview',
        action: 'switching the preview',
      },
      styles: {
        running: 'Looking up style sources',
        done: 'Looked up style sources',
        action: 'looking up style sources',
      },
      audit: {
        running: 'Checking the page',
        done: 'Checked the page',
        action: 'checking the page',
      },
    },
    callFailed: (action: string) => `Error ${action}`,
    callUnanswered: (action: string) => `Stopped ${action}`,
    screenshotsCleared: 'Screenshot cleared',
    viewScreenshot: 'View full size',
    screenshot: 'Preview screenshot',
    renderedScreenshot: 'Approximate screenshot. It may look off.',
    shareCapture: 'Turn on accurate screenshots',
    shareCaptureFailed: "Couldn't turn on accurate screenshots",

    cannotRollBack: "Can't roll back",
    understood: 'OK',
    undoRollbackTitle: 'Undo this rollback?',
    undoRollbackDescription: 'Files go back to what they were before the rollback.',
    undoRollback: 'Undo rollback',
    rollBackTitle: 'Roll back to before this Run?',
    rollBackDescription:
      'Project files go back to before this Run, and later Runs no longer count in the conversation. You can undo this.',
    rollBackElsewhereDescription: (runs: number) =>
      `Project files go back to before this Run, and later Runs no longer count, including ${plural(runs, 'Run', 'Runs')} in other conversations. You can undo this.`,
    affectedFiles: 'Affected files',
    changedLater: 'Changed later',
    fileChange: { remove: 'Delete', recreate: 'Recreate', restore: 'Restore' },
    conflictNote: 'Rolling back overwrites files marked “Changed later”.',
    rolledBackTo: { prefix: 'Rolled back “', suffix: '”' },
    undidRollback: 'Undid a rollback',
    rolledBack: 'Rolled back',
    files: (count: number) => plural(count, 'file', 'files'),
    rollbackUndone: 'Undone',
    undo: 'Undo',
  },
});

export type RunText = (typeof runMessages)[Locale];
