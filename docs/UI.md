# 界面与动效

Studio 的外壳要美观、克制、快。外壳是作者工作的框架，不是主角：预览里显示的是作者的主题，外壳不与它争色。

设计前先查 [References](References.md#界面与动效) 里的实现。本文记录采纳的结果，是界面规则的唯一依据。第三方的设计 Skill 不直接安装，采纳的规则写进本文。

## 1. 布局

- **宽屏**（≥ 768px）：左侧 Agent 栏，右侧工作台。两者是浮在底色上的圆角面板，相隔 8px。Agent 是主要的编写者，所以放在最先看到的位置；这与 v0、Lovable 的布局一致。
- **Agent 栏**默认 380px，可以在 320px 到一半宽度之间拖动，也可以收起。窗口缩放时它保持像素宽度，工作台吸收变化。
- **工作台**有预览和代码两个标签。两个面板都保持挂载：切换视图不会销毁正在运行的预览和编辑器状态。
- **预览舞台**：设备框保持设备的视口尺寸，只整体缩放以放进舞台，从不放大；下方标注设备、尺寸和缩放比例。
- **窄屏**：一次显示一个面板（Agent、预览、代码），由底部的分段控件切换，隐藏的面板保持挂载。窄屏默认预览移动设备。

## 2. 组件

- 组件层是 shadcn（Base UI 版）与 Tailwind v4。组件源码复制进仓库，归 Studio 所有，可以按本文改写；不以 npm 包的形式依赖组件库。
- 取用顺序：shadcn 官方组件 → Fluid Functionalism（Base UI 版）→ beUI。
- Beautiful UI 只作为 Agent 界面的交互参考：Thinking、Streaming Text、Tool Chips、Approval Card、Task Rows、Diff Table、Code Block、Agent Screen。
- Animate UI 采用 MIT + Commons Clause，与 AGPL 不兼容：只参考做法，不复制代码。
- 引入组件时：动效改写为 §4 的档位，数值换成 §3 的 token，并在文件头注明来源与许可。
- 组件的 `className` 只用于布局，视觉差异写成变体。因此不需要 tailwind-merge。
- 禁用的按钮保持可聚焦，用 tooltip 说明为什么不可用。
- 选择类控件共用一种外观：凹陷的轨道和滑动的滑块。切换面板内容的用 Tabs，从几个选项里选一个的用 SegmentedControl（单选组）。
- Transcript 的结构先参考 TT 应用内助手：React 组件，宿主能力经 `actions` 注入。
- Fluid Functionalism 与 beUI 的组件依赖 Motion，取用时把动效改写为 §4 的 CSS 档位。
- 不引入 cmdk 与 `@shadcn/react`：前者带 Radix 原语，后者把组件逻辑放进了 npm 包。
- 文件树用 headless-tree（MIT）加自绘的行；diff 用 `@codemirror/merge`（MIT）。

## 3. 视觉 token

起点取自 Fluid Functionalism。token 全部定义在 Tailwind v4 的 `@theme` 中，Tailwind 的默认色板与刻度已移除，组件里不写裸值。

| 项 | 规则 |
|---|---|
| 密度 | 两档：默认 36px，紧凑 28px。按钮、输入框、选择器与列表行同高，弹出列表的行与触发器对齐。密度按区域设定（`data-density`）：面板标题栏、文件树、编辑器工具栏和检查器用紧凑档 |
| 字体 | 拉丁字符用 Inter 可变字体（自托管，按 `unicode-range` 只下载用到的子集）；中文回落到系统字体；代码用系统等宽字体栈。字号按用途分六个角色（display、title、subtitle、body、caption、micro），不按大小挑。Transcript 与 Markdown 的字号行高在 P1a 实测 14/22 与 13/20 后定稿；中文段落行高不低于 1.6 |
| 可编辑字段 | 触屏设备上不小于 16px，避免 iOS Safari 聚焦时缩放页面 |
| 文字颜色 | 只有 foreground 与 muted 两种。红色只表示错误。不用透明度区分层级 |
| 强调色 | 琥珀色，只用于焦点与主要操作，其余一律用带一点暖意的中性灰阶 |
| 表面 | 由后到前：底色、凹陷、面板、浮层。浅色模式靠阴影区分层级，深色模式靠逐级变亮 |
| 圆角 | 同心：内圆角 = 外圆角 − 内边距 − 边框 |
| 流式文本 | 不用 `text-wrap: balance` 或 `pretty`，避免已输出的行重新折行。静态的说明文字可以用 `pretty` 避免孤字 |
| diff | `--color-diff-add`、`--color-diff-del` 两组底色与前景色，低彩度，与 danger 区分开。+/− 符号与删除线同时出现，不只靠颜色 |
| 语法高亮 | 高亮 token 定义在 `@theme` 中，深浅色各一套。CodeMirror 主题直接引用 CSS 变量 |
| 状态 | 运行中、已取消、失败、interrupted 四种状态只用 foreground、muted、danger 三种颜色，并配上图标和文字 |
| 预览上的标记 | Studio 画在预览上的标记用强调色，例如 Agent 光标、检查器的选框。作者的主题可能正被改坏，标记不能依赖它 |

深浅色跟随系统，也可以手动切换：
- 手动设置存在 IndexedDB 里，外壳读到设置后才首次渲染。
- 切换的瞬间冻结所有过渡，避免逐个元素出现颜色渐变。

## 4. 动效

动效用来传达状态变化，不作装饰。高频使用的界面保持克制。

| 档位 | 进入 | 退出 | 用于 |
|---|---|---|---|
| fast | 80ms | 60ms | hover、淡入淡出、tooltip、焦点环 |
| moderate | 160ms，临界阻尼，无回弹 | 120ms | 下拉、标签页、抽屉、短距离位移 |
| slow | 240ms，轻微回弹 | 160ms | 对话框、大面板 |

- 越大的东西动得越慢。组件只引用档位，不写具体时长。
- 退出比进入快一档，用 ease-out 补间，不用弹簧。
- 只动 `transform` 与 `opacity`，不动 `top`、`left`、`width`、`height`。
  - 原因：前两者由合成线程完成，不触发重新布局和绘制。
  - 这在 Studio 里尤其要紧：预览与 Studio 同源，共用一个主线程，vendor 繁忙时，这类动画仍然流畅。
- 折叠：
  - 高度瞬间变化；
  - 内容用透明度动画（可以加 −4px 的位移），moderate 档进入、fast 档退出；
  - Transcript 和文件树里不对高度做动画。
- 循环动画只有 spin 与 indeterminate 两种。不用 shimmer，因为它动的是 `background-position`。
- 图标交换：两个图标放在同一格，进入用完整档，离开用退出档。
- 动画可以中途打断，并从当前状态平滑返回。
- 键盘导航不加动画。
- 用户开启"减少动态效果"时：
  - 去掉位移、缩放和布局动画；
  - 保留透明度与颜色渐变；
  - indeterminate 停止，spin 放慢。
  
  动效变少、变轻，但不是完全没有。
- 动效不触及预览 iframe。iframe 里是 vendor 的完整布局，对它做尺寸动画会让 vendor 逐帧重排。切换 Device 本来就会重载 View。

**实现**：默认用 CSS。
- 每个档位是一个工具类（`motion-fast`、`motion-moderate`、`motion-slow`），提供时长与缓动，并让退出自动快一档；组件只声明要过渡的属性。浮层的出现与消失用 `motion-popup`，从锚点缩放淡入。
- Base UI 用 `data-starting-style` / `data-ending-style` 驱动 CSS 过渡，进入、退出和中途取消都由它处理。
- 弹簧曲线用 CSS `linear()` 表达，由 `apps/studio/scripts/springs.mjs` 生成。
- 参考库大多基于 Motion，复制它们的组件时，把动效改写为 CSS 档位。
- 出现 CSS 做不到的需求（手势驱动、需要速度连续的拖拽）时，再引入 Motion 并按需加载，同时记入 [Decisions](Decisions.md)。

## 5. 交互

- **列表高亮**（文件树、命令面板、菜单）：只有一个高亮块，随指针移动。指针在某一项内，就高亮这一项；否则高亮最近的一项。点击落在空隙里时，交给高亮项处理：高亮的就是点击会命中的。以下列表不用这种高亮：误点代价高的、只有部分项可点的、内容会自行移动的（例如实时日志）。
- **焦点**：焦点环只在 `:focus-visible` 时显示。菜单和命令面板以高亮行作为焦点指示。组合框的输入框保持 DOM 焦点，用 `aria-activedescendant` 指向当前行。
- **滚动条**：触屏设备用原生滚动。桌面用细滚动条。
- **只在 hover 时出现的操作**：在触屏和键盘焦点下也必须可见。
- **破坏性操作**：
  - 不用红色，因为红色只表示错误；
  - 按钮写明动作，例如"回滚到此处""丢弃"；
  - 经 AlertDialog 确认，确认框列出会受影响的内容。
- **加载**：
  - 短于 300 ms 的加载不显示提示；
  - 内容形状已知时，用静态骨架；
  - 时长未知时，用 indeterminate 细线。
- **空状态**写明下一步该做什么。
- **错误**：
  - 在原处显示原文，并提供重试；
  - 需要用户处理的错误，不用会自动消失的 toast。
- **编辑器的文件标签**：
  - 标签可关闭、会溢出，所以不用凹陷轨道加滑块的样式；
  - 当前标签与内容区使用同一种表面色，连成一体；
  - 脏点与关闭按钮在同一格里交换；
  - 溢出时横向滚动。
- **输入法**：中文输入法组字期间，按 Enter 不发送。
