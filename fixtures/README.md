# 样板

每个子目录是一份 SillyTavern 数据目录（docs/Architecture.md §2），布局与 ST 的 `data/` 相同：`default-user/` 下是用户数据，`_css/user.css` 是全局样式。构建时 `apps/studio/build/published.ts` 把它们发布到 `/_studio/fixtures/<名称>/`，并生成带 SHA-256 的 `index.json`。

样板根目录的 `replay.json` 是它的 Replay：`{ "replies": [{ "content", "reasoning"? }] }`。生成端点按顺序每次回放一条，流式时按固定节奏分段推送；全部放完后，生成以错误应答，不会重复。回放到第几条属于 Session，记在 Session 数据根目录的 `replay-position.json` 里，随 Session 持久化与重置。没有 `replay.json` 的样板不能生成。

样板是数据，保持 SillyTavern 写出的原样，不经过格式化工具。

## showcase

一个全新安装的 ST 1.19.0 用户，加上一段展示用的聊天。

- 来源：ST `1.19.0` 标签下的 `default/content/`，按 `content-manager.js` 为新用户复制的映射放置。背景只保留五张，Seraphina 的表情立绘没有收录。
- 与默认内容的差异：
  - `settings.json`：`firstRun: false`、`currentVersion: "1.19.0"`、`main_api: "openai"`、`active_character: "default_Seraphina.png"`、背景为 `tavern day.jpg`、`power_user.auto_load_chat: true`。目的是启动时不弹出引导、直接打开聊天。
  - `settings.json` 的连接：`power_user.auto_connect: true`，Chat Completion 来源为 `custom`，`custom_url` 为保留域名 `http://replay.invalid/v1`，模型 `replay`。这个地址从不被请求，状态与生成都由 Session Backend 的 Replay 应答；ST 对 `custom` 来源只要求地址有效，所以启动后即为已连接。
  - `chats/default_Seraphina/Seraphina - 2023-5-12 @21h 32m 29s 224ms.jsonl`：五条消息，覆盖 Markdown 的斜体、引语、加粗、列表、引用块，以及一张带按钮的前端卡（HTML 代码块）。文件名取自角色卡的 `chat` 字段。
  - `replay.json`：三条回复，依次是带 Markdown 的叙述、带思考过程且更新了状态卡的回复，以及一句收尾。
- 许可：AGPL-3.0，与 SillyTavern 相同。
