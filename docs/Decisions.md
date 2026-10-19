# 关键取舍

每条记录一个已经做出的决定，以及它的理由和被放弃的方案。理由里写明参考过哪些已有实现（见 [References](References.md)）。新事实推翻旧判断时，同时修改这里和相关文档。

| 决定 | 理由 | 放弃的方案 |
|---|---|---|
| 预览运行真实 vendor | 选择器能否命中，取决于 ST 的消息管线：类名会被改写为 `custom-*`，消息里的 `<style>` 会被限定作用域，正则按 placement 生效。JSR 在运行时静态导入几十个 ST 模块。TT 的差异由 JS 运行产生，例如 `data-tt-frontend-source-handoff` 属性是运行时才设置的 | 手写 DOM 加 TavernHelper 桩的仿生沙盒。它会成为一个持续漂移的第二事实来源。PureTavern 做过禁用脚本的静态预览，因控件失效已经放弃 |
| Studio 与预览同源 | 生态的信任模型本就把扩展视为用户授权的代码。同源让 Studio 能直接操作预览文档，同步 XHR 也能在页内应答 | 独立源：需要跨窗口协议，要传输 Snapshot 并维护副本，要部署多个子域，换来的只有密钥隔离 |
| API 在页内接入，SW 只负责子资源 | Chromium 和 WebKit 的 SW 不拦截同步 XHR。这种划分也与 TauriTavern"拦截器 + 协议层"的结构一致 | `/api/*` 全部交给 SW |
| 热应用只走宿主的公开入口，重载结果为准 | 保证预览走的路径就是发布后的路径 | 注入 Studio 私有的 `<style>`：层叠位置与真实环境不同，而且事实来源变成了被注入的样式 |
| Mount 是唯一的放置机制，项目类型只是模板 | 一个机制同时负责预览放置、导出组装和会话写入的采纳 | 按项目类型分别实现预览和导出 |
| Mount 指向 vendor 启动时读取的生效态；JSON 按 Merge Patch 合并；项目只拥有它写出的键 | ST 启动时只从 `settings.json` 读取外观，主题文件只在下拉框选中时由 `applyTheme` 复制进 `power_user`。挂到主题文件，重载就看不到主题。Merge Patch 是标准语义。所有权让采纳只比较项目写出的键，ST 每次启动整份重写 `settings.json` 产生的回声也就不会显示为差异 | 挂到 `themes/<名>.json`，启动后再驱动下拉框选中：重载结果要依赖一段界面操作。在 Snapshot 里重做 `applyTheme`：Studio 复刻 vendor 逻辑。为每个字段写一条 Mount：要写几十条声明 |
| Mount 的 `fence` 把文本包成 Markdown 代码块 | 酒馆助手只把含 HTML 的代码块渲染成前端卡，生态里的前端代码都以代码块的形式出现在消息文本里。这样预览与发布形态一致，无构建和本地文件夹两档也走同一条路 | tavern_helper_template"实时修改"的 `$('body').load(url)` 加载器：预览与发布形态不同，脚本的执行方式也变了。把 HTML 写成 `.md` 文件：编辑器失去 HTML 语言支持，构建产物也没法这样写 |
| Session 以内存为准，写入覆盖层在后台存进 IndexedDB，失败可见；第二个标签页经 BroadcastChannel 请求，由 Web Lock 交接 | 卡片作者用 Replay 推进到深处的状态，不应因刷新而丢失。PureTavern 写入失败后仍回报成功，属于静默降级，Studio 不这样做。标签页崩溃时 Web Lock 会自动释放；正常交接前，旧标签页要卸载 View、写完持久化，所以还需要一个请求通道 | 不持久化：刷新即丢失状态。只用 Web Lock 的 `steal`：旧标签页来不及保存 TT 退出时的写入和持久化队列。PureTavern 的做法：不处理多标签页，后写的覆盖先写的 |
| TT vendor 经 TauriTavern 自己的 Web Host 运行 | Rust 命令名属于 TT 的 Internal 契约，对它的模拟只能由 TT 维护 | 由 Studio 模拟 TT 命令；或者只加载 TT 的 CSS 再注入平台身份 |
| Web Host 只覆盖 Studio 的三条路径：启动到聊天、会话写入、Replay 生成 | Studio 不做真实聊天，也不需要同步、agent、MCP、导出等能力。命令清单按这三条路径实测得出，范围外的命令以 `Unsupported` 拒绝，维护面最小 | 在浏览器里完整模拟 TT 的 IPC：大部分命令没有消费者，却要随 TT 的每次改动同步维护 |
| Web Host 的 ST 数据走 ST HTTP API | 这是现成的公开契约。Session Backend 只需实现一次，两种 vendor 共用 | 为 ST 数据另定一套端口 |
| Web Host 按命令契约保存 TT 设置，不复刻原生磁盘布局 | Web Host 必须实现的是 `get/update_tauritavern_settings` 的 DTO。它把 DTO 作为一份不透明文档经 `store` 存于 Session，重载不丢失；默认值由 Rust 生成。原生布局是 Rust 仓储的内部实现：TT 设置分成 `tauritavern-settings.json` 与 `settings/dynamic-theme.json` 两份文件，ST 设置也分段存放，并带有旧布局的迁移。导出走 Studio 自己的 UI，样板也不携带 TT 设置，原生布局在 Studio 一侧没有消费者 | 沿用 TT 的数据目录布局：要在 JS 里重写磁盘布局、迁移和 DTO 映射，TT 的内部存储也会变成跨仓库契约，原生每次存储重构都得同步。此前的理由"样板能直接取自真实 TT 数据目录"不成立，TT 的布局本来就不同于 ST。由 Web Host 在内存中维护：重载即丢失，违反"重载为准"，还会与 localStorage 里的设置镜像（如 `tt:panelRuntimeProfile`）不一致 |
| Web Host 只模拟真实平台的身份 | 新增 `web` 平台会让每个平台分支和守卫多出一项，而且并不存在"web 版 TT"这个产品 | 新增 `web` 平台 |
| TT 前端总是运行在宿主之上，原生全局只经 `tauri-bridge.js` 读取 | 宿主边界只剩一个接缝，Web Host 要模拟的也只有这一处。"是否在 TauriTavern 中"由仓库决定，不是运行时才知道的事实 | 各模块各自读取 `window.__TAURI__`；保留以 `__TAURI_RUNNING__` / `isTauri()` 区分 TT 与上游行为的双分支，这会带来静默降级，并让上游修改被合并进死分支 |
| app-use 引擎运行在被观察页面的 realm 里 | 引擎只保留一种运行模型，`#chat` 滚动和 `app.evaluate` 自然就是对的 | 在父窗口里观察子窗口：会在父 realm 里再加载一份 ST 运行时 |
| app-use 引擎随 Attach 打包 | 页面一连接，引擎就在它的 realm 里可用，重载后自然重建，不需要另外管理注入的时机。代价是 Attach 增加约 12 kB（gzip），启动时间不变（P0 V6） | 首次使用时再注入单独的包：要处理注入时机、加载失败和每次重载后的重新注入，换来的只是少加载这 12 kB |
| Agent 截图默认用 Element Capture，snapdom 只作退回 | P0 V7 实测：Element Capture 与浏览器截图一致，含模糊面板与 JSR 卡片，授权后每帧约 1 ms。snapdom 在 ST 上会丢失或压暗背景层、重复 `<q>` 的引号、让文本重新折行，换选项也不变，每次 0.6–1.1 s。主题是 Studio 的主要产物，背景与排版失真会直接误导 Agent | snapdom 作默认、Element Capture 作像素级选项：省去一次授权，代价是默认截图在最常见的场景里失真 |
| Agent 循环自己写，模型接入用 AI SDK Core | 自己掌握 Run / Round / Journal 的语义，并与 TT 保持一致 | libfx：需要 JSPI，BYOK 只支持 OpenAI 兼容格式，WASM 下工具串行执行，版本仍是 0.0.x。AI SDK 的 agent 抽象：大版本之间频繁改名 |
| 工具的稳定 ID 用点分组，发给模型时把点换成下划线；编辑工具叫 `edit_file` | OpenAI 与 Anthropic 的工具名都不允许点号，TT 也是这样换算的。`apply_patch` 是 GPT 系模型在 Codex 中训练的 V4A 补丁格式的名字，拿它命名精确替换工具会误导模型。各家 harness 的工具名本来就不统一，真正一致的是参数形状 | 不加前缀的 `ls`、`grep`、`read`：会唤起 shell 参数和正则方言的先验，实际参数却是 JSON；纯文本搜索收到 `a\|b` 这类正则时会静默返回空结果。沿用 TT 的 `apply_patch` |
| Checkpoint 在 Run 首次写某个文件之前保存它原来的内容；内容去重、压缩，总量有上限 | 回滚只需要 Run 实际改动过的文件，保存时复用 CAS 已经读到的内容。TT 没有文件快照可以借用 | Run 开始前给整个项目做快照：本地文件夹里有 `node_modules` 等大量无关文件 |
| 知识以文件为主，配合 agentic 检索 | 精确、可离线、可审计，并与 vendor 版本对应 | 浏览器内的 embedding 模型；Vectorize / AI Search |
| 不做跨源隔离 | COOP/COEP 会阻止前端卡加载第三方资源 | WebContainers、@rolldown/browser |
| 外壳用 React 19；进入 vendor 页面的代码与 `packages/*` 不用框架 | 界面是 IDE 级，需要成熟的组件与无障碍原语。热路径（编辑器、预览、截图）都不经过 React，框架成本落不到性能上。框架与编译方式和 TT 自有界面相同，Transcript 等将来可以共享。shadcn（Base UI）在 React 上最成熟，Agent 写 React 的质量也最稳定 | 手搓：自有代码成倍增加，最容易出错的无障碍原语也要自己写。Vue 3：生态作者常用，但那是预览里的事，而且外壳会与 TT 不一致。Solid / Svelte 5：细粒度更新的优势落不到热路径上。Preact：只省几十 KB，React 19 特性与 Base UI 都要走兼容层 |
| Agent 在左，工作台（预览 / 代码）在右 | Agent 是主要的编写者，作者主要看结果；v0、Lovable 采用同样的布局。预览与代码用标签切换，两个面板都保持挂载 | 编辑器居中的 IDE 布局：把作者很少直接写的代码放在了主位 |
| lint 用 oxlint，不用 ESLint | oxlint 原生覆盖 TypeScript、React Compiler 规则与 jsx-a11y，type-aware 检查直接基于 TS 7 | ESLint 9 已停止支持；eslint-plugin-jsx-a11y 不支持 ESLint 10；typescript-eslint 需要 TS 6 的 API，要另装一份 TS |
| 动效默认用 CSS，不引入 Motion | Base UI 原生支持由 CSS 过渡驱动的进入、退出与中途取消；弹簧可用 `linear()` 表达；Studio 的动效只需 transform 与 opacity | 以 Motion 作为统一动效层：多一个运行时依赖，而现有需求 CSS 都能满足。出现手势驱动、需要速度连续的动画时重新评估 |
| 编辑器用 CodeMirror 6 | 对触屏友好、模块化；代码主要由 Agent 编写 | Monaco |
| 浏览器里不运行 TypeScript | 代码主要由 Agent 编写；作者代码几乎都是 JS，运行时注入的全局类型不全，静态检查误报多。事实来源是真实 vendor 的运行结果：诊断取自运行时，补全读取生成的 API 索引 | TS 6 LanguageService worker；TS 7 的浏览器构建（官方尚未发布，Go 的 wasm 只能单线程）。P2 浏览器内构建出现确需类型检查的 TS 项目时，重新评估 |
| 浏览器端状态不进入 Session，换用 vendor 镜像时清理 | 以 vendor 后端契约为界，与真实部署和 PureTavern 一致。同源先后运行不同镜像是 Studio 带来的情况，而状态格式由镜像代码定义：ST 1.19.0 的缩略图缓存是裸 Blob，TT 是对象 | 归 Session 所有、随重置清理，并让 Fixture 携带 storage：要求比真实部署更强的确定性，多出一套机制。在预览 realm 中包装 Storage 与 `indexedDB`、按 vendor 加前缀：改写浏览器 API，偏离生产路径 |
| Studio 不使用 localStorage 和 sessionStorage | 同源代码随时可能清空它们 | 把密钥放在 sessionStorage |
| 手动深浅色设置存在 cookie 里，`index.html` 的内联脚本在首帧之前读出 | 它是唯一需要在首帧之前读到的偏好，而 IndexedDB 是异步的，读到之前页面已经按系统配色画了一帧。cookie 是它唯一的存储位置，丢失时只会回到跟随系统 | 存在 IndexedDB，接受首帧闪一下。同时存在 IndexedDB 与 cookie：同一个设置有两份 |
| 部署用 Workers Static Assets | Cloudflare 对新项目的推荐方案 | Pages |
