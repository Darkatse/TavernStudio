# 性能

> 状态：后续功能设计稿　日期：2026-10-18

酒馆前端的性能问题有两层：vendor 自身的实现，以及作者自由叠加的内容。后者更严重：一个看似普通的页面里，可能同时运行着十几到几十个 iframe，CPU 和内存随楼层数一起膨胀。移动端尤其危险：可用内存不足时，Android 的 kswapd 持续回收内存并占满 CPU，界面随之卡顿，最后渲染进程被系统杀死；iOS 没有 swap，WebContent 进程会直接被终止。

vendor 的问题由 TauriTavern 的运行时治理负责（Embedded Runtime、ChatSurface），作者的自由度也不应受限。本功能只做一件事：**让代价可见**。作者在编写时看到自己的产物乘以楼层数之后的代价，用户在真机上看到是谁占用了资源。

## 1. 原则

1. **vendor 行为和生态的隐含契约是既定事实。** 不建议修改，也不报告。例如：消息里的 `<style>` 匹配所有楼层，JSR 给每个 iframe 注入的预置库，ST 对所有元素设置的 `text-shadow`。
2. **只对能选择的写法给建议。** 成本必须能归属到项目文件或具体的 realm，vendor 基线不出现在建议里。
3. **数量优先于耗时。** 次数、个数和字节数与机器无关；耗时只在同一次运行内作相对参考。
4. **空闲优先。** 用户不操作时，任何主线程活动都是浪费。基线接近 0，结果不受噪声和机器快慢影响。
5. **测不到就说测不到。** 浏览器不提供的信号显示为"不提供"；估算值标为估算，不冒充测得值。

## 2. 组成

| 部分 | 内容 | 位置 |
|---|---|---|
| Skill 性能约束 | 各类产物的省资源写法，见 §6 | 各产物 Skill 的性能一节 |
| 长聊天样板 | 200 楼，每楼都带卡片 | `fixtures/` |
| 探针 | 在被观察页面的各个 realm 里采集，见 §3、§4 | `@tauritavern/app-use` |
| 性能面板 | 探针结果加 Skill 建议，见 §5 | Studio |
| 宿主内存信号 | 系统内存压力、渲染进程被杀 | TauriTavern 原生层，经 `tauri-bridge.js` |

## 3. 探针

### 3.1 安装

- 探针属于 app-use 引擎，与引擎一样运行在被观察页面的 realm 里，只在测量期间启用。
- 启用后观察 iframe 插入，在插入后的微任务里给 iframe 初始的 `about:blank` 窗口安装探针。HTML 规范要求首次同源导航沿用这个窗口，所以探针会保留到卡片文档里，卡片脚本注册的定时器、监听器和 rAF 全部可见。嵌入式 Chromium 152 实测，srcdoc 与 blob 两种 iframe 都成立。
- 探针只包装、透传调用，不改变语义。
- 探针只通过 `WeakRef` / `FinalizationRegistry` 引用 realm，自身不得延长 realm 的寿命。
- realm 的身份取 iframe 的 id。JSR 为 `TH-message--<mesid>--<idx>` 和 `TH-script--<name>--<id>`；扩展代码按模块 URL 归属，经 Mount 映射到项目文件。

### 3.2 采集

| 类别 | 信号 | 浏览器 |
|---|---|---|
| 调度 | rAF、定时器、事件监听、observer 的注册数、注销数和每秒触发次数 | 全部 |
| 耗时 | 每次回调的执行时间，由包装在回调前后取时得到 | 全部 |
| 动画 | `getAnimations()` 里无限运行的动画、它们修改的属性、是否响应 reduced-motion | 全部 |
| 内存 | 见 §4 | — |
| 卡顿归因 | Long Tasks 的 `attribution[].containerId` 指出哪个 iframe；LoAF 的 `scripts[].window` 指出哪个 realm、哪个函数 | Chromium |

卡顿归因的实测结论：
- 同源 iframe 与页面共用主线程，卡片里的阻塞直接体现在页面的 rAF 间隔中。
- Long Tasks 把 50 ms 以上的任务全部归到了正确的 iframe，srcdoc 也一样。
- LoAF 只记录 50 ms 以上的帧和 5 ms 以上的脚本。srcdoc 里定义的回调可能丢失脚本条目，此时 Long Tasks 仍然可以定位 iframe。未触发渲染的长帧只进入 iframe 自己的时间线，所以每个 realm 都要挂观察器。

### 3.3 测量场景

- **Studio**：测量就是运行一个 Scene。Scene 从重载开始，所以探针先于所有 iframe 就位。空闲测量是打开长聊天样板后静置一段时间。
- **应用内助手**：用户在聊天中途发起测量时，iframe 已经存在，其中先前注册的定时器和监听器不可见。需要完整数据时，先重建聊天投影（ChatSurface 重新挂载，或 Embedded Runtime 冷恢复），并事先告诉用户。
- **对照实验**：CSS 渲染成本无法归到某个 realm，只能在同一个 Scene 里比较有无某个产物。只用于报告。

## 4. 内存

### 4.1 页面整体

| 信号 | 来源 | 可用范围 |
|---|---|---|
| 系统可用内存、低内存阈值、是否处于低内存 | Android `ActivityManager.MemoryInfo`；iOS 可用内存与内存警告 | TauriTavern |
| 渲染进程被杀 | Android `onRenderProcessGone`；iOS WebContent 进程终止 | TauriTavern |
| JS 堆 | `performance.memory` | Chromium。桌面精确（实测）；Android WebView 分桶、约 20 分钟更新一次（源码结论，待实测）；WebKit 不提供 |
| 结构账本 | 各 realm 之和，见 §4.2 | 全部 |

- 移动端的渲染进程运行在独立进程里，宿主读不到它的内存，但能读到系统的内存压力。kswapd 卡顿就发生在这个层面，所以宿主信号是移动端整体内存的唯一可靠来源。
- 探针启用期间，定期把结构账本交给宿主。渲染进程被杀后，宿主保留最后一份账本，下次启动时可以回答"白屏前页面上有什么"。
- Studio 与预览共用一个 JS 堆，以加载预览前的读数作为基线。

### 4.2 每个 iframe

不跨源隔离时，没有现成 API 能给出单个 realm 的内存。按以下四项组合：

1. **结构账本**：全部浏览器可用，都是确定值。
   - DOM 节点数。
   - 图像解码字节：`<img>` 和 CSS 背景图按 `naturalWidth × naturalHeight × 4` 计算，canvas 按 `width × height × 4` 计算。实测一个 2048² 的 canvas 为 16 MB。
   - video 元素数、样式表规则数。
   - realm 内载入的脚本体积，取自该 realm 的 Resource Timing。
2. **泄漏**：iframe 移除后，用 `FinalizationRegistry` 观察它的 realm 是否被回收。
   - 实测：没有外部引用的 realm 约 30 秒后被回收；父页面持有它的一个函数时一直存活，释放引用后随下一次 GC 被回收。
   - GC 由内存分配驱动，时机不可控，所以结果标为"疑似泄漏：已移除 N 秒，期间有其他 realm 被回收"。Studio 的 Scene 可以主动施加分配压力。
3. **堆增量标定**：在 Studio 里用桌面 Chromium 完成。
   - 在 Scene 中记录每个 realm 创建前后的 JS 堆差值，多次运行取中位数，得到"一个 JSR 卡片 realm 约多少 MB"之类的标定值，写入知识包。
   - TauriTavern 在真机上用"realm 数 × 标定值 + 结构账本"给出估算，并标为估算。
4. **精确分解**：候选方案，不默认启用。
   - `performance.measureUserAgentSpecificMemory()` 能按 iframe（container id）拆分内存，但要求跨源隔离，而且只在 Chrome 本体中提供。
   - 在嵌入式 Chromium 152 中，即使已经跨源隔离，调用也会报 `SecurityError`（实测），TauriTavern 使用的 WebView 预计同样不可用。
   - Studio 若要采用，需要一个由 SW 注入 COOP 和 `COEP: credentialless` 的显式测量模式。这个模式下卡片里的跨源 iframe 会被拦截，还要修订 [Decisions](Decisions.md) 中"不做跨源隔离"一条。先确认 Chrome 中可用，再做决定。

## 5. 呈现

- **性能面板**：按楼层和 realm 列出探针数据，并按可见楼层数折算，例如"200 楼时约 200 个 iframe，约 X MB"。每一项附上 Skill 中对应的建议。
- **同一份结果**：面板、Studio 的 `inspect.audit` 性能类别，以及应用内助手的 app 工具，读的是同一份测量结果。
- **建议的对象**：Studio 面向作者，说明怎么写更省；应用内助手面向用户，说明该调哪些设置，例如 JSR 渲染深度、ChatSurface 虚拟化、Embedded Runtime 档位。

## 6. Skill 性能约束（草案）

只收录作者能选择、且不触碰隐含契约的写法。标"待实测"的条目，在 Studio 中验证后才写入 Skill。

**通用**
- 每楼都执行的东西，成本要乘以可见楼层数。ST 默认显示最近 100 楼（`chat_truncation`）。

**主题**
- 尊重用户的性能开关：`body.no-blur`（No Blur 默认开启）、`body.noShadows`、`body.reduced-motion`。不要用 `!important` 把模糊或阴影加回来。核心 CSS 没有使用 `.reduced-motion`，所以主题里的无限动画要自己在这个类和 `prefers-reduced-motion` 下停止。
- 模糊和阴影加在容器上，不要加在 `.mes`、`.mes_text` 这类每楼都有的元素上。动画只改 `transform` 和 `opacity`。

**正则美化**
- 非 markdownOnly 的 AI 输出正则在流式期间每个刷新周期都会对全文重跑；markdownOnly 正则在每条消息每次渲染时都会运行，结果不缓存。要避免灾难性回溯，用明确的字面量锚定模式，并用 `minDepth` / `maxDepth` 缩小范围。
- 共用样式不要每楼都输出一份，否则 N 楼就有 N 份规则，每份都匹配全部消息。用酒馆助手的角色脚本注入一次（待实测）。

**前端卡**
- 每个前端块是一个 iframe，每个 iframe 都要重新执行一遍预置库。作者能控制的是"前端块数 × 楼层数"：需要交互的界面只在最新楼层输出，历史楼层输出静态 HTML。这一点在打开聊天时生效；本次会话中已经渲染出的旧楼层，要等重新渲染才会释放。
- 图片按显示尺寸提供。解码后的内存是"宽 × 高 × 4"，每楼一份。canvas 不用时释放。
- 只改数据时，`setChatMessages` 传 `refresh: 'none'`。默认的 `'affected'` 会重建这一楼的所有 iframe。
- 卡片内部避免频繁增删节点或修改 class。Tailwind 运行时监听整个文档，每次这类变化都会重建 CSS。
- 热路径里先把 `SillyTavern` 存到局部变量，因为每次读取都会调用 `getContext()` 并展开对象。少用 `console.*`，日志会进入父页面一个没有上限的 Map。
- 高度用 `min-height: Nvh`，不要用 `height: Nvh`（待实测）。

**扩展与脚本**
- `STREAM_TOKEN_RECEIVED` 每个分片都触发，平滑流式下每个字符触发一次，不节流，且每次都带全文，监听器依次 await。不要在这里处理全文；需要最终结果的逻辑放到 `MESSAGE_RECEIVED` 或 `CHARACTER_MESSAGE_RENDERED`。
- 不要把大数据放进 `extension_settings`。任何一项设置变化，都会把整个 settings 序列化后保存。
- 主文档的每次 DOM 变化都会触发核心的多个文档级 MutationObserver。更新要批量做，避免高频修改主文档。
- 切换聊天或卸载时，释放自己创建的监听器、observer 和计时器。酒馆助手脚本用 `eventOn` 注册；直接挂在父页面上的监听器和计时器不会被自动清理。
- 不要让父页面持有 iframe 里的函数或对象，否则 iframe 移除后整个 realm 都无法回收。

## 7. 不做

- CPU 降速和真机模拟：需要 CDP，纯前端做不到。
- 跑分和排行榜。
- 因性能问题阻止导出。
- 采样 profiler：JS Self-Profiling 只有 Chromium 提供，且只覆盖以独立文件加载的代码。等有需求时再考虑。

## 8. 分期与待验证

| 阶段 | 内容 |
|---|---|
| 随 P1 | Skill 性能约束、长聊天样板 |
| T3 之后 | 探针进入 app-use；宿主内存信号 |
| 随 P2 Scene | Studio 性能面板、`inspect.audit` 性能类别、堆增量标定 |
| 之后 | 应用内助手接入 |

待验证：
- Firefox、Safari、WebKitGTK 是否同样沿用初始窗口，探针能否先于卡片脚本就位；
- Chrome 本体中 `measureUserAgentSpecificMemory()` 能否按 srcdoc iframe 拆分；
- Android WebView 中 `performance.memory` 的实际精度；
- Android 上 `onTrimMemory` 前台等级是否仍会下发，还是只能轮询 `MemoryInfo`；
- §6 中标"待实测"的条目。

## 9. 与 TauriTavern 的关系

- 探针随 `@tauritavern/app-use` 由 TauriTavern 发布，Studio 与应用内助手共用。
- 宿主内存信号是新的原生能力，前端只经 `tauri-bridge.js` 读取。Web Host 对它以 `Unsupported` 拒绝。
- 现有性能 HUD（`src/tauri/main/perf/perf-hud.js`）可以改为探针数据的一个视图，只保留 Tauri IPC 调用统计这一项 TauriTavern 独有的数据。
- 宿主内存信号以后也可以作为 Embedded Runtime 驻留预算的输入。
