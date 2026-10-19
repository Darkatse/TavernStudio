# P0 报告：运行时验证

> 日期：2026-10-18。验证对象：ST 1.19.0 镜像、TauriTavern `f1c50c42`（T4 W1）镜像、JS-Slash-Runner 4.11.3、`@tauritavern/app-use` 0.1.0、snapdom 3.3.5。
> 环境：Windows 11；Studio 由 `pnpm dev` 提供（未压缩、未缩小）；浏览器为系统 Chrome 155 与 Edge 155，以及 Playwright 1.64 自带的 Firefox 与 WebKit 构建，经 `playwright-core` 驱动。每项实验都有可重跑的脚本，见各节。

## 结论

| # | 结果 | 一句话 |
|---|---|---|
| V1 | 通过 | ST 镜像可复现，`lib.js` 与上游构建逐字节一致 |
| V2 | 通过 | 冷启动、热启动和重载时页面都由 SW 控制 |
| V3 | 通过 | ST 启动并渲染 showcase，没有请求漏到网络，没有错误 |
| V4 | 通过（`ee045cc5`） | 桌面与移动身份都渲染出聊天和 JSR 卡片。首测的 `f1c50c42` 在扩展发现处失败，并在 APP_READY 之后报出 7 个范围外命令；TauriTavern 已在 W2/W3 中修正 |
| V5 | Chrome、Edge、Firefox 通过；WebKit 有两处限制 | JSR 从上游安装，前端卡在 srcdoc 中渲染，iframe 内请求由 SW 和页内接入应答。WebKit 中接入晚于卡片的启动代码，媒体元素绕过 SW |
| V6 | 通过（app-use 0.1.1） | `app.snapshot` 进入 JSR iframe，`app.interact` 完成点击。0.1.0 在 ST 上无法点击任何 iframe 内的元素，0.1.1 已修正 |
| V7 | 通过，默认方式改为 Element Capture | Element Capture 与浏览器截图一致；snapdom 在 ST 上有系统性失真 |
| V8 | 通过 | 两条主题热应用路径都在 3 ms 内生效，与重载结果一致 |
| V9 | 已记录 | 抽样代码在 `top` 指向 Studio 时都不出错 |
| V10 | 通过（TT 部分含 V4 第 1 项的改正） | 换镜像时清理干净，Studio 自有存储与 Agent 计数键保留；数据子资源带内容哈希 ETag，TT 校验缩略图所依赖的 `HEAD` 在替换后返回新 ETag |
| V11 | 通过 | 三类来源的语法错误与运行时错误全部捕获；文件的行列号准确，srcdoc 内联脚本按固定偏移可映射 |

退出条件已满足：V1–V8、V10、V11 通过，V9 已记录。遗留项见末节。

## V1 ST 镜像

`pnpm vendor:st 1.19.0`（`vendors/st/build.mjs`）

- 来源：npm `sillytavern@1.19.0` 的 tarball，配合 GitHub 同名 tag 上的 `package-lock.json`。`npm ci --omit=dev --ignore-scripts` 后，用 ST 自己的 `docker/build-lib.js` 构建 `lib.js`。
- 锚点为 `<base href="/">`，`index.html` 中必须恰好出现一次，否则构建失败。
- 结果：592 个文件，14 个内置扩展，镜像 26.5 MB，构建 24.5 s。`lib.js` 为 1,947,206 字节，与真实 ST 的构建产物一致。

## V2、V3 Preview SW 与 ST 接入

`node scripts/preview-check.mjs`

- SW 只处理 iframe 导航；顶层导航、`/_studio/` 与跨源请求原样放行。
- 响应重新包装后再返回，不带原 URL，于是模块按请求 URL 解析，不会重复加载模块实例。
- 同步 XHR 不经过 SW。ST 接入在页内应答 API 和数据文件的同步读取；同步加载 vendor 静态文件时，改写到 `/__vendor/<id>/`。
- Attach 把 `window.parent` 重定义为页面自身，因为 ST 与扩展默认自己是顶层页面。`top` 不能重定义，见 V9。
- APP_READY 经 `import('/scripts/events.js')` 监听，它与 ST 共用同一个模块实例。Attach 运行时 `getContext()` 还在模块图的 TDZ 中，不可用。
- 注册 SW 前先 `getRegistration('/')`。直接 `register()` 要排在导航触发的更新检查之后，几次重载后热启动多等 1.6 s。
- Chromium 中 blob: iframe 不受 SW 控制。JSR 可选的 blob 模式因此不受支持，它的默认 srcdoc 模式不受影响。

## V4 TauriTavern 与 Web Host

`pnpm vendor:tt <TauriTavern 检出目录> f1c50c42`，然后 `node scripts/p0/v4-tt.mjs`

**镜像**：在 TauriTavern 发布 web 发行物（它的计划 T5）之前，从某个提交构建。构建只读取检出目录：
- `git archive` 导出构建所需的文件；
- 用该提交的锁文件安装依赖，再运行它自己的 `pnpm web:build`；
- 镜像是导出的 `src/`，`<base href="/">` 之后注入两个脚本：Attach，和 `/_studio/web-host.js`。

结果：`tt@2.3.0+f1c50c42`，1127 个文件，20 个内置扩展，31.5 MB。

**装配**：
- `/_studio/web-host.js` 是一个 0.23 kB 的 ES module，静态导入镜像自带的 `/tauri/web-host/install.js`，所以它在 `init.js` 之前完成安装。
- Attach 按 vendor 选择 API 路径：TT 页面不装 ST 接入，由 TT 自己的 host kernel 经 Web Host 调用 Session Backend；诊断仍覆盖所有 realm。
- Web Host 得到同步的后端和 Session 持有的 `store`。跨 realm 的值在接收方的 realm 里克隆，Studio 不持有可能已经卸载的页面里的对象。
- Device 同时带两种身份。桌面取浏览器自己的 UA，TT 平台按浏览器所在系统映射；移动对两种 vendor 都是 iPhone，即 iPhone UA 与 `{ platform: 'ios', kind: 'mobile' }`。iOS 走与桌面相同的原始字节传输，W1 已经覆盖。
- 工作台可以在 ST 与 TT 之间切换：关闭 View，清理上一个镜像的浏览器端状态，打开新的 Session。

**结果**（Chrome 155）：

| 身份 | 聊天 | 背景 | JSR 卡片 |
|---|---|---|---|
| `{ windows, desktop }` | 5 条消息 | 有 | APP_READY 后 942 ms |
| `{ ios, mobile }`，移动布局 | 5 条消息 | 有 | APP_READY 后 984 ms |

上表来自首测的 `f1c50c42`，下面第 1 项只在镜像副本里临时改正过。TauriTavern 在 W2/W3（`ee045cc5`）中修正了三项问题；用它的原样镜像重跑，桌面与移动都通过，JSR 卡片在 APP_READY 之后 155–194 ms 出现，范围外命令的报错与未捕获错误都已消失。仍有两条 console 错误：TT 路由把 `/api/sprites/get` 与 `/api/sd/comfy/workflows` 转成原生命令，Web Host 不支持，ST 自己会回退。卸载时的刷新失败属于 Studio 的卸载方式。

**W1（`f1c50c42`）的问题**，属于 TauriTavern：
1. **阻塞启动**：`get_extensions` 以 POST 请求 `/api/extensions/discover`，而 ST 的这个端点是 GET（`src/endpoints/extensions.js` 中的 `router.get('/discover')`）。`backend.js` 的 `json()` 默认用 POST，这个调用没有指定方法。TT 自己的测试后端只按路径匹配，原生路由用的是 `router.all`，所以都没有发现。
2. **APP_READY 之后的启动路径没有覆盖**：TT 在 APP_READY 之后才激活第三方扩展和部分内置扩展。W1 的启动测试停在 APP_READY，这些调用不在测试里：
   - agent-system：`open_extension_store_entry`、`register_agent_extension_tool`，在页面上弹出红色错误提示；
   - mcp-manager：`list_mcp_servers`；
   - expressions：`list_sprites`；
   - Stable Diffusion：`sd_handle`（读取 ComfyUI 工作流）；
   - Quick Reply：`save_quick_reply_set`（启动时保存）。

   其中前三项在范围外（agent、MCP、extension store），需要决定它们在 Web Host 下的表现：以空结果应答，或者让这些内置扩展在能力缺失时安静地不启用。
3. **View 卸载时的生命周期刷新失败**：重载或切换设备会移除 iframe，TT 在 `pagehide` 时刷新设置。这时 realm 已脱离文档，`new Headers()` 抛出 "Headers is not a constructor"；同时 `database_handle` 不受支持。页面存活时 `saveSettings()` 正常。这一项也牵涉 Studio：卸载 View 的方式需要让 vendor 的卸载处理在仍然附着的 realm 中运行，见末节。

TT 的 `get_character_chats_by_id` 仍对结果做 `Object.values`，属于 W1 已知的审阅待修项；Session Backend 返回数组，所以这次没有暴露。

## V5 酒馆助手

`node scripts/p0/v5-jsr.mjs [--browser msedge]`

- 安装：按固定版本从 jsDelivr 获取 `N0VI028/JS-Slash-Runner@4.11.3` 的全部 266 个文件，共 9.4 MB。逐个用 jsDelivr 公布的 SHA-256 校验，缓存在 `studio-extensions`，放到 `default-user/extensions/JS-Slash-Runner/`。
- Chrome 155、Edge 155、Firefox 与 WebKit 结果相同：
  - `TavernHelper` 已定义；
  - 卡片在 srcdoc 的 `TH-message--4--0` 中渲染，受 SW 控制；
  - Tailwind 运行时经 SW 返回 200（Firefox 的资源计时不填 `workerStart`，但该路径在网络上是 404，200 只能来自 SW）；
  - 卡片 realm 中的 `fetch` 已被接管，`fetch('/api/ping')` 返回 204，同步 XHR `/version` 返回 1.19.0。
- 在 WebKit 中跑通之前修了两处：
  - SW 重新包装 304 响应时必须不带 body。WebKit 给 304 一个空的 body 流，Response 构造器会拒绝它，结果 vendor 文件一个都没加载。
  - 已装入的标记改放在 window 的全局对象上。frame 导航后 WindowProxy 不变，而 WebKit 会为 srcdoc 文档换一个新的全局对象，之前按 WindowProxy 记录，导致卡片 realm 被当成已装入而跳过。
- WebKit 的两处限制，均为 Playwright 的 Windows 版 WebKit 上的实测，真实 Safari 仍需在 macOS / iOS 上确认：
  - 卡片的启动代码先于 ST 接入运行。WebKit 换上新全局对象后，接入要到 frame 的 load 才能装上：卡片自己的 load 监听器都已执行过，之后的代码才有接入。这之前的 API 调用到达 SW，返回 501 并记入诊断。在其他引擎中，脚本首次运行时接入已在。卡片通常经 `parent` 调用 API，所以接受这一限制；要提前，只能改写 JSR 生成的 srcdoc，而那会改变作者看到的文档。
  - `<audio>` 的加载不经过 SW，直接到网络上返回 404。`fetch()` 同一个文件则经过 SW。ST 的提示音因此加载失败。
- 限制：jsDelivr 拒绝超过 50 MB 的仓库，LittleWhiteBox 就是一例。安装器需要第二个来源，例如 GitHub 归档，P1 处理。

## V6 app-use

`node scripts/p0/v6-app-use.mjs`

Attach 直接打包 npm 上的 `@tauritavern/app-use@0.1.0`，引擎在 vendor 页面的 realm 中求值，与 TT 应用内助手相同。页面连接时把引擎交给 Studio；APP_READY 之后 Studio 才把它交给 Agent。Attach 由 7.5 kB 增至 43.8 kB（gzip 15.2 kB），启动时间不变。

| 操作 | 耗时 |
|---|---|
| `app.snapshot {}`，51 行 | 首次 158 ms，之后 14 ms |
| 按 iframe 的 ref 进入 JSR 卡片 | 0.7 ms |
| `app.interact` 点击卡片按钮 | 0.1.0 失败，见下；0.1.1 为 2.1 ms，卡片把 Health 从 42 改为 58 |

- **缺陷**：app-use 0.1.0 的 `frameMapping` 遇到任一祖先元素带 `perspective` 就拒绝映射 iframe 坐标。ST 的 `style.css` 给 `html` 设了 `-webkit-perspective: 1000`（修复 Chrome 模糊层闪烁），所以在原版 ST 上，任何 iframe 内的元素都点不了。TT 的 `style.css` 已去掉这条规则，所以 TT 一侧的测试没有发现。
- **验证**：在页面上把 `perspective` 置为 `none` 后，同一次点击 2.6 ms 完成，卡片自己把 Health 从 42 改为 58。
- **处理**：只有 3D 变换才受 `perspective` 影响，而祖先的矩阵已被要求是 2D，所以这项检查可以去掉。TauriTavern 已在 app-use 0.1.1 中修正，Studio 不改 vendor 的 CSS。
- **TauriTavern**（`--vendor tt`）：TT 的聊天由 ChatSurface 负责滚动。页面提供 `scrollChatSurfaceTo` 时，页面引擎把主页面 `#chat` 的滚动交给它，与 TT 应用内助手相同；这里判断的是页面提供的能力，不是 vendor。TT 中卡片按钮起初不在可见区域，app-use 拒绝点击并提示先滚动；脚本像 Agent 那样滚动一次 `#chat`，再点击成功，耗时 1.5 ms。

## V7 截图方式

`node scripts/p0/v7-capture.mjs`。Element Capture 需要真正渲染的标签页，脚本因此以有头模式运行，窗口放在屏幕外。

以浏览器自己的截图为基准，把各结果缩放到同一尺寸后逐像素比较。"差异像素"指任一通道差值超过 40 的像素。

| 场景 | 方式 | 耗时 | 平均差 | 差异像素 |
|---|---|---|---|---|
| Dark Lite（ST 默认，无模糊） | Element Capture | 每帧约 1 ms | 5.1 | 3.7% |
| | snapdom | 0.6–1.1 s | 43.2 | 39% |
| Azure（50 个模糊面板） | Element Capture | 每帧约 1 ms | 4.7 | 2.5% |
| | snapdom | 0.8–1.1 s | 37–45 | 31–39% |

- **Element Capture**：模糊和 JSR 卡片都与浏览器截图一致，残差来自缩放。
  - 共享标签页的授权约 0.4 s，之后每取一帧约 1 ms。
  - 预览 iframe 必须自成层叠上下文，否则一帧也收不到。Studio 已给它加上 `isolation: isolate`。
  - 帧只在页面重绘时产生，所以要保持流打开、读取最新一帧；等待"下一帧"在静止页面上会一直等下去。
  - 帧的尺寸是 View 在屏幕上的显示尺寸。需要原始分辨率时，截图期间把舞台缩放设为 1。
  - 仅限 Chromium 桌面版，每个 Session 授权一次；无头浏览器取不到帧。
- **snapdom** 的问题是结构性的，不随选项改变；截 `body` 或 `html`、是否 `embedFonts` 结果都相同：
  - ST 的背景层 `#bg1`（`z-index: -1`）落在 `body` 背景之下：不透明主题中消失，半透明主题中变暗；
  - `<q>` 的引号重复；
  - 文本度量不同，行会重新折行，楼层逐个错位；
  - 能截到模糊面板和同源 iframe，不需要授权，各浏览器都能用。
- **决定**：在 Chromium 桌面上默认使用 Element Capture，首次截图时请求授权；用户拒绝或浏览器不支持时退回 snapdom，并在结果里标明已知失真。已同步到 [Agent §5](../Agent.md#5-视觉) 与 [Decisions](../Decisions.md)。

## V8 主题热应用

`node scripts/p0/v8-theme.mjs`

| 路径 | 生效耗时 |
|---|---|
| 写入 `#customCSS` 并派发 `input` | 3 ms |
| 设置取色器的 `color` 属性，由组件派发变更 | 3 ms |

ST 按防抖延迟保存设置，等待保存后重载，计算样式与热应用后完全一致。

## V9 `window.top`

`window.top` 是不可配置的属性，在 vendor 页面及其下各层 iframe 中都指向 Studio。另外两条路也走不通：全局 `let top` 会抛出 SyntaxError，`var top` 不起作用。

| 样本 | 使用 | 在 Studio 中的表现 |
|---|---|---|
| LittleWhiteBox v3.1.7（`3881627`）`modules/scheduled-tasks/scheduled-tasks.js:2054` | `if (window.top && window.top !== window) window.top.XBTasks = window.XBTasks` | 条件成立，`XBTasks` 被写到 Studio 的 window 上。LWB 不读取它，无错误、无可见影响 |
| JSR 4.11.3 `src/iframe/cleanup_protector.js` | 仅当 `top` 可配置时才重定义 | 不会执行，与真实 ST 相同 |
| JSR 注入 iframe 的脚本 | 只读 `window.parent` 上的 `$`、`SillyTavern`、`TavernHelper` | `parent` 是 vendor 页面，正确 |
| ST 内置 gallery 的 nanogallery2 | `top.location.hash = …` | 只在非根相册或它自带的灯箱中触发，ST 的 gallery 用不到（静态分析，未运行） |

StageDog 的 tavern_helper_template 与另外十余个本地缓存的扩展、脚本中，没有找到依赖 `top` 的代码。

结论：维持现状，在文档中写明 `top` 指向 Studio。会受影响的是直接读取 `top.document`、`top.SillyTavern` 的作者代码，Attach 的诊断会记录它们抛出的错误。

## V10 浏览器端状态与 ETag

`node scripts/p0/v10-storage.mjs`

- ST 1.19.0 加 JSR 写入的状态：
  - IndexedDB：`SillyTavern_ChatCompletions`、`SillyTavern_Prompts`、`SillyTavern_TextCompletions`；
  - localStorage：`TH-AudioPlayer:is_expanded`、`TH-Panel:active_tab`、`TH-PromptViewer:wi_tracer_enabled`。
- 数据子资源的 ETag 是内容的 SHA-256。替换同名背景后 5 ms 内即提供新内容，重载后依然正确。
- 同一镜像再次启动时，埋入的 localStorage、sessionStorage、IndexedDB 与 Cache 标记全部保留。换用另一镜像时全部清理，只留下 Studio 的两个 Cache 和 app-use 的计数键。
- 清理时不能有打开的 vendor 页面，否则删除数据库会被阻塞；Studio 会报错，而不是一直等待。第二个标签页接管 Session（Architecture §4）是 P1 的前置工作。
- ST 自己的背景缩略图缓存不校验 ETag，替换同名背景后 ST 的缩略图不会更新。真实 ST 也是如此，属于 vendor 行为。
- TT 复用背景预览前，先用 `HEAD` 取 ETag 与缓存比较，缺少 ETag 时报错（`backgrounds.js` 的 `getCustomBackgroundPreview`）。在 TT 页面里，经 TT 自己包装过的 `fetch` 实测（含 V4 第 1 项的改正）：`HEAD /backgrounds/tavern%20day.jpg` 返回内容哈希 ETag；替换同名背景后 ETag 随之改变，重载后保持。TT 依赖的这个契约成立。这条界面路径本身没有走到，因为样板里没有自定义聊天背景。

## V11 运行时诊断

`node scripts/p0/v11-diagnostics.mjs`

| 来源 | 错误 | 记录的位置 | 精度 |
|---|---|---|---|
| 扩展 `index.js` | 运行时 | `…/third-party/V11-Runtime/index.js:4:3` | 与源文件一致，URL 映射到 `default-user/extensions/V11-Runtime/index.js` |
| | 语法 | `…/V11-Syntax/index.js:3:7` | 一致 |
| JSR 脚本 | 运行时、语法 | `about:srcdoc`，frame `TH-script--<名称>--<id>` | 在 srcdoc 文档内准确；比作者源码多 14 行 |
| 前端卡 | 运行时、语法 | `about:srcdoc`，frame `TH-message--<楼层>--<序号>` | 在 srcdoc 文档内准确；本例比消息中的代码多 27 行 |

偏移来自 JSR 在作者代码前拼接的内容，同一个 frame 内固定。srcdoc 可以从 iframe 上读到，所以 Studio 能定位作者代码在 srcdoc 中的起点，把行号换算回源码；frame 名则给出楼层或脚本 id。这部分映射在 P1 随 Mount 实现。

## 测量

`node scripts/preview-check.mjs`，ST 1.19.0，桌面 View，Chrome 155。

| 指标 | 结果 |
|---|---|
| 冷启动到 APP_READY（新浏览器配置，含从 jsDelivr 安装 JSR） | 2344 ms：SW 35、数据 858、vendor 1339 |
| 热启动 | 1460 ms：SW 16、数据 145、vendor 1199 |
| 重载 View | 1020–1049 ms |
| 首屏请求 | 250 个，解码后 8.98 MB；镜像共 26.5 MB，启动只加载其中一部分 |
| 主题热应用 | 3 ms |
| Element Capture | 授权约 0.4 s，每帧约 1 ms |
| snapdom | 0.6–1.1 s |
| `app.snapshot` 概览 | 首次 158 ms，之后 14 ms |
| Attach | 43.8 kB，gzip 15.2 kB |

首屏的网络传输量没有单独测到：vendor 文件由 SW 获取，不出现在页面的资源计时里。部署后的传输量取决于压缩，需要在 Workers 上重测。

**各引擎**（`--browser`，ST 1.19.0，桌面 View）：

| 引擎 | 冷启动 | 热启动 | 重载 View |
|---|---|---|---|
| Chrome 155 | 2344 ms | 1460 ms | 1.0–1.05 s |
| Firefox（Playwright） | 6044 ms：数据 1551、vendor 2173 | 2463 ms | 1.6–2.2 s |
| WebKit（Playwright，Windows） | 5196 ms：数据 1946、vendor 3102 | 3436 ms | 2.8–3.1 s |

Firefox 与 WebKit 用的是 Playwright 的构建，在 Windows 上未必代表正式版的性能；它们只用于确认功能，不用来定预算。

**TauriTavern**（`--vendor tt`，Chrome 155，`ee045cc5`）：Studio 总从 ST 启动，所以只看切换后 TT 自己的部分。新 Session 的数据 159–180 ms；View 到 APP_READY 1.44–1.63 s；重载 1.35–1.41 s；JSR 卡片在 APP_READY 之后 155–194 ms 出现，因为 TT 延后激活第三方扩展。首屏解码 3.0 MB，ST 为 8.98 MB。W2/W3 让 TT 的系统扩展也在浏览器里启动，比 W1 的 `f1c50c42`（APP_READY 0.95–1.2 s，重载 1.28 s）慢约 0.3 s，超出建议的 1.1 s 重载预算。

**P1 性能预算（建议）**

| 指标 | 预算 |
|---|---|
| 热启动 | ≤ 1.5 s |
| 重载 View | ≤ 1.1 s |
| 主题热应用 | ≤ 16 ms |
| 截图（Element Capture） | 每帧 ≤ 16 ms |
| 截图（snapdom） | ≤ 1.2 s |
| `app.snapshot` 概览 | ≤ 200 ms |
| Attach（gzip） | ≤ 20 kB |

冷启动受首次安装扩展的影响较大，暂不设预算，P1 加入镜像缓存后再定。

## 回写与遗留

已回写：
- [Architecture](../Architecture.md) §4、§5、§8；
- [Agent](../Agent.md) §5；
- [Decisions](../Decisions.md)：截图方式与 app-use 的装载方式。

遗留：

| 项 | 前置条件 |
|---|---|
| WebKit 的两处限制在真实 Safari 上的表现 | 在 macOS / iOS 上实测 |
| 设备的安全区：iframe 中 `env(safe-area-inset-*)` 为 0，移动 View 的顶栏被圆角遮住 | P1，Device 预设 |
| 体积超过 50 MB 的扩展的安装来源 | P1 |
| 第二个标签页接管 Session | P1，清理浏览器端状态的前置。V4 中已见到后果：同时开着的第二个 Studio 标签页发布了另一个 vendor 的 Session，第一个标签页的页面随即从错误的镜像加载文件 |
