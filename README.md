# Tavern Studio（暂名）

面向 SillyTavern 生态作者的纯前端工作台。主题、扩展、酒馆助手脚本、前端卡与正则美化，都在真实的 SillyTavern / TauriTavern 前端里所见即所得地编写和预览。内置的 Agent 能改文件、看页面、操作界面。

> 状态：S0 已完成，即仓库骨架与界面基础。下一步是 P0 运行时验证，见 [docs/plan](docs/plan/README.md)。

## 开发

需要 Node 24 以上与 pnpm 11。

```bash
pnpm install
```

```bash
pnpm dev
```

```bash
pnpm run check
```

`pnpm dev` 在 <http://localhost:3000> 启动 Studio。`pnpm run check` 是唯一的检查入口，依次运行类型检查、lint、格式检查与构建；第一个测试落地时加入测试。

## 文档

从 [docs/README.md](docs/README.md) 开始。参与开发前先读 [AGENTS.md](AGENTS.md)。

## 许可

AGPL-3.0-only。Studio 永久非商业：知识包会收录 PolyForm Noncommercial 许可的内容（例如酒馆助手的文档与类型），分发时需要遵守其条款，详见 [docs/Knowledge.md](docs/Knowledge.md#4-许可)。
