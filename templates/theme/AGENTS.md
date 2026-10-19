# 主题项目

这是一个 SillyTavern 主题。`studio.json` 把项目文件挂到 SillyTavern 启动时读取的设置上：

- `theme.json` 是 `power_user` 中属于主题外观的字段。改动会在预览里驱动 SillyTavern 自己的主题控件。
- `theme.css` 是主题的自定义 CSS，即 `power_user.custom_css`。

主题名就是项目名。不要在 `theme.json` 里加 `theme` 键：它表示用户选中了哪个已保存的主题，不属于主题本身。

导出时，两者组装成 SillyTavern 能导入的主题 JSON。
