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
| Vendor | 一个前端发行版本，如 `st-1.19.0`、`tt-2.3.0` |
| Vendor 镜像 | Vendor 的不可变静态文件，加上构建期注入的 Attach，见 [Vendors §1](Vendors.md#1-vendor-镜像) |
| Device | 视口尺寸、上下系统栏的高度与平台身份。ST 的身份来自 UA，TT 的来自 `__TAURITAVERN_HOST__` |
| Fixture（样板） | 一段 ST 数据目录：settings、角色、聊天、主题、世界书、扩展设置。可以附带 Replay |
| Replay（回放） | Fixture 附带的一组 assistant 回复（样板根目录的 `replay.json`），生成端点每次按顺序流式回放一条。回放到第几条记在 Session 数据根目录的 `replay-position.json` 里，随 Session 持久化与重置 |
| Project | 作者的源文件，加上 `studio.json` |
| Mount | `studio.json` 里的一条声明：把项目文件或目录放到一个挂载点上。挂载点是数据路径，可以用 `#` 接 JSON Pointer，指向文件里的某个值，见 [§6](#6-项目) |
| Snapshot | Fixture 与挂载后的 Project 合成的数据目录，内容寻址，不可变 |
| Session | Vendor + Snapshot + 会话写入，以及 Web Host 的持久状态。一个浏览器里同时只有一个 Session |
| 会话写入 | vendor 在预览中经 ST HTTP API 写入 Session 的数据，例如 ST 保存设置、脚本写变量 |
| 回声写入 | 在项目拥有的键上与 Snapshot 语义相等的会话写入，例如热应用之后 vendor 的回写。不显示为差异 |
| 浏览器端状态 | vendor 及其中运行的代码写入源存储（localStorage、sessionStorage、IndexedDB）的状态。与真实部署一样属于浏览器，不属于 Session |
| View | Session 在某个 Device 上的一个 iframe。一个 Session 可以有多个 View |
| Session Backend | 在 Session 数据上实现 ST HTTP API 的 Studio 模块，两种 vendor 共用 |
| Attach | vendor 页面 `<head>` 里的第一个脚本，把页面交给 Studio 装配 |
| ST 接入 | Studio 装入 ST vendor 页面的 API 接入层，拦截 fetch / XHR / `$.ajax` 并交给 Session Backend |
| Web Host | TauriTavern 提供的浏览器宿主实现，是 TT vendor 的 API 接入层，见 [Vendors §3](Vendors.md#3-web-host-契约) |
| Preview SW | 预览使用的 Service Worker，负责映射 vendor 静态文件、提供数据子资源，不含业务逻辑 |

Studio 遵守的数据契约是 SillyTavern 的数据目录布局与 HTTP API：Session 按 ST 的布局保存数据，经 ST HTTP API 提供给两种 vendor。TT 设置只经 Web Host 的命令契约保存（[Vendors §3](Vendors.md#3-web-host-契约)）。TauriTavern 的磁盘布局是它的内部实现，Studio 不依赖。Studio 不另定数据格式。

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

**Session 归属**：同一浏览器里打开第二个 Studio 标签页时，由新标签页接管 Session。接管过程如下：
1. Session 由一个 Web Lock 持有。新标签页经 BroadcastChannel 请求接管。
2. 旧标签页卸载 View，等持久化写完，然后释放锁，并显示"已在另一个标签页打开"。
3. 如果 5 s 内锁没有释放，新标签页直接抢占锁，并在诊断中报告可能丢失的写入。

这与下面 View 的卸载是同一个模式。

**View 的卸载**：重载、切换设备或 vendor 之前，先让 vendor 页面在 iframe 仍在文档中时卸载，再移除 View，与真实页面重载的顺序一致。TT 页面先经 Web Host 的 `exit()` 走原生的关闭流程保存设置与聊天，Studio 等它完成；5 s 内没有完成时照常卸载，并在诊断中报告可能丢失的写入。随后 iframe 导航到 `about:blank`，vendor 的 `pagehide` 处理在仍附着的 realm 中运行。ST 没有卸载时的保存，防抖中尚未保存的写入与真实 ST 一样会丢失。

**顶层窗口**：ST 与扩展默认自己就是顶层页面，Attach 因此把 `window.parent` 指回页面自身。`window.top` 不可重定义，在 vendor 页面及其下各层 iframe 中都指向 Studio。P0 抽样的生态代码都不受影响：LittleWhiteBox 会把 `XBTasks` 写到 Studio 的 window 上，但它自己不读取（[P0 报告 V9](plan/P0-Report.md#v9-windowtop)）。直接读取 `top.document`、`top.SillyTavern` 的作者代码会出错，诊断会记录这些错误。

**焦点**：预览里的页面不能从 Studio 拿走焦点。
- 浏览器对跨源 iframe 本有这道边界，同源的预览没有。没有它时：
  - vendor 一启动就把焦点拉进预览：ST 显示加载对话框、聚焦输入框，TT 就绪后聚焦输入框；
  - 前端卡、Agent 的 fill 也会这样；
  - 作者正在输入框里打的字因此落进预览，开着的对话框也失去焦点。
- Attach 在每个 realm 里包装页面自己移动焦点的调用：`focus()`，以及对话框的 `show()` 与 `showModal()`。
  - 调用照常在页面里生效。
  - 若预览当时没有焦点、作者在 Studio 的某个元素上，焦点回到那里。
- 作者按下或用 Tab 进入预览后，焦点在预览内照常移动。

## 5. 编辑与预览

数据单向流动：项目文件 → Snapshot → Session → View。

项目文件变化后，Studio 依次做三件事：
1. 重新计算受影响的 Mount。
2. 按挂载点写入 Session 当前的数据。只替换挂载点上的内容，Session 的其他写入保留，例如聊天、变量、设置。
3. 按数据路径（包括 Pointer）分派热应用。没有热应用入口的路径，就重载 View。

热应用不按产物类型分派，因为运行时不认项目类型（[§6](#6-项目)）。

| 数据路径 | 热应用入口 |
|---|---|
| `settings.json#/power_user` 的主题字段 | 驱动 ST 自己的主题控件，控件 id 取自 Vendor 解剖图：<br>• `#customCSS` 赋值后派发 `input`；<br>• 取色器设置 `color` 属性即可，它会自己派发带 `detail.rgba` 的 `change`（再手动派发一次会让 ST 的处理器抛错）；<br>• `font_scale` 等滑块在 `input` 之后还要派发 `mouseup`，否则 CSS 变量等到松手才更新；<br>• 其余字段用各自的控件。<br>之后读回 vendor 内存中的 `power_user` 核对，不一致就报告并重载；值由 vendor 自己保存 |
| `default-user/extensions/<名>/` 下整个替换的 CSS 文件，页面已经按 manifest 把它载入为 `<link id="third-party_<名>-css">`（id 经 vendor 的 `sanitizeSelector`） | Studio 写入 Session，等它发布到 Cache Storage，再给这个 link 换一个带新查询参数的 href，保留 TT 的 `ttCompat` 等原有参数，然后等它载入。<br>• 原位替换，不重新插入元素，以保持层叠顺序；<br>• Chromium 在新样式表载入之前保留旧的，实测没有闪出无样式的帧；<br>• 页面上没有对应的 link、或载入失败时，重载 |
| 扩展的其他文件：JS、`manifest.json`、i18n、模板，以及 manifest 没有载入的 CSS | 重载 View：manifest 只在启动时读一次，ESM 无法卸载 |
| 酒馆助手脚本：`settings.json` 与角色卡中的 `tavern_helper` 脚本 | TavernHelper 的公开 API `replaceScriptTrees`，只作用于当前角色或预设 |
| 角色卡的其他字段，例如前端卡、角色正则 | 调用 `getCharacters()` 和 `reloadCurrentChat()` |

表中只列已经确定的路径。全局正则、世界书、Quick Reply 等其余路径，在 P1 中逐项实测、与重载结果对照后再加入。

- **vendor 在内存里持有的数据。** 如果 vendor 在内存里持有一份数据、保存时整体写回，那么只改 Session 不会生效，vendor 之后保存时还会用旧值把它覆盖。
  - 这类路径只能走 vendor 的公开入口，做不到就重载。
  - 目前已知的有：`settings.json` 的全部字段、酒馆助手脚本、世界书、Quick Reply。
- **运行中的页面是它数据的唯一写入者。** 热应用只驱动 vendor 自己的控件，由 vendor 走自己的保存路径写入，Studio 不在运行中的页面底下写页面会写的数据。
  - 数据里出现这些值之后，放置才算完成；在此之前比较差异，仍以上一次的放置为准，不会把旧值误报为会话写入。
  - 控件没取到值（读回不一致），或 vendor 在 5 s 内没有保存，就改走重载路径：页面先经退出流程保存，Studio 再写入，然后重载。没有热应用入口的路径也走这条路。
  - 理由：TT 的 Web Host 保存 `settings.json` 前会比对页面加载时的版本。Studio 若既驱动控件、又直接写数据，就是同一个值写了两次，第二次让页面的版本过期，这个页面之后的每次保存都会被拒绝。ST 没有这项校验，但同样只走控件，两种 vendor 是同一条路。
  - 扩展的文件在运行中的页面里没有写入者，vendor 不经 API 写它们。所以热应用扩展 CSS 时由 Studio 写入，没有双写；写入的同时，这些路径的放置就算完成，比较差异时不会把新内容当成会话写入。
- **观察跟上项目。** Agent 写下的文件要经过 Mount 和 Session 才到达预览，可能还要重载。所以观察预览的工具（`app.*`、截图）先等预览放置完项目的最新文件、页面就绪，再动手。
- **重载是权威。** 热应用只是优化，结果必须与重载一致。重载也改变不了的内容如实呈现，与真实 ST 一致：
  - 已有聊天里的开场白：`first_mes` 只在新建聊天时复制；
  - 已被输出正则改写过的消息。
- **会话写入**进入 Session，例如 ST 保存设置、作者在 ST 界面里调整主题、脚本写变量。落在挂载点上的会话写入以差异形式呈现给用户，用户采纳后，沿 Mount 反向写回项目文件。
  - **比较**按挂载的语义进行：
    - JSON 解析后，比较项目拥有的键；
    - 文本逐字比较；
    - 角色卡比较里面嵌的 JSON；
    - 带 `fence` 的先去掉包装。
  - **回声写入**不显示为差异。vendor 的规范化会如实显示，例如把颜色统一写成 `rgba(r, g, b, a)`；作者采纳一次后，项目就与之一致。
  - **采纳粒度**以挂载点为单位，不提供按代码块采纳：只采纳一部分可能写出无效的 JSON。
  - **冲突**：项目改动、切换 vendor、换样板或重开 Studio 时，Session 会覆盖或丢弃挂载点上尚未采纳的会话写入。被覆盖的内容由 Session 统一报告并显式提示，不静默丢弃。作者自己重置 Session、或丢弃某个挂载点的会话写入时不提示。
- **变量面板**通过页内真实的 TavernHelper / MVU API 修改变量，卡片收到的事件与生产环境相同。
- **Replay 推动叙事状态**：用户发送消息后，生成端点回放下一条预设回复。用于测试流式楼层、MVU 变量更新和 `AI_OUTPUT` 正则。
- **诊断来自运行时。** Attach 在预览页和子 iframe 中收集 `error`、`unhandledrejection` 与 `console.error`，经 Mount 映射回项目文件和行号。编辑器的 lint 标记与 Agent 的 `app.read_logs` 读取同一份记录。独立文件的行列号准确。JSR 脚本和前端卡的内联脚本报告的是 srcdoc 文档内的行号，与作者源码之间差一个固定偏移，即 JSR 拼接在前面的内容；Studio 从 iframe 的 srcdoc 中找到作者代码的起点，换算回源码行号。

## 6. 项目

```json
{
  "fixture": "showcase",
  "mounts": [
    { "from": "theme.json", "to": "default-user/settings.json#/power_user" },
    { "from": "theme.css",  "to": "default-user/settings.json#/power_user/custom_css" }
  ]
}
```

- **Mount 是唯一的放置机制。** 主题、前端卡等只是起始模板，由初始文件、Mount、推荐样板和对应 Skill 组成。运行时不认项目类型。
- **数据路径。** 挂载点、Session、Preview SW 和样板都用同一种路径，即相对数据根的路径，例如 `default-user/settings.json`、`_css/user.css`。
- **指向生效态。** Mount 挂到 vendor 启动时读取的那份数据。
  - ST 启动时只从 `settings.json` 读取外观。主题文件只在下拉框里被选中时，才由 `applyTheme` 把字段逐个复制进 `power_user`。
  - 因此主题挂到 `power_user`，不挂到 `themes/<名>.json`，否则重载后看不到主题。
  - 预设作用域的正则与脚本同理，挂到 `settings.json` 里当前预设的副本。
- **合并。**
  - JSON 挂到 Pointer 时，按 JSON Merge Patch（RFC 7386）合并：对象按键覆盖，其余值整体替换。
  - 文本挂到 Pointer 时，成为该位置的字符串值。
  - 不带 Pointer 时，整个文件替换。
  - 两条 Mount 写到同一个位置时报错，不按先后顺序覆盖。
- **所有权。** 项目只拥有它写出的键，采纳和导出都只看这些键。示例中的 `theme.json` 是 `power_user` 里属于主题外观的字段。
  - 选中哪个已保存的主题（`power_user.theme`）和无障碍偏好（`reduced_motion`）属于用户，不属于主题，项目不拥有它们。
  - 原因：TT 启动时按名字解析主题文件。项目拥有 `power_user.theme`，样板里又没有同名文件时，TT 会报错并改用另一个主题，项目的外观随之被覆盖。不拥有这个键时，选中的是样板里真实存在的主题，外观字段仍来自项目，这正是作者在 ST 里调过外观、尚未另存主题时的状态。
- **结构化文档。** Pointer 可以指向 JSON 文件，也可以指向角色卡 PNG 里嵌的卡片 JSON，读写规则与 ST 相同。
- **整个文件。** 不带 Pointer 的 Mount 把文件原样放到挂载点。无构建的扩展模板就是四条这样的 Mount，项目根即扩展根，推到 GitHub 后可以用 git 安装：

  ```json
  {
    "fixture": "showcase",
    "mounts": [
      { "from": "manifest.json",   "to": "default-user/extensions/my-extension/manifest.json" },
      { "from": "index.js",        "to": "default-user/extensions/my-extension/index.js" },
      { "from": "style.css",       "to": "default-user/extensions/my-extension/style.css" },
      { "from": "i18n/zh-cn.json", "to": "default-user/extensions/my-extension/i18n/zh-cn.json" }
    ]
  }
  ```
- **目录。** `from` 可以是目录，整棵子树原样挂到 `to` 下。
  - 扩展通常写两条 Mount：一条挂 `manifest.json`，一条挂 `dist/`。
  - 这样保留了扩展根的布局，manifest 里的路径和相对 import 都依赖这个布局。
- **`fence`。** `"fence": "html"` 表示先把文本包成 Markdown 代码块再挂载。
  - 生态里的前端代码都以代码块的形式出现在消息文本里，例如正则的 `replaceString`、`first_mes`、世界书。
  - 酒馆助手也只把含 HTML 的代码块渲染成前端卡。
- **内容逐字挂载**，所以检查器命中的规则能映射回 `theme.css` 的行号。`fence` 只多出固定的一行。
- **反向写回。** 采纳时沿同一条 Mount 反向写回：
  - JSON 写回项目文件里对应的键；
  - 文本写回整个文件；
  - 带 `fence` 的先去掉包装。
  
  Pointer 里带数组下标时，作者在 ST 界面里调整顺序后会错位，这时以整体差异呈现。
- **导出**沿 Mount 读取合成后的数据，组装为 ST 能导入的格式。导出什么由放置决定：放进 `power_user` 的是主题，放进某个扩展文件夹的文件是那个扩展。一个项目有几种导出时，工作台用菜单列出。
  - 主题 JSON：照 ST 的 `getThemeObject` 组装，`name` 取项目名；
  - `user.css`；
  - 角色卡 PNG；
  - 扩展 zip：项目放进 `default-user/extensions/<名>/` 的文件，从 Snapshot 读取，放在唯一的顶层文件夹 `<名>/` 下，文件名 `<名>.zip`。ST 与 TT 都不能从 zip 安装扩展，作者把它解压到 `data/default-user/extensions/` 下即可；
  - 酒馆助手 Script.json；
  - 正则 JSON；
  - 世界书 JSON；
  - Quick Reply JSON。
- **构建分三档：**
  - 无构建：主题、单文件前端卡、纯 JS 脚本。
  - 本地文件夹模式：用 File System Access 打开作者的模板仓库，由作者自己运行 watch 负责构建，Studio 挂载构建产物。导出的是现有产物，发布构建由作者负责。
  - 浏览器内构建（P2）：esbuild-wasm 加 Vue SFC / Tailwind 插件。

  不做跨源隔离。遇到不支持的构建特性时明确报错。
- **项目存储。**
  - 项目放在 OPFS 里；本地文件夹经 File System Access 打开。两者都是 `FileSystemDirectoryHandle`，所以工作区只需要一种实现。
  - 本地文件夹会被外部构建改写：按一次构建去抖，读到不完整的产物时报错并重读，不沿用旧值。
- **归档。** 项目可以导出为 zip，文件按项目内的路径存放，既能在 Studio 里再导入，也能解压后在别处编辑。
  - 导入时先检查全部路径，有一处不合格就整个拒绝，不写入任何文件。不合格指：越出项目目录、含控制字符、超过 500 个字符、与另一个路径只差大小写（在 Windows 和 macOS 上它们是同一个文件）。
  - 整个文件夹压缩时，`studio.json` 所在的唯一顶层文件夹就是项目根。macOS 附加的 `__MACOSX/` 忽略。
  - 导入的项目以 zip 的文件名命名，与已有项目重名时加编号。

## 7. 存储

**Studio 自有存储**

| 数据 | 位置 |
|---|---|
| 项目文件 | OPFS；本地文件夹项目留在作者的文件系统里 |
| 项目元数据、本地文件夹的目录句柄、History、Journal、Checkpoint、偏好 | IndexedDB（一个库，经 idb 访问） |
| Session 的写入覆盖层与 Web Host 文档 | IndexedDB |
| Session 子资源 | Cache Storage |
| vendor 镜像与知识包缓存 | Cache Storage |
| 样板、模板与第三方扩展的文件 | Cache Storage，按发布时给出的 SHA-256 校验一次，键里带摘要，之后启动不再请求网络 |
| 密钥 | 默认只在内存中；用户勾选后持久化到 IndexedDB |
| 手动深浅色与界面语言的设置 | cookie，首次渲染之前读取（[UI §3](UI.md#3-视觉-token)、[§6](UI.md#6-文案与本地化)） |

- Cache 名统一带 Studio 前缀 `studio-`，清理浏览器端状态时按这个前缀识别 Studio 的缓存。
- Studio 不使用 localStorage 和 sessionStorage：vendor 与项目代码同源，随时可能调用 `localStorage.clear()`。
- 启动时调用 `navigator.storage.persist()`，并以项目归档（§6）作为备份手段。
- **Session 的持久化**：
  - 以内存为准。持久化在后台按写入顺序进行，不挡住同步应答。
  - 持久化失败时报诊断，并以一条不会自动消失的错误通知标明 Session 未持久化。不能降级为只存内存、却照常回报成功。
  - 重新打开 Studio 时，由样板和项目合成 Snapshot，再叠加覆盖层。如果期间项目改过某些挂载点，按 §5 用项目的内容覆盖。
  - "重置 Session"丢弃覆盖层。
- **Agent 的存储有上限**，见 [Agent §1](Agent.md#1-运行模型)。

**浏览器端状态**

以 vendor 的后端契约为界。经 ST HTTP API 读写的数据和 Web Host 的持久状态属于 Session。vendor 及其中的扩展、酒馆助手、前端卡和作者脚本留在浏览器里的状态属于浏览器，例如 `language`、输入框草稿、`SillyTavern_*` 缓存库、酒馆助手的面板位置。这与真实部署和 PureTavern 的做法一致：
- 不进入 Fixture 和 Snapshot。重载时保留，Session 重置也不清理。
- 状态格式由 vendor 代码定义，因此跟随 Vendor 镜像：本浏览器换用另一个镜像时，加载前先清理。例如 ST 1.19.0 把背景缩略图缓存存成裸 Blob，TT 存成对象，ST 读到 TT 写下的记录会抛错。切换 Device 和并排显示不清理，因为运行的是同一份代码。
- 作者可以手动清理，例如给前端卡清档。真实 ST 中清除站点数据即可，Studio 中那样做会连同项目一起删除。
- 清理范围是源上除 Studio 自有存储外的全部。清理前先卸载所有 View，因为有打开的连接时，删除数据库会被阻塞。app-use 的快照计数键属于 Agent，予以保留。

## 8. 技术栈与仓库

- 工具链：Rsbuild 2、Rstest、strict TypeScript 7，均用最新版。lint 用 oxlint：开启 type-aware（基于 TS 7）、React Compiler 规则与 jsx-a11y。格式用 Prettier，Tailwind 类名自动排序。
- 外壳：React 19 + React Compiler。Compiler 经 Rsbuild 内置 SWC 的 `reactCompiler` 开启，不经过 Babel，与 TT 相同。界面层为 Tailwind v4 + shadcn（Base UI），组件、视觉与动效规则见 [UI](UI.md)。
- 编辑器：CodeMirror 6，只用它自带的 JS / CSS / HTML 语言支持。补全与悬停读取解剖图里的 API 索引，诊断来自运行时（§5）。浏览器里不运行 TypeScript。
- 编辑器缓冲区放在 CodeMirror 的 `EditorState` 里，不进 React state。重计算放到 worker。
- 数据：IndexedDB 经 idb 访问。Studio 的状态以内存为准，界面经各自 store 的 `useSyncExternalStore` 订阅，IndexedDB 只负责保存。

**框架边界**：只有 `apps/studio` 的外壳使用 React。
- 进入 vendor 页面的代码不用框架，包括 Attach 和它打包的 ST 接入、诊断收集与 app-use 引擎；Preview SW 也不用。这与 TT 的划分相同：完整的状态型界面用 React root，接入上游 DOM 的部分用原生代码。
- `packages/*` 不依赖框架，可以在没有 DOM 的环境中测试。
- 外壳只有一个工作区页面，不用路由。不用全局状态库：以局部 state 为主，需要时经 `useSyncExternalStore` 接外部 store，与 TT 相同。

```
apps/studio           Studio 应用
apps/edge             可选：LLM CORS 中继、截图用的跨域图片代理（Cloudflare Worker）
packages/preview      Preview SW、Attach、ST 接入
packages/backend      Session Backend 与 Replay
packages/agent        Run 循环、工具、Journal、Checkpoint 的回滚规则、模型接入
packages/workspace    OPFS 文件（写入时交出被替换的内容）、Mount、Snapshot
packages/st-data      角色卡 PNG、聊天 JSONL、主题格式
vendors/              ST 镜像构建脚本、TT 镜像装配脚本
fixtures/             样板
skills/               维护者编写的 Skill
knowledge/            知识包的来源登记与流水线
```

目录在第一项用到它的工作开工时建立，不预建空包。`@tauritavern/app-use` 由 TauriTavern 发布，Studio 按版本依赖。

## 9. 部署与安全

- **部署**：Cloudflare Workers Static Assets，单一源，域名 `studio.tauritavern.com`。用户数据随源保存，域名一经发布不再更换。`workers.dev` 只用于版本预览。全站纯静态，也可以自托管。
  - `scripts/site.mjs` 把 Studio 构建、vendor 镜像（`/__vendor/`）与知识包合成 `site/`，`wrangler.jsonc` 部署它。部署由 GitHub Actions 手动触发（`deploy.yml`），凭据在仓库 Secrets 中。
  - 路径与文件一一对应（`html_handling: none`），未命中返回 404；`/` 经 `_redirects` 指向 Studio 外壳。
  - `_headers` 给 Preview SW 加 `Service-Worker-Allowed: /`；带哈希的 Studio 资源与每个镜像目录长期缓存，其余每次重新验证。
  - 预览里的 URL 是虚拟的，内容取决于 Session，所以 Preview SW 交给页面的响应一律 `Cache-Control: no-cache`；镜像本身的长期缓存只作用于它在 `/__vendor/` 下的真实地址。镜像里 Studio 写入过的 `index.html` 由 SW 每次重新验证。
- **可选边缘函数只有两个：**
  - LLM CORS 中继：白名单放行，不记录日志，用户可自行部署。
  - 截图用的跨域图片代理：只在截图路径中使用，限制资源类型和大小。
- **安全**：同源意味着扩展、卡片和 Agent 写的代码能读到 Studio 的全部数据。与 ST / TT 相比，唯一新增的风险是**密钥原文可读**：ST / TT 的密钥放在后端，读取接口只返回打码值。对策：
  - 密钥默认不持久化；
  - 工具结果管线对已配置的密钥做脱敏；
  - 建议用户使用限额 key。
