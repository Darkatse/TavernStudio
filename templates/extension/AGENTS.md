# 扩展项目

这是一个 SillyTavern 扩展，不需要构建，在 SillyTavern 与 TauriTavern 上都能运行。项目根就是扩展根：推到 GitHub 后，可以用仓库地址在 SillyTavern 里安装。

`studio.json` 把三个文件挂到 `default-user/extensions/my-extension/`，前端把它当作已安装的第三方扩展 `third-party/my-extension`：

- `manifest.json`：前端启动时读一次，声明显示名、载入顺序和要载入的 `index.js`、`style.css`。改动后预览重载。
- `index.js`：扩展的代码，作为 ES module 载入。改动后预览重载。
- `style.css`：扩展的样式。改动后预览原位换上新样式，不重载。

新增的文件（例如 i18n 或 HTML 模板）要在 `studio.json` 里加一条同样挂到 `default-user/extensions/my-extension/` 下的 Mount，否则预览和导出里都没有它。

改扩展名时，一起改三条 Mount 里的 `my-extension`、`index.js` 里的 `PREFIX` 和 `style.css` 里的 class 前缀。`SETTINGS_KEY` 是已保存设置的键，发布之后不要再改。

导出得到 `my-extension.zip`，解压到 `data/default-user/extensions/` 下就是安装好的扩展。
