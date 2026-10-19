# Agent

Studio 的大部分代码由 Agent 编写，Agent 体验是首要打磨对象。运行模型和语义沿用 [TauriTavern Agent](https://github.com/Darkatse/TauriTavern/blob/main/docs/Agent/README.md)，对标它的应用内助手（Session 模式），让两个项目共用一套心智模型。

## 1. 运行模型

| 概念 | 含义 |
|---|---|
| Run | 一次任务执行，从用户消息开始。模型给出不带工具调用的回复即完成，否则以失败或取消结束。不设 finish 工具 |
| Round | 循环的一轮：发送上下文 → 模型回复 → 依次执行工具 → 进入下一轮 |
| Guidance | 运行中追加的指令，在下一轮模型请求前加入上下文 |
| History | 规范的消息记录，每条带上所在的 Round。Transcript 与发给模型的上下文都由它得出 |
| Journal | Run 的事件日志，记录进度、终态和大结果的引用。按顺序追加，不改写 |
| Checkpoint | Run 改动过的文件在改动前的内容，可以一键回滚 |

- 取消会结束当前 Run。已生效的文件修改保留，需要时经 Checkpoint 回滚。
- 页面刷新后，缺少终态的 Run 显示为 interrupted。没有收到结果的工具调用改写为一条说明，文案与 TT 相同，工具不重放。
- **Checkpoint 的保存**：
  - Run 第一次写某个文件之前，先保存它原来的内容，保存完成后才写入。Run 新建的文件也记录下来，回滚时删除。
  - 保存与 CAS 检查共用同一次读取。
  - 内容按 SHA-256 去重，用 `CompressionStream`（gzip）压缩后存进 IndexedDB。
- **Checkpoint 的回滚**：
  - 回滚前先核对，文件仍是该 Run 写下的内容；不是的话，列出冲突。
  - 回滚记为一条新的 Journal 事件。之后的 Run 保留并标注"已回滚"，回滚本身也可以撤销。
  - TT 的 checkpoint 指执行状态，与这里同名不同义。
- **存储上限**：
  - Checkpoint 总量默认 100 MB。超出时从最旧的 Run 开始清理，并删除不再被引用的内容；被清理的 Run 标明不能回滚。
  - 截图和 `tool-results/` 的长结果只保留最近 20 个 Run，更早的显示为"已清理"。
  - History 与 Journal 的文字记录保留。
  - 设置中显示占用。
- 循环由我们自己实现，只有几百行。模型接入使用 AI SDK 7 Core 的 provider 包，不用它的 agent 抽象。

## 2. 模型接入

- 只做 BYOK，由浏览器直连模型服务。
- CORS 情况：
  - OpenAI、Gemini、OpenRouter、DeepSeek 等直接返回 CORS 头；
  - Anthropic 需要带上 `anthropic-dangerous-direct-browser-access`；
  - 基于 new-api / one-api 的中转默认放开所有源；
  - 其余不返回 CORS 的端点，经可自部署的 CORS 中继访问。
- 图片：OpenAI 兼容格式只接受 user 消息里的图片。因此截图工具只返回文字结果，图片另作为合成的 user 消息注入。
- 沿用 TT 模型网关的经验：
  - `finishReason` 为 length 时不执行工具；
  - 模型调用了未声明的工具时，Run 失败；
  - assistant 消息连同 reasoning 与 provider 元数据原样保存、原样回放；
  - callId 可能重复，按顺序配对。
  
  中转端点是否回传 reasoning 字段，逐个实测。

## 3. 工作区视图

| 根 | 权限 | 内容 |
|---|---|---|
| `project/` | 读写 | 项目文件与 `studio.json` |
| `skills/` | 只读 | 当前生效的 Skill |
| `knowledge/` | 只读 | 知识包语料 |
| `vendor/` | 只读 | 当前 vendor 的源码与解剖图 |
| `tool-results/` | 只读 | 较长工具结果的可读版本 |

文本写入以读取时记录的内容 SHA 做 CAS（比较后写入），与 TauriTavern Workspace 一致：
- 读状态、先读后改、只读过部分内容时对编辑的限制、`read_file` 的输出格式与读取上限、错误码，都与 TT 相同。
- CAS 检查与写入在同一个异步互斥区内完成，对应 TT 的写锁。
- 本地文件夹项目里，列目录和搜索时跳过 `.gitignore` 忽略的路径；按路径直接读取不受此限。

## 4. 工具

工具的稳定 ID 用点分组。发给模型时把点换成下划线，例如 `workspace_read_file`，与 TT 同一规则：OpenAI 与 Anthropic 的工具名都不允许点号。提示词和工具说明里引用的，都是模型实际看到的名字。

| 组 | 工具 | 说明 |
|---|---|---|
| 工作区 | `workspace.list_files` `search_files` `read_file` `write_file` `edit_file` | 与 TauriTavern 语义相同。`edit_file` 是精确替换（`old_string` / `new_string` / `replace_all`），TT 中叫 `apply_patch`；Studio 不沿用这个名字，因为它是 GPT 系模型在 Codex 中训练的补丁格式的名字。超过阈值的结果写入 `tool-results/`，模型收到开头的预览和读取指引，规则同 TT |
| 预览 | `preview.configure` | 切换 Vendor、Device、Fixture |
| | `preview.reload` | 重载 View |
| | `preview.capture` | 截图。可选 set-of-marks 编号，编号与 `app.snapshot` 的 ref 对应，并附上关键的计算样式 |
| 页面 | `app.snapshot` `app.interact` `app.evaluate` `app.read_logs` | 来自 `@tauritavern/app-use`，引擎注入到预览页内运行，契约与 TauriTavern 应用内助手相同。`app.read_logs` 读取 Attach 收集的运行时记录，见 [Architecture §5](Architecture.md#5-编辑与预览) |
| 检查 | `inspect.styles` | 列出命中的规则和来源（vendor CSS / 主题 / 扩展 / 消息里的 `<style>`），经 Mount 映射到项目文件的行号 |
| | `inspect.audit` | 确定性检查：对比度、溢出与裁切、元素重叠、零尺寸 |

能用确定性检查的地方不靠视觉判断。`inspect.audit` 给出数值；截图负责整体审美和布局上的直觉判断。

## 5. 视觉

- **默认方式**：在 Chromium 桌面上使用 Element Capture，限定在 View 的 iframe 上，结果与浏览器渲染一致。每个 Session 首次截图时请求共享标签页，之后保持流打开，截图只是读取最新一帧。
- **退回方式**：用户拒绝授权或浏览器不支持时，在预览文档内用 snapdom 截图。它在 ST 上有已知失真：背景层缺失或变暗、`<q>` 引号重复、文本重新折行（见 [P0 报告 V7](plan/P0-Report.md#v7-截图方式)）。
- 截图结果会标注所用方式；snapdom 的结果附上已知失真。上下文中只保留最近若干张图片。

## 6. 上下文

系统提示词包含以下内容，其余材料由 Agent 按需读取，不预先载入：
- 当前的 Vendor / Device / Fixture；
- `studio.json`；
- 项目里的 `AGENTS.md`；
- 生效 Skill 的名称、描述与路径。

## 7. 体验

- Transcript 按 Run 分组。中间轮次、工具调用和思考过程可以折叠，最终答复始终可见。
- 工具结果直接显示在 Transcript 里：截图缩略图、逐文件的 diff、审计结果。
- 预览中显示 Agent 的光标（app-use cursor），视图跟随 Agent 当前操作的目标。
- 停止按钮随时可用。Checkpoint 时间线可以回滚到任意一次 Run 之前。

## 8. 安全

- `app.evaluate` 在预览页面的 realm 中执行。
- 工具结果进入模型上下文前，对已配置的密钥做脱敏。
- 卡片、扩展输出和导入内容一律视为不可信输入，在工具结果中标明来源。
