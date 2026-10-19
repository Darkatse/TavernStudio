# P0 报告：运行时验证

> 日期：2026-10-18。验证对象：ST 1.19.0 镜像、JS-Slash-Runner 4.11.3、`@tauritavern/app-use` 0.1.0、snapdom 3.3.5。
> 环境：Windows 11；Studio 由 `pnpm dev` 提供（未压缩、未缩小）；浏览器为系统 Chrome 155 与 Edge 155，经 `playwright-core` 驱动。每项实验都有可重跑的脚本，见各节。

## 结论

| # | 结果 | 一句话 |
|---|---|---|
| V1 | 通过 | ST 镜像可复现，`lib.js` 与上游构建逐字节一致 |
| V2 | 通过 | 冷启动、热启动和重载时页面都由 SW 控制 |
| V3 | 通过 | ST 启动并渲染 showcase，没有请求漏到网络，没有错误 |
| V4 | 待 T4 W1 | TT 镜像经 Web Host 启动，等 TauriTavern 的 W1 分支 |
| V5 | Chromium 通过；Firefox、Safari 待测 | JSR 从上游安装，前端卡在 srcdoc 中渲染，iframe 内请求由 SW 和页内接入应答 |
| V6 | 部分通过，阻塞于 app-use 缺陷 | `app.snapshot` 能进入 JSR iframe；`app.interact` 在 ST 上无法点击任何 iframe 内的元素，原因已定位，修复属于 app-use |
| V7 | 通过，默认方式改为 Element Capture | Element Capture 与浏览器截图一致；snapdom 在 ST 上有系统性失真 |
| V8 | 通过 | 两条主题热应用路径都在 3 ms 内生效，与重载结果一致 |
| V9 | 已记录 | 抽样代码在 `top` 指向 Studio 时都不出错 |
| V10 | ST 部分通过；TT 部分待 V4 | 换镜像时清理干净，Studio 自有存储与 Agent 计数键保留；数据子资源带内容哈希 ETag |
| V11 | 通过 | 三类来源的语法错误与运行时错误全部捕获；文件的行列号准确，srcdoc 内联脚本按固定偏移可映射 |

退出条件尚未全部满足：V4、V6、V5 的 Firefox / Safari 与 V10 的 TT 部分仍未完成，见末节。

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

## V5 酒馆助手

`node scripts/p0/v5-jsr.mjs [--browser msedge]`

- 安装：按固定版本从 jsDelivr 获取 `N0VI028/JS-Slash-Runner@4.11.3` 的全部 266 个文件，共 9.4 MB。逐个用 jsDelivr 公布的 SHA-256 校验，缓存在 `studio-extensions`，放到 `default-user/extensions/JS-Slash-Runner/`。
- Chrome 155 与 Edge 155 结果相同：
  - `TavernHelper` 已定义；
  - 卡片在 srcdoc 的 `TH-message--4--0` 中渲染，受 SW 控制；
  - Tailwind 运行时经 SW 返回 200；
  - 卡片 realm 中的 `fetch` 已被接管，`fetch('/api/ping')` 返回 204，同步 XHR `/version` 返回 1.19.0。
- Firefox 与 Safari 需要下载 Playwright 的浏览器构建，尚未测试。
- 限制：jsDelivr 拒绝超过 50 MB 的仓库，LittleWhiteBox 就是一例。安装器需要第二个来源，例如 GitHub 归档，P1 处理。

## V6 app-use

`node scripts/p0/v6-app-use.mjs`

Attach 直接打包 npm 上的 `@tauritavern/app-use@0.1.0`，引擎在 vendor 页面的 realm 中求值，与 TT 应用内助手相同。页面连接时把引擎交给 Studio；APP_READY 之后 Studio 才把它交给 Agent。Attach 由 7.5 kB 增至 43.8 kB（gzip 15.2 kB），启动时间不变。

| 操作 | 耗时 |
|---|---|
| `app.snapshot {}`，51 行 | 首次 158 ms，之后 14 ms |
| 按 iframe 的 ref 进入 JSR 卡片 | 0.7 ms |
| `app.interact` 点击卡片按钮 | 失败，见下 |

- **缺陷**：app-use 0.1.0 的 `frameMapping` 遇到任一祖先元素带 `perspective` 就拒绝映射 iframe 坐标。ST 的 `style.css` 给 `html` 设了 `-webkit-perspective: 1000`（修复 Chrome 模糊层闪烁），所以在原版 ST 上，任何 iframe 内的元素都点不了。TT 的 `style.css` 已去掉这条规则，所以 TT 一侧的测试没有发现。
- **验证**：在页面上把 `perspective` 置为 `none` 后，同一次点击 2.6 ms 完成，卡片自己把 Health 从 42 改为 58。
- **处理**：只有 3D 变换才受 `perspective` 影响，而祖先的矩阵已被要求是 2D，所以这项检查可以去掉。修复与 0.1.1 发布属于 TauriTavern，已另建任务。Studio 不改 vendor 的 CSS。
- TT vendor 需要的 `scrollTo` 选项随 V4 接入。

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
- ST 自己的背景缩略图缓存不校验 ETag，替换同名背景后 ST 的缩略图不会更新。真实 ST 也是如此，属于 vendor 行为。TT 缩略图的部分随 V4 验证。

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

首屏的网络传输量没有单独测到：vendor 文件由 SW 获取，不出现在页面的资源计时里。部署后的传输量取决于压缩，需要在 Workers 上重测。TT 的各项测量随 V4 补上。

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
| V4，以及 V10 的 TT 部分 | TauriTavern T4 W1 |
| V6 的 `app.interact` | `@tauritavern/app-use@0.1.1`：去掉 `perspective` 拒绝。之后 Studio 升级依赖并重跑 V6 |
| V5 的 Firefox / Safari | 下载 Playwright 的 Firefox 与 WebKit 构建，需要维护者同意 |
| 体积超过 50 MB 的扩展的安装来源 | P1 |
| 第二个标签页接管 Session | P1，清理浏览器端状态的前置 |
