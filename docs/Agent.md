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

- Run 不设轮数和工具调用次数的上限，作者看着它进行，随时可以停止。Studio 不压缩上下文，History 只增不减，所以上下文窗口就是 Run 的上界：窗口写满时，Run 以 `agent.output_truncated` 或模型错误结束。
- 取消会结束当前 Run。已生效的文件修改保留，需要时经 Checkpoint 回滚。
- 页面刷新后，缺少终态的 Run 显示为 interrupted。没有收到结果的工具调用改写为一条说明，文案与 TT 相同，工具不重放。
- **Checkpoint 的保存**：
  - Run 第一次写某个文件之前，先保存它原来的内容，保存完成后才写入。Run 新建的文件也记录下来，回滚时删除。
  - 保存与 CAS 检查共用同一次读取：项目存储在核对之后、写入之前，把被替换的内容交给 Checkpoint。
  - 内容按 SHA-256 去重，用 `CompressionStream`（gzip）压缩后存进 IndexedDB。每个文件另记最后一次写入后的 SHA-256，供回滚核对。
- **Checkpoint 的回滚**：
  - Run 与回滚都是操作，按开始的顺序排成一条时间线。"回滚到某次操作之前"把从它起改动过的每个文件，还原为其中最早那次改动之前的内容。
  - 回滚前先核对，文件仍是最后一次改动写下的内容；不是的话，在确认框里标出，回滚会覆盖这些改动。
  - 回滚本身是一次操作：开始前先记入 Journal，再还原文件，并像 Run 一样保存被替换的内容。中途失败时，已还原的部分可以撤销。
  - 撤销回滚就是回滚到这次回滚之前，只在它是最新一次操作时提供；之后有了别的 Run，就从那些 Run 的标记回滚。
  - 被回滚的操作留在对话里，标为"已回滚"，并且不再进入模型上下文：回滚让文件和 Agent 的对话一起回到那个时刻。撤销回滚后，它们回来。
  - TT 的 checkpoint 指执行状态，与这里同名不同义。
- **存储上限**：
  - Checkpoint 默认每个项目 100 MB，按压缩后的大小计，同一内容只计一次。超出时从最旧的操作开始清理，并删除不再被引用的内容；被清理的操作记入 Journal，标明不能回滚。
  - 截图和 `tool-results/` 的长结果只保留最近 20 个 Run，更早的显示为"已清理"。
  - History 与 Journal 的文字记录保留。
  - 设置中显示占用。
- 循环由我们自己实现，只有几百行。模型接入使用 pi-ai 的单轮流式接口：
  - 只引入 `@earendil-works/pi-ai/api/*.lazy`，每家 provider 在第一次请求时才加载，不用 pi-ai 的 agent 包；
  - 精确锁定版本。

## 2. 模型接入

- 只做 BYOK，由浏览器直连模型服务。
- CORS 情况：
  - OpenAI、Gemini、OpenRouter、DeepSeek 等直接返回 CORS 头；
  - Anthropic 需要带上 `anthropic-dangerous-direct-browser-access`；
  - 基于 new-api / one-api 的中转默认放开所有源；
  - 其余不返回 CORS 的端点，经可自部署的 CORS 中继访问。
- 模型与上限：
  - 填好地址和 API Key 后，可以向服务获取模型列表。OpenAI 与 OpenAI 兼容接口用 `GET /models`，Anthropic 用 `GET /v1/models`，Gemini 用 `GET /models`。也可以直接填写模型 id。
  - 选中模型时，表单填入它的上下文窗口、单次输出上限，以及会不会思考、能不能看图。来源依次是：服务在列表里给出的值（OpenRouter、Gemini、Anthropic 给出上限），pi-ai 自带的模型资料，默认值（128K / 16K，会思考、能看图）。用了默认值时，提示作者按服务文档核对。所有值都可以修改，以作者填写的为准。
  - 中转服务用原厂的 id 提供别家的模型，模型的上限跟着模型走。所以查 pi-ai 资料时，先查端点自己的 provider，再查其余预设的 provider。
  - 调用时，如果 pi-ai 认识这个模型（provider、模型 id、API 都相同），就沿用 pi-ai 对它请求格式的描述，例如 DeepSeek 的推理格式和 `max_tokens` 字段；地址、上限和能力仍取作者的设置。
  - 推理强度：会思考的模型在输入框旁选择推理强度，按端点保存，没选过时为"中"。
    - 可选的档位由 pi-ai 按模型资料给出（`getSupportedThinkingLevels`），不支持的不列出；pi-ai 不认识的模型给出"关闭"到"高"。
    - 选"关闭"时不请求推理，pi-ai 在服务允许时显式关闭。没有"模型默认"：pi-ai 的单轮接口里，不请求推理就是关闭。
    - 换了模型、保存的档位不再受支持时，pi-ai 发送时就近取一档。
    - 不会思考的模型，pi-ai 不发送推理参数，输入框旁也不显示推理强度。用了默认值（会思考）而服务不接受推理参数时，请求报错，选"关闭"或在设置里取消"推理模型"即可。
  - 每个 provider 的资料单独分块，只在获取模型列表或调用模型时加载。
  - pi-ai 会随对话增长收紧单次输出上限，使它不超过“上下文窗口 − 已用 − 4096”。回复写满上限时 Run 失败（`agent.output_truncated`），失败信息带上输入与输出的 token 数，便于判断是上限太低还是对话太长。
- 图片：截图作为工具结果里的图片返回。OpenAI 兼容格式只接受 user 消息里的图片，pi-ai 在这类接口上把工具结果里的图片移到紧随其后的 user 消息里，Studio 不另做一套。
- History 原样保存 pi-ai 的 assistant 消息，各家签名都在里面，回放时原样交回。
  - 唯一的改写是为空或重复的工具调用 id，见下文。
  - 签名的编码属于 pi-ai 的内部格式，升级前用录制的 History 做回放测试。
  - 切换模型时，pi-ai 丢弃不能回放的推理；只有 provider、api、model 都相同才算同一模型。所以每个端点配置的 provider id 必须稳定。
- 沿用 TT 模型网关的经验，以下由 Studio 自己处理，pi-ai 不做：
  - 停止原因为 length 时不执行工具；
  - 模型调用了未声明的工具时，Run 失败；
  - 有的 OpenAI 兼容中转不返回调用 id，pi-ai 读作空串。同一条回复里为空或重复的 id，在记入 History 之前按出现顺序换成新 id，其余 id 保持原样。之后的执行、上下文、Transcript 与长结果文件都以同一条消息内 id 唯一为前提；
  - 没有收到结果的工具调用，在发出请求前按 TT 的文案改写，不交给 pi-ai 自带的兜底。
- 模型请求失败时，由 pi-ai 按 OpenAI 与 Anthropic SDK 的规则重试，最多 3 次，与 TT 应用内助手的默认次数相同：408、409、429、5xx 与网络错误重试，遵守服务要求的等待时间，要求等待超过 60 s 的直接失败。响应开始之后中断的不重试；重试不记入 Journal。测试连接不重试。
- 官方 SDK 会带 `x-stainless-*` 请求头。各端点的 CORS 预检逐个实测，不通过时用自定义 fetch 去掉这些头。

## 3. 工作区视图

| 根 | 权限 | 内容 |
|---|---|---|
| `project/` | 读写 | 项目文件与 `studio.json` |
| `skills/` | 只读 | 当前生效的 Skill |
| `knowledge/` | 只读 | 知识包语料 |
| `vendor/` | 只读 | 当前 vendor 的源码与解剖图 |
| `tool-results/` | 只读 | 较长工具结果的可读版本 |

文本写入以读取时记录的内容 SHA 做 CAS（比较后写入），与 TauriTavern Workspace 一致：
- 读状态、先读后改、只读过部分内容时对编辑的限制、`read_file` 的读取上限，都与 TT 相同；搜索、结果的写法与错误码按编码 Agent 的习惯，见 §4。
- CAS 检查与写入在同一个异步互斥区内完成，对应 TT 的写锁。
- 本地文件夹项目里，列目录和搜索时跳过 `.gitignore` 忽略的路径；按路径直接读取不受此限。

## 4. 工具

工具的稳定 ID 用点分组。发给模型时把点换成下划线，例如 `workspace_read_file`，与 TT 同一规则：OpenAI 与 Anthropic 的工具名都不允许点号。提示词、工具说明和报错里引用的，都是模型实际看到的名字，由 `modelToolName` 从 ID 得出；ID 只用于注册、Journal 和文档。`app.*` 的 ID 取自 app-use 导出的工具定义（`snapshotTool.name` 等），Studio 不另写一份；app-use 自带的说明与报错从 0.1.4 起也写别名。

| 组 | 工具 | 说明 |
|---|---|---|
| 工作区 | `workspace.list_files` `grep` `read_file` `write_file` `edit_file` | 读状态与 CAS 沿用 TauriTavern，搜索和结果按编码 Agent 的习惯，见下文。`edit_file` 是精确替换（`old_string` / `new_string` / `replace_all`），TT 中叫 `apply_patch`；Studio 不沿用这个名字，因为它是 GPT 系模型在 Codex 中训练的补丁格式的名字。所有工具的结果都套用同一个阈值，超过 100,000 字符的写入 `tool-results/`，模型收到开头 3,000 字符和读取它的方法。阈值高于 `read_file` 单次的最大输出（80,000 字符加行号），所以读回外置的结果不会再被外置；TT 只外置外部工具的结果，阈值为 50,000 |
| 预览 | `preview.configure` | 切换 Vendor、Device、Fixture |
| | `preview.reload` | 重载 View |
| | `preview.capture` | 截图。可选 set-of-marks：把最新快照页的 ref 框出并标号，标签是 ref 冒号后的部分。Studio 把标记画在图上，不往页面里插节点；框住整张图的（如快照根）不画。ref 由 app-use 的 `refs()` 列出，经 `resolve` 找到元素 |
| 页面 | `app.snapshot` `app.interact` `app.evaluate` `app.read_logs` | 来自 `@tauritavern/app-use`，引擎注入到预览页内运行，契约与 TauriTavern 应用内助手相同。`app.read_logs` 读取 Attach 收集的运行时记录，见 [Architecture §5](Architecture.md#5-编辑与预览) |
| 检查 | `inspect.styles` | 列出命中的规则和来源（vendor CSS / 主题 / 扩展 / 消息里的 `<style>`），经 Mount 映射到项目文件的行号 |
| | `inspect.audit` | 确定性检查：对比度、溢出与裁切、元素重叠、零尺寸 |

**面向模型的文字**（沿用 TT 的分工）：工具说明写用途、参数和边界，结果只报告事实，错误说明问题和已知的改法；提到别的工具，写它的调用名。同一个词在各工具里只有一个意思："preview" 只指实时预览，长文件分段读取不叫 preview。

**工作区工具**：TT 的 Agent 写长文本，结果报字数；Studio 的 Agent 写样式和代码，工具贴近编码 Agent 的习惯（Claude Code、Codex、Gemini CLI、opencode 的做法见 [Decisions](Decisions.md)）。
- `grep`：JavaScript 正则，逐行匹配，默认区分大小写。结果是 `路径:行号:内容`，上下文行写成 `路径-行号-内容`，不相连的段落之间是 `--`；另有只列文件（`files_with_matches`）和按文件计数（`count`）两种模式。默认给 100 条，最多 1,000，超出时说明还有更多、怎样缩小范围。超过 500 字符的行（压缩过的文件）只显示第一个匹配附近的一段。不是文本的文件跳过。
- `list_files` 与 `grep` 共用一种 glob，与 ripgrep 的 `--glob` 相同：不含 `/` 的匹配任意深度的文件名，含 `/` 的匹配 path 之下的路径。
- 根按工作区的顺序，`project/` 在前；根之下的路径逐段比较，目录的内容紧跟在目录之后。列目录与搜索结果都是这个顺序。
- 结果报告行，不报字数：读取写明行号范围与总行数，写入写明文件现有的行数，编辑写明每处替换在哪一行开始。
- 一行长到一次读不完时，只显示它的前 2,000 字符，并指向 `grep`。

能用确定性检查的地方不靠视觉判断。`inspect.audit` 给出数值；截图负责整体审美和布局上的直觉判断。

**元素寻址**：`preview.capture` 与 `inspect.*` 指定元素的方式与 `app.interact` 相同，都经 app-use 的 `resolve`：最新快照页里的 ref，或者只匹配一个可观察元素的选择器，可以用 `root` 限定范围。同一个元素在几个工具里是同一个名字，失败时的报错也相同。

**`inspect.styles` 的来源**：
- 规则从页面的 CSSOM 读取，层叠顺序按 CSS Cascade 5：重要性、style 属性、层、特异性、出现顺序。属性没有声明而可以继承时，指出提供它的祖先。值里用到的自定义属性一并解释。
- 样式表先对应到数据路径，再沿 Mount 对应到项目文件：
  - 主题的自定义 CSS 所在的 `<style>` 由解剖图给出（字段的 `element`），对应 `power_user.custom_css`；
  - `<link>` 按 URL 对应数据路径，例如扩展的 CSS；
  - 其余是 vendor 文件，写成 `vendor/src/` 下的路径。
- Mount 逐字放置文本，所以样式表里的行号就是项目文件的行号，带 `fence` 的加一行。CSSOM 不保留源码位置，行号靠按顺序比对规则的前缀（选择器或 at 规则）找出。
- ST 写在 `<html>` style 属性上的主题变量，经解剖图的 `cssVariables` 对应到主题字段，再对应到项目里的 `theme.json`。
- 消息里的 `<style>` 被 ST 改写过（选择器加 `.mes_text` 前缀，类名改为 `custom-*`），只标明所在的消息。
- 不涉及伪元素、`@container`、`@scope`、动画和浏览器默认样式。

## 5. 视觉

- **默认方式**：在 Chromium 桌面上使用 Element Capture，限定在 View 的 iframe 上，结果与浏览器渲染一致。
  - 共享标签页需要作者的一次点击，Agent 的工具调用发不起这个请求。所以第一次截图先用退回方式，Transcript 在这张截图下提示失真，并提供"开启精确截图"。
  - 开启后流一直保持，截图只是读取最新一帧。View 重载后换了 iframe，下一次截图时把流重新限定到新的 iframe 上。
  - 作者可以随时在浏览器的共享提示里停止，之后回到退回方式。
- **退回方式**：未开启、浏览器不支持、或预览此刻不在屏幕上（作者在看代码，或窄屏上在看 Agent）时，在预览页面内用 snapdom 截图。
  - snapdom 体积较大，单独构建为 `/_studio/capture.js`，第一次需要时才在页面的 realm 里加载，不进 Attach。
  - 它在 ST 上有已知失真：背景层缺失或变暗、`<q>` 引号重复、文本重新折行（见 [P0 报告 V7](plan/P0-Report.md#v7-截图方式)）。
- 两种方式都编码为 JPEG（质量 0.85），宽度超过 1280 像素时缩小。可以只截一个元素，寻址方式见 §4；元素在前端卡等页内 iframe 里时，按外层 iframe 的位置换算。
- 截图结果会标注所用方式，snapdom 的结果附上已知失真。只在模型能看图时提供 `preview.capture`。上下文中只保留最近 3 张图片。

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
- 工具结果进入 History 和模型上下文之前，其中已配置的 API Key 原文替换为 `[redacted]`。只处理文本，截图里出现的密钥替换不了。
- 卡片、扩展输出和导入内容一律视为不可信输入，在工具结果中标明来源。
