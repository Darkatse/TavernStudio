# 架构

## 1. 目标与边界

Studio 让作者在真实前端里看到自己的产物，大部分编写工作交给 Agent。它按优先级解决三件事：

1. **在真实 vendor 上即时预览**：ST / TT × 桌面 / 移动 × 样板，改动后立即可见。
2. **作者产物是一等公民**：主题、扩展、酒馆助手脚本、前端卡、正则美化各自有项目模板、预览挂载和导出格式。
3. **能看能动手的 Agent**：改文件，看快照和截图，操作界面，查询与 vendor 版本对应的知识。

不做：真实 LLM 聊天（用 Replay 代替）、真机预览、中国大陆可达性。

## 2. 概念

预览由三项输入决定：

```
View = render(Vendor, Device, Snapshot)        Snapshot = Fixture ⊕ mount(Project)
```

vendor 留在浏览器里的状态不在其中，与真实部署一样随浏览器保留，见 [§7](#7-存储)。

| 概念 | 定义 |
|---|---|
| Vendor | 一个前端发行版本，如 `st@1.19.0`、`tt@2.3.0` |
| Vendor 镜像 | Vendor 的不可变静态文件，加上构建期注入的 Attach，见 [Vendors §1](Vendors.md#1-vendor-镜像) |
| Device | 视口尺寸与平台身份。ST 的身份来自 UA，TT 的来自 `__TAURITAVERN_HOST__` |
| Fixture（样板） | 一段数据目录：settings、角色、聊天、主题、世界书、扩展设置，以及 TT 的私有文件。可以附带 Replay |
| Replay（回放） | Fixture 附带的一组 assistant 回复，由生成端点按节奏流式回放 |
| Project | 作者的源文件，加上 `studio.json` |
| Mount | `studio.json` 里的一条声明：把项目文件映射到数据路径。路径后可以用 `#` 接 JSON Pointer，指向文件里的某个字段 |
| Snapshot | Fixture 与挂载后的 Project 合成的数据目录，内容寻址，不可变 |
| Session | Vendor + Snapshot + 会话写入。一个浏览器里同时只有一个 Session |
| 浏览器端状态 | vendor 及其中运行的代码写入源存储（localStorage、sessionStorage、IndexedDB）的状态。与真实部署一样属于浏览器，不属于 Session |
| View | Session 在某个 Device 上的一个 iframe。一个 Session 可以有多个 View |
| Session Backend | 在 Session 数据上实现 ST HTTP API 的 Studio 模块，两种 vendor 共用 |
| Attach | vendor 页面 `<head>` 里的第一个脚本，把页面交给 Studio 装配 |
| ST 接入 | Studio 装入 ST vendor 页面的 API 接入层，拦截 fetch / XHR / `$.ajax` 并交给 Session Backend |
| Web Host | TauriTavern 提供的浏览器宿主实现，是 TT vendor 的 API 接入层，见 [Vendors §3](Vendors.md#3-web-host-契约) |
| Preview SW | 预览使用的 Service Worker，负责映射 vendor 静态文件、提供数据子资源，不含业务逻辑 |

数据目录布局是 SillyTavern、TauriTavern 后端与 Studio 共同遵守的契约。TT 的私有文件沿用 TT 的布局：`default-user/tauritavern-settings.json` 与 `_tauritavern/`。Studio 不另定数据格式。

## 3. 不变式

1. **预览运行真实 vendor。** 不复刻 DOM，不写 TavernHelper 或宿主的桩。保真度来自真代码。
2. **项目文件是唯一事实来源。** 预览由 Snapshot 派生。预览中产生的写入属于 Session，只能沿 Mount 反向、经用户显式采纳后写回项目。
3. **预览与发布走同一条路。** 热应用只走宿主自己的公开入口，重载结果是权威。做不到热应用时，显式重载。
4. **Agent 只通过文件修改项目**，观察和操作预览也只用同一套工具。
5. **失败可见。** 未实现的端点返回 501，未实现的 TT 命令以 `Unsupported` 拒绝，不返回猜测值。
6. **一个浏览器一个 Session，一次一个 Vendor。** 桌面和移动 View 可以并排；ST 与 TT 只能切换，不能并排。
7. **知识与 vendor 版本对应。** 能从源码生成的知识不手写。

## 4. 运行时

Studio 与预览同源。生态的信任模型本来就把扩展、脚本和卡片视为用户授权的代码，Studio 沿用这一模型。同源让 Studio 能直接操作预览文档，不需要跨窗口协议。由此带来的唯一安全差异见 §9。

```
同一源
├─ 顶层 /：Studio（资源位于 /_studio/）── 工作区、Agent、Session Backend、密钥
│   └─ <iframe src="/">  Preview SW 按 destination=iframe 返回 vendor 的 index.html
│        Attach：在 vendor 脚本之前装入 Device 环境、错误与 console 捕获、API 接入、app-use 引擎
│          ST：ST 接入（页内，含子 iframe）→ Session Backend
│          TT：TT host kernel → Web Host → Session Backend
└─ Preview SW
     ① vendor 静态文件：根路径 → /__vendor/<id>/
     ② 数据子资源：/characters /thumbnail /backgrounds /User Avatars /assets /user
        /css/user.css /scripts/extensions/third-party/*  ← Cache Storage（由 Studio 写入）
```

| 请求 | 处理者 |
|---|---|
| `/api/*`、`/csrf-token`、`/version` | 页内 API 接入 → Session Backend |
| vendor 静态文件 | Preview SW → `/__vendor/<id>/` |
| 数据子资源 | Preview SW → Cache Storage |
| 未被页内接入接管的上下文发出的 `/api/*` | Preview SW 返回 501，附诊断信息 |

两种 vendor 结构相同：页内一层处理 API，SW 一层提供子资源，与 TauriTavern 自身"拦截器 + 协议层"的划分一致。API 放在页内处理，是因为 Chromium 和 WebKit 的 SW 不拦截同步 XHR，而页内接入可以同步读取 Session 数据。

数据子资源的响应以内容哈希作为 ETag。TT 复用背景缩略图前会用 HEAD 校验 ETag，响应缺少 ETag 时直接报错；作者替换同名背景后，缩略图也借此失效。

**启动顺序**：
1. 注册 SW，等待它接管页面；
2. 本浏览器上次运行的是另一个 vendor 镜像时，清理浏览器端状态（见 §7）；
3. 把 Snapshot 的子资源写入 Cache Storage；
4. 创建 iframe，SW 返回带 Attach 的 vendor `index.html`；
5. Attach 在 vendor 脚本运行前完成装配；
6. vendor 正常启动。

**静态托管**：只有 `/` 返回 Studio 外壳。vendor 路径和数据路径未命中时返回真正的 404，不做 SPA 回退。

**Session 归属**：同一浏览器里打开第二个 Studio 标签页时，新标签页接管 Session，旧标签页会收到通知。

**顶层窗口**：ST 与扩展默认自己就是顶层页面，Attach 因此把 `window.parent` 指回页面自身。`window.top` 不可重定义，在 vendor 页面及其下各层 iframe 中都指向 Studio。P0 抽样的生态代码都不受影响：LittleWhiteBox 会把 `XBTasks` 写到 Studio 的 window 上，但它自己不读取（[P0 报告 V9](plan/P0-Report.md#v9-windowtop)）。直接读取 `top.document`、`top.SillyTavern` 的作者代码会出错，诊断会记录这些错误。

## 5. 编辑与预览

数据单向流动：项目文件 → Snapshot → Session → View。

| 产物 | 热应用路径 |
|---|---|
| 主题 | 驱动 ST 自己的主题控件：写入 `#customCSS` 并派发 `input`，设置取色器并派发 `change`。控件 id 取自 Vendor 解剖图 |
| 扩展 CSS | 更新 Cache Storage，重新挂载 `<link id="<name>-css">` |
| 扩展 JS | 重载 View（ESM 无法卸载） |
| 前端卡 / 正则美化 | 更新 Session 数据，调用 `getCharacters()` 和 `reloadCurrentChat()` |
| 酒馆助手脚本 | TavernHelper 的公开 API，如 `replaceScriptTrees` |

- **重载是权威。** 热应用只是优化，结果必须与重载一致。
- **会话写入**进入 Session，例如 ST 保存设置、作者在 ST 界面里保存主题、脚本写变量。落在 Mount 覆盖路径上的写入以差异形式呈现给用户；用户采纳后，沿 Mount 反向写回项目文件。
- **变量面板**通过页内真实的 TavernHelper / MVU API 修改变量，卡片收到的事件与生产环境相同。
- **Replay 推动叙事状态**：用户发送消息后，生成端点回放下一条预设回复。用于测试流式楼层、MVU 变量更新和 `AI_OUTPUT` 正则。
- **诊断来自运行时。** Attach 在预览页和子 iframe 中收集 `error`、`unhandledrejection` 与 `console.error`，经 Mount 映射回项目文件和行号。编辑器的 lint 标记与 Agent 的 `app.read_logs` 读取同一份记录。独立文件的行列号准确。JSR 脚本和前端卡的内联脚本报告的是 srcdoc 文档内的行号，与作者源码之间差一个固定偏移，即 JSR 拼接在前面的内容；Studio 从 iframe 的 srcdoc 中找到作者代码的起点，换算回源码行号。

## 6. 项目

```json
{
  "fixture": "showcase",
  "mounts": [
    { "from": "theme.json", "to": "themes/Bamboo.json" },
    { "from": "theme.css",  "to": "themes/Bamboo.json#/custom_css" }
  ]
}
```

- **Mount 是唯一的放置机制。** 主题、前端卡等只是起始模板，由初始文件、Mount、推荐样板和对应 Skill 组成。运行时不认项目类型。
- **导出**沿 Mount 组装产物：主题 JSON、`user.css`、角色卡 PNG、扩展 zip、酒馆助手 Script.json、正则 JSON、世界书 JSON。
- **内容逐字挂载**，所以检查器命中的规则能映射回 `theme.css` 的行号。
- **构建分三档：**
  - 无构建：主题、单文件前端卡、纯 JS 脚本。
  - 本地文件夹模式：用 File System Access 打开作者的模板仓库，由作者自己的 webpack watch 负责构建，Studio 挂载 `dist/`。
  - 浏览器内构建（P2）：esbuild-wasm 加 Vue SFC / Tailwind 插件。

  不做跨源隔离。遇到不支持的构建特性时明确报错。

## 7. 存储

**Studio 自有存储**

| 数据 | 位置 |
|---|---|
| 项目文件 | OPFS |
| 项目元数据、Journal、Checkpoint、偏好 | IndexedDB（Dexie，一个库） |
| Session 子资源 | Cache Storage |
| vendor 镜像与知识包缓存 | Cache Storage |
| 密钥 | 默认只在内存中；用户勾选后持久化到 IndexedDB |

- Cache 名统一带 Studio 前缀。
- Studio 不使用 localStorage 和 sessionStorage：vendor 与项目代码同源，随时可能调用 `localStorage.clear()`。
- 启动时调用 `navigator.storage.persist()`，并提供项目导出作为备份手段。

**浏览器端状态**

以 vendor 的后端契约为界。经 ST HTTP API 读写的数据和 TT 的私有文件属于 Session。vendor 及其中的扩展、酒馆助手、前端卡和作者脚本留在浏览器里的状态属于浏览器，例如 `language`、输入框草稿、`SillyTavern_*` 缓存库、酒馆助手的面板位置。这与真实部署和 PureTavern 的做法一致：
- 不进入 Fixture 和 Snapshot。重载时保留，Session 重置也不清理。
- 状态格式由 vendor 代码定义，因此跟随 Vendor 镜像：本浏览器换用另一个镜像时，加载前先清理。例如 ST 1.19.0 把背景缩略图缓存存成裸 Blob，TT 存成对象，ST 读到 TT 写下的记录会抛错。切换 Device 和并排显示不清理，因为运行的是同一份代码。
- 作者可以手动清理，例如给前端卡清档。真实 ST 中清除站点数据即可，Studio 中那样做会连同项目一起删除。
- 清理范围是源上除 Studio 自有存储外的全部。清理前先卸载所有 View，因为有打开的连接时，删除数据库会被阻塞。app-use 的快照计数键属于 Agent，予以保留。

## 8. 技术栈与仓库

- 工具链：Rsbuild 2、Rstest、strict TypeScript 7，均用最新版。lint 用 oxlint：开启 type-aware（基于 TS 7）、React Compiler 规则与 jsx-a11y。格式用 Prettier，Tailwind 类名自动排序。
- 外壳：React 19 + React Compiler。Compiler 经 Rsbuild 内置 SWC 的 `reactCompiler` 开启，不经过 Babel，与 TT 相同。界面层为 Tailwind v4 + shadcn（Base UI），组件、视觉与动效规则见 [UI](UI.md)。
- 编辑器：CodeMirror 6，只用它自带的 JS / CSS / HTML 语言支持。补全与悬停读取解剖图里的 API 索引，诊断来自运行时（§5）。浏览器里不运行 TypeScript。
- 编辑器缓冲区放在 CodeMirror 的 `EditorState` 里，不进 React state。重计算放到 worker。
- 数据：Dexie，界面经 `liveQuery` 订阅。

**框架边界**：只有 `apps/studio` 的外壳使用 React。
- 进入 vendor 页面的代码不用框架，包括 Attach 和它打包的 ST 接入、诊断收集与 app-use 引擎；Preview SW 也不用。这与 TT 的划分相同：完整的状态型界面用 React root，接入上游 DOM 的部分用原生代码。
- `packages/*` 不依赖框架，可以在没有 DOM 的环境中测试。
- 外壳只有一个工作区页面，不用路由。不用全局状态库：以局部 state 为主，需要时经 `useSyncExternalStore` 接外部 store，与 TT 相同。

```
apps/studio           Studio 应用
apps/edge             可选：LLM CORS 中继、截图用的跨域图片代理（Cloudflare Worker）
packages/preview      Preview SW、Attach、ST 接入
packages/backend      Session Backend 与 Replay
packages/agent        Run 循环、工具、Journal、模型接入
packages/workspace    OPFS 文件、Mount、Snapshot、Checkpoint
packages/st-data      角色卡 PNG、聊天 JSONL、主题格式
vendors/              ST 镜像构建脚本、TT 镜像装配脚本
fixtures/             样板
skills/               维护者编写的 Skill
knowledge/            知识包的来源登记与流水线
```

目录在第一项用到它的工作开工时建立，不预建空包。`@tauritavern/app-use` 由 TauriTavern 发布，Studio 按版本依赖。

## 9. 部署与安全

- **部署**：Cloudflare Workers Static Assets，单一源。用 `workers.dev` 即可起步，自有域名可选。全站纯静态，也可以自托管。
- **可选边缘函数只有两个：**
  - LLM CORS 中继：白名单放行，不记录日志，用户可自行部署。
  - 截图用的跨域图片代理：只在截图路径中使用，限制资源类型和大小。
- **安全**：同源意味着扩展、卡片和 Agent 写的代码能读到 Studio 的全部数据。与 ST / TT 相比，唯一新增的风险是**密钥原文可读**：ST / TT 的密钥放在后端，读取接口只返回打码值。对策：
  - 密钥默认不持久化；
  - 工具结果管线对已配置的密钥做脱敏；
  - 建议用户使用限额 key。
