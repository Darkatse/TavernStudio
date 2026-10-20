# 知识与记忆

Agent 依据的知识按可靠性排序：与 vendor 版本对应的生成物 > 维护者编写的 Skill > 上游文档。所有知识都是文件，挂在工作区的只读根下，用工作区工具读取。

## 1. 内容

| 类别 | 来源 | 挂载位置 |
|---|---|---|
| Vendor 解剖图 | 从 vendor 镜像生成 | `vendor/anatomy/` |
| Vendor 源码 | vendor 镜像 | `vendor/src/` |
| Skill | 维护者编写，`SKILL.md` 格式 | `skills/` |
| 知识包 | 上游文档与类型定义，由脚本生成，随 Studio 发布 | `knowledge/` |

**Vendor 解剖图**按版本从镜像源码生成（`vendors/lib/anatomy.mjs`），是结构化条目，包括：
- `theme.json`：`getThemeObject` 的每个主题字段，以及：
  - 设置它的控件：选择器、写法、要派发的事件，以及处理器等到松手才应用的 `commit` 事件；
  - 中文标签与说明，取自 i18n 的 `zh-cn.json`；
  - 它驱动的 CSS 变量和 class；
  - 它的值成为哪个元素的内容（`element`），例如 `custom_css` 成为 `#custom-style` 的文本。`inspect.styles` 靠它把这个 `<style>` 里的规则对应回项目文件。
  
  `control: null` 表示热应用没有入口，需要重载。
- `css-variables.json`：核心样式表 `:root` 中的变量与默认值，经 `fields` 交叉引用到主题字段；
- `landmarks.json`：
  - DOM 地标：从 body 出发沿 id 链可达的区域，以及 vendor 克隆用的模板；
  - 由 `power_user` 切换的 class（按元素）；
- `eventSource` 事件、`getContext()` 的键；TT 镜像另含 `window.__TAURITAVERN__` ABI；
- API 索引：由镜像里的类型定义与 `getContext()` 生成的名称、签名和文档，供编辑器补全与悬停使用。Agent 直接读取原始 `.d.ts`。

解剖图只由镜像生成。JSR 不在镜像里，它的 `@types` 放在知识包的 `knowledge/jsr/`。

同一份生成物也是 vendor 升级时的契约基线：新旧两版解剖图的差异就是这次升级的影响面，见 [Vendors §5](Vendors.md#5-升级)。

**Skill**：
- 格式与 TauriTavern Skill、Claude Code、StageDog 模板相同，都是 `SKILL.md`。
- 首批：`st-theme`、`st-extension`、`jsr-frontend-card`、`jsr-script`、`mvu-statusbar`、`tt-compat`。
- 同一份 Skill 也能装进作者本地的编码 Agent，或 TauriTavern 的应用内助手。所以 Skill 里不写工具名，只写要做什么、读哪个路径，例如"读取 `vendor/anatomy/` 中的 CSS 变量表"：在这几个地方，工具的名字各不相同。
- Skill 由 Studio 自己编写。StageDog 模板的 Skill 只作为知识包收录，不改写进 Studio 的 Skill。

**知识包**每个来源一个目录，来源在 `knowledge/sources.mjs` 中登记：

| 目录 | 内容 |
|---|---|
| `st-docs/` | SillyTavern-Docs 仓库在固定提交上的 Markdown 原文。不用 `llms.txt`：它不能固定版本，路由也与仓库路径对不上 |
| `jsr/` | JSR 的 `@types`、`global.d.ts`、CHANGELOG 与 README，版本与 Studio 安装的相同 |
| `jsr-docs/` | JSR 文档站的 Markdown。更新日志页是 CHANGELOG 的副本，不重复收录 |
| `mvu/` | MVU 的 README、CHANGELOG 与 `doc/` 下的教程。它们讲的是较早的写法；基于 zod 的写法在 PolyForm 许可的来源里 |
| `ccv3/` | 角色卡 V3 规范 |
| `ccv2/` | 角色卡 V2 规范的摘要与链接。V2 没有许可，摘要由 Studio 撰写；V3 逐个收录了 V2 的字段 |
| `tt/` | TauriTavern 的 `docs/API/` 与两份契约文档（FrontendHostContract、ThirdPartyExtensions），与 TT 镜像同一个提交。`src/types.d.ts` 已在 `vendor/src/` 里 |
| `stagedog-template/` | StageDog 模板的 Skill、AGENTS.md、README 与模板、示例中的文本文件 |

## 2. 检索

- Agent 用 `workspace.search_files` 和 `read_file` 检索挂载内容。
- 精确符号（变量名、选择器、API）直接命中解剖图里的结构化条目。
- P2 阶段视评估结果引入 BM25（Orama + `Intl.Segmenter`），处理中文的自然语言提问。
- 在评估证明有必要之前，不引入 embedding 和向量库。

## 3. 更新

P1 由脚本生成，随 Studio 发布：
- `pnpm knowledge [<id>...] --tt-checkout <TT 仓库>` 运行 `knowledge/build.mjs`，按 `sources.mjs` 中固定的提交取各来源。每个来源产出一个分片 `knowledge/out/<id>/`。
- 文件从 jsDelivr 下载，逐个核对其文件列表里的 SHA-256，缓存在 `knowledge/.work/`。TT 文档从本地 TT 仓库读取，提交取自 `vendors/tt/release.json` 固定的版本。
- 只收文本：不是 UTF-8 的文件让生成停下，需要在 `sources.mjs` 里排除。
- 生成器核对 LICENSE 与声明的许可：有标题的许可看标题，MIT 没有标题，看授权条款的开头。不符时停下，报出来源与 LICENSE 的开头。
- 分片整体替换：先写进临时目录，再换上；内容没变时不动。Windows 上，运行中的 dev server 占着它发布的子目录，带子目录的分片就换不上：生成器报错，原分片保持不变，停下 dev server 后再生成。
- 逐文件记录：分片根目录的 `source.json` 记来源仓库、ref、版本名、许可（及其依据）、署名与分发策略，分片里的文件共用它；发布时生成的 `index.json` 记每个文件的大小与 SHA-256。上游的 LICENSE 原文放在分片根目录。
- Studio 把 `knowledge/out/` 发布在 `/_studio/knowledge/`。没有生成时，Studio 照常构建（CI 的构建就是这样，与 vendor 镜像相同），Agent 读 `knowledge/` 时得到错误，说明怎样生成。

之后：
- P2：GitHub Actions 定时更新。客户端只下载有变化的分片，缓存在 Cache Storage 中。
- 每个项目记录所用的知识包版本和 vendor 版本，保证结果可复现。

## 4. 许可

| 许可 | 来源 | 策略 |
|---|---|---|
| AGPL-3.0 | ST、ST 文档、TauriTavern、ST-Prompt-Template | 原文收录，附出处与许可 |
| PolyForm Noncommercial 1.0.0 | JSR 代码、类型与文档；StageDog 模板与 Skill | 原文收录，附许可原文与出处（有 Required Notice 的一并保留） |
| MIT | MVU、角色卡 V3 规范 | 原文收录，附许可原文 |
| 无许可 | 角色卡 V2 规范、部分教程站 | 只放链接与摘要，摘要由 Studio 撰写 |

`source.json` 的 `policy` 记分发策略：原文收录为 `verbatim`，只放链接与摘要为 `link`。

PolyForm Noncommercial：
- Studio 永久非商业，可以收录。
- JSR 与 StageDog 模板都在 2026-09 改用 PolyForm，JSR 此前是 AFPL。生成器核对 LICENSE，所以拒绝改换许可之前的提交。JSR 文档站没有 LICENSE，页脚写明 PolyForm 并链接到 JSR 的 LICENSE；生成器核对这行页脚，分片里放 JSR 的许可原文，`source.json` 记下依据。
- PolyForm 允许非商业的修改。不把这些内容改写进 Studio 的 Skill 或代码，是 Studio 自己的取舍：Studio 以 AGPL-3.0 发布，任何人都可以按 AGPL 使用它，包括商用；混入 PolyForm 的内容就做不到这一点。
- 告知作者由维护者负责。

## 5. 记忆

- **项目记忆**：`project/AGENTS.md`，随项目一起版本化和导出。
- **用户记忆**：Studio 里的一个偏好文件。
- Agent 修改记忆时以 diff 的形式提出，由用户确认。不存在用户看不到的记忆。
