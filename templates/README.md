# 项目模板

每个子目录是一个起始模板：初始文件、`studio.json` 中的 Mount 与推荐的样板（docs/Architecture.md §6）。新建项目时，模板的文件原样复制到项目里。构建时 `apps/studio/build/published.ts` 把它们发布到 `/_studio/templates/<名称>/`。

运行时不认项目类型，模板只是起点。

## theme

SillyTavern 主题：`theme.json` 挂到 `power_user`，`theme.css` 挂到 `power_user.custom_css`。`theme.json` 的字段与取值来自 SillyTavern 1.19.0 的 `getThemeObject`，在 showcase 样板上运行得到，即样板当前外观的完整主题。去掉了两个属于用户的键（docs/Architecture.md §6，所有权）：
- `theme`：选中的已保存主题。项目拥有它而样板里没有同名主题文件时，TT 会报错并改用另一个主题；
- `reduced_motion`：无障碍偏好，ST 启动时会按系统设置改写；主题拥有它，开了"减少动态效果"的系统上就会平白多出一条待采纳。
