# 项目模板

每个子目录是一个起始模板：初始文件、`studio.json` 中的 Mount 与推荐的样板（docs/Architecture.md §6）。新建项目时，模板的文件原样复制到项目里。构建时 `apps/studio/build/published.ts` 把它们发布到 `/_studio/templates/<名称>/`。

运行时不认项目类型，模板只是起点。

## theme

SillyTavern 主题：`theme.json` 挂到 `power_user`，`theme.css` 挂到 `power_user.custom_css`。`theme.json` 的字段与取值来自 SillyTavern 1.19.0 的 `getThemeObject`，在 showcase 样板上运行得到，即样板当前外观的完整主题。去掉了两个属于用户的键（docs/Architecture.md §6，所有权）：
- `theme`：选中的已保存主题。项目拥有它而样板里没有同名主题文件时，TT 会报错并改用另一个主题；
- `reduced_motion`：无障碍偏好，ST 启动时会按系统设置改写；主题拥有它，开了"减少动态效果"的系统上就会平白多出一条待采纳。

## extension

不需要构建的 SillyTavern 第三方扩展，在 SillyTavern 与 TauriTavern 上都能运行。项目根就是扩展根，推到 GitHub 后可以用 git 安装。`studio.json` 用三条整个文件的 Mount，把 `manifest.json`、`index.js`、`style.css` 挂到 `default-user/extensions/my-extension/` 下：

- 扩展在 `#extensions_settings2` 放一个设置抽屉，其中的开关经 `extensionSettings.my_extension` 与 `saveSettingsDebounced()` 保存；
- 打开时在每条消息的名字旁显示字数，样式来自 `style.css`。改 `style.css` 时预览原位换上新样式，改另外两个文件时预览重载。

文件夹名 `my-extension` 只用 `[A-Za-z0-9_-]`，也不能与预览里已经安装的扩展同名，例如 `JS-Slash-Runner`。导出得到 `my-extension.zip`，里面是 `my-extension/` 文件夹。脚本只经 `SillyTavern.getContext()` 使用前端。需要构建的扩展（例如 Creator Extension 模板）走 P1c 的本地文件夹模式。
