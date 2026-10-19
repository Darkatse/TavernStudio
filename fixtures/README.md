# 样板

每个子目录是一份 SillyTavern 数据目录（docs/Architecture.md §2），布局与 ST 的 `data/` 相同：`default-user/` 下是用户数据，`_css/user.css` 是全局样式。构建时 `apps/studio/build/fixtures.ts` 把它们发布到 `/_studio/fixtures/<名称>/`，并生成带 SHA-256 的 `index.json`。

样板是数据，保持 SillyTavern 写出的原样，不经过格式化工具。

## showcase

一个全新安装的 ST 1.19.0 用户，加上一段展示用的聊天。

- 来源：ST `1.19.0` 标签下的 `default/content/`，按 `content-manager.js` 为新用户复制的映射放置。背景只保留五张，Seraphina 的表情立绘没有收录。
- 与默认内容的差异：
  - `settings.json`：`firstRun: false`、`currentVersion: "1.19.0"`、`main_api: "openai"`、`active_character: "default_Seraphina.png"`、背景为 `tavern day.jpg`、`power_user.auto_load_chat: true`。目的是启动时不弹出引导、直接打开聊天。
  - `chats/default_Seraphina/Seraphina - 2023-5-12 @21h 32m 29s 224ms.jsonl`：五条消息，覆盖 Markdown 的斜体、引语、加粗、列表、引用块，以及一张前端卡（HTML 代码块）。文件名取自角色卡的 `chat` 字段。
- 许可：AGPL-3.0，与 SillyTavern 相同。
