# DrawPhy 开发路线图（2026-11 起）

> 输入：`docs/codebase-review.md`（为什么排这个顺序）· `docs/modular-framework.md`（模块化契约）· `docs/developer-guide.md`（怎么动手）
> 每个阶段给出：目标 / 涉及文件 / 步骤（编号即执行顺序）/ 验收标准 / 风险与回滚。
> **执行纪律**：一次只做一个阶段；每阶段开始前 `git commit` 留点；验收全绿才算完成；阶段日志追加到 `docs/dev-progress.md`。

---

## 阶段 0：版本控制（半天，立即执行）

**目标**：消灭「无 git」这个全库最高危债务。

1. `git init`；写 `.gitignore`（排除 `backup/`、`_check/*.png`、`*.log`、`.DS_Store`）；首提交全部现状。
2. 核对 backup/ 里 5 份快照不纳入版本库（已在 .gitignore）。
3. 从此**每个阶段一个 commit、每次验证通过一个 commit**；手工 backup 流程退役。

**验收**：`git log` 有初始提交；`git status` 干净。
**风险**：无。

---

## 阶段 5：part 宿主模块 + 部件数据化 + 命名端子（2-3 周，业务价值最高）

**目标**：让「部件」成为一等公民——part 类型模块化、114 部件走 registry、导线能粘到「电池正极」这种**命名端子**。

**背景**：13/16 类型已模块化，剩 `point`、`part`（以及内建 `func`）。部件当前由 `parts.js` 的 `DP.parts.byId` 独立维护，registry 的 parts 表闲置；部件没有语义端点，粘附纯靠几何。

**涉及文件**：新增 `src/modules/host/part.js`、`src/modules/host/point.js`；改 `parts.js`、`core.js`（moduleOf 已有）、`render.js`（R.primitive）、`index.html`、两个测试页；新增部件端点数据。

**步骤**：

1. **R.primitive 接入 registry**（先修漂移面）：部件内部图元渲染从旧 switch 改为 `registry.get(type).render` 优先、旧 switch 兜底。部件全由已迁移 primitives 组成，此步无行为变化。
2. **part 宿主模块**：`part.js` 实现契约——`bbox`（部件局部包围盒 × partMatrix）、`hitTest`（先局部坐标逆变换再逐图元测）、`translate/scale/mirror`（变换 partMatrix，注意 mirror 目前对 part 是禁用的，先保持禁用）、`render`（逐图元委托 + 整体 transform 属性）。**不许改部件局部坐标系定义。**
3. **部件数据化**：`parts.js` 每个部件定义追加 `terminals: [{id:'+', x, y, label:'正极'}, ...]`（先给电学类 30 个部件标端子，其余类为空数组）。`registry.registerPart(def)` 启用，`DP.parts.byId` 改为 `registry.getPart` 薄包装（旧 API 不变）。
4. **命名端子**：吸附引擎不动；在 `S.collectPoints` 的部件分支里把 terminals 作为 `kind: 'terminal'` 吸附点输出（端子 id 透传）。`bind` 扩展为可记 `terminal: '+'`，`applyBindings` 优先按端子解析位置（端子坐标 = partMatrix × 局部端子点），无 terminal 字段的旧 bind 走原包围盒偏移逻辑——**旧文件兼容**。
5. **交互收益**：导线端点吸到端子时，属性面板/悬停可显示「正极」；移动部件时导线跟随精度提升（端子是精确点而非包围盒中心推算）。
6. **point 模块**：最后把 point 迁完（最简单，留作收尾练手）。此时 16/16 全模块化。
7. **双轨收敛**：全量 diff 每个类型「模块实现 vs 旧 switch」，确认一致后删除 core/ui/render 中的旧 switch 分支（保留 `moduleOf` 空值兜底 = 未注册类型抛可读错误）。**这是双轨时代的终点。**

**验收**：
- 逻辑/交互/png 三件套全绿，且新增断言：part 模块 bbox/hitTest/变换 ≥6 条、端子吸附 ≥3 条、旧格式 bind 兼容 ≥2 条；
- `index.html?sample=1` 串联电路示例中，从电池拖到电阻的导线端点 hover 显示端子名；
- 阶段 5 前保存的 JSON 原样打开、导线跟随无偏移。

**风险**：partMatrix 逆变换的数值精度（测试用 1e-6 容差锁死）；端子字段污染旧文档（只增不改，fromJSON 不处理即可）。

**回滚**：`git revert` 阶段 5 各 commit。

---

## 阶段 6：命令式历史 + ui.js 切分（2-3 周，架构天花板）

**目标**：用命令对象替代全量 JSON 快照，彻底解决 80 步上限与每步 O(n) 序列化；顺手把 ui.js 按职责切成 4 个文件。

**涉及文件**：改 `core.js`（DP.history 重写）、`src/ui.js` 拆分为 `src/ui/{tools,pointer,text-edit,panels}.js`（全部挂 `DP.ui`）、`eventbus.js` 启用；index.html 与测试页脚本块更新。

**步骤**：

1. **eventbus 启用**：定义事件表（`history:push / history:undo / model:changed / selection:changed / tool:changed`）；`DP.state` 关键写点改经 bus 广播，ui.js 订阅刷新（订阅前先保留命令式调用作为双轨，同阶段 5 纪律）。
2. **命令对象**：`{id, label, do(), undo(), mergeKey?}`。mergeKey 用于连续操作合并（拖动 1 秒 = 1 步，而不是 60 步）。命令生成方式：**不逐个手写**——在 `afterChange` 处做「前后快照差分」自动生成 undo 数据（对 objects 做 id 级 diff：added/removed/modified），保持现有调用点零改动。这是「自动命令化」，比手写命令便宜 10 倍且同样达到 O(Δ) 存储。
   - 说明：若差分实现复杂度过高，退而求其次：快照改存 objects 的引用 + 写时复制（copy-on-write），栈里只存变化的对象。二选一，评审倾向前者。
3. **history 重写**：栈存命令，上限 200；undo/redo 回放；`dirty` 改为命令计数与栈指针比较得出。
4. **ui.js 切分**（与 2/3 同车做，因为两者都大改 ui.js，分开做要吃两遍回归）：
   - `ui/tools.js`：buildTools / toolsFromRegistry / applyStyle / buildParts / bindTopbar；
   - `ui/pointer.js`：bindBoard / onDown / onMove / onUp / onDbl / hitTest / getNodes / setNode / snap / buildPreview / createShape / trim / erase；
   - `ui/text-edit.js`：openTextEditor / commitText / cancelText；
   - `ui/panels.js`：renderProps / bindProps / ctxmenu / clipboard / group / autosave。
   - 拆分时**只做机械搬移**：函数体一行不改，文件头挂到同一 `DP.ui` IIFE 的等价结构。
5. **两段式命中**：`ui.js` 的 `hitTest` 先按 `M.bbox` 粗筛（容差扩 4px）再调模块 `hitTest`。

**验收**：
- 三件套全绿；新增断言：undo/redo 在「创建→拖动→缩放→删除→成组」序列后逐步回放位置/几何完全一致（≥5 步回放比对）；连续拖动合并为 1 条历史；
- 性能基线：800 对象文档连续绘制 50 步，单步耗时 < 阶段 5 基线的 30%（用 `performance.now()` 在测试页打点）；
- ui.js 拆分后 4 个新文件总行数 ≈ 2353 ± 20（纯搬移验证）。

**风险**：历史是用户数据安全攸关的子系统——**第 2 步先写历史专项测试页 `_check/history.html`**（构造 20 步随机操作序列，逐步 undo 回初始、再 redo 到终态，深比较 objects），全绿后才允许替换实现。

**回滚**：`git revert`；旧 history 实现保留到验收后一个 commit 再删。

---

## 阶段 7：打磨与防御（1 周，可穿插）

- textbox/callout 创建改走 `mod.defaults()`（评审问题 2.3-2 收尾）。
- `compileFunc` 加超时守卫（表达式死循环保护）。
- autosave 增加多文档槽位 localStorage。
- 帮助面板补快捷键总表。
- 每完成一项跑三件套。

---

## 阶段 8：新能力（按需求排期，每项独立成阶段）

| 能力 | 方案 | 预估 |
| --- | --- | --- |
| 任意角旋转 | 对象加 `rotation` 字段；bbox 取旋转后包络；手柄环形拖动。模块契约加可选 `rotate(o, rad)` | 1 周 |
| 多页 | `pages[]` + 页签栏；文档 version bump 到 2，fromJSON 保留 v1 读取 | 1 周 |
| PDF 导出 | 打印样式表 + `window.print()`（用户另存 PDF），零依赖 | 2 天 |
| 图层 | `o.layer` + 图层面板；先只读（显隐/锁定）后排序 | 1 周 |
| 修剪扩展（圆/弧参与） | G 层已有 segCircle/circleCircle 求交，扩 doTrim 分派 | 3 天 |

每项验收：三件套 + 该功能专项断言 + 旧文件兼容断言。

## 阶段 9：长期（无明确排期）

- 布尔运算（path 层面，工作量大，评估后再立项）
- 富文本 / LaTeX 公式（教学场景高价值，需自研或引入唯一例外依赖——需专项评审）
- 协作/云存储（不符合纯本地定位，不做，除非产品转向）

---

## 路线图总览

```
阶段 0  git init                    ▮ 半天   [阻断级债务]
阶段 5  part 模块化/部件数据化/端子   ▮▮▮ 2-3周 [业务价值最高]
阶段 6  命令式历史 + ui.js 切分      ▮▮▮ 2-3周 [架构天花板]
阶段 7  打磨与防御                  ▮ 1周
阶段 8  旋转/多页/PDF/图层           按需
阶段 9  布尔/公式/协作               评估后
```

**给执行者的最后一句话**：阶段 5 和 6 是「现在必须做的」，7 是「顺手做的」，8/9 是「被需要时才做的」。任何时候发现本路线图与代码现状矛盾，以代码+测试为准修正本文档，并在 dev-progress.md 留痕。
