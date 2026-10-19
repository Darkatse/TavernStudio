# Agent

Studio 的大部分代码由 Agent 编写，Agent 体验是首要打磨对象。运行模型和命名沿用 [TauriTavern Agent](https://github.com/Darkatse/TauriTavern/blob/main/docs/Agent/README.md)，让两个项目共用一套心智模型。

## 1. 运行模型

| 概念 | 含义 |
|---|---|
| Run | 一次任务执行，从用户消息开始，到完成、失败或取消结束 |
| Round | 循环的一轮：发送上下文 → 模型回复 → 依次执行工具 → 进入下一轮 |
| Guidance | 运行中追加的指令，在下一轮模型请求前加入上下文 |
| Journal | Run 的事件日志。按顺序追加，不改写；较大的结果存为引用 |
| Checkpoint | Run 开始前项目文件的内容寻址快照，可以一键回滚 |

- 取消会结束当前 Run。已生效的文件修改保留，需要时经 Checkpoint 回滚。
- 页面刷新后，缺少终态证据的 Run 显示为 interrupted，不重放工具。
- 循环由我们自己实现，只有几百行。模型接入使用 AI SDK 7 Core 的 provider 包，不用它的 agent 抽象。

## 2. 模型接入

- 只做 BYOK，由浏览器直连模型服务。
- CORS 情况：
  - OpenAI、Gemini、OpenRouter、DeepSeek 等直接返回 CORS 头；
  - Anthropic 需要带上 `anthropic-dangerous-direct-browser-access`；
  - 基于 new-api / one-api 的中转默认放开所有源；
  - 其余不返回 CORS 的端点，经可自部署的 CORS 中继访问。
- 图片：OpenAI 兼容格式只接受 user 消息里的图片。因此截图工具只返回文字结果，图片另作为合成的 user 消息注入。

## 3. 工作区视图

| 根 | 权限 | 内容 |
|---|---|---|
| `project/` | 读写 | 项目文件与 `studio.json` |
| `skills/` | 只读 | 当前生效的 Skill |
| `knowledge/` | 只读 | 知识包语料 |
| `vendor/` | 只读 | 当前 vendor 的源码与解剖图 |
| `tool-results/` | 只读 | 较长工具结果的可读版本 |

文本写入以读取时记录的内容 SHA 做 CAS（比较后写入），与 TauriTavern Workspace 一致。

## 4. 工具

| 组 | 工具 | 说明 |
|---|---|---|
| 工作区 | `workspace.list_files` `search_files` `read_file` `write_file` `apply_patch` | 与 TauriTavern 同名，语义相同 |
| 预览 | `preview.configure` | 切换 Vendor、Device、Fixture |
| | `preview.reload` | 重载 View |
| | `preview.capture` | 截图。可选 set-of-marks 编号，编号与 `app.snapshot` 的 ref 对应，并附上关键的计算样式 |
| 页面 | `app.snapshot` `app.interact` `app.evaluate` `app.read_logs` | 来自 `@tauritavern/app-use`，引擎注入到预览页内运行，契约与 TauriTavern 应用内助手相同。`app.read_logs` 读取 Attach 收集的运行时记录，见 [Architecture §5](Architecture.md#5-编辑与预览) |
| 检查 | `inspect.styles` | 列出命中的规则和来源（vendor CSS / 主题 / 扩展 / 消息里的 `<style>`），经 Mount 映射到项目文件的行号 |
| | `inspect.audit` | 确定性检查：对比度、溢出与裁切、元素重叠、零尺寸 |

能用确定性检查的地方不靠视觉判断。`inspect.audit` 给出数值；截图负责整体审美和布局上的直觉判断。

## 5. 视觉

- **默认方式**：在预览文档内用 snapdom 截图，嵌套的同源 iframe 逐个截取后再合成。不需要用户授权。`backdrop-filter`、跨域图片和字体可能失真。
- **像素级方式**：在 Chromium 桌面上使用 Element Capture，每个 Session 授权一次。
- 截图结果会标注所用方式及其保真度。上下文中只保留最近若干张图片。

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
