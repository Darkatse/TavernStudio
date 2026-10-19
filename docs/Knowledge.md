# 知识与记忆

Agent 依据的知识按可靠性排序：与 vendor 版本对应的生成物 > 维护者编写的 Skill > 上游文档。所有知识都是文件，挂在工作区的只读根下，用工作区工具读取。

## 1. 内容

| 类别 | 来源 | 挂载位置 |
|---|---|---|
| Vendor 解剖图 | 从 vendor 镜像生成 | `vendor/anatomy/` |
| Vendor 源码 | vendor 镜像 | `vendor/src/` |
| Skill | 维护者编写，`SKILL.md` 格式 | `skills/` |
| 知识包 | 上游文档与类型定义，由 CI 打包 | `knowledge/` |

**Vendor 解剖图**按版本从镜像源码生成（`vendors/lib/anatomy.mjs`），是结构化条目，包括：
- `theme.json`：`getThemeObject` 的每个主题字段，以及：
  - 设置它的控件：选择器、写法、要派发的事件，以及处理器等到松手才应用的 `commit` 事件；
  - 中文标签与说明，取自 i18n 的 `zh-cn.json`；
  - 它驱动的 CSS 变量和 class。
  
  `control: null` 表示热应用没有入口，需要重载。
- `css-variables.json`：核心样式表 `:root` 中的变量与默认值，经 `fields` 交叉引用到主题字段；
- `landmarks.json`：
  - DOM 地标：从 body 出发沿 id 链可达的区域，以及 vendor 克隆用的模板；
  - 由 `power_user` 切换的 class（按元素）；
- `eventSource` 事件、`getContext()` 的键；TT 镜像另含 `window.__TAURITAVERN__` ABI；
- 已安装 JSR 版本的 `@types`；
- API 索引：由上述类型定义与 `getContext()` 生成的名称、签名和文档，供编辑器补全与悬停使用。Agent 直接读取原始 `.d.ts`。

同一份生成物也是 vendor 升级时的契约基线：新旧两版解剖图的差异就是这次升级的影响面，见 [Vendors §5](Vendors.md#5-升级)。

**Skill**：
- 格式与 TauriTavern Skill、Claude Code、StageDog 模板相同，都是 `SKILL.md`。
- 首批：`st-theme`、`st-extension`、`jsr-frontend-card`、`jsr-script`、`mvu-statusbar`、`tt-compat`。
- 同一份 Skill 也能装进作者本地的编码 Agent，或 TauriTavern 的应用内助手。所以 Skill 里不写工具名，只写要做什么、读哪个路径，例如"读取 `vendor/anatomy/` 中的 CSS 变量表"：在这几个地方，工具的名字各不相同。
- Skill 由 Studio 自己编写。StageDog 模板的 Skill 只作为知识包收录，不改写进 Studio 的 Skill。

**知识包**收录以下内容：
- ST 文档（`llms.txt` 与各页 `.md`）；
- JSR 文档与 CHANGELOG；
- MVU 文档；
- 角色卡规范；
- TauriTavern 扩展 API 文档。

## 2. 检索

- Agent 用 `workspace.search_files` 和 `read_file` 检索挂载内容。
- 精确符号（变量名、选择器、API）直接命中解剖图里的结构化条目。
- P2 阶段视评估结果引入 BM25（Orama + `Intl.Segmenter`），处理中文的自然语言提问。
- 在评估证明有必要之前，不引入 embedding 和向量库。

## 3. 更新

- GitHub Actions 定时在固定 ref 上拉取各来源，产出分片知识包和清单。清单逐文件记录：来源仓库、ref、路径、SHA、许可、分发策略。
- 知识包作为静态文件发布。客户端只下载有变化的分片，缓存在 Cache Storage 中。
- 每个项目记录所用的知识包版本和 vendor 版本，保证结果可复现。

## 4. 许可

| 许可 | 来源 | 策略 |
|---|---|---|
| AGPL-3.0 | ST、ST 文档、TauriTavern、ST-Prompt-Template | 原文收录，附出处与许可 |
| PolyForm Noncommercial 1.0.0 | JSR 代码、类型与文档；StageDog 模板与 Skill | Studio 永久非商业，可以收录：原文放进 `knowledge/`，附许可原文与出处（有 Required Notice 的一并保留），并告知作者。不改写进 Studio 的 Skill 或代码 |
| MIT | MVU、角色卡 V3 规范 | 收录 |
| 无许可 | 角色卡 V2 规范、部分教程站 | 只放链接与摘要 |

## 5. 记忆

- **项目记忆**：`project/AGENTS.md`，随项目一起版本化和导出。
- **用户记忆**：Studio 里的一个偏好文件。
- Agent 修改记忆时以 diff 的形式提出，由用户确认。不存在用户看不到的记忆。
