---
name: st-theme
description: 制作或修改 SillyTavern 主题：主题字段、自定义 CSS、SillyTavern 与 TauriTavern 的差异，以及怎样核对结果。
---

# SillyTavern 主题

一个主题由两部分组成：

- **主题字段**：颜色、模糊强度、字体缩放、聊天样式等，存在 `power_user` 里。每个字段由界面上的一个控件设置，并驱动若干 CSS 变量。
- **自定义 CSS**：`power_user.custom_css`，处理字段覆盖不到的地方。

项目里，`theme.json` 是字段，`theme.css` 是自定义 CSS，`studio.json` 把两者挂到前端的设置上。保存后预览会自己更新。

## 先查解剖图

`vendor/anatomy/` 是从当前前端的源码生成的，比记忆可靠：

- `theme.json`：每个主题字段的控件、中文标签、说明，以及它驱动的 CSS 变量和 class。
- `css-variables.json`：核心样式表里的 CSS 变量、默认值，以及哪些字段会改它。
- `landmarks.json`：页面的主要区域（如 `#chat`、`.mes`、`#send_form`、`#top-bar`）、前端克隆用的模板，以及由设置切换的 class。

需要更细的规则时，读 `vendor/src/` 里的源码，例如 `style.css`。

## 先用字段，再写 CSS

- 颜色、模糊、阴影这类改动先改字段。字段改的是 `--SmartTheme…` 变量，整个界面会一致地跟着变，作者以后在设置里调整也会生效。
- CSS 里引用这些变量，不写死颜色：`color: var(--SmartThemeBodyColor)`。
- 字段的取值格式照 `theme.json` 里现有的写，颜色是 `rgba(r, g, b, a)`。
- 不要在 `theme.json` 里加 `theme` 或 `reduced_motion` 键：前者是用户选中了哪个已保存的主题，后者是用户的无障碍偏好，都不属于主题。

## 写 CSS 时注意

- 选择器以 `landmarks.json` 里的区域为准，不凭印象写。
- 消息正文里的 HTML 经过前端清洗：作者写的 class 会被加上 `custom-` 前缀，消息里的 `<style>` 会被限定在消息内。主题要选中消息里的作者内容时，写 `.custom-名字`。
- 核心样式的优先级通常不高，用更具体的选择器就能覆盖，少用 `!important`；用了的话，作者在设置里改字段就压不住它。
- 背景图由前端的背景功能管理，主题不覆盖背景图本身，只调整盖在它上面的面板。
- 毛玻璃效果依赖 `backdrop-filter` 和模糊强度字段（`--blurStrength`）；面板背景要留一些透明度，模糊才看得见。
- 窄屏下前端会换一套布局。桌面和移动两种设备都要看。

## SillyTavern 与 TauriTavern

- TauriTavern 运行同一套前端，多出几个字段和界面元素，以它的 `vendor/anatomy/` 为准。切换前端后，`vendor/` 跟着变。
- TauriTavern 的聊天区由自己的布局层排布，滚动方式与 SillyTavern 不同；不要假设 `#chat` 的滚动结构。
- TauriTavern 启动时按名字解析选中的主题，所以项目不拥有主题名（见上文）。
- 交付前在两种前端上都核对一遍。

## 核对

- 截图看整体观感：配色是否协调、层次是否清楚、有没有被遮挡或裁切的地方。
- 数值不靠截图判断：颜色、尺寸、对比度，读页面里的计算样式。正文与背景的对比度至少 4.5:1。
- 逐项看过：普通文本、斜体、引号、下划线文本、代码块、长消息、输入框、顶栏与侧边面板、弹出菜单。
- 改完 CSS 后看一眼运行日志，确认没有报错。
