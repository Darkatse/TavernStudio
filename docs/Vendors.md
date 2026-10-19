# Vendor

## 1. Vendor 镜像

Vendor 镜像是一个前端发行版本的不可变静态文件集，部署在 `/__vendor/<id>/`，由 Preview SW 映射到预览的根路径。镜像相对上游只改一处：构建时在 `index.html` 的 `<head>` 开头注入。注入锚点必须恰好出现一次，否则构建失败。

| | ST 镜像 | TT 镜像 |
|---|---|---|
| 来源 | npm `sillytavern@<version>` | TauriTavern release 附带的 web 发行物 |
| 构建 | 按上游 webpack 配置、用相同的依赖版本预构建 `/lib.js` | 无需构建，发行物已含构建产物 |
| 注入 | Attach | Attach，加上 Web Host 安装脚本 |
| API 接入 | ST 接入 | TT host kernel + Web Host |

每个镜像都保留原始文件的 hash 清单，并生成 Vendor 解剖图（见 [Knowledge §1](Knowledge.md#1-内容)）。解剖图在 `out/__vendor/anatomy/<id>/`，由镜像构建写出；`pnpm vendor:anatomy [<id>]` 可以不重建镜像而单独重新生成。

## 2. Session Backend

Session Backend 在 Session 数据上实现 ST HTTP API，是两种 vendor 共同的数据入口：ST vendor 经 ST 接入直接调用它，TT vendor 经 Web Host 调用它。

覆盖范围以启动、渲染和会话写入为界：

| 用途 | 端点 |
|---|---|
| 启动 | `/csrf-token`、`/version`、`/api/settings/get`、`/api/secrets/read`、`/api/extensions/discover`、`/api/avatars/get`、`/api/characters/all`、`get` 与 `chats`、`/api/groups/all`、`/api/backgrounds/all` 与 `folders`、`/api/image-metadata/all`、`/api/chats/get` 与 `recent` |
| 写入 | `/api/settings/save`、`/api/chats/save`（含 integrity 校验）、`/api/characters/edit` 与 `merge-attributes`、`/api/themes/save`、`/api/presets/save`、`/api/quick-replies/save`、`/api/worldinfo/get` 与 `edit` |
| 生成 | `/api/backends/chat-completions/status`（连接与模型列表）、`generate`（流式与非流式），由 Replay 应答 |

样板 settings 固定以下取值：
- `tokenizer: 0`：避开 tokenizer 的同步 XHR 调用；
- `enable_accounts: false`：跳过账户逻辑；
- `auto_load_chat: true`：启动后自动打开聊天。
- `auto_connect: true`，Chat Completion 来源为 `custom`，`custom_url` 为从不被请求的 `http://replay.invalid/v1`：启动即连接 Replay，状态与生成都由 Session Backend 应答。

样板中的角色或预设带有酒馆助手脚本时，还要满足两点，否则一启动就会弹窗、产生写入，或与热应用同时重载：
- 预先在 `extension_settings.tavern_helper.script.enabled` 中启用它们；
- 酒馆助手的实时监听保持关闭（默认就是关闭的）。

未实现的端点返回 501。

端点语义与 ST 相同，只有一处有意的差异：ST 的 `/api/characters/chats` 在角色还没有聊天目录、以及内部出错时，都以 200 返回 `{ error: true }`。Session Backend 对"没有聊天目录"返回 `[]`，真正的错误才返回错误。ST 的客户端对 `[]` 与 `{ error: true }` 的处理相同（`getPastCharacterChats` 都得到空列表），ST vendor 看不出差别；Web Host 则可以只接受数组，不必在两种含义之间猜测。

## 3. Web Host 契约

Web Host 归 TauriTavern 所有。它在浏览器里实现 TT 的原生侧，即 `window.__TAURI__` 与 `__TAURITAVERN_HOST__`；TT 的应用代码感知不到它的存在。实现计划由 TauriTavern 仓库维护（T4）。

```js
import { installWebHost } from '/tauri/web-host/install.js';
const host = installWebHost({         // 返回 { emit, exit }
  identity: { platform, kind },   // 被模拟的真实平台
  backend: { handle(request) },   // ST 兼容后端：{ method, url, headers, body } → { status, headers, body }
  store: { load(), save(value) }, // Web Host 自己的持久状态：一份 Studio 不解读的 JSON 文档
});
```

- **范围**：只服务 Studio 的三条路径：启动到聊天、预览中的会话写入、Replay 生成。Web Host 不是 TT IPC 的完整实现，范围外的命令以 `Unsupported` 拒绝。某个 Studio 场景确实需要新命令时，先改本节，再由 TT 实现。
- **执行顺序**：必须在 `init.js` 之前执行。`init.js` 是 module 脚本，而注入在 Attach 之后的 module 脚本会按文档顺序先于它执行。
- **ST 数据走 ST HTTP API**，这是 TauriTavern 已承诺维护的上游兼容契约。Web Host 相当于 TT routes 的反向映射：把 TT IPC 转回 ST HTTP。
- **TT 私有数据只按命令契约保存。** 原生的磁盘布局是 Rust 仓储的内部实现，Web Host 不复刻它。范围内只有 TT 设置：
  - Web Host 把 `get_tauritavern_settings` 返回的 DTO 存进自己的文档，经 `store` 交给 Studio。Studio 随 Session 保存和重置这份文档，不解读其内容，所以重载不会丢失 TT 设置。
  - 默认值由 TT 从 Rust 的 `Default` 生成，读取时与已存的文档合并，TT 升级后新增的字段会自然补上。
  - `update_tauritavern_settings` 按原生语义逐字段合并：未提供的字段保持原值。
  - 系统扩展初始化所需读取由 Web Host 返回全新安装状态，工具声明确认接收；Agent 运行、MCP 操作与扩展私有数据写入以 `Unsupported` 拒绝。
- **平台身份**只取真实平台，不存在 `web` 这个平台。
- **调用方式**：Studio 直接调用 `backend.handle`，不走 fetch，以免被 TT 的拦截器拦回来形成回环。跨 realm 只传递可结构化克隆的数据。
- **同步返回**：`backend.handle`、`store.load()` 与 `store.save()` 都同步返回。Session 数据常驻内存，ST 接入应答同步 XHR 也依赖这一点；持久化由 Studio 在后台完成。Web Host 对外的 `invoke` 仍是异步的，由它自己包装成 Promise。范围内的请求体都能同步处理，带文件的上传与头像不在范围内。
- **表单**：角色编辑请求沿用 Session Backend 的纯数据表单 `{ kind: 'form', entries: [name, value][] }`，只含文本字段；不传跨 realm 的 `FormData` 或文件对象。
- **生成响应**：非流式生成返回 JSON 字符串；流式生成同步返回响应头，`body` 是 `ReadableStream<Uint8Array>`，承载标准 SSE 字节。Web Host 消费它并映射为 TT 的 `afterSeq` 事件；取消与关闭通过 reader 的 `cancel()` 传回 Replay。流是可转移对象：同源直接调用可返回该流，经结构化克隆转交时必须放入 transfer list。
- **错误响应**：非 2xx 响应的 `body` 必须是字符串，用于错误信息。
- **卸载**：`host.exit()` 走 TT 原生关闭窗口的流程，TT 保存完设置与聊天后它才完成；保存失败时页面保持打开，它也保持等待，再次调用即重试。Studio 移除 TT View 前先等待它，顺序见 [Architecture](Architecture.md) 的"View 的卸载"。

样板不携带 TT 设置。新 Session 里的 TT 设置就是 TauriTavern 全新安装时的设置，例如 Embedded Runtime 为 `auto`、ChatSurface 虚拟化关闭。作者在 TT 界面里切换这些设置，写入与 ST 设置一样进入 Session。

## 4. 酒馆助手

- JSR 不打包进 vendor 镜像，而是按固定版本从上游安装到 Snapshot 的 `extensions/JS-Slash-Runner/`，与在 ST 里安装扩展的方式一致。安装后离线缓存。
- 文件取自 jsDelivr 的 GitHub 镜像，逐个按 jsDelivr 公布的 SHA-256 校验。
- jsDelivr 拒绝超过 50 MB 的仓库，这类扩展（如 LittleWhiteBox）改从本地文件夹安装，与本地文件夹模式用同一套机制（[Architecture §6](Architecture.md#6-项目)）。
- JSR 的 blob URL 模式不受支持：Chromium 中 blob: iframe 不受 Preview SW 控制。默认的 srcdoc 模式不受影响。
- JSR 使用 PolyForm Noncommercial 许可，Studio 保留其许可声明，不把它的代码并入 Studio。

## 5. 升级

1. ST 或 TT 发布新版本后，构建新镜像并生成解剖图。
2. 与上一版本的解剖图对比，差异就是影响面，可能涉及注入锚点、Session Backend 端点、主题控件 id、ST 接入。
3. 修正受影响的部分，跑预览冒烟测试，然后发布镜像。旧镜像保留若干个版本，供已固定版本的项目使用。
