# Vendor

## 1. Vendor 镜像

Vendor 镜像是一个前端发行版本的不可变静态文件集，部署在 `/__vendor/<id>/`，由 Preview SW 映射到预览的根路径。镜像相对上游只改一处：构建时在 `index.html` 的 `<head>` 开头注入。注入锚点必须恰好出现一次，否则构建失败。

| | ST 镜像 | TT 镜像 |
|---|---|---|
| 来源 | npm `sillytavern@<version>` | TauriTavern release 附带的 web 发行物 |
| 构建 | 按上游 webpack 配置、用相同的依赖版本预构建 `/lib.js` | 无需构建，发行物已含构建产物 |
| 注入 | Attach | Attach，加上 Web Host 安装脚本 |
| API 接入 | ST 接入 | TT host kernel + Web Host |

每个镜像都保留原始文件的 hash 清单，并生成 Vendor 解剖图（见 [Knowledge §1](Knowledge.md#1-内容)）。

## 2. Session Backend

Session Backend 在 Session 数据上实现 ST HTTP API，是两种 vendor 共同的数据入口：ST vendor 经 ST 接入直接调用它，TT vendor 经 Web Host 调用它。

覆盖范围以启动、渲染和会话写入为界：

| 用途 | 端点 |
|---|---|
| 启动 | `/csrf-token`、`/version`、`/api/settings/get`、`/api/secrets/read`、`/api/extensions/discover`、`/api/avatars/get`、`/api/characters/all` 与 `get`、`/api/groups/all`、`/api/backgrounds/all` 与 `folders`、`/api/image-metadata/all`、`/api/chats/get` 与 `recent` |
| 写入 | `/api/settings/save`、`/api/chats/save`（含 integrity 校验）、`/api/characters/edit` 与 `merge-attributes`、`/api/themes/save`、`/api/worldinfo/get` 与 `edit` |
| 生成 | `/api/backends/chat-completions/generate`（流式与非流式），由 Replay 应答 |

样板 settings 固定以下取值：
- `tokenizer: 0`：避开 tokenizer 的同步 XHR 调用；
- `enable_accounts: false`：跳过账户逻辑；
- `auto_load_chat: true`：启动后自动打开聊天。

未实现的端点返回 501。

## 3. Web Host 契约

Web Host 归 TauriTavern 所有。它在浏览器里实现 TT 的原生侧，即 `window.__TAURI__` 与 `__TAURITAVERN_HOST__`；TT 的应用代码感知不到它的存在。实现计划由 TauriTavern 仓库维护（T4）。

```js
import { installWebHost } from '/tauri/web-host/install.js';
installWebHost({
  identity: { platform, kind },   // 被模拟的真实平台
  backend: { handle(request) },   // ST 兼容后端：{ method, url, headers, body } → { status, headers, body }
  privateFiles: { read(path), write(path, bytes), remove(path), list(dir) },  // TT 私有文件
  deliverFile(name, blob),        // 文件导出如何交付
});
```

- **执行顺序**：必须在 `init.js` 之前执行。`init.js` 是 module 脚本，而注入在 Attach 之后的 module 脚本会按文档顺序先于它执行。
- **ST 数据走 ST HTTP API**，这是 TauriTavern 已承诺维护的上游兼容契约。Web Host 相当于 TT routes 的反向映射：把 TT IPC 转回 ST HTTP。
- **TT 私有数据沿用 TT 的数据目录布局**，包括 `default-user/tauritavern-settings.json` 与 `_tauritavern/` 下的 extension store、agent / MCP 注册表。Web Host 经 `privateFiles` 读写，文件存于 Session；`privateFiles` 只接受这两处路径。文件缺失时，Web Host 像 TT 首次启动那样写入默认值。这样重载不会丢失 TT 设置，样板也可以直接取自真实的 TT 数据目录。
- **未实现的命令**以 `Unsupported` 拒绝。
- **平台身份**只取真实平台，不存在 `web` 这个平台。
- **调用方式**：Studio 直接调用 `backend.handle`，不走 fetch，以免被 TT 的拦截器拦回来形成回环。跨 realm 只传递可结构化克隆的数据。

样板不含 `tauritavern-settings.json` 时，即为 TauriTavern 全新安装的设置，例如 Embedded Runtime 为 `auto`、ChatSurface 虚拟化关闭。作者在 TT 界面里切换这些设置，写入与 ST 设置一样进入 Session。

## 4. 酒馆助手

- JSR 不打包进 vendor 镜像，而是按固定版本从上游安装到 Snapshot 的 `extensions/JS-Slash-Runner/`，与在 ST 里安装扩展的方式一致。安装后离线缓存。
- 文件取自 jsDelivr 的 GitHub 镜像，逐个按 jsDelivr 公布的 SHA-256 校验。jsDelivr 拒绝超过 50 MB 的仓库，这类扩展（如 LittleWhiteBox）需要另一个来源。
- JSR 的 blob URL 模式不受支持：Chromium 中 blob: iframe 不受 Preview SW 控制。默认的 srcdoc 模式不受影响。
- JSR 使用 PolyForm Noncommercial 许可，Studio 保留其许可声明，不把它的代码并入 Studio。

## 5. 升级

1. ST 或 TT 发布新版本后，构建新镜像并生成解剖图。
2. 与上一版本的解剖图对比，差异就是影响面，可能涉及注入锚点、Session Backend 端点、主题控件 id、ST 接入。
3. 修正受影响的部分，跑预览冒烟测试，然后发布镜像。旧镜像保留若干个版本，供已固定版本的项目使用。
