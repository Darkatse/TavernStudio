import { formatNumber, plural } from '../i18n/common';
import type { Locale } from '../i18n/locale';
import { defineMessages } from '../i18n/messages';
import type { RunStatus } from './runs';

/** The Transcript's text: Runs, tool calls and rollbacks. It loads with the Transcript. */
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

    // A Run
    rollBackHere: '回滚到此处',
    rollBackBeforeRun: '回滚到这次运行之前',
    cancelledNote: '已停止。已经生效的文件修改都保留着。',
    interruptedNote: '页面关闭时这次运行还没有结束；没有结果的工具调用不会重新执行。',
    runFailed: (reason: string) => `运行失败：${reason}`,
    /** What the author can do about a failure the Agent can explain, by its code. */
    failureAdvice: {
      'agent.output_truncated':
        '回复写到单次输出上限就停了，其中的工具调用没有执行。对话越长，留给回复的空间越少：可以在「模型」设置里调高单次输出上限，或核对上下文窗口。',
    },
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
    thinkingRedacted: '（思考内容已由服务方加密）',
    arguments: '参数',
    result: '结果',
    error: '错误',
    /**
     * A tool call's words: what it does while it runs and once done, and the
     * action that a failed or unanswered call names.
     */
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
    screenshotsCleared: '截图已清理，较早的运行不保留截图。',
    enlargeScreenshot: '放大截图',
    shrinkScreenshot: '缩小截图',
    screenshot: '预览截图',
    renderedScreenshot: '这张截图由页面结构渲染，背景和排版可能失真。',
    shareCapture: '开启精确截图',
    shareCaptureFailed: '没能开启精确截图',

    // Rollback
    cannotRollBack: '无法回滚',
    understood: '知道了',
    undoRollbackTitle: '撤销这次回滚？',
    undoRollbackDescription: '文件回到回滚之前的内容。',
    undoRollback: '撤销回滚',
    rollBackTitle: '回滚到这次运行之前？',
    rollBackDescription:
      '项目文件回到这次运行开始之前。之后的运行留在对话里，标为已回滚，Agent 继续对话时不再参考它们。回滚可以撤销。',
    affectedFiles: '受影响的文件',
    changedLater: '之后有改动',
    /** What a rollback does to a file. */
    fileChange: { remove: '删除', recreate: '重新创建', restore: '还原' },
    conflictNote: '标为"之后有改动"的文件在 Agent 写入之后又被修改过，回滚会覆盖这些修改。',
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
    cancelledNote: 'Stopped. File changes already made are kept.',
    interruptedNote:
      "This Run hadn't finished when the page closed. Tool calls without a result won't run again.",
    runFailed: (reason: string) => `Run failed: ${reason}`,
    failureAdvice: {
      'agent.output_truncated':
        "The reply stopped at the output limit, so its tool calls didn't run. The longer the conversation, the less room a reply has: raise the output limit in model settings, or check the context window.",
    },
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
    thinkingRedacted: '(The model service encrypted this thinking.)',
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
    screenshotsCleared: "Screenshot cleared. Older Runs don't keep screenshots.",
    enlargeScreenshot: 'Enlarge screenshot',
    shrinkScreenshot: 'Shrink screenshot',
    screenshot: 'Preview screenshot',
    renderedScreenshot:
      'This screenshot was rendered from the page structure, so backgrounds and layout may be off.',
    shareCapture: 'Turn on accurate screenshots',
    shareCaptureFailed: "Couldn't turn on accurate screenshots",

    cannotRollBack: "Can't roll back",
    understood: 'OK',
    undoRollbackTitle: 'Undo this rollback?',
    undoRollbackDescription: 'Files go back to what they were before the rollback.',
    undoRollback: 'Undo rollback',
    rollBackTitle: 'Roll back to before this Run?',
    rollBackDescription:
      'Project files go back to how they were before this Run started. Later Runs stay in the conversation, marked as rolled back, and the Agent leaves them out from then on. You can undo the rollback.',
    affectedFiles: 'Affected files',
    changedLater: 'Changed later',
    fileChange: { remove: 'Delete', recreate: 'Recreate', restore: 'Restore' },
    conflictNote:
      'Files marked “Changed later” were changed after the Agent wrote them. Rolling back overwrites those changes.',
    rolledBackTo: { prefix: 'Rolled back “', suffix: '”' },
    undidRollback: 'Undid a rollback',
    rolledBack: 'Rolled back',
    files: (count: number) => plural(count, 'file', 'files'),
    rollbackUndone: 'Undone',
    undo: 'Undo',
  },
});

/** The Transcript's text in one language, for helpers that word things for a component. */
export type RunText = (typeof runMessages)[Locale];
