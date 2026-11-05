# DrawPhy 模块化框架设计（评审稿 v1）

> 目标：把 DrawPhy 改造成「一个绘图部件 + 它的绘图逻辑/算法 = 一个独立小模块」的可注册架构；模块需要显示在主页时，通过全局 Registry 注册到主页，后续新增部件不动核心代码。
>
> 本轮边界：**只做调研与框架设计，不重构/修改任何现有源码，不改变现有 ribbon UI 菜单与 CSS 样式**。所有落地动作在框架评审通过后按第 6 章分阶段执行。
>
> 日期：2026-11-05。配套调研材料：
> - 开源架构调研：`…/agents/s_0003e6eLGoT/artifacts/oss-architecture.md`
> - 现有源码分析：`…/agents/s_0003e6euuZ0/drawphy-current-state.md`
> - 绘图算法调研：`…/agents/s_0003e6eABdo/artifacts/drawing-algorithms.md`

---

## 0. 硬约束（任何设计决策的前提）

| # | 约束 | 含义 |
|---|---|---|
| 1 | 零第三方依赖 | 不 npm install、不 import 外部包，不引入 React/Vue 等框架 |
| 2 | 纯静态、无构建 | 没有 webpack/vite/tsc；产物就是 `.html/.js/.css`，双击即用 |
| 3 | file:// 可用 | 不能依赖 `fetch()` 读本地文件；ES module 跨文件 import 在 file:// 下被 CORS 拦截（实测见 5.1） |
| 4 | 原生 SVG 渲染 | 不重写为 Canvas；现有数据模型继续以 SVG 元素为输出目标 |
| 5 | UI 外观不变 | ribbon 的 DOM 结构契约与 CSS class 保持，行为可从「静态写死」改为「Registry 动态生成」，但生成结果视觉一致 |

---

## 1. 现状诊断

### 1.1 事实清单（已逐个计数，不采信注释）

- **部件 114 个、11 个分类**（`src/parts.js`，逐个 `mk()` 实测）：

| 分类 | 数量 | 分类 | 数量 | 分类 | 数量 |
|---|---|---|---|---|---|
| 电学 | 30 | 光学 | 15 | 力学 | 20 |
| 通用 | 12 | 常用图形 | 8 | 热学 | 6 |
| 仪器 | 6 | 连接线 | 5 | 化学键 | 5 |
| 环类 | 4 | 尺寸 | 3 | | |

  注意：温度计写在 parts.js「热学」注释块下（parts.js:237），实际注册 `cat` 是「仪器」（parts.js:238）。

- **绘图工具 23 个**（`src/ui.js:18-42` 的 TOOLS 数组），按分组：shape 15 个、text 5 个、edit 3 个。
- 运行时对象实际出现 **15 种 type**：`line, arrow, polyline, circle, ellipse, arc, rect, point, text, textbox, callout, dim, angle, path, part`。
- 加载方式：6 个 IIFE 文件经普通 `<script>` 按序加载（index.html:174-179），全部挂在全局 `window.DP` 命名空间；状态集中在 `DP.state`；历史是 `JSON.stringify({objects, groups})` 整文档快照（core.js:538-540），栈上限 80。

### 1.2 核心架构问题：类型行为散落在 8~11 处 switch

当前每新增一个图形类型，必须手工登记的位置（行号见源码分析报告 §2）：

| # | 位置 | 职责 |
|---|---|---|
| 1 | core.js `M.localBBox`（151-213） | 包围盒 |
| 2-4 | core.js `translateObj / scaleObj / mirrorObj`（277 / 290 / 327） | 三种变换 |
| 5 | core.js `S.collectPoints`（352-410） | 吸附锚点 |
| 6-7 | render.js `R.primitive / R.object`（92 / 142） | SVG 渲染 |
| 8 | ui.js `hitObject`（610-663） | 命中检测 |
| 9-10 | ui.js `getNodes / setNode`（673 / 704） | 节点手柄 |
| 11 | ui.js `onDown/onMove/onUp` 大 if 链（790 起） | 绘制交互 |

纯过程式 type 分发、无 per-type handler 注册表，违反开闭原则。此外存在**依赖方向倒置**：core.js 反向依赖 `DP.parts.byId`（core.js:134、204），render.js 默认值反向依赖 `DP.state.style`（render.js:143），全局命名空间下形成隐式循环依赖。

### 1.3 现存缺陷（精炼版，全部带代码依据）

**P0 — 漏登记导致的「半死对象」（框架迁移第一批就要修）**

1. **arrow 在三个变换表里漏登记**：`translateObj/scaleObj/mirrorObj`（core.js:279/295/333）只有 `case 'line'`，没有 arrow 分支。箭头能被点选（hitObject:613-615 含 arrow），但**无法拖动移动、方向键微调、对齐、镜像、手柄缩放**。示例图里的三个力箭头即受影响。（已核对 onMove:1244-1247 确实走 translateObj。）
2. **hitObject 缺 textbox / callout / path 三个分支**（ui.js:610-663，default 返回 false）：文本框、标注、贝塞尔曲线画完后**无法点选、无法橡皮删除、双击编辑入口（ui.js:1438）也因命中落空而失效**。
3. **localBBox 缺 path 分支**（core.js:211-212 默认 0×0）：贝塞尔曲线包围盒退化为原点一点，框选与选中框全部失真。
4. **collectPoints 不覆盖 dim/angle/textbox/callout/path**（core.js:360-407）：这些对象不产生任何吸附锚点。

**P1 — 算法与代码质量问题**

5. `mirrorObj` 的 arc 分支是坏代码（core.js:337-338）：337 行三元两边都是 `o.a0` 自赋值死代码；338 行第二句使用刚改写的值，结果错误；水平镜像根本不改角度，作者自留注释「// 近似」。
6. 徒手 RDP 容差固定 1.6 世界单位（ui.js:1609）、采样步距固定 1.2（ui.js:1147），不随缩放 k/笔速调整：放大 4 倍时容差仅 0.4px 抽稀过度，缩小时等效 6px 细节糊掉。
7. 徒手只抽稀、不做曲线平滑（无贝塞尔拟合），输出是硬折线。
8. 贝塞尔只有二次 Q（ui.js:1010），无三次 C、无多段连续曲线、创建后无控制柄。
9. 函数图像固定 240 点、x 固定区间 [-10,10]（ui.js:1555-1556），平段浪费、陡段不够密，输出本质是折线而非矢量曲线。
10. 箭头头尺寸与线宽强耦合：`Math.max(8, width*4.2)`（render.js:135），无独立箭头大小设置。
11. 修剪 doTrim 仅支持直线（ui.js:1657/1659），折线/圆/弧不可剪。
12. 历史是整文档全量快照，对象一多每步撤销都全量序列化+解析。
13. 普通图元无任意角度自由旋转，全矩阵能力（core.js:114-148）目前只有 part 在用；scaleObj 还会把 circle 就地偷偷改写为 ellipse（core.js:299），类型身份不稳定。
14. 字段命名不一致：text 渲染读 `o.rotate`（render.js:56），U.rotate 写的是 `o.rot`（ui.js:1958），文字点旋转+90° 视觉上不转。
15. 右键菜单「水平镜像」对所有对象直接写 `o.flip`（ui.js:332-336），但 flip 只在 partMatrix 生效，对普通图元是空操作，与 ribbon 行为不一致。
16. `onWheel` 死条件（ui.js:1712）：`if (e.ctrlKey || e.metaKey || true)` 使 ctrl 判断失效，任何滚轮都缩放。
17. arc/text 包围盒都是估计值：arc 采样 24 段（core.js:169），text 按字符数×字号×0.62 估宽（core.js:183），不反映真实字宽与上下标。
18. index.html:155-159 快捷键速查表漏 J/O/D/H/Q/Z 六个键。
19. group 只是选择语义（render.js:201 注释明示），无嵌套层级数据结构。
20. 分类列表双写：parts.js 的 `cats` 数组（374）与 index.html:69-79 静态分类按钮是两份手工维护副本。

### 1.4 已具备的「类 Registry」基础（迁移可直接复用）

- `DP.parts.list / byId`（parts.js:371-376）：mk() push + `Object.fromEntries` 索引，部件添加已经是数据化的。
- TOOLS 数组、ICONS 字典、快捷键查找均为数据驱动（ui.js:18-42、82-106、1853-1854）。
- `toggleRibInline`（ui.js:122-240）已经从数组动态生成按钮：工具按钮 `TOOLS.filter(t=>t.g===key)`（135）、部件按钮 `DP.parts.list.filter(p=>p.cat===key)`（180），并保留 LRU 超宽收起逻辑。

差距：当前只注册了「按钮长什么样」，类型的真正行为（bbox/变换/命中/节点/渲染/吸附）仍在 switch 里；没有生命周期钩子，没有 schema 化字段默认值。

---

## 2. 开源项目调研结论


### 2.1 八个项目速览

| 项目 | 定位 / 技术栈 | 形状注册模式 | 可借鉴度 |
|---|---|---|---|
| **Excalidraw** | 手绘白板；React+TS，rough.js 渲染，Canvas 主绘 | 元素 = 纯 JSON + type 字符串 + `new*Element` 工厂（`packages/element/src/newElement.ts`），无类实例 | ★★★★★ |
| **tldraw** | SDK 级白板；React+TS，响应式 store | `ShapeUtil` 抽象类（getDefaultProps/component/getGeometry/hitTestPoint），type 字符串 + schema validator | ★★★★ |
| **mxGraph (draw.io 内核)** | 图表引擎；纯 JS 无框架，SVG/VML/Canvas 抽象层 | `mxCell` 数据树 + 样式字符串 + `mxCodecRegistry` 编解码注册 | ★★★★ |
| **Fabric.js** | Canvas 对象模型；纯 JS | `fabric.Object` 继承体系 + 静态 `type` + 静态 `fromObject` 反序列化 | ★★ |
| **Paper.js** | Canvas 矢量 scene graph；纯 JS | `Item` 继承（Path/Group/Layer），无注册表，直接 new；hitTest 分档 | ★★ |
| **rough.js** | <9KB 手绘渲染器；纯 JS，Canvas+SVG 双后端 | 无形状注册；`generator`（生成 drawable）与 `RoughCanvas/RoughSvg`（后端）分离 | ★★★★★ |
| **SVG.js** | 原生 SVG 的 OO 封装；纯 JS | `Parent/Container/Shape` 分层，`SVG.invent()`/`SVG.extend()` 注册 | ★★★ |
| **JointJS** | 商业图表；纯 JS，SVG 渲染 | `class extends dia.Element` + `type:'ns.Name'` + markup 数据数组，router 可插拔 | ★★★★ |

### 2.2 三个最值得抄的架构模式

**模式 A：Excalidraw 式「元素 = 纯 JSON + type 字符串 + 工厂函数」**
- 元素是 plain object 而非类实例，天然可 `JSON.stringify`、可存 localStorage、可在 file:// 下持久化；每种形状一个 `new*Element` 工厂，type 字符串决定行为分派。
- 历史做元素级 delta：`History` 维护 undo/redo 栈，按元素分桶 added/removed/updated，updated 桶再存属性级 PropertyDiff，而非整图快照。
- 来源：
  - https://github.com/excalidraw/excalidraw/blob/main/packages/element/src/newElement.ts
  - https://docs.excalidraw.com/docs/codebase/json-schema
  - https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/excalidraw-element-skeleton

**模式 B：tldraw 式「形状模块对象」（用字面量替代 ShapeUtil 类）**
- tldraw 把每个形状的全部生命周期收敛到一个 ShapeUtil：默认 props、视觉 component、碰撞几何 getGeometry、命中 hitTestPoint、能力开关 canResize/canEdit。
- DrawPhy 不引入类继承与 React，直接用**普通字面量对象表**实现等价物：`DP.registry.shapes.rect = { defaults, bbox, hitTest, render, nodes, ... }`。关键设计是**视觉渲染与碰撞几何分离**——命中走几何数据，不从 SVG DOM 反算。
- 来源：
  - https://github.com/tldraw/tldraw
  - https://examples.tldraw.com/custom-components

**模式 C：rough.js 式「几何 → drawable → 渲染后端」三段式**
- `rough.generator()` 接收几何定义输出中间表示 drawable，再由 `rough.canvas()`/`rough.svg()` 两种后端各自绘制；换后端不动上层。
- DrawPhy 对应：模型层只声明「画什么」，统一生成 SVG drawable（path/节点指令），渲染器负责生成标准 SVG；未来可加手绘风格后端或导出专用后端，且继续满足原生 SVG 约束。
- 来源：
  - https://roughjs.com/
  - https://roughjs.com/posts/release-4.0/
  - https://github.com/rough-stuff/rough

### 2.3 次优模式（按需要引入）

- **mxGraph 事务聚合历史**：一次拖动产生 N 个属性变更，经 `mxUndoableEdit.add()` 累加，交互结束整体入栈，保证一次拖动 = 一个 undo 单元。来源：https://jgraph.github.io/mxgraph/docs/js-api/index/General.html
- **mxGraph 三层分离**：`mxGraphModel`（纯数据）↔ `mxGraphView`（屏幕状态缓存）↔ `mxCellRenderer`（按样式绘制）。来源：https://jgraph.github.io/mxgraph/docs/manual.html
- **JointJS markup 数据化 + type 命名空间**：形状外观用 JSON 节点数组描述（tagName/selector/attributes），type 用 `ns.Name` 命名空间（如 `physics.VectorArrow`）避免多模块命名冲突；router 命名空间可插拔。来源：https://docs.jointjs.com/4.1/learn/features/customizing-shapes/cell-namespaces/
- **Paper.js 命中分档**：hitTest 用 options 区分 fill/stroke/segments 三档，对应「点在内部 / 点在边线 / 点在端点」。来源：https://paperjs.org/reference/project/
- **Fabric.js fromObject 约定**：反序列化按 type 字符串反查到对应模块再调用其 fromJSON，可作为 DrawPhy 工程文件打开的分派约定。来源：https://fabric5.fabricjs.com/docs/fabric.Object.html

### 2.4 明确不抄

- Fabric.js / Paper.js / JointJS 自身不带完整 undo 的现状（DrawPhy 必须自建命令式历史）。
- mxGraph 的 `allowEval` 样式表达式求值（安全反例）与 mxEditor 的 XML 配置体系。
- 任何需要 React、npm 打包、ES module 运行时才能工作的注册写法。
- SVG marker 做箭头的方案（跨浏览器差异、不参与包围盒/命中计算；Excalidraw/tldraw 均手算真实 path，详见 3.1）。

---

## 3. 逐部件 / 工具算法优化对照表

### 3.1 23 个绘图工具对照（行号针对当前源码）

| 工具 | 现状问题 | 推荐算法与默认参数 | 参考 |
|---|---|---|---|
| select | 移动走 translateObj，arrow 等漏登记类型拖不动（ui.js:1244） | 命中与移动统一改走 Registry 分派；AABB 预筛 + 反序命中即停 | tldraw、Excalidraw collision.ts |
| line | 双模交互已就绪；端点粘附可用 | 保持点击-点击+拖拽双模；命中容差 10 屏幕 px=10/k，线宽补偿 +strokeWidth/2 | Excalidraw threshold=10（源码实测） |
| arrow | 变换表漏登记（core.js:279/295/333）；箭头尺寸与线宽耦合（render.js:135） | 先补登记；箭头长 `L=clamp(25·(w/2),10,40)`、半张角 20°；短箭头 `min(L, segLen·0.5)`；曲线方向取 B(0.3)；极短线退化为圆点头 | Excalidraw bounds.ts getArrowheadSize/Angle（源码实测） |
| darrow | 同上，双向头共用同一几何 | 起点端方向向量取反复用；两端独立短箭头收缩 | Excalidraw bounds.ts |
| polyline | 仅去重，无自相交提示 | 末点距首点 <4px 自动闭合；O(n²) 跨立实验自相交检测（n>20 先 AABB 粗筛） | 工程经验值，已标注 |
| polygon | 最小点数校验已有 | 鞋带公式最小面积 20 屏幕 px²/k² 过滤误触；闭合输出 `M…Z` | 鞋带公式：https://en.wikipedia.org/wiki/Shoelace_formula |
| rect | 仅 90° 步进旋转，无自由角度 | 增加 angle 字段，渲染加 SVG transform；保持参数化坐标 | W3C transform：https://www.w3.org/TR/SVG/coords.html#TransformAttribute |
| ellipse | 命中用归一化方程，近线精度一般 | 逆旋转到局部坐标，迭代最近点法（初值 0.707、迭代 3 次），距离 ≤ tol+线宽/2 命中 | Excalidraw distanceToEllipse（shape.ts 源码实测） |
| circle | 横纵缩放会被就地改写成 ellipse（core.js:299） | 类型身份保持稳定：非等比缩放时由模块工厂显式生成新 ellipse，而非原地改 type | Excalidraw 元素工厂模式 |
| arc | 包围盒 24 段采样（core.js:169）；镜像分支坏代码（core.js:337） | 内部存「圆心+起止角+半径」；包围盒改解析解：端点 + 落在角区间内的极值点，禁止采样；重写镜像角度换算 | W3C implnote：https://www.w3.org/TR/SVG/implnote.html |
| freehand | 固定采样 1.2、固定 RDP 容差 1.6、只抽稀不平滑（ui.js:1147/1609） | 采样 2~3 屏幕 px；RDP 容差 1.5 屏幕 px=1.5/k（快笔 >1500px/s 翻倍）；20° 角切硬角；平滑段 Catmull-Rom（τ=0.5）转三次贝塞尔 | simplify.js：https://github.com/mourner/simplify-js；CR→贝塞尔：https://arxiv.org/abs/2011.08232 |
| bezier | 仅二次 Q、无控制柄、无命中（ui.js:1010、610） | 升级三次 C：`P1c=P0+2/3(P1−P0)`、`P2c=P2+2/3(P1−P2)`；de Casteljau 做评估/分割/手柄；控制柄命中 8px | de Casteljau：https://en.wikipedia.org/wiki/De_Casteljau%27s_algorithm |
| point | 功能完整 | 保持；r 可在属性面板调；继续作为锚点源 | — |
| roundrect | rx 固定公式 `min(12,w/4,h/4)`（ui.js:1530） | 保留公式；同 rect 加 angle 支持自由旋转 | — |
| func | 固定 240 点、x∈[-10,10]、折线输出（ui.js:1555） | 可见 x 范围 32 段起步；递归中点细分，弦高判据 0.5 屏幕 px=0.5/k、深度封顶 12；NaN 或 y 跳变 >5 倍视口高判定间断分段 | Maple 自适应：https://fr.maplesoft.com/support/help/Maple/view.aspx?path=plot%2Fadaptive |
| textbox | hitObject 无分支，画完不可选（ui.js:610） | 补命中（rect 包围盒+4px）；字段 schema 化；双击编辑走 Registry | Fabric fromObject 分派思想 |
| callout | 同上；引线与框位置固定 | 补命中；引线端点可作节点；指向点与框分别参数化 | Paper.js 命中分档 |
| text | rotate/rot 字段名不一致导致旋转无效（render.js:56 vs ui.js:1958） | 统一字段名；包围盒在有测量条件时改用 getBBox 实测，保留估算兜底 | MDN text：https://developer.mozilla.org/en-US/docs/Web/SVG/Element/text |
| dim | 命中按基线段、斜向包围盒不准（ui.js:650、core.js:188） | 延伸线偏移 6~8 屏幕 px；标注箭头 10~12px；标签白底偏移 5~8px；存被引用元素 id 实现联动重算 | ISO 129-1 制图惯例（未逐条核对原文，已标注） |
| angle | 不产生吸附锚点 | 角度弧半径 25px；标签在弧外侧中点；补 collectPoints | 制图惯例 |
| trim | 仅支持直线（ui.js:1657） | 扩展到 polyline 逐段、rect 四边、circle/ellipse 求交后分段，复用现有 t 参数排序框架 | 现有 doTrim 框架已支持多类型求交，仅目标类型受限 |
| eraser | 依赖 hitObject，漏登记类型擦不掉 | 擦除分派走 Registry 命中；容差 10/k | Excalidraw collision.ts |
| fill | 白名单写死（ui.js:895），整对象上色 | 改为模块能力开关 `capabilities.fill`；封闭性由模块几何自证；为后续布尔运算留接口 | tldraw canResize 能力开关模式 |

### 3.2 11 类部件的优化方向

| 分类 | 推荐优化 |
|---|---|
| 电学（30） | 为两端端子声明标准连接点（局部坐标 anchor），导线粘附从「包围盒中心偏移」升级为「命名端子绑定」；开关/变阻器增加可动参数（开关角度、滑片位置 prop + 节点） |
| 光学（15） | 透镜/镜面的光心、焦点声明为命名锚点；光路箭头与透镜端子联动；法线作为参考线图层 |
| 力学（20） | 滑轮组、弹簧、斜面参数化（圈数、倾角、物块位置 prop）；力箭头支持沿任意宿主边法向粘附；弹簧曲线改 Catmull-Rom 平滑 |
| 热学（6） | 火焰/液面用参数化 path；温度计修正注册分类（仪器），液柱高度做 prop |
| 仪器（6） | 量筒/天平/卡尺刻度数据化生成而非逐线手写；表盘指针做可旋转节点 |
| 常用图形（8） | 全部加 angle 自由旋转；菱形/梯形等多边形统一走 polygon 模块，减少重复定义 |
| 连接线（5） | 直角/总线/跳线升级为可插拔 router（直线/正交/平滑三策略），跳线弧用二次贝塞尔 |
| 尺寸（3） | 与 dim 工具合并为同一标注模块，支持水平/竖直/角度三态与联动更新 |
| 环类（4） | 环扇形包围盒用解析解；跑道形统一 rect+rx 逻辑 |
| 化学键（5） | 单/双/三键按键数参数化生成；苯环走正六边形+内圆的参数工厂 |
| 通用（12） | 坐标轴/表格/括号等模板化：刻度与行列数做 prop，由工厂生成图元，减少静态条目 |

### 3.3 推荐默认参数总表（全部按屏幕像素定义，运行时 ÷k 换算世界单位）

| 参数 | 推荐值 | 依据 |
|---|---|---|
| 命中容差 | 10 屏幕 px | Excalidraw collision.ts 源码实测 |
| 吸附容差 | 8 屏幕 px | Excalidraw SNAP_DISTANCE=8 源码实测 |
| 手柄/控制柄命中 | 8 屏幕 px | 同源 |
| Shift 角度锁定 | 15°（π/12） | Excalidraw SHIFT_LOCKING_ANGLE 源码实测 |
| 自动正交磁吸 | `|sin Δθ|·r < 8px` | 与吸附容差同源 |
| 网格步距 / 细分 | 20 / 5 | Excalidraw DEFAULT_GRID_SIZE=20、GRID_STEP=5 |
| 手绘采样间距 | 2~3 屏幕 px | expo-signature-canvas minDistance=2 |
| RDP 容差 | 1.5 屏幕 px；慢笔 1、快笔 3 | 对照现状固定 1.6 世界单位的问题 |
| 硬角角阈值 | 20°（15~25 可调） | 工程经验值，无开源确证，已标注 |
| 箭头头长 / 半张角 | `clamp(25·w/2,10,40)` / 20° | Excalidraw bounds.ts 源码实测 |
| 多边形闭合距离 / 最小面积 | 4 px / 20 px² | 工程经验值，已标注 |
| 函数自适应：初始段/弦高/深度 | 32 段 / 0.5 px / 12 层 | Maple/sympy 自适应惯例 |
| 间断跳变阈值 | y 差 >5 倍视口高 | tan 极点工程惯例 |
| 标注：延伸线/箭头/标签 | 6~8 px / 10~12 px / 5~8 px 白底 | ISO 129-1 惯例，已标注 |

> 工程经验值（无权威开源确证）共 4 处：硬角 20°、多边形闭合 4px 与最小面积 20px²、标注偏移量。落地时先按推荐值实现并集中放在 `core/config.js`，后续按实测手感调整，不散落进各模块。

---

## 4. 模块化框架设计

### 4.1 核心概念：一个模块 = 一个类型的完整生命周期

**模块（ShapeModule）** 是一个普通字面量对象，描述一种绘图部件从「用户点按钮」到「存盘再打开」的全部行为。它不自己 new 类、不直接持有全局状态，只向核心声明契约：

```
按钮元数据 → 字段默认值 → 绘制交互 → 几何/包围盒 → 命中检测
          → 节点手柄 → 变换 → 吸附锚点 → 渲染 → 序列化
```

- 一个模块 = 一个 type（如 `rect`）；部件类模块一个 type 对应多个视觉定义（如 `part` 模块读取各自的 `partId` 形状数据）。
- 模块文件只做两件事：定义模块对象、调用 `DP.registry.register(module)` 自注册。
- 「显示在主页」= 模块元数据里声明 `menu`（tab/分类/位置），核心据此把按钮注册到主页 ribbon；不声明 menu 的模块（如仅供内部复用的基础 path 模块）不出现按钮，但仍可被其他模块调用。

### 4.2 ShapeModule 标准接口契约

| 字段 | 类型 | 必需 | 说明 |
|---|---|---|---|
| `type` | string | 是 | 全局唯一类型名，建议命名空间写法 `physics.xxx` 防冲突；基础图元沿用 `rect`/`line` 等短名 |
| `version` | number | 是 | 模块自身版本，用于后续字段迁移 |
| `meta` | object | 是 | `{ name, icon, shortcut, hint }`；icon 为 SVG path 字符串或现有 ICONS key |
| `menu` | object | 否 | `{ tab, category, group, order }`；缺省即不注册到主页 |
| `defaults(props)` | function | 是 | 工厂：返回带默认字段的新对象（含 id 由核心统一发放） |
| `bbox(o)` | function | 是 | 返回精确局部包围盒 `{x,y,w,h}`，禁止采样估计 |
| `hitTest(o, p, tol)` | function | 是 | 点命中，返回 bool；tol 由核心按 10/k 传入 |
| `anchors(o)` | function | 否 | 返回命名吸附锚点数组 `[{id, x, y, kind}]` |
| `nodes(o)` | function | 否 | 返回节点手柄定义 `[{id, x, y}]`；空数组表示无节点编辑 |
| `setNode(o, id, p)` | function | 否 | 拖动节点时的字段回写 |
| `translate/scale/rotate/mirror` | function | 否 | 四种变换；缺省由核心按通用几何兜底（如逐点变换） |
| `render(o, ctx)` | function | 是 | 输出 SVG drawable（见 4.6），不直接操作 DOM |
| `serialize/deserialize` | function | 否 | 自定义字段编解码；缺省走 JSON 原样存取 |
| `capabilities` | object | 否 | `{ fill, rotate, resize, multiselect, editable }` 能力开关，默认全开 |
| `tool` | object | 否 | 多点/点击式工具的交互状态机（见 4.7），拖拽式工具可缺省 |

设计约定：
1. **所有函数保持纯函数风格**——输入对象与点，输出结果或就地改字段，不读 `DP.state`；需要样式默认值时由核心作为参数传入，彻底消除 render.js 反向依赖 state 的问题。
2. 未实现的可选钩子由核心统一兜底，模块只写自己特殊的部分（如 arc 只需重写 bbox，translate 可复用通用逐点逻辑）。
3. 字段名以本契约为准统一（修复 `rot/rotate` 类不一致），旧字段在迁移层做映射。

### 4.3 全局 Registry 与「注册到主页」机制

全局唯一的 `DP.registry` 是核心提供的模块索引，分三张表：shape 表（类型行为）、menu 表（主页按钮位）、part 表（部件定义，由现有 parts.js 数据迁移）。

- `register(module)`：校验 type 唯一、必需字段齐全，写入 shape 表；若 `module.menu` 存在，同步把按钮描述写入 menu 表并按 `order` 排序——这一步就是「注册到主页」。
- `get(type)` / `has(type)` / `list(filter)`：其他子系统（渲染器、命中、历史、IO）只通过 registry 取行为，不再有任何硬编码 type 分支。
- `registerPart(partDef)`：部件数据专用入口，part 模块运行时按 partId 取用。
- 重复注册同 type 时按 `version` 高者覆盖并在控制台告警，避免静默冲突。
- ribbon 渲染器只做一件事：读 menu 表，按 tab/category 分组生成与现有 DOM 结构、CSS class 完全一致的按钮（骨架见 5.5）。分类的双写问题（parts.js cats 与 index.html 静态按钮）由此收敛为 menu 表一份数据。

### 4.4 分层与目录结构

```
DrawPhy/
├── index.html                 # 入口：仅按序加载 core 与 modules 的 script 标签
├── assets/editor.css          # 保持不变
├── src/
│   ├── core/                  # 核心层：不依赖任何具体模块
│   │   ├── config.js          # 全局可调参数（3.3 全部常数集中处）
│   │   ├── geometry.js        # 现 DP.geom：几何函数 + 矩阵
│   │   ├── registry.js        # Registry 实现
│   │   ├── eventbus.js        # 事件总线 + 命令/历史
│   │   ├── snapping.js        # 吸附引擎（调用模块 anchors）
│   │   ├── renderer.js        # 通用 SVG 渲染器（drawable → SVG 节点）
│   │   ├── interaction.js     # 指针事件总入口 + 工具状态机运行时
│   │   └── store.js           # 文档状态、id 发放、序列化外壳
│   ├── modules/               # 模块层：每个文件一个或一组小模块
│   │   ├── primitives/        # line/arrow/rect/ellipse/circle/arc/polygon/
│   │   │                      # polyline/freehand/bezier/point/roundrect
│   │   ├── text/              # text/textbox/callout
│   │   ├── annotation/        # dim/angle（含未来联动标注）
│   │   ├── function/          # func（自适应采样）
│   │   ├── part/              # part 宿主模块 + 部件形状数据
│   │   └── parts-data/        # 114 部件定义，按 11 类分文件
│   └── ui/                    # 外壳层：ribbon/属性面板/对话框，外观不变
│       ├── ribbon.js          # 从 menu 表生成 ribbon
│       ├── panels.js          # 属性面板（按模块字段 schema 生成）
│       └── dialogs.js
└── docs/
```

命名约定：type 用小写短名或点分命名空间；模块文件 `kebab-case.js`；模块对象名 `XxxModule`；部件定义沿用现有 `partId` 不重命名，保证旧工程文件可打开。

### 4.5 依赖方向（强制单向）

```
ui（外壳） ──→ core（内核） ←── modules（模块）
                         ↑
        modules 之间只允许通过 core 提供的通用能力协作，
        禁止互相 import/引用具体 type
```

- 核心**不依赖任何具体模块**：现有 core.js 对 `DP.parts.byId` 的引用（core.js:134/204）改为由 part 模块在渲染/变换钩子里自行处理，核心只调 `registry.get(o.type).xxx`。
- 模块只依赖 core 暴露的稳定 API（geometry、config、eventbus）；同层模块间不复用彼此内部函数，公共几何一律下沉到 core。
- ui 不认识具体 type，属性面板按模块声明的字段 schema 自动生成。
- 依赖规则在无构建环境下用「加载顺序 + 全局命名空间约定」保证：core 先加载、modules 后加载、ui 最后；评审 code review 时以「core 目录不得出现具体 type 字符串」为检查项。

### 4.6 模型与渲染分离（rough.js 三段式落地）

```
模型层：o = 纯 JSON 数据（type + 字段），无任何 DOM 引用
   │  module.render(o, ctx)
   ▼
drawable：中间表示，仅描述 SVG 指令，如
   { tag:'path', attrs:{d, stroke, fill}, children:[...] }
   │  core/renderer.js
   ▼
SVG 节点：renderer 统一 createElementNS、属性写入、diff 更新
```

- 模块的 `render` 只产出 drawable 字面量，不碰 `document`，因此同一 drawable 可分别驱动屏幕渲染、PNG 导出、SVG 导出，消除当前 io.js 与 render.js 两套输出逻辑的重复。
- 箭头头、标注线等全部作为 drawable 内的真实 path 节点（不使用 marker），包围盒与命中天然可算。
- 未来加手绘风格时，只需新增一个把 drawable 转 rough 指令的渲染后端，模块与模型零改动。
- 性能：renderer 做节点级 diff（按对象 id 复用 DOM），替代当前全量 `innerHTML` 重建，对象数量大时帧率与内存同时改善。

### 4.7 事件、命令与历史

**事件总线（eventbus）**：core 定义有限事件名（`pointerdown/move/up`、`object:change`、`selection:change`、`history:change`、`view:change`），模块和 ui 订阅，不直接互相调用。

**工具状态机**：interaction.js 是指针事件唯一入口，按当前 tool 找到对应模块的 `tool` 钩子（`onDown/onMove/onUp/onCancel`），把屏幕坐标换算世界坐标、统一处理吸附后再交给模块。现有 onDown 大 if 链（ui.js:790 起）逐段搬入各模块的 tool 钩子，交互行为不变。

**命令模式替代全量快照（分两步走）**：
1. 过渡期：保留现有整文档快照机制，但入栈时机用**事务包裹**——借鉴 mxGraph `mxUndoableEdit`，一次拖拽/一次多点绘制期间的所有变更先聚合，pointerup 时才产生一个 undo 单元，保证「一次操作 = 一次撤销」。
2. 终态：每个变更建模为 `Command { apply, invert, targetId, patch }`，历史栈存命令而非整文档 JSON；撤销调 `invert` 局部回写。相比现状（core.js:538 每步全量序列化 80 份），内存与延迟显著下降。
3. 旧版自动保存的文档格式保持可读，store 加载时按版本走迁移函数。

### 4.8 吸附引擎与模块的协作

- 吸附引擎在 core，容差统一取 config（8 屏幕 px=8/k）；它不自己猜对象上有哪些可吸点，而是调用 `registry.get(o.type).anchors(o)`，由模块声明命名锚点（端点/中点/圆心/象限/交点/自定义端子）。
- 迁移后立即补齐当前 `collectPoints` 不覆盖的 dim/angle/textbox/callout/path（core.js:360-407）。
- 角度吸附（Shift 15°、无 Shift 自动正交 `|sin Δθ|·r<8px`）与 smart guides（bbox 边/中心对齐参考线）在引擎内实现，所有模块自动受益，无需各自处理。
- 部件模块的 anchors 从局部坐标声明（如电池两端端子），引擎经部件矩阵变换到世界坐标，替代当前按包围盒中心偏移的近似粘附。

### 4.9 部件模块与图形模块的统一

- part 不做特殊化处理：它也是一个 ShapeModule，`render` 时按 `o.partId` 从 part 表取形状定义（现有 L/P/C/R/T/A/D/SF 图元语义保留），矩阵变换逻辑（partMatrix）收进该模块的 transform 钩子。
- 114 个部件不需要 114 个模块文件：形状数据进 `parts-data/`（按 11 类分文件），part 宿主模块只有一个；部件升级为「参数化部件」时（如开关角度、弹簧圈数），在对应部件数据里加 `props` 声明与节点，宿主模块通用渲染，不新增类型。
- 常用图形里与基础图元重复的（矩形/圆/菱形等）逐步改为直接实例化 primitives 模块，删除重复定义；新增部件的默认路径就是「写一份 part 数据 + 调 registerPart」，核心与其他模块零改动——这正是用户要的「方便以后拓展」。

---

## 5. 代码级骨架（零依赖原生 JS）

### 5.1 file:// 下 ES module 可用性：本机实测结论

2026-11-05 在本机用 Chrome（headless）对 `file://` 做了对照实验：

| 测试 | 结果 |
|---|---|
| 普通 `<script src="c.js">` | 成功，页面输出 `CLASSIC_OK` |
| 内联 `<script type="module">`（无 import） | 成功，输出 `INLINE_MODULE_OK` |
| 外部 `import {x} from './m.js'` | **失败**，控制台报错：`Access to script at 'file:///.../m.js' from origin 'null' has been blocked by CORS policy: Cross origin requests are only supported for protocol schemes: http, data, isolated-app, chrome-extension, chrome, https, chrome-untrusted.` |
| 同上，加启动参数 `--allow-file-access-from-files` | 成功，但要求用户用特殊参数启动浏览器，双击场景不现实 |

结论：**不能把跨文件 ES module import 作为默认方案**。Edge/Firefox 同为该行为（origin null + CORS）。

### 5.2 兼容方案：IIFE 自注册 + UMD 风格包装

模块文件继续用普通 `<script>` 加载，用一个统一包装函数把「IIFE 全局注册」与「未来若经 http 或打包工具运行时的 ES module 形态」隔离开：

```js
// src/core/module-wrap.js —— 核心先加载；所有模块用 DP.defineModule 定义
(function (global) {
  global.DP = global.DP || {};
  // 统一的模块定义入口：传 type 与工厂函数，工厂延迟执行以便引用 core
  global.DP.defineModule = function (type, factory) {
    var mod = factory(global.DP);
    mod.type = type;
    global.DP.registry.register(mod);
  };
})(window);
```

```js
// src/modules/primitives/rect.js —— 普通 script 标签即可，file:// 无 CORS
DP.defineModule('rect', function (DP) {
  var G = DP.geometry, C = DP.config;
  return {
    version: 1,
    meta: { name: '矩形', icon: 'rect', shortcut: 'r', hint: '拖拽绘制矩形' },
    menu: { tab: 'draw', category: 'shape', group: 'shape', order: 10 },
    defaults: function () {
      return { x: 0, y: 0, w: 0, h: 0, angle: 0,
               stroke: C.stroke, fill: C.fill, strokeWidth: C.strokeWidth };
    },
    // 其余钩子见 5.4
  };
});
```

可选增强（不影响双击使用）：若将来项目经本地 http 服务打开或引入打包，可在包装内追加 `if (typeof module !== 'undefined') module.exports = mod;` 分支，同一文件两种形态通用，无需改写模块代码。

### 5.3 Registry 骨架

```js
// src/core/registry.js
DP.registry = (function () {
  var shapes = Object.create(null);   // type -> module
  var menu = [];                      // 主页按钮描述
  var parts = Object.create(null);    // partId -> 部件定义
  var REQUIRED = ['version', 'meta', 'defaults', 'bbox', 'hitTest', 'render'];

  function register(mod) {
    if (!mod.type) throw new Error('模块缺少 type');
    REQUIRED.forEach(function (k) {
      if (mod[k] === undefined) throw new Error('模块 ' + mod.type + ' 缺少 ' + k);
    });
    var old = shapes[mod.type];
    if (old && old.version > mod.version) {
      console.warn('已存在更高版本，忽略重复注册：' + mod.type);
      return;
    }
    shapes[mod.type] = mod;
    if (mod.menu) {
      var slot = {
        type: mod.type, order: mod.menu.order || 100,
        tab: mod.menu.tab, category: mod.menu.category,
        group: mod.menu.group, name: mod.meta.name,
        icon: mod.meta.icon, shortcut: mod.meta.shortcut
      };
      // 替换旧槽位后重排，保证「注册到主页」只有一份数据
      menu = menu.filter(function (m) { return m.type !== mod.type; });
      menu.push(slot);
      menu.sort(function (a, b) { return a.order - b.order; });
    }
  }

  return {
    register: register,
    get: function (type) { return shapes[type]; },
    has: function (type) { return !!shapes[type]; },
    list: function (filter) {
      var all = Object.keys(shapes).map(function (t) { return shapes[t]; });
      return filter ? all.filter(filter) : all;
    },
    menuSlots: function (tab, category) {
      return menu.filter(function (m) {
        return (!tab || m.tab === tab) && (!category || m.category === category);
      });
    },
    registerPart: function (def) {
      if (parts[def.id]) console.warn('部件重复注册：' + def.id);
      parts[def.id] = def;
    },
    getPart: function (id) { return parts[id]; }
  };
})();
```

### 5.4 完整模块示例：rect

```js
// src/modules/primitives/rect.js
DP.defineModule('rect', function (DP) {
  var G = DP.geometry, C = DP.config;

  function norm(o) { // 归一化负宽高，保持与现有 shapeFrom 行为一致
    if (o.w < 0) { o.x += o.w; o.w = -o.w; }
    if (o.h < 0) { o.y += o.h; o.h = -o.h; }
  }

  return {
    version: 1,
    meta: { name: '矩形', icon: 'rect', shortcut: 'r', hint: '拖拽绘制，Shift 锁定正方形' },
    menu: { tab: 'draw', category: 'shape', group: 'shape', order: 10 },
    capabilities: { fill: true, rotate: true, resize: true },

    defaults: function () {
      return { x: 0, y: 0, w: 0, h: 0, angle: 0,
               stroke: C.stroke, fill: C.fill, strokeWidth: C.strokeWidth };
    },

    bbox: function (o) {
      return { x: o.x, y: o.y, w: o.w, h: o.h }; // angle 由核心在外层统一处理
    },

    hitTest: function (o, p, tol) {
      var t = tol + o.strokeWidth / 2;
      var onEdge =
        G.distToSeg(p, { x: o.x, y: o.y }, { x: o.x + o.w, y: o.y }) <= t ||
        G.distToSeg(p, { x: o.x + o.w, y: o.y }, { x: o.x + o.w, y: o.y + o.h }) <= t ||
        G.distToSeg(p, { x: o.x + o.w, y: o.y + o.h }, { x: o.x, y: o.y + o.h }) <= t ||
        G.distToSeg(p, { x: o.x, y: o.y + o.h }, { x: o.x, y: o.y }) <= t;
      if (onEdge) return true;
      if (o.fill && o.fill !== 'none') {           // 填充区域内部命中
        return p.x >= o.x && p.x <= o.x + o.w && p.y >= o.y && p.y <= o.y + o.h;
      }
      return false;
    },

    nodes: function (o) {
      return [
        { id: 'nw', x: o.x, y: o.y },
        { id: 'ne', x: o.x + o.w, y: o.y },
        { id: 'se', x: o.x + o.w, y: o.y + o.h },
        { id: 'sw', x: o.x, y: o.y + o.h }
      ];
    },

    setNode: function (o, id, p) {
      if (id.indexOf('w') >= 0) { o.x = p.x; }
      if (id.indexOf('e') >= 0) { o.w = p.x - o.x; }
      if (id.indexOf('n') >= 0) { o.y = p.y; }
      if (id.indexOf('s') >= 0) { o.h = p.y - o.y; }
      norm(o);
    },

    translate: function (o, dx, dy) { o.x += dx; o.y += dy; },

    render: function (o) {
      return {
        tag: 'rect',
        attrs: {
          x: o.x, y: o.y, width: o.w, height: o.h,
          transform: o.angle ? 'rotate(' + o.angle + ' ' + o.x + ' ' + o.y + ')' : null,
          stroke: o.stroke, fill: o.fill, 'stroke-width': o.strokeWidth
        }
      };
    }
  };
});
```

### 5.5 完整模块示例：arrow（含新箭头头几何，修复当前不可移动问题）

```js
// src/modules/primitives/arrow.js
DP.defineModule('arrow', function (DP) {
  var G = DP.geometry, C = DP.config;

  // 箭头头几何：Excalidraw bounds.ts 公式族
  function head(o, tip, from) {
    var dx = tip.x - from.x, dy = tip.y - from.y;
    var segLen = Math.hypot(dx, dy) || 0.001;
    var nx = dx / segLen, ny = dy / segLen;
    var L = Math.min(
      Math.max(25 * (o.strokeWidth / 2), 10), 40);
    L = Math.min(L, segLen * 0.5);              // 短箭头收缩
    var alpha = 20 * Math.PI / 180;
    var qx = tip.x - nx * L, qy = tip.y - ny * L;       // 后沿中点
    // 两翼：把后沿中点 q 绕 tip 分别旋转 ±alpha（q 与 tip 距离恰为 L）
    function rot(px, py, a) {
      var vx = px - tip.x, vy = py - tip.y;
      return { x: tip.x + vx * Math.cos(a) - vy * Math.sin(a),
               y: tip.y + vx * Math.sin(a) + vy * Math.cos(a) };
    }
    var w1 = rot(qx, qy, alpha), w2 = rot(qx, qy, -alpha);
    return {
      d: 'M ' + tip.x + ' ' + tip.y +
         ' L ' + w1.x + ' ' + w1.y +
         ' L ' + w2.x + ' ' + w2.y + ' Z',
      L: L
    };
  }

  return {
    version: 1,
    meta: { name: '箭头', icon: 'arrow', shortcut: 'a', hint: '点击-点击或拖拽画箭头' },
    menu: { tab: 'draw', category: 'shape', group: 'shape', order: 20 },
    capabilities: { fill: false, rotate: true, resize: true },

    defaults: function () {
      return { x1: 0, y1: 0, x2: 0, y2: 0, doubleHead: false,
               stroke: C.stroke, fill: C.stroke, strokeWidth: C.strokeWidth };
    },

    bbox: function (o) {
      var xs = [o.x1, o.x2], ys = [o.y1, o.y2];
      return { x: Math.min.apply(null, xs), y: Math.min.apply(null, ys),
               w: Math.abs(o.x2 - o.x1), h: Math.abs(o.y2 - o.y1) };
    },

    hitTest: function (o, p, tol) {
      return G.distToSeg(p, { x: o.x1, y: o.y1 }, { x: o.x2, y: o.y2 })
             <= tol + o.strokeWidth / 2;
    },

    // 关键修复：当前 core 三个变换表没有 arrow 分支，迁移后箭头可移动/缩放/镜像
    translate: function (o, dx, dy) {
      o.x1 += dx; o.y1 += dy; o.x2 += dx; o.y2 += dy;
    },
    nodes: function (o) {
      return [{ id: 'a', x: o.x1, y: o.y1 }, { id: 'b', x: o.x2, y: o.y2 }];
    },
    setNode: function (o, id, p) {
      if (id === 'a') { o.x1 = p.x; o.y1 = p.y; } else { o.x2 = p.x; o.y2 = p.y; }
    },
    anchors: function (o) {
      return [{ id: 'tip', x: o.x2, y: o.y2, kind: 'endpoint' },
              { id: 'tail', x: o.x1, y: o.y1, kind: 'endpoint' }];
    },

    render: function (o) {
      var h1 = head(o, { x: o.x2, y: o.y2 }, { x: o.x1, y: o.y1 });
      var children = [{
        tag: 'line',
        attrs: { x1: o.x1, y1: o.y1, x2: o.x2, y2: o.y2,
                 stroke: o.stroke, 'stroke-width': o.strokeWidth }
      }, { tag: 'path', attrs: { d: h1.d, fill: o.stroke, stroke: 'none' } }];
      if (o.doubleHead) {
        var h0 = head(o, { x: o.x1, y: o.y1 }, { x: o.x2, y: o.y2 });
        children.push({ tag: 'path', attrs: { d: h0.d, fill: o.stroke, stroke: 'none' } });
      }
      return { tag: 'g', children: children };
    }
  };
});
```

### 5.6 ribbon 从 Registry 动态生成（保持现有 class 与 DOM 结构）

现有 `toggleRibInline`（ui.js:122-240）的生成逻辑保留，只把数据源从 TOOLS/DP.parts 换成 registry 的 menu 槽位；生成的按钮 class（`tool-btn`/`part-btn`）、图标结构、LRU 收起规则完全不变，因此 CSS 与视觉零影响：

```js
// src/ui/ribbon.js
function buildInline(category, host) {
  var slots = DP.registry.menuSlots(undefined, category);
  var html = slots.map(function (s) {
    var icon = DP.ICONS[s.icon]
      ? '<svg viewBox="0 0 24 24" class="t-ico">' + DP.ICONS[s.icon] + '</svg>'
      : '<span class="part-thumb" data-part="' + s.type + '"></span>';
    return '<button class="tool-btn" data-tool="' + s.type + '" title="' +
           s.name + (s.shortcut ? '（' + s.shortcut + '）' : '') + '">' +
           icon + '<span class="t-lbl">' + s.name + '</span></button>';
  }).join('');
  host.innerHTML = html;   // 宿主节点 #ribInline 与现有结构一致
}
```

- 分类按钮（index.html 现有 `[data-cat]` 静态结构）本阶段保留不动；后续可再由 menu 表连分类一起生成，但不作为本轮依赖。
- 属性面板同理：模块按自身字段声明 schema，panels.js 生成与现有控件相同的输入控件，class 名沿用 editor.css 现有定义。

### 5.7 命令与历史骨架

```js
// src/core/eventbus.js + command.js
DP.bus = (function () {
  var map = Object.create(null);
  return {
    on: function (ev, fn) { (map[ev] = map[ev] || []).push(fn); },
    emit: function (ev, payload) {
      (map[ev] || []).forEach(function (fn) { fn(payload); });
    }
  };
})();

DP.commands = (function () {
  var undoStack = [], redoStack = [], tx = null;

  function makePatch(targetId, before, after) {
    var patch = {};
    Object.keys(after).forEach(function (k) {
      if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) {
        patch[k] = { from: before[k], to: after[k] };
      }
    });
    return patch;
  }

  return {
    begin: function () { tx = []; },            // 事务开始（pointerdown）
    record: function (obj) {                    // 记录变更前快照
      if (tx) tx.push({ id: obj.id, before: JSON.parse(JSON.stringify(obj)) });
    },
    commit: function (store) {                  // pointerup 聚合成一个 undo 单元
      if (!tx) return;
      var unit = tx.map(function (entry) {
        var after = store.byId(entry.id);
        return { id: entry.id, patch: makePatch(entry.id, entry.before, after) };
      }).filter(function (u) { return Object.keys(u.patch).length; });
      if (unit.length) { undoStack.push(unit); redoStack.length = 0; }
      tx = null;
      DP.bus.emit('history:change');
    },
    undo: function (store) {
      var unit = undoStack.pop();
      if (!unit) return;
      unit.forEach(function (u) {
        var o = store.byId(u.id);
        Object.keys(u.patch).forEach(function (k) { o[k] = u.patch[k].from; });
      });
      redoStack.push(unit);
      DP.bus.emit('history:change');
    },
    redo: function (store) { /* 对称地写回 patch.to */ }
  };
})();
```

过渡期兼容：`DP.history.push()` 现有调用点保留，内部先继续走整文档快照；待模块迁移覆盖全部 type 后，再把调用点切换到 commands，整个过程任何时刻系统都可运行、可回归。

---

## 6. 迁移映射与分阶段落地

### 6.1 15 个现有 type → 模块映射

| 现 type | 目标模块文件 | 迁移要点 |
|---|---|---|
| line | modules/primitives/line.js | 双模交互平移；锚点=两端点 |
| arrow / darrow | modules/primitives/arrow.js | 合并为同模块 `doubleHead` 开关；补 translate/scale/mirror 三个当前缺失钩子 |
| polyline | modules/primitives/polyline.js | 加闭合距离与自相交检测 |
| rect | modules/primitives/rect.js | 加 angle；节点四角 |
| roundrect | modules/primitives/roundrect.js | 复用 rect 逻辑，render 加 rx/ry |
| ellipse | modules/primitives/ellipse.js | 命中改 3 次迭代最近点 |
| circle | modules/primitives/circle.js | 修复缩放被就地改 type 的问题 |
| arc | modules/primitives/arc.js | 改参数化存储、解析包围盒、重写镜像 |
| polygon | modules/primitives/polygon.js | 最小面积过滤、闭合 Z |
| freehand | modules/primitives/freehand.js | 采样/RDP 按 k 换算 + 角切 + CR 平滑 |
| path（现二次贝塞尔） | modules/primitives/bezier.js | 升级三次 C、控制柄、补命中与 bbox |
| point | modules/primitives/point.js | 直接迁移 |
| text | modules/text/text.js | 统一 rot/rotate 字段；getBBox 实测 |
| textbox / callout | modules/text/textbox.js、callout.js | 补命中；schema 化 |
| dim / angle | modules/annotation/dim.js、angle.js | 补锚点；为联动重算存引用 |
| func | modules/function/func.js | 自适应采样替换固定 240 点 |
| part | modules/part/part.js + parts-data/ | 矩阵逻辑收进模块；部件数据按 11 类拆文件 |

### 6.2 114 部件 → 数据包映射

| 数据包文件 | 含分类（数量） |
|---|---|
| parts-data/electric.js | 电学 30 |
| parts-data/optics.js | 光学 15 |
| parts-data/mechanics.js | 力学 20 |
| parts-data/heat.js | 热学 6（温度计改注册到仪器） |
| parts-data/instruments.js | 仪器 6 + 温度计 |
| parts-data/common-shapes.js | 常用图形 8（能复用 primitives 的直接实例化） |
| parts-data/connectors.js | 连接线 5 |
| parts-data/dimension.js | 尺寸 3 |
| parts-data/rings.js | 环类 4 |
| parts-data/chemical.js | 化学键 5 |
| parts-data/general.js | 通用 12 |

partId 与坐标数据原样保留，仅文件位置与注册入口变化，旧 `.dpp` 工程文件与 autosave 无需转换即可打开。

### 6.3 分阶段落地计划（每阶段小步、可回归、可单独验证）

| 阶段 | 内容 | 验收标准 |
|---|---|---|
| **0. 地基** | 新增 core 目录骨架：config（集中 3.3 全部常数）、registry、module-wrap、eventbus；旧文件保持运行，新文件并行加载 | 打开 index.html 无控制台报错；`DP.registry` 可用；现有功能逐项手测无变化 |
| **1. P0 修复** | 在**旧架构内**先修漏登记：arrow 补三个变换分支、hitObject 补 textbox/callout/path、localBBox 补 path、collectPoints 补五类；修 mirror arc 坏代码 | 箭头可拖动/镜像；文本框/标注/贝塞尔可点选可擦除；每修复项配一次实际操作验证 |
| **2. 试点模块** | 先迁 rect、arrow 两个模块（含 5.4/5.5 骨架），核心加「registry 优先、旧 switch 兜底」的双轨分派 | 用新模块画矩形/箭头，命中、节点、渲染、历史、导出与旧行为一致；ribbon 视觉截图对比无差异 |
| **3. primitives 批量迁移** | 按 line→polyline/polygon→rect 系→圆/椭圆/弧→freehand/bezier→point 的顺序，每批 2~3 个模块；同步落地算法升级（RDP 按 k、CR 平滑、三次贝塞尔、解析包围盒） | 每批回归：23 工具全量手测清单 + 示例图（sample=1）渲染像素级对比 + 撤销重做/导出检查 |
| **4. text/annotation/function** | 迁 text/textbox/callout、dim/angle、func；统一字段名；func 换自适应采样 | 文字旋转生效；函数图在缩放下平滑且奇点正确分段；标注锚点可吸附 |
| **5. part 与部件数据** | part 宿主模块 + 11 个 parts-data 包；命名端子 anchors；参数化部件 props 框架 | 114 部件全部可放置、可编辑、可导出；导线粘附到命名端子；旧工程文件直接打开 |
| **6. ribbon 全量数据化** | 5.6 生成逻辑替换数据源；属性面板按 schema 生成；删除 TOOLS/parts 旧数组与 cats 双写 | ribbon 全部按钮由 menu 表生成；DOM 结构与 class 清单逐一比对一致；快捷键全量验证 |
| **7. 命令式历史 + 渲染 diff** | 切换到 5.7 命令历史；renderer 节点级 diff 替换全量 innerHTML | 一次操作=一次撤销；大文档（100+ 对象）拖动帧率与内存对比改善；历史栈不再存 80 份全量 JSON |

每个阶段独立提交、独立可回滚；任何阶段出问题都不影响前一阶段的可用状态。阶段 1 与后续模块化解耦，可最先落地立即消除 P0 缺陷。

### 6.4 不改 UI 的保障措施

1. **冻结契约**：迁移前先把现有 ribbon 的 DOM 结构与全部 class 名整理成清单（`tool-btn`/`part-btn`/`rib-inline`/`cat-btn` 等），新代码生成结果必须逐节点匹配该清单。
2. **CSS 零改动**：editor.css 不新增、不删除、不调整；模块只产出 class 名在现有样式表内的元素。
3. **截图回归**：阶段 2/6 完成后对 ribbon 各分类展开态做截图，与当前页面对比，视觉差异即缺陷。
4. 分类按钮静态结构在阶段 6 之前保持原样，交互（LRU 收起、就地展开）沿用现有函数，仅替换数据来源。

---

## 7. 风险与开放问题

| # | 风险 / 开放问题 | 应对 |
|---|---|---|
| 1 | 双轨分派期（registry + 旧 switch）可能出现行为不一致 | 双轨只在阶段 2-5 存在；每批迁移用同一手测清单验证，确认后删除旧分支 |
| 2 | 工程经验值（20° 角切、4px 闭合、标注偏移）实际手感可能偏差 | 全部集中在 config.js，按真实使用反馈调参，不写死在模块里 |
| 3 | 命令式历史的 patch 对嵌套结构（parts 数组字段）diff 成本 | 先做扁平字段 patch；嵌套字段（如部件 shapes）仍按整体替换记录，后续再优化 |
| 4 | 节点级 diff 渲染器的复杂度可能引入新 bug | 放在最后阶段（7）独立实施，保留全量重建作为可回退路径 |
| 5 | 参数化部件（props+节点）是新增能力，现有 114 部件数据无此结构 | 作为可选增强，部件数据缺省 props 时按静态方式渲染，不强制改造 |
| 6 | 开放问题：是否需要图层/页签（Excalidraw frames、mxGraph layers 级能力） | 本框架的 registry 与 store 已预留，但不在当前需求范围，待后续单独立项 |
| 7 | 开放问题：file:// 下未来若想用 ES module 组织源码 | 可选 dev-only 方案：用 node 写一个零依赖拼接脚本把 modules 合并成单文件；或经本地 http 服务打开；均不影响默认双击路径 |

---

## 8. 附录：来源 URL 汇总

### 8.1 项目官方与源码

- Excalidraw：https://excalidraw.com/ ；https://github.com/excalidraw/excalidraw
  - 元素工厂：https://github.com/excalidraw/excalidraw/blob/main/packages/element/src/newElement.ts
  - JSON 结构：https://docs.excalidraw.com/docs/codebase/json-schema
  - 元素骨架 API：https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/excalidraw-element-skeleton
  - 箭头几何：https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/element/bounds.ts
  - 渲染：https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/renderElement.ts
  - 吸附：https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/snapping.ts
  - 常量：https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/constants.ts
  - 椭圆几何：https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/utils/geometry/shape.ts
  - 吸附架构：https://deepwiki.com/zsviczian/excalidraw/5.7-frames-and-snapping
- tldraw：https://tldraw.dev/ ；https://github.com/tldraw/tldraw ；https://examples.tldraw.com/custom-components ；https://tldraw.dev/reference/store/Store ；命中测试：https://deepwiki.com/tldraw/tldraw-v1/11.3-hit-testing
- mxGraph / draw.io：https://www.diagrams.net/ ；https://github.com/jgraph/mxgraph ；手册：https://jgraph.github.io/mxgraph/docs/manual.html ；API：https://jgraph.github.io/mxgraph/docs/js-api/index/General.html
- Fabric.js：https://fabric5.fabricjs.com/ ；https://github.com/fabricjs/fabric.js ；Object：https://fabric5.fabricjs.com/docs/fabric.Object.html
- Paper.js：https://paperjs.org/ ；https://github.com/paper/paper.js ；Project：https://paperjs.org/reference/project/
- rough.js：https://roughjs.com/ ；https://roughjs.com/posts/release-4.0/ ；https://github.com/rough-stuff/rough
- SVG.js：https://svgjs.dev/docs/3.x/ ；https://github.com/svgdotjs/svg.js
- JointJS：https://www.jointjs.com/opensource ；https://github.com/clientio/joint ；命名空间：https://docs.jointjs.com/4.1/learn/features/customizing-shapes/cell-namespaces/

### 8.2 规范、论文与技术资料

- W3C SVG Marker：https://svgwg.org/specs/marker/
- W3C SVG arc 实现注记：https://www.w3.org/TR/SVG/implnote.html
- W3C transform：https://www.w3.org/TR/SVG/coords.html#TransformAttribute
- MDN marker：https://developer.mozilla.org/en-US/docs/Web/SVG/Element/marker
- MDN paths：https://developer.mozilla.org/en-US/docs/Web/SVG/Tutorial/Paths
- MDN transform：https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/transform
- MDN text：https://developer.mozilla.org/en-US/docs/Web/SVG/Element/text
- de Casteljau：https://en.wikipedia.org/wiki/De_Casteljau%27s_algorithm
- RDP：https://en.wikipedia.org/wiki/Ramer%E2%80%93Douglas%E2%80%93Peucker_algorithm
- simplify.js：https://github.com/mourner/simplify-js
- 点在多边形内：https://en.wikipedia.org/wiki/Point_in_polygon
- 鞋带公式：https://en.wikipedia.org/wiki/Shoelace_formula
- 线线相交：https://en.wikipedia.org/wiki/Line%E2%80%93line_intersection
- Catmull-Rom 与贝塞尔：https://arxiv.org/abs/2011.08232 ；https://arxiv.org/html/2011.08232v1
- JointJS 曲线博客：https://www.jointjs.com/blog/how-to-create-nice-looking-curves-in-svg-with-fixed-tangents
- AGG 自适应贝塞尔：https://agg.sourceforge.net/antigrain.com/research/adaptive_bezier/index.html
- 手绘平滑：https://www.xjavascript.com/blog/how-to-smooth-a-freehand-drawn-svg-path/
- 签名采样阈值：https://www.npmjs.com/package/expo-signature-canvas
- 三点定圆：https://math.berkeley.edu/~giventh/3pts.pdf
- 旋转椭圆包围盒：http://ael.chungbuk.ac.kr/lectures/undergraduate/%EB%AF%B8%EB%9E%98%EC%84%A4%EA%B3%84-2/2022-2/rotated-ellipse/ellipse.pdf
- Maple 自适应采样：https://fr.maplesoft.com/support/help/Maple/view.aspx?path=plot%2Fadaptive
- Sympy 自适应与奇点：https://sympy-plot-backends.readthedocs.io/en/v3.1.1/modules/graphics/functions_2d.html

### 8.3 调研诚实声明

- 各报告中检索不到确证的条目均已显式标注（如 tldraw 撤销具体类名、Fabric v6 子类注册函数名、Paper.js inject API），未以推测填充。
- 工程经验参数共 4 处（硬角 20°、多边形闭合 4px、最小面积 20px²、标注偏移量），落地时集中于 config.js 并标注为待实测调参项。
- 完整一手调研见三份子报告（路径见文首），本文所有行号引用以当前仓库源码为准。
