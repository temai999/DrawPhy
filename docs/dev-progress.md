# DrawPhy 模块化重构 · 开发日志

> 重构前备份：`backup/pre-modular-20261105`
> 框架依据：`docs/modular-framework.md`（评审稿 v1）
> 硬约束：零第三方依赖 / 纯静态无构建 / 原生 SVG / 禁止 ES module import-export（普通 `<script>` + IIFE 挂全局 `DP`，file:// 双击可用）/ editor.css 零改动 / ribbon 视觉零变化 / 114 部件 + 23 工具不丢失 / 旧工程文件（partId、bindEndpoint）可打开。

---

## 阶段 0：核心地基（已完成）

### 改动文件清单
- 新增 `src/core/config.js`（DP.config，全部可调常数集中）
- 新增 `src/core/module-wrap.js`（DP.defineModule，框架 5.2）
- 新增 `src/core/registry.js`（三表 registry，框架 5.3）
- 新增 `src/core/eventbus.js`（DP.bus on/emit，框架 5.7 顶部）
- 修改 `index.html`：4 个 core 脚本按 config→module-wrap→registry→eventbus 顺序插在 `src/core.js` 之前

### 关键决策
1. **defaults 取真实代码值，不取任务书占位值**：核对 `core.js:530` 的 `DP.state.style` 真实默认值为 `stroke:'#22303c' / width:2 / dash:'solid' / fill:'none' / opacity:1 / fontSize:18`，因此 `config.defaults = {stroke:'#22303c', fill:'none', strokeWidth:2, fontSize:18}`（任务书给的 `#1f2937/#e8f0fe/16` 为占位）。
2. **阶段 0 不回流旧常数**：旧代码（ui.js 里 7/k、10/k、RDP 1.6 等）本轮全部保持原样，config 仅供新模块与后续阶段使用，确保行为零变化、可随时回退。
3. registry 必需字段校验沿用框架 5.3（version/meta/defaults/bbox/hitTest/render），重复注册同 type 时按 version 高者覆盖并 console.warn；menu 槽位先替换同 type 槽位再按 order 排序。
4. bus.emit 对 handler 异常做 try/catch 隔离，单订阅者异常不影响其他订阅者；on 返回退订函数。

### 验证结果
- `node --check`：新增 4 文件 + 全部旧文件共 10 个全部 OK（node v22.23.2）。
- E2E（`index.html?sample=1&fresh=2101/2102`，真实浏览器）：
  - console 零错误；`DP.config` 存在（hitTol=10、defaults 为真实值 `#22303c/none/2/18`）；registry/bus/defineModule 就绪；bus 往返测试通过；示例 36 对象正常渲染。
  - ribbon 顶部 y=38、高 156，无纵向裁切；点选线条→选中（蓝框+端点手柄+属性面板「已选 1 个·line」）正常；绘图/部件 tab 切换、分类 inline 面板、15 个光学部件缩略图渲染无遮挡溢出。

### 遗留问题
- config 常数尚未回流旧代码（有意为之，阶段 0 保持行为零变化）；bus 目前无真实订阅者（阶段 2+ 接入）。

---

## 插入需求：快捷键帮助面板（文件 tab → 帮助菜单）

### 改动文件清单
- `index.html`：文件 rgroup 新增「帮助」rcell（按钮 `id=btnHelp`，沿用 rcell/rcells/rcap 结构）；右侧 aside 删除「快捷键」panel-title + `.keys` 整块。
- `src/ui.js`：新增 `toggleHelp/closeHelp/buildHelpHtml`（`.stage` 内绝对定位卡片，无遮罩，可 Esc/关闭按钮收起）；bindTopbar 绑定 btnHelp；bindKeys Escape 分支插入帮助关闭。
- editor.css **零改动**：面板复用现有 `.props-title/.props-sub/.keys/.keys kbd/.mini` class。

### 关键决策
1. **数据驱动纠正了旧速查表错误**：旧 aside 把 `M` 标为「标注」（实为尺寸 dim），且漏 J/O/D/H/Q/Z 六键；帮助面板直接从 TOOLS 生成，工具快捷键永远单数据源。
2. 面板为 `.stage` 内居中卡片（非 fixed 浮层、无遮罩），满足「干净可关闭、无深色遮罩」；不弹 dock/popover。
3. 首版布局 bug：`.keys` 是 flex-column，直接放 kbd 会被拉成整行大框 → 每组包一层 row `<div>` 修复（E2E 截图已确认）。

### 验证结果
- node --check OK；E2E：文件 tab 可见「快捷键」入口；点击展开面板含 23 工具（按 绘图/文字与标注/编辑 分组）+ 4 行通用快捷键；Esc 与「关闭」按钮均可收起；右侧 aside 仅剩「属性」；console 零错误；截图无溢出。

### 遗留问题
- 无。

---

## 阶段 1：P0 修复（在旧架构内修）

### 改动文件清单
- `src/core.js`：新增 `G.parsePath / pathBBox / pathDistance / pathAnchors / serializePath / mapPath`（支持 M/L/H/V/Q/T/C/S/Z 及相对命令）；`M.localBBox` 补 `path`；`M.translateObj / scaleObj / mirrorObj` 补 `textbox / callout / path`；`S.collectPoints` 补 `dim / angle / textbox / callout / path`，callout 额外提供指向点。
- `src/ui.js`：`hitObject` 补 `textbox / callout / path`，dim 命中覆盖基线、尺寸线与延伸线；`U.rotate` 统一写入 `rot` 并兼容旧 `rotate`；右键「水平/垂直镜像」改走 `U.mirror`；删除滚轮 `|| true` 死条件；新增部件库按住拖入画布（5px 阈值、半透明 ghost、画布高亮、松手落件）；启动时按当前标签页展开对应 `rgroup`。
- `src/render.js`：文字渲染优先读 `rot`，旧工程 `rotate` 自动兼容。
- `_check/test.html`：逻辑断言 17 → 34（path 解析/包围盒/命中/平移缩放镜像、五类吸附锚点、文字旋转字段）。
- `_check/interact.html`：交互断言 17 → 26（真实拖入链路、textbox/callout/path 点选与拖动）；分类数更新为 11。

### 关键决策
1. **path 包围盒用解析解**：直线取端点，二次/三次贝塞尔求导数极值点，不采样；`A` 命令暂按终点直线近似（顶层 path 只由贝塞尔工具生成，部件内部 path 不参与顶层包围盒）。
2. **path 命中才允许折线逼近**：二次 12 段、三次 18 段，避免命中测试引入复杂求根；包围盒仍保持解析精度。
3. **文字旋转字段统一为 `rot`**：渲染同时兼容旧 `rotate`，打开旧工程再旋转时自动迁移，避免 `render.js:56 / ui.js:1958` 的字段分裂。
4. **部件拖入与单击共存**：指针移动 <5px 视为单击，仍进入连续放置模式；移动 ≥5px 生成 `.drag-ghost`，松手仅在画布内落件并自动切回选择工具。
5. **修正启动空白 ribbon**：`index.html` 所有 `.rgroup` 默认 `hidden`，旧 `init` 只展开分类却没展开标签组；现在先按 `.on` 标签页同步 `hidden`，再打开首个分类。

### 验证结果
- `node --check`：`core.js / ui.js / render.js / parts.js` 全部通过。
- 逻辑自检 `_check/test.html`：**34/34 通过**。
- 交互自检 `_check/interact.html`：**26/26 通过**，含部件拖入、textbox/callout/path 点选与 path 拖动。
- 真实页面 `index.html?sample=1`：无头 Chrome 截图正常，ribbon 首屏展开、示例 36 对象渲染、console 零错误。
- 截图：`_check/p0-sample2.png`。

### 遗留问题
- 普通图形（矩形/椭圆/弧等）仍不支持任意角度旋转；文字包围盒未随旋转更新。
- path 的 `A` 命令包围盒/命中仍是直线近似；顶层贝塞尔暂未升级为三次曲线 + 控制柄。
- 阶段 2 已完成，见下节；上述旋转与曲线升级留待阶段 3+。

---

## 阶段 2：rect/arrow 试点模块 + 双轨分派（已完成）

### 改动文件清单
- 新增 `src/modules/primitives/rect.js`（type `rect`，含 `rx > 0` 圆角矩形）与 `src/modules/primitives/arrow.js`（type `arrow`，`style.arrow = end | both | none` 覆盖单/双箭头）。
- 修改 `src/core.js`：新增 `DP.geometry` 别名与 `M.moduleOf`；`M.localBBox / translateObj / scaleObj / mirrorObj`、`S.collectPoints` 改为 registry 优先、旧 switch 兜底；模块锚点增加 `kind → 中文标签` 映射。
- 修改 `src/render.js`：新增 `R.drawable`（tag/attrs/children → SVG 字符串）；`R.object` registry 优先。
- 修改 `src/ui.js`：`hitObject / getNodes / setNode` registry 优先；`shapeFrom` 对矩形、圆角矩形、单/双箭头调用模块 `defaults` 工厂，旧 switch 仅兜底。
- 修改 `index.html`：在 `core.js` 之后加载两个试点模块，普通 `<script>`，file:// 可用。
- `_check/test.html`：34 → **48** 项；`_check/interact.html`：26 → **38** 项；`_check/png.html` 增加 rect/arrow 导出对象。
- `README.md`、`docs/dev-progress.md` 同步阶段状态。

### 关键决策
1. **双轨分派只替换已知钩子**：模块存在且声明对应函数时优先调用；其余类型/钩子原样走旧 switch，任何模块缺失都不会让页面失效。
2. **模块产 drawable，不直接拼字符串**：`rect/arrow` 的 `render` 返回 `{tag, attrs, children}`，由 `R.drawable` 统一转 SVG；为后续屏幕/PNG/SVG 共用与渲染 diff 留出中间层。
3. **试点模块不改变视觉**：箭头仍用旧公式 `max(8, width*4.2)` 与 line + polygon 双节点；本轮只迁移架构，不在试点里混入新箭头几何。
4. **工厂职责分离**：`defaults(props)` 只返回字段与样式，`type` 由 `shapeFrom` 补；`roundrect` 映射到 `rect` 模块并写 `rx`，`darrow` 映射到 `arrow` 模块并写 `style.arrow='both'`，保证旧工程字段不变。
5. **命中/节点行为原样保留**：rect 的“内部即命中”、arrow 的线距离命中、节点 key（`nw/ne/se/sw`、`x1/x2`）均与旧代码一致，避免试点阶段引入手感回归。
6. **锚点 kind 标准化**：模块声明 `endpoint/midpoint/center`，核心映射为“端点/中点/中心”，旧吸附提示文本不变。

### 验证结果
- `node --check`：`core.js / render.js / ui.js / rect.js / arrow.js` 全部通过。
- 逻辑自检 `_check/test.html`：**48/48 通过**（新增模块注册、menu 槽位、rect/arrow defaults/bbox/变换/节点/锚点/drawable、自定义探针模块证明 registry 优先）。
- 交互自检 `_check/interact.html`：**38/38 通过**（真实拖拽创建矩形/箭头、模块工厂调用、矩形节点缩放、箭头点选与移动）。
- PNG/SVG 导出 `_check/png.html`：PNG 合法（约 32KB），SVG 序列化通过；导出对象包含模块渲染的 rect/arrow。
- 真实页面 `index.html?sample=1`：console 零错误，36 个示例对象正常渲染，`registry` 为 `shapeCount=2 / menuCount=2`，首屏 ribbon 正常；截图 `_check/stage2-sample.png`。

### 遗留问题
- ribbon 仍读 `TOOLS / DP.parts`，尚未消费 registry menu 表；试点模块虽已写入 menu 槽位，但不影响现有按钮。
- 除 rect/arrow 外的 13 种运行时 type 仍走旧 switch；`R.primitive` 尚未纳入模块分派。
- 箭头头仍沿用旧尺寸公式；自由旋转、三次贝塞尔、`A` 命令精确包围盒等留待后续阶段。
- 模块重复注册的版本覆盖策略已在 registry 实现，尚无真实插件升级场景。

---

## 阶段 3：primitives 批量迁移（已完成）

> 说明：本阶段代码先于日志落地（`index.html` 已加载 7 个新模块，日志一度停留在「未开始」），2026-11-05 13:00 补记并补齐自检覆盖。

### 改动文件清单
- 新增 `src/modules/primitives/line.js`（type `line`，端点 + 中点锚点）
- 新增 `src/modules/primitives/circle.js`（非等比缩放降级为 `ellipse`，保留旧语义）
- 新增 `src/modules/primitives/ellipse.js`（`rx/ry` 双节点）
- 新增 `src/modules/primitives/polyline.js`（折线/多边形共用，`o.closed` 区分，闭合时补收尾段）
- 新增 `src/modules/primitives/arc.js`（bbox 24 点采样；命中含 360° 回绕；镜像同步翻转 `a0/a1`）
- 新增 `src/modules/primitives/path.js`（bbox/命中/锚点/变换全部委托 `G.pathBBox / pathDistance / parsePath / mapPath`）
- 新增 `src/modules/primitives/text.js`（字号估算 bbox；上下标 tspan 树；`rot` 优先、兼容旧 `rotate`）
- 修改 `index.html`：在 `ui.js` 之前按 rect→arrow→line→circle→ellipse→polyline→arc→path→text 顺序加载
- 修改 `src/ui.js`：`moduleShapeFrom` 补 `line / circle / ellipse` 分支；`toolsFromRegistry` 消费 registry menu 槽位
- `_check/test.html`：加载全部模块，新增第 15 节模块级断言；48 → **75** 项
- `_check/interact.html`：加载全部模块，新增第 7.7 节模块交互断言；38 → **43** 项

### 关键决策
1. **`DP.render` 必须懒查找**：模块工厂在 `render.js` 之前执行，工厂内 `var R = DP.render` 恒为 `undefined`；统一改为在 `render` 方法内取 `DP.render`。
2. **arc 的镜像不能链式覆盖**：先缓存 `A0/A1` 再写回，`axis='v'` 用 `-A1/-A0`、`axis='h'` 用 `180-A1/180-A0`，保证跨度不变、large/sweep 标志仍正确。
3. **path 只迁移不换算法**：模块直接委托既有 `G.*`，避免迁移期同时改行为和实现；三次贝塞尔与控制柄编辑仍留待阶段 6+。
4. **circle 降级逻辑保留在模块内**：`|sx-sy|>0.01` 时把对象改写为 `ellipse` 并删除 `r`，与旧 switch 完全一致，旧工程打开行为不变。
5. **text 用 tspan 树而非拼字符串**：与 `R.drawable` 对齐，后续导出/屏幕共用同一条渲染路径；`^`/`_` 的 dy 累加逻辑与旧 `textSvg` 等价。

### 验证结果
- `node --check`：全部 20 个 JS 文件通过。
- 逻辑自检 `_check/test.html`：**75/75**（新增 11 模块注册与契约完整性、逐类型 bbox/命中/变换/渲染、circle 降级、arc 角度镜像、text 上下标、菜单槽位 8+3）。
- 交互自检 `_check/interact.html`：**43/43**（含 textbox/callout 经模块命中和拖动）。
- 真实页面 `index.html?sample=1`：无头 Chrome 无控制台异常，示例图正常渲染。

### 遗留问题
- `R.primitive`（部件内部图元、部件缩略图）仍只走旧 switch，尚未纳入 registry 分派；部件内部渲染与顶层对象存在两条路径。
- `point / dim / angle / part` 仍是纯旧 switch。
- 文字包围盒尚未随旋转更新（`rot` 只影响渲染）。

---

## 阶段 4：text / annotation 迁移（已完成，两批）

### 第一批：textbox / callout

#### 改动文件清单
- 新增 `src/modules/primitives/textbox.js`（type `textbox`）：bbox = 矩形本体；命中含 2px 外扩；锚点 4 角 + 中心；缩放时字号按 `k=(|sx|+|sy|)/2` 同步。
- 新增 `src/modules/primitives/callout.js`（type `callout`）：bbox 同时包住尖点与文本框；命中 = 文本框 ±2px 或贴近引线；锚点额外提供「指向点」（`label:'指向点'` 覆盖默认 kind 文案）。
- 修改 `index.html`：在 `text.js` 之后加载 textbox、callout。
- 两个模块均声明 `menu`（text 分类，order 110 / 120），`toolsFromRegistry` 自动按序排列，ribbon 视觉与原先一致。
- `_check/test.html` / `interact.html`：补 `textbox` 与 `callout` 的模块级与交互级断言。

#### 关键决策
1. **节点手柄保持空实现**：旧 `getNodes` 对 textbox/callout 返回 `[]`，模块同样返回 `[]`，避免迁移顺手引入新交互。
2. **标注锚点用 `label` 而非新增 kind**：核心 `anchorLabel` 优先读 `a.label`，因此「指向点」提示文案不变，无需改核心映射表。
3. **镜像按包围盒中心对称**：textbox 用 `2cx-(x+w)`，callout 分别翻尖点与文本框，保证镜像后包围盒中心不动。
4. **渲染仍走 drawable**：rect/line/circle/text 四类节点由 `R.drawable` 统一序列化，文字内容显式 `R.escape`（`R.drawable` 只转义属性、不转义子文本）。

### 第二批：dim / angle

#### 改动文件清单
- 修改 `src/render.js`：局部函数 `arrowHead` 挂到 `R.arrowHead`，供模块复用同一套箭头头几何（模块路径与旧 switch 同源，不会出现两套公式）。
- 新增 `src/modules/primitives/dim.js`（type `dim`）：bbox 沿用 `offset` 公式；命中 = 基线（2×tol）/ 尺寸线（2×tol）/ 两条延伸线（tol）；锚点两端点 + 中点；缩放时 `offset *= k`；渲染 3 线 + 2 箭头 + 数值标签（`label || value/unit`，`R.escape`）。
- 新增 `src/modules/primitives/angle.js`（type `angle`）：bbox = 外接圆；命中容差 `tol*1.5`；锚点顶点 + 两端点；**镜像只翻圆心、不翻 `a0/a1`**（与旧 switch 完全一致，迁移期不顺手改语义）；渲染弧 + 角度文字。
- 修改 `index.html` / 两个自检页：加载 dim、angle；test.html 模块清单 11 → 13，菜单断言改为 shape 8 项 / text 5 项。
- `_check/interact.html` 新增 7.8 节：dim 两击创建 + 尺寸线点选；angle 三击创建 + 弧线点选。

### 验证结果（两批合并）
- `node --check`：22 个 JS 文件全部通过。
- 逻辑自检 `_check/test.html`：**83/83**（新增 dim bbox/命中/渲染计数/偏移同比缩放，angle 弧线命中/半径同比缩放/镜像语义）。
- 交互自检 `_check/interact.html`：**47/47**（textbox/callout/dim/angle 全部经模块命中、拖动或创建）。
- 真实页面 `index.html?sample=1`：无头 Chrome 无控制台异常；截图 `_check/stage4-sample.png`（ribbon、示例图、属性面板均正常）。

### 遗留问题
- `point / part` 仍在旧 switch（part 属阶段 5：part 宿主模块 + 11 个 parts-data 包 + 命名端子）。
- textbox/callout 的创建仍在 `ui.js` 内联构造，尚未走模块 `defaults` 工厂（与 rect/arrow 的创建路径不一致）。
- 文字/标注的旋转、自动换行、富文本仍不支持；文字包围盒未随 `rot` 更新。

---

## 下一步（阶段 5）
1. part 宿主模块：`bbox/hitTest/anchors/translate/scale/mirror/render`，`partMatrix` 矩阵渲染入模块。
2. 114 部件拆为 parts-data 数据包（registry parts 表启用，`registerPart` 落地），`DP.parts` 改为兼容别名。
3. 命名端子 anchors：导线可粘附到「正极 / 负极 / 端子」等命名位置。
4. 顺带把 textbox/callout 创建改走 `mod.defaults()`，统一构造路径。

---

## 2026-11-05 下午：全库评审 + 三份开发文档（无代码改动）

### 产出
- `docs/codebase-review.md`——结构/实现/UI/业务四维评审，13 项问题分级（🔴×2：无 git、全量快照历史天花板；🟡×4：双轨漂移面、ui.js 巨石、registry parts 闲置、R.primitive 未接入）。
- `docs/developer-guide.md`——面向执行 agent 的操作手册：黄金法则 8 条、目录地图、数据模型、模块契约全表、新增图元 12 步、验证命令原文、禁止事项表（每条标注真实事故出处）、文件模板。
- `docs/roadmap.md`——阶段 0-9 路线图：阶段 0 git init（立即）→ 阶段 5 part 模块化/部件数据化/命名端子 → 阶段 6 命令式历史+ui.js 切分 → 阶段 7 打磨 → 阶段 8 新能力 → 阶段 9 长期项。每阶段含步骤/验收/风险/回滚。

### 决策记录
- 历史改命令式采用「afterChange 前后快照差分自动生成 undo 数据」方案（不逐命令手写），并需先建 `_check/history.html` 专项页（随机操作序列 undo/redo 深比较）再替换实现。
- 对象字段命名冻结（存量 JSON 兼容优先）；吸附引擎冻结；双轨在阶段 5 末收敛为单轨。

---

## 阶段 5（上）：part/point 宿主模块 + 命名端子（2026-11-05）

### 改动文件清单
- 新增 `src/modules/host/part.js`（type `part`）：bbox = partMatrix×局部四角；命中 = 世界包围盒±2（旧语义）；anchors = 四角+中心+**命名端子**（局部端子点经 partMatrix 映射，携带 `tid`）；scale = 包围盒中心定位 + s×k；**mirror 保持旧语义（只翻 flip 标志，不平移）**；render = matrix 组逐图元委托。
- 新增 `src/modules/host/point.js`（type `point`）：bbox/hitTest/平移/缩放/镜像/渲染全部对齐旧 switch。
- `src/render.js`：**R.primitive 接入 registry 优先分派**（阶段 5.1），部件内部图元渲染不再绕过模块，顶层与内部渲染同源。
- `src/core.js`：collectPoints 透传锚点 `tid`；S.resolve 返回 `terminal`；新增 `M.terminalPoint(o, tid)`；`bindEndpoint` 第四参 terminal（偏移相对端子点记录）；`applyBindings` 端子绑定优先按 partMatrix 精确重算，端子缺失自动回退包围盒中心（旧格式完全兼容）。
- `src/ui.js`：snap 包装返回 terminal；三处线条绑定点 + 节点拖动透传 terminal；`placePartAt` 改走 `mod.defaults()` 工厂（**修出真实 bug：工厂返回值缺 type 字段**，已在模块 defaults 内补齐）。
- `src/parts.js`：新增 `TERMINALS` 映射，**31 个电学部件**标出命名端子（电池正负极、二极管/LED 阴阳极、变压器原副边、开关公共端/触点、接地端等）；`registry.registerPart` 启用，114 部件全部入 registry parts 表（`DP.parts.byId` 保持同引用兼容）。
- `index.html` / `_check/test.html` / `_check/interact.html` 同步加载 host 两个模块；interact.html 增加 window.onerror 采集（输出 PAGE_ERRORS）。
- 建立 git 版本控制（阶段 0）：初始提交 + 换行符配置，backup/ 与 _check/*.png 已 gitignore。

### 验证结果
- `node --check` 24 个 JS 全部通过。
- 逻辑自检 **98/98**（新增 15 条：part bbox/命中/端子锚点/变换/镜像语义、terminalPoint、端子绑定写入与精确跟随、旧格式兼容、collectPoints 透传、registry parts 表、point 契约）。
- 交互自检 **50/50**（新增 3 条：端点吸附命名端子、绑定记录 terminal='+'、移动宿主端子精确跟随）。
- PNG 导出链路产出 32265B 合法图片；`index.html?sample=1` 无控制台异常，截图 `_check/stage5-sample.png` 界面正常。

### 遗留问题
- 阶段 5 收尾未做：旧 switch 中 `part/point` 分支摘除 + 全类型双轨收敛为单轨（需先 diff 模块与旧实现一致性）。
- 电学以外类别（光学/力学/热学等 83 个部件）暂未标端子，terminals 为空时行为同旧版。
- 属性面板/悬停尚未展示端子名（数据与绑定已就绪，属 UI 增强）。
- 阶段 4 遗留的 fillAll 消费端仍缺失（填充工具对部件设置了 fillAll 但渲染未消费，为迁移前既有问题）。

---

## 阶段 5（下）：收尾——端子数据全覆盖 + 单轨收敛（2026-11-05）

### 改动文件清单
- `src/parts.js`：TERMINALS 新增 32 个部件的命名端子——光学 9（透镜入射/出射点、棱镜三顶点、镜面两端、光纤出入光口、光箭首尾、光源中心）、力学 10（弹簧/绳/杆两端、测力计提环与挂钩、滑轮悬挂点、地面两端、钩码挂钩、力箭头作用点）、通用 5（坐标轴原点与轴端、双/弯/直箭头端）、连接线 5（首尾端）、化学键 3（两原子端）。**63/114 部件带命名端子**，其余纯几何图形（方框/表格/烧杯等）四角锚点已够，刻意不标。
- `src/ui.js`：属性面板增强——选中 part 显示端子清单（名称 · 分隔）；选中 line/arrow 显示粘附信息（起点/终点→宿主名称+端子名，宿主已删有兜底文案）。
- **单轨收敛**（删除全部已迁移类型的旧 switch 分支，共 -418 行）：
  - `core.js`：localBBox/translateObj/scaleObj/mirrorObj/collectPoints 五处，未注册类型回退安全默认（零包围盒/不可变换/无锚点）+ 一次性 console.warn 告警。
  - `ui.js`：hitObject/getNodes/setNode 三处，未注册类型不可命中/无节点。
  - `render.js`：R.object 的 arrow/dim/angle/part/textbox/callout 六个 case 与失去调用方的 lineWithArrows 删除，未注册类型回退 R.primitive。
  - 架构从此「单轨」：registry 模块是唯一行为来源；旧 switch 双轨彻底退役（评审问题 2.3/3.3 关闭）。

### 验证结果
- `node --check` 全部通过；逻辑 **98/98**、交互 **50/50**、PNG 导出 31758B 合法。
- `index.html?sample=1` 无控制台异常（含未注册类型告警零触发），截图 `_check/stage5-final-sample.png`：受力分析/凸透镜光路/串联电路三图完整。

### 过程教训（写入开发手册素材）
- **Git Bash heredoc 会把 Python 字符串里的 `\n` 篡改成 `/n`**（MSYS2 路径转换）：行级字符串匹配静默失配。对策：改文件的 Python 脚本一律用 Write 工具落盘为 .py 文件再执行，或脚本内用 `chr(10)`。
- core.js 首刀切除时按 `};` 找函数尾，撞上 `return { ... };` 语句误切；对策：按「下一个函数头」作右边界，不按字符尾巴。

### 阶段 5 全部完成，遗留转入后续阶段
- fillAll 消费端缺失（填充工具对 part 设置了 fillAll 但渲染未消费，迁移前既有问题）→ 阶段 7。
- 端子吸附半径/优先级调优、端子小圆点可视化 → 阶段 7。
- 命令式历史、ui.js 切分 → 阶段 6。

---

## 阶段 6：差分式命令历史 + 命中两段式 + ui 拆分（2026-11-05）

### 6.1 历史专项回归页 `_check/history.html`（先于实现落地）
- 20 步确定性序列（mulberry32 固定种子）：创建矩形/圆/线/文字/部件、平移、缩放、镜像、改样式、删除、成组、调层序。
- 断言：undo 逐步回退可回到初态（objects/groups 深比较）、redo 各步与 undo 严格互逆、redo 到顶与终态一致、undo 后新操作截断 redo 分支、无变化 push 不增长栈、栈上限与深度、合并、pop。
- **先在旧实现上跑基线**（16/20，剩 4 项正是新能力），再替换实现后 23/23 全绿。

### 6.2 DP.history 重写（core.js）
- 存储从「每步全量 JSON」改为 **id 级差分补丁**：`{label, before:{order,objs,groups}, after:{...}, t}`，只记录被新增/删除/修改的对象；顺序未变时 `order=null`（回放沿用当前顺序），进一步压缩。
- 上限 80 → **200**；`push(label, window)` 支持同标签连续提交合并（样式取样、方向键微移）；新增 `pop()` 用于操作失败回滚（填充无封闭轮廓）；`reset/undo/redo` 语义与旧实现一致（懒提交）。
- **基准（800 对象 × 50 步）**：0.45 ms/步（旧 0.36 ms/步，同量级）、历史占用 **27,380 B**（旧 **8,392,994 B**，约 1/306）。
  - 说明：单步时间受限于「每步必须比较全文档」这一固有成本，未达到路线图设想的 30%；真正的收益是内存天花板消失（旧实现 80 步 × 800 对象 = 6.4 万对象副本）。
- 回滚方案：`src/history` 旧实现保留在 `backup/pre-stage6-20261105/core.js`。

### 6.3 命中两段式（ui.js）
- `hitTest` 先用 `M.localBBox`（容差外扩 4px）粗筛，命中包围盒后再调模块精细命中；800 对象场景绝大多数对象挡在 O(1) 判定内。

### 6.4 ui.js 拆分（机械搬移，零行为变化）
- 新增 `src/ui/tools-data.js`（23 条工具表 + 图标，`U.TOOLS/U.IC/U.ICONS`）
- 新增 `src/ui/help.js`（帮助文案，`U.helpHtml`）
- 新增 `src/ui/shapes.js`（`DP.shape.from/moduleFrom/simplifyPts`，纯函数）
- ui.js 只保留别名与薄包装：2254 → 2103 行，且工具表/帮助/工厂各自独立可改。
- **踩坑**：ui.js 原为 `const U = (DP.ui = {})`，会覆盖前面文件挂载的 `U.TOOLS` 等 → 改为 `DP.ui = DP.ui || {}`。这类「多文件挂同一命名空间」的坑已写入开发手册。
- **未做**：按路线图把「指针状态机」拆成 pointer.js / panels.js。原因：`onDown/onMove/onUp` 与 `D`（当前交互）、DOM 引用、面板刷新是同一份可变闭包状态，机械外移必须改成 `U._.D` 形式的共享槽，收益（文件更小）与风险（触及全部拖拽/缩放/旋转路径）不成比例；已改为「纯逻辑优先外移」策略，状态机保持内聚。

### 验证
- `node --check` 全部通过；逻辑 **98/98**、交互 **50/50**、历史 **23/23**、PNG 31758B。
- `index.html?sample=1` 无异常，界面截图与阶段 5 完全一致（零视觉变化）。

---

## 阶段 7-a：光线工具 + 线型/线宽体系（2026-11-05，用户需求驱动）

### 需求
1. 新增「光线」：中间有箭头的实线（光学光路，区别于端点箭头的 arrow）。
2. 线型继续丰富，补主光轴线型。
3. 线宽改为「可选择」。

### 实现
- **线型唯一数据源 `src/core/style.js`（新）**：`DP.style.DASHES`（6 种）+ `WIDTHS`（6 档）+ `dashArray()/dashName()/isDash()/normWidth()`。12 个模块与 render.js 里各自为政的 `if (dash === 'dashed')...` 全部收敛为一次 `DP.style.dashArray()` 调用（脚本化替换，0 手改遗漏）。**新增线型从「改 14 处」变成「改 1 处」。**
- **线型表**：solid 实线 / dashed 虚线 / dotted 点线 / **dashdot 点划线（主光轴，`14 4 3 4`）** / dashdotdot 双点划线 / longdash 长划线。dashArray 未知值安全回落实线。
- **光线模块 `src/modules/primitives/ray.js`（新，type:'ray'）**：实线 + 中点箭头（`style.rayArrows: 1|2`，2 = 三等分双箭头）；头长随线宽（与 arrow 同公式）并被线长夹住；anchors/nodes/translate/scale/mirror 与 line 同构；capabilities 声明 `bind: true`，端点粘附/端子粘附开箱即用。工具位：基本图形组、快捷键 Y。
- **端点粘附能力位**：`M.isBindable(o)` 读 `capabilities.bind`，替换 core.js/ui.js 里 4 处 `type === 'line' || 'arrow'` 硬编码（光线就是这类漏改的活案例）。
- **UI**：
  - 样式面板：线型 6 个按钮（SVG 实际 dasharray 预览，所见即所得）、线宽 6 档预设按钮、填充移入第二列；选中态随当前对象同步（markStyleBtns）。
  - 属性面板：线宽改为「预设下拉 + 任意数值框」双通道（非预设宽度动态补选项，旧文档值不被悄悄改掉）；线型下拉 6 项；选中光线时出现「箭头：中点 1 个 / 三等分 2 个」。
- CSS：style-grid3 改双列（3 行高不变，与部件网格对齐）、`.toolbtns button.on` 选中态。

### 验证
- `node --check` 30 个 js 全过；逻辑 **108/108**（新增 ray 5 项 + 线型/线宽 5 项）、交互 **50/50**、历史 **23/23**、PNG 31758B。
- 截图核对：样式面板 6 线型 + 6 线宽布局正常无溢出；画布上光线中点箭头、三等分双箭头、主光轴点划线、虚线箭头均正确渲染。
- 教训（已有先例重犯）：test.html 里用旧 Edit 删「行尾换行」把 `// 15.2` 注释与 `const ci` 合并成一行，注释吞掉声明 → 运行时 `ci is not defined`。**不要用「删换行」式 Edit。**

### 阶段 7-a 追加（同日第二轮反馈）：线型/线宽按钮全面「实际线样化」
- 用户要求：线宽 = 线样 + 数字；线型 = 纯实际线样，不要文字。
- ui.js 抽出 `dashBtnHtml()/widthBtnHtml()` 两个生成器，ribbon 样式面板与属性面板共用：
  - 线型按钮：按真实 dasharray + 真实线宽画一段线（名称仅进 title 提示）；
  - 线宽按钮：按真实粗细画线 + 数字（纯线样分不清 1 与 1.5）。
- 属性面板：线型/线宽由文字下拉改为 3 列 × 2 行的线样按钮网格（`.picks`），线样用当前线色；自定义宽度保留「自定义」数值框；点选后同步选中态。
- 验证：108/108、50/50、23/23；截图核对 ribbon 与属性面板布局无溢出。

### 阶段 7-a 再追加（同日第三轮反馈）：线型/线宽改为「线样下拉」，不平铺
- 用户要求：线宽、线型用下拉框选择，不要平铺按钮。
- 原生 select 的 option 放不了 SVG → 自绘轻量下拉 `.sdrop`：
  - 收起态 = 当前取值的真实线样 + 名称/数值 + 箭头；
  - 展开态 = 纵向选项列表，每项真实线样（dasharray / 真实粗细）。
- 关键实现：菜单 position:fixed + placeDropMenu()（#ribbon overflow-y:hidden 会裁掉 absolute 菜单）；
  全局点击/滚动/Esc 收起在 bindTopbar 只挂一次；选项点击事件委托在 .sdrop 容器（动态补项也能用）；
  setDropValue 支持就地补非预设线宽项。
- ribbon 样式面板两条下拉定宽 104px；属性面板下拉撑满 + 56px 自定义数值框。
- 验证：108/108、50/50、23/23、PNG 31758B；截图核对收起/展开/线宽展开三态；
  模拟点选 dashdot + 3 后 DP.state.style 正确、收起态文字同步。
