# Tavern Studio（暂名）

> 状态：S0 已完成　日期：2026-10-18　TauriTavern 基线：`dev` 2bd2c302

Tavern Studio 是面向 SillyTavern 生态作者的纯前端工作台。主题、扩展、酒馆助手脚本、前端卡与正则美化，都在真实的 SillyTavern / TauriTavern 前端里所见即所得地编写和预览。内置的 Agent 能改文件、看页面、操作界面。

## 文档

| 文档 | 内容 |
|---|---|
| [Architecture](Architecture.md) | 概念、不变式、运行时、编辑与预览、项目、存储、技术栈、部署与安全 |
| [UI](UI.md) | 界面与动效：布局、组件来源、视觉 token、动效档位、交互规则 |
| [Agent](Agent.md) | 运行模型、模型接入、工具、视觉、体验、安全 |
| [Knowledge](Knowledge.md) | Vendor 解剖图、Skill、知识包、检索、许可、记忆 |
| [Vendors](Vendors.md) | Vendor 镜像、Session Backend、Web Host 契约、酒馆助手、升级 |
| [Performance](Performance.md) | 后续功能：性能原则、探针、内存、Skill 性能约束 |
| [References](References.md) | 参考实现：设计前先查的已有项目 |
| [Decisions](Decisions.md) | 关键取舍与放弃的方案 |
| [plan/](plan/README.md) | 当前推进计划 |

架构文档描述目标行为，与实现不一致时，要么改实现，要么在同一次改动里改文档。`plan/` 下的计划完成后即删除，过程中出现的架构变化回写到上面的文档。

## 原则

沿用 TauriTavern 的[项目哲学](https://github.com/Darkatse/TauriTavern/blob/main/CONTRIBUTING.md#项目哲学)与 conceptual-integrity：同一种事情只走一条路。在此之上强调两点：

1. **先参考，后设计。** 设计任何机制之前，先查 [References](References.md) 里的已有实现怎样解决同一问题，读代码，必要时实测。能沿用就沿用并注明出处；不沿用时在 [Decisions](Decisions.md) 写明理由。生态已有的约定优先于 Studio 自定。
2. **为道日损。** 代码越多，缺陷越多。新增概念或机制需要现实问题和证据支撑；已有机制或真实 vendor 能给出答案时，不另造一套。

Studio 自己的不变式见 [Architecture §3](Architecture.md#3-不变式)。

## 已定事项

- 许可：AGPL-3.0，永久非商业。
- 模型：只做 BYOK。
- 访问：不考虑中国大陆可达性。
- 生成：不接真实模型；需要回复时，用 Replay 回放预设内容。
- 编辑器：CodeMirror 6，浏览器里不运行 TypeScript。
- 打磨重点：Agent 体验与界面美观。
