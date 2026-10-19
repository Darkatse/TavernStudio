# Tavern Studio Workspace Guidelines

## 道：项目哲学

沿用 TauriTavern 的[项目哲学](https://github.com/Darkatse/TauriTavern/blob/main/CONTRIBUTING.md#项目哲学)：通用大于特判，从第一性原理出发，fail fast，可维护性优先，KISS 与 60/95，简洁与优雅，遵循但不拘泥。同一种事情只走一条路。

Studio 在此之上强调两点：

1. **先参考，后设计。** 设计任何机制之前，先查 [docs/References.md](docs/References.md) 里的已有实现怎样解决同一问题，读代码，必要时实测。能沿用就沿用并注明出处；不沿用时在 [docs/Decisions.md](docs/Decisions.md) 写明理由。
2. **为道日损。** 代码越多，缺陷越多。新增概念、机制或依赖需要现实问题和证据支撑；已有机制或真实 vendor 能给出答案时，不另造一套。

## 文档优先

动手前先读 [docs/README.md](docs/README.md) 列出的相关文档：概念与不变式在 Architecture，界面规则在 UI，已做的取舍在 Decisions。新事实推翻旧判断时，同一次改动里修改文档。

## 术：工程实践

- **框架边界**：只有 `apps/studio` 的外壳使用 React。进入 vendor 页面的代码、Preview SW 和 `packages/*` 不依赖框架（Architecture §8）。
- **界面**：只使用 [docs/UI.md](docs/UI.md) 的 token 与动效档位，不写裸值。组件的 `className` 只用于布局，视觉差异写成变体。界面改动要在浏览器里看过亮色、暗色和窄屏。
- **命名**：同一概念只用一个名字，贯穿代码、界面文案和文档，与 Architecture §2 的概念表一致。文件名用 kebab-case。
- **错误**：约束失效时带上下文抛错，不猜测默认值。未实现的端点返回 501，未实现的 TT 命令以 `Unsupported` 拒绝。
- **存储**：Studio 不使用 localStorage 和 sessionStorage（Architecture §7）。
- **依赖**：新增依赖前先确认现有依赖和平台能力不够用，并核对许可。
- **注释**：注释是易失性的，实现与架构是非易失性的。行为由代码和类型表达，概念与取舍写进 docs；注释只写代码表达不了的非平凡不变式：
  - 为什么必须这样：时序与并发、跨 realm、浏览器或 vendor 的行为事实，以及看起来多余、删掉就会出错的步骤；
  - 代码之外的约束：外部契约、单位与编码、信任边界。
  
  不复述代码或名字，不写历史、实测数据、任务过程、计划与文档章节的引用，不保留注释掉的代码。许可与出处声明、工具指令（`oxlint-disable`、`webpackIgnore` 等）照常保留。改代码时，同一次改动里删改失效的注释。
- **测试准入**：只为可观察的稳定行为、非平凡的不变式或边界，以及已经发生并修复的缺陷写测试。不测字面量、显然的控制流、直接委托和实现细节，不提前添加回归测试。
- **收尾**：`pnpm run check` 通过只是行为核对。逐路径自审概念、职责、状态归属和数据链路，确认维护者不必理解多余的路径。

## 仓库级 Skill

`.agents/skills/` 是唯一来源，`.claude/skills` 是指向它的软链接。`conceptual-integrity` 复制自 [Darkatse/conceptual-integrity](https://github.com/Darkatse/conceptual-integrity)，保持原样；涉及架构规划、统一机制或审阅时使用它。
