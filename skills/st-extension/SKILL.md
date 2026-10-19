---
name: st-extension
description: 制作或修改 SillyTavern 第三方扩展：manifest、入口脚本与样式、getContext() 接口、SillyTavern 与 TauriTavern 的差异，以及怎样交付和核对。
---

# SillyTavern 扩展

一个扩展是用户数据目录 `data/default-user/extensions/` 下的一个文件夹。文件夹名就是扩展的身份，前端称它 `third-party/<文件夹名>`。前端启动时读每个文件夹的 `manifest.json`，按它载入一个脚本和一份样式。

项目里，`studio.json` 把扩展的文件挂到 `default-user/extensions/<文件夹名>/` 下，项目根就是扩展根。保存后预览会自己更新：改样式时原位换上新样式；改 `manifest.json` 或脚本时预览重载，因为 manifest 只在启动时读一次，载入过的 ES module 也无法卸载。

## 先查源码

`vendor/src/` 是当前前端的源码，比记忆可靠：

- `scripts/extensions.js`：怎样发现、排序、载入和停用扩展，以及 manifest 的每个字段怎么用。
- `scripts/st-context.js`：`getContext()` 返回的全部接口。
- `scripts/events.js`：`eventTypes` 里的全部事件名。
- `index.html` 与 `vendor/anatomy/landmarks.json`：扩展可以放界面的位置，以及前端克隆用的模板，例如消息的 `#message_template`。

## manifest.json

- 常用字段：`display_name`（扩展列表里的名字）、`loading_order`（小的先载入）、`js`、`css`、`author`、`version`、`homePage`、`auto_update`。`requires` 与 `optional` 是 Extras 模块，通常写空数组。
- `js` 和 `css` 写成相对扩展根的路径字符串。
- 写了 `css`，样式载入失败时整个扩展算载入失败。没有样式就不写这个字段。
- 需要时再加：`i18n`（语言代码到 JSON 文件的映射，在脚本之前载入）、`dependencies`（依赖的其他扩展名）、`minimum_client_version`、`hooks`（`activate`、`install`、`delete` 等时机调用脚本导出的哪个函数）。

## 入口脚本

- 脚本作为 ES module 载入。前端的一切都从 `SillyTavern.getContext()` 取：它是前端公开的接口；源码里的模块路径和导出随版本变化，TauriTavern 还改写了其中一些。
- 不要写死扩展的文件夹名：用户用 git 安装时，文件夹名取自仓库名。要读扩展自己的其他文件时，用 `new URL('./文件', import.meta.url)` 求出地址。
- 在 `eventTypes.APP_READY` 里初始化。前端会把这个事件重放给晚注册的监听者，所以什么时候注册都会收到。
- 初始化时直接按当前状态渲染一遍，例如已经打开的聊天，然后再订阅事件。不要等第一次 `CHAT_CHANGED`，它可能已经发生过了（见下文 TauriTavern）。
- 设置存在 `extensionSettings[键]` 下，改动后调用 `saveSettingsDebounced()`，随前端的 `settings.json` 保存。读取时先补上默认值。键要稳定，发布之后不再改，否则用户的设置会丢。
- 用户可见的文字可以经 `t` 或 `translate` 翻译，翻译数据由 manifest 的 `i18n` 提供。

## 界面

- 设置放进 `#extensions_settings2`（扩展面板右栏）或 `#extensions_settings`（左栏），沿用前端的抽屉结构：`.inline-drawer` 里放 `.inline-drawer-toggle.inline-drawer-header` 和 `.inline-drawer-content`，展开和收起由前端处理。
- 消息在 `#chat .mes` 里，`mesid` 属性是它在 `chat` 数组里的下标。换聊天、加载更早的消息、编辑和滑动回复时，前端会重新生成消息或其中的内容，所以加到消息里的元素要在 `CHAT_CHANGED`、`MORE_MESSAGES_LOADED`、`CHARACTER_MESSAGE_RENDERED`、`USER_MESSAGE_RENDERED`、`MESSAGE_UPDATED`、`MESSAGE_SWIPED` 之后补上。
- 扩展自己的 class 和 id 统一加前缀，避免与前端和其他扩展冲突。

## 样式

- 前端把 `css` 载入为 `<link id="third-party_<文件夹名>-css">`，排在核心样式之后。
- 颜色、字号引用主题变量（`--SmartThemeBodyColor`、`--SmartThemeQuoteColor`、`--mainFontSize` 等，见 `vendor/anatomy/css-variables.json`），扩展就会跟着用户的主题走。
- 选择器写在扩展自己的元素上。要改前端自己的界面时，用更具体的选择器，少用 `!important`。

## SillyTavern 与 TauriTavern

- TauriTavern 在 `APP_READY` 之后才载入第三方扩展，`EXTENSION_SETTINGS_LOADED` 也推迟到扩展载入之后。此前的事件扩展收不到，所以要按上文在初始化时先渲染当前状态。
- 不支持 CSS 级联层的旧 WebView 上，TauriTavern 给样式地址加上 `ttCompat=layer`，由宿主展平其中的 `@layer`。用了 `@layer` 时，要确认展平后层叠顺序仍然正确。
- TauriTavern 的聊天区由自己的布局层排布，移动端还会避让系统栏；不要假设 `#chat` 的滚动结构和视口高度。
- `window.__TAURITAVERN__` 只在 TauriTavern 上存在。要在 SillyTavern 上也能运行的扩展不依赖它，用到时先判断。
- 交付前在两种前端、桌面和移动两种设备上都核对一遍。

## 交付

- 两种前端都不能从 zip 安装扩展。导出的 zip 里只有一个与扩展同名的文件夹，用户把它解压到 `data/default-user/extensions/` 下，重新载入页面即可使用。
- 用 git 安装时，扩展的文件要在仓库根：把项目推到 GitHub，用户在前端的"安装扩展"里填仓库地址。
- 不要用已经装在预览里的扩展名作文件夹名，例如 `JS-Slash-Runner`。

## 核对

- 扩展面板里能看到它的设置，扩展列表里没有载入错误。
- 截图看界面是否融入前端：间距、配色、在亮色和暗色主题下都清楚。
- 数值不靠截图判断：读页面里的计算样式，确认样式真的生效。
- 设置改动后重载预览，确认保存住了。
- 看一眼运行日志，确认没有报错。
