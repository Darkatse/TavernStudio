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
- 聊天背景由前端的背景功能管理，作者在背景面板里选，主题不替换它。面板、按钮、消息框上的装饰图可以由主题提供，见下文"图片与字体"。
- 毛玻璃效果依赖 `backdrop-filter` 和模糊强度字段（`--blurStrength`）；面板背景要留一些透明度，模糊才看得见。
- 窄屏下前端会换一套布局。桌面和移动两种设备都要看。

## 图片与字体

主题常用图片营造氛围，用网络字体定调。页面加载的图片和字体统称资源。

- 作者自己的图片和字体放进项目的 `assets/`，预览按 `/user/files/assets/<文件名>` 提供，CSS 里写 `url("/user/files/assets/paper.webp")`。作者可以把文件拖进文件树，或用文件树的导入按钮。
- `read_file` 能读图片和字体：返回格式、大小和预览里的 URL；图片附上图本身，字体附上各类文字的覆盖、可用的 `@font-face` 和一张样张。
- 导出的主题 JSON 只带 CSS，不带 `assets/` 里的文件。主题要分享给别人时，这些文件需要放到别人也能访问的地方，例如作者自己的图床，或作者的 GitHub 仓库经 jsDelivr 提供，再把 URL 换成那里的地址。动手之前先问作者。

**图片**

- 尺寸接近显示尺寸：图标显示为 24 px，3x 屏需要 72 px，用 1024 px 的原图会让每个用户多下载几百 KB。
- 照片和纹理用 WebP 或 JPEG，带透明的小图用 PNG 或 WebP，简单图形用 SVG。
- 只有很小的 SVG 适合写成 data URL。内联的图片随 CSS 存进设置，ST 每次保存设置都要写一遍。
- 图床的地址要能长期访问，不确定时问作者。

**字体**

- 字体栈以通用字族结尾（`serif`、`sans-serif`），中文主题在它前面写一个中文字族，例如 `"TRW UDMincho", "Songti SC", serif`。栈里只有一个网络字体时，它加载失败或缺字，文字就落到浏览器的默认字体。
- 作者没有指定中文字体时，主动问作者要不要去 [ZeoSeven Fonts](https://fonts.zeoseven.com) 挑一款喜欢的：打开字体页，点"嵌入到 Web 项目"，把那段代码或字体页的链接（`/items/<id>/`）发过来。然后写：

  ```css
  @import url("https://fontsapi.zeoseven.com/<id>/main/result.css");
  ```

  字族名在那段代码里；只拿到 id 时，`inspect_resources` 会列出这个样式表声明的字族。这些字体按字符切成了很多片，页面只下载用到的部分。
- 拉丁字体可以用 Google Fonts 或 Fontsource 的 CSS。
- `@import` 写在 CSS 的最前面、所有规则之前，否则浏览器忽略它。
- 字体的许可写在样式表开头的注释里，`inspect_resources` 会读出来。不允许商用或再分发的字体，先告诉作者。
- 导入了却没有用到的字体，样式表照样要下载，删掉它。

## SillyTavern 与 TauriTavern

- TauriTavern 运行同一套前端，多出几个字段和界面元素，以它的 `vendor/anatomy/` 为准。切换前端后，`vendor/` 跟着变。
- TauriTavern 的聊天区由自己的布局层排布，滚动方式与 SillyTavern 不同；不要假设 `#chat` 的滚动结构。
- TauriTavern 启动时按名字解析选中的主题，所以项目不拥有主题名（见上文）。
- 交付前在两种前端上都核对一遍。

## 核对

- 截图看整体观感：配色是否协调、层次是否清楚、有没有被遮挡或裁切的地方。
- 数值不靠截图判断：颜色、尺寸、对比度，读页面里的计算样式。正文与背景的对比度至少 4.5:1。
- 逐项看过：普通文本、斜体、引号、下划线文本、代码块、长消息、输入框、顶栏与侧边面板、弹出菜单。
- 用了图片或字体时运行 `inspect_resources`。它列出加载失败的图片、远大于显示尺寸的图片、缺失的字体和缺字、没有通用字族的字体栈、没用到的导入，处理完再交付。
- 改完 CSS 后看一眼运行日志，确认没有报错。引用了 `assets/` 里没有的文件时，日志里有一条 404。
