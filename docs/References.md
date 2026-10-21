# 参考实现

**先参考，后设计。** 设计或实现任何机制之前，先查下列已有实现怎样解决同一个问题：它们怎么做、为什么这样做、踩过哪些坑。结论以代码和实测为准，README 只作线索。

- 能沿用就沿用，并注明出处；不沿用时，在 [Decisions](Decisions.md) 写明理由。
- 生态已有的约定优先于 Studio 自定：数据目录布局、HTTP API、扩展加载方式、Skill 格式。
- 参考的是做法与理由，不是照搬代码。代码能否复用，以许可为准。

## 上游与同类实现

| 实现 | 许可 | 设计这些部分前先查它 |
|---|---|---|
| [SillyTavern](https://github.com/SillyTavern/SillyTavern) | AGPL-3.0 | 数据目录布局、HTTP API 语义、前端启动与消息渲染管线、主题控件、浏览器端状态（`AccountStorage`、localforage 缓存库）。ST vendor 本体 |
| [TauriTavern](https://github.com/Darkatse/TauriTavern) | AGPL-3.0 | TT 私有数据布局（`default-user/tauritavern-settings.json`、`_tauritavern/`）、Host Kernel 的拦截器与协议层、[FrontendHostContract](https://github.com/Darkatse/TauriTavern/blob/main/docs/FrontendHostContract.md)、`@tauritavern/app-use`、应用内助手的 Run / Journal / 工具 / Workspace、Skill 格式 |
| [PureTavern](https://github.com/Lianues/PureTavern) | AGPL-3.0 | 纯前端接管 `/api/**`（Legacy Hook）；存储边界：业务数据进自有的单个 IndexedDB，ST 自己的浏览器端状态原样不动；按 Build ID 缓存静态资源的 Service Worker；未实现端点返回 501 并记入诊断；归档格式。它尝试过禁用脚本的静态预览，后来放弃 |
| [酒馆助手 JS-Slash-Runner](https://github.com/N0VI028/JS-Slash-Runner) | PolyForm Noncommercial 1.0.0 | TavernHelper API 与 `@types`、脚本树、前端卡的 iframe 运行时、变量与事件、它自己写入的浏览器端状态（`TH-*`）。Studio 从上游安装它、收录它的文档与类型，但不把它的代码并入 Studio |
| [TauriTavern Creator Extension](https://github.com/Darkatse/TauriTavern-Creator-Extension) | MIT | Vue 3 扩展模板，扩展项目模板的起点 |

## 兼容样本

真实的生态作品，用来检验预览是否保真。许可各不相同，引用前先查看各自的 LICENSE。

| 样本 | 检验什么 |
|---|---|
| [LittleWhiteBox](https://github.com/RT15548/LittleWhiteBox) | `window.top` 的影响、变量与面板 |
| [ST-Prompt-Template](https://github.com/zonde306/ST-Prompt-Template) | 消息渲染前后执行脚本 |
| [Moonlit Echoes](https://github.com/RivelleDays/SillyTavern-MoonlitEchoesTheme) | 以扩展形式发布的主题，桌面与移动适配 |
| [cocktail](https://github.com/Lianues/cocktail) | 改写启动与聊天渲染的扩展 |

## 界面与动效

采纳结果见 [UI](UI.md)。

| 实现 | 许可 | 参考什么 |
|---|---|---|
| [shadcn/ui](https://ui.shadcn.com) | MIT | 组件结构、registry 分发方式、Base UI 版组件 |
| [Base UI](https://base-ui.com) | MIT | 无障碍原语；由 CSS 过渡驱动的进入与退出动画；Tabs 指示条的位置变量 |
| [Fluid Functionalism](https://www.fluidfunctionalism.com) | MIT | 视觉 token、动效档位、列表高亮与焦点规则（见其 [craft reference](https://github.com/mickadesign/fluid-functionalism/blob/main/skills/fluid-functionalism/references/craft.md)）；提供 Base UI 版组件 |
| [beUI](https://beui.dev/components/motion) | 据报道为 MIT，取用前核对仓库 | 动效组件，各自处理了"减少动态效果" |
| [Beautiful UI](https://www.beautifului.dev) | MIT | Agent 界面：思考过程、流式文本、工具调用、审批、diff、代码块 |
| [Animate UI](https://animate-ui.com/docs) | MIT + Commons Clause | 动效原则：退出快于进入，只动 transform 与 opacity，键盘导航不加动画。许可与 AGPL 不兼容，不复制代码 |
| v0、Lovable、bolt.new | 闭源产品 | 布局：对话在左、预览与代码在右，预览与代码以标签切换 |
| [Chrome DevTools](https://github.com/ChromeDevTools/devtools-frontend)、[VS Code](https://github.com/microsoft/vscode) 的色样 | BSD-3-Clause、MIT | 代码里颜色值前的色样；DevTools 把半透明颜色画在棋盘格上 |
| [Anthropic 官网](https://www.anthropic.com)的字标 | 闭源产品 | 品牌字标的展开：字母从标志处散开，散开过半才淡入 |

## 已对比的方案

- Gemini 版 Studio 计划（本机 `D:\Code\Github\TauriTavern\.cache\PlanDocs\Gemini-TavernStudio`）：仿生沙盒等取舍见 [Decisions](Decisions.md)。

## 本机副本

维护者机器上的位置，供 Agent 直接检索。使用前先 `git pull`，旧副本可能给出过时的结论。

| 实现 | 位置 |
|---|---|
| SillyTavern | `D:\Code\Github\SillyTavern` |
| PureTavern | `D:\Code\Github\PureTavern` |
| 酒馆助手 | `D:\Code\Github\TauriTavern\.cache\JS-Slash-Runner`。`D:\Code\Github\JS-Slash-Runner` 停在 2026-02，仍是改换许可前的 AFPL |
| Creator Extension | `D:\Code\Github\TauriTavern-Creator-Extension` |
| 兼容样本 | `D:\Code\Github\TauriTavern\.cache\` 下同名目录 |

新增参考项目时，写明链接、许可，以及"设计哪些部分前先查它"。
