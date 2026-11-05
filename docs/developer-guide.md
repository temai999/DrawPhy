# DrawPhy 开发操作手册（面向执行 agent）

> 这份手册假设你**不熟悉本项目**。照做即可保证不破坏现有功能；每一条「禁止事项」都来自真实事故或评审结论。
> 先读 `README.md`（5 分钟），遇到问题回查本手册对应章节。评审背景见 `docs/codebase-review.md`，规划见 `docs/roadmap.md`。

---

## 0. 黄金法则（先背下来）

1. **不许引入任何第三方依赖**——没有 npm、没有 node_modules、没有 CDN 链接。新增能力必须手写或用浏览器原生 API。
2. **不许使用 ES module**（`import` / `export` / `type="module"`）——file:// 直开会被 CORS 阻断，页面白屏。一律用文末「文件模板」的 IIFE 写法。
3. **不许改动对象数据字段的命名与语义**——存量 JSON 文件依赖当前字段（rect 是 `x,y,w,h`；line 是 `x1,y1,x2,y2`）。改了 = 用户旧文件打不开。
4. **一次只做一个最小改动**，改完立刻跑第 8 节的验证命令，全绿才允许下一个改动。
5. **改动前先备份**：`cp 要改的文件 backup/pre-<阶段名>-<日期>/`。项目刚建立 git 后改为先 commit。
6. **不要顺手重构你没被要求碰的代码**。「双轨分派」时期尤其如此：旧 switch 是安全网，不是垃圾。
7. **迁移一个类型必须四条路径全改**：创建（走模块 `defaults()`）、命中（模块 `hitTest`）、变换（`translate/scale/mirror`）、渲染（模块 `render`）。只改一半 = 制造漂移，评审问题 2.3-2。
8. **页面行为零变化优先于代码漂亮**。评审的验收标准永远是「视觉与手感与旧版一致」。

---

## 1. 项目一句话

DrawPhy 是物理教学用科学绘图板：对标亿图（EE），纯静态网页，双击 `index.html` 即用，原生 SVG 渲染，导出 PNG/SVG/JSON。

## 2. 目录地图

```
DrawPhy/
├─ index.html                  # 唯一入口。骨架 + 25 个 <script>（顺序=依赖，不许乱序）
├─ src/
│  ├─ core/
│  │  ├─ config.js             # DP.config：默认样式常量
│  │  ├─ style.js              # DP.style：线型表 DASHES / 线宽表 WIDTHS / dashArray()（唯一数据源）
│  │  ├─ module-wrap.js        # DP.defineModule(type, factory)：模块定义入口
│  │  ├─ registry.js           # DP.registry：三表（shapes/menu/parts）+ 版本守卫
│  │  └─ eventbus.js           # DP.bus：发布订阅（当前零订阅，阶段 6 启用）
│  ├─ core.js                  # 地基：DP.geom / DP.model / DP.snap / DP.state / DP.history / DP.sel
│  ├─ render.js                # 渲染：R.drawable / R.object / R.primitive / R.escape / R.arrowHead
│  ├─ ui.js                    # 巨石：工具栏/指针事件/命中/节点/文本编辑/属性/剪贴板/分组/自动保存
│  ├─ parts.js                 # 114 个参数化部件定义（DP.parts.byId）
│  ├─ io.js                    # 导出 PNG/SVG/JSON + ?sample=1 示例图
│  └─ func.js                  # DP.compileFunc：函数图像表达式编译
│  └─ modules/primitives/      # 14 个已迁移图元模块（含 ray 光线，见第 4 节）
├─ _check/
│  ├─ test.html                # 逻辑自检（无头 Chrome 跑），当前 83 项
│  ├─ interact.html            # 交互自检（合成 PointerEvent），当前 47 项
│  ├─ png.html                 # PNG 导出链路自检
│  └─ *.png                    # 历史截图证据，不许删
├─ docs/                       # 文档：本手册 / 评审 / 路线图 / 模块化框架 / 开发进度
├─ backup/                     # 手工快照（git 建立后逐步废弃）
└─ assets/                     # 图标等静态资源
```

**脚本加载顺序（index.html）**：core/* 五件（config → style → module-wrap → registry → eventbus）→ core.js → 14 个模块 → func.js → parts.js → render.js → ui.js → io.js。
新模块脚本**插在 core.js 之后、func.js 之前**；测试页 `_check/test.html` 有同样的脚本块，**两边必须同步加**（漏加 = 测试页白跑，发生过）。

## 3. 数据模型（最重要的一节）

### 3.1 全局状态 `DP.state`

```js
DP.state = {
  objects: [],            // 扁平数组，一切图形都是它的元素。没有场景树！
  selection: new Set(),   // 选中的对象 id 集合
  tool: 'select',         // 当前工具 id（对应模块 type 或内建名）
  view: { x: 60, y: 40, k: 1 },        // 画布平移/缩放
  page: { w: 1240, h: 820, bg: '#fff', grid: true },
  snap: { grid: true, gridSize: 20, anchors: true },
  style: { stroke, width, dash, fill, opacity, fontSize, arrow },
  groups: {},             // groupId -> true
  clipboard: null,
};
```

### 3.2 对象长什么样

每个对象是**扁平字典**，必有 `id` 和 `type`，几何字段随类型不同，`style` 是嵌套字典：

```js
{ id: 'r12', type: 'rect', x: 100, y: 80, w: 120, h: 60, rx: 0,
  style: { stroke: '#22303c', width: 2, dash: 'solid', fill: 'none', opacity: 1 } }

{ id: 'l3', type: 'line', x1: 0, y1: 0, x2: 100, y2: 0,
  bind: { x2: { id: 'p7', dx: 15, dy: -8 } } }   // 端点粘附：x2 端绑定到对象 p7
```

`bind` 规则：`{端点key: {id: 宿主id, dx, dy}}`，dx/dy 是**相对宿主包围盒中心**的偏移。宿主移动/缩放时 `DP.model.applyBindings()` 让导线跟随。**不要发明新的绑定格式。**

`style.dash` 的合法值与 `style.width` 的预设都定义在 `src/core/style.js`（DP.style），当前线型：solid / dashed / dotted / **dashdot（点划线=主光轴）** / dashdotdot / longdash。**新增线型只改 style.js 一处**，模块渲染、SVG 导出、样式面板、属性下拉会全部自动生效——禁止在模块里手写 `if (dash === 'xxx')`。光线（type:'ray'）另有 `style.rayArrows: 1|2` 控制中间箭头个数。

### 3.3 文档序列化

`DP.model.toJSON()` → `{version:1, page, objects, groups}`。`fromJSON()` 反向载入。version 字段是迁移通道：将来改格式必须 bump version 并保留旧版读取分支。

### 3.4 历史

`DP.history.push()` 在**每次可逆操作后**调用（由 ui.js 的 `afterChange()` 统一触发）。undo/redo 是全量快照回放。你**新增任何修改 objects 的操作，都必须经过 afterChange 或显式 push**，否则撤销栈漏项。

## 4. 模块契约（registry）

### 4.1 注册与查找

```js
DP.defineModule('rect', function (DP) { ... return { /* 模块对象 */ }; });
DP.registry.get('rect')      // 取模块
DP.registry.has('rect')      // 判断存在
DP.registry.menuSlots('draw', 'shape')  // 工具按钮槽位（自动按 order 排序）
```

注册时缺必需字段直接 throw；同 type 低版本注册被忽略并 warn。**模块文件加载即注册，没有惰性加载。**

### 4.2 模块字段全表（以 rect.js 为范本，逐字段说明）

| 字段 | 必需 | 类型 | 说明 |
| --- | --- | --- | --- |
| `version` | ✅ | number | 每次行为变更 +1。同版本重复注册=覆盖并 warn；低版本=忽略 |
| `meta` | ✅ | object | `{name, icon, shortcut, hint}`——按钮名称/图标/快捷键/悬浮提示 |
| `defaults(props)` | ✅ | fn | 返回带默认几何+style 的对象。props 里的键覆盖默认值。**对象的创建必须走它**（评审规则 7） |
| `bbox(o)` | ✅ | fn | 返回 `{x, y, w, h}`（左上+宽高）。**必须容忍负 w/h**（拖拽反向） |
| `hitTest(o, p, tol)` | ✅ | fn | p `{x,y}` 世界坐标，tol 像素容差（已换算世界单位）。命中返回 truthy |
| `render(o, ctx)` | ✅ | fn | 返回 `{tag, attrs}` 或 `{tag, attrs, children:[...]}`。ctx.style 可覆盖 o.style |
| `menu` | — | object | 有它才出现在工具栏：`{tab:'draw', category:'shape'\|'text', group, order}`。order 决定排序 |
| `capabilities` | — | object | `{fill, rotate, resize}` 声明能力，属性面板据此显示控件 |
| `anchors(o)` | — | fn | 吸附点：`[{id, x, y, kind}]`，kind ∈ `endpoint/center/mid/quadrant/intersection`。新图元要可被吸附就靠它，**吸附引擎零改动** |
| `nodes(o)` / `setNode(o, id, p)` | — | fn | 选中后的编辑手柄。nodes 返回 `[{id, x, y, label?}]`，setNode 按 id 写回几何。不需要手柄就返回 `[]`，setNode 留空函数 |
| `translate(o, dx, dy)` | — | fn | 平移 |
| `scale(o, sx, sy, ax, ay)` | — | fn | 以 (ax,ay) 为锚缩放。sx/sy 可为负（镜像拖拽） |
| `mirror(o, axis)` | — | fn | axis ∈ `'h'`（水平轴翻转=上下镜像）/`'v'`。**保持包围盒中心不动**（评审规则，textbox/callout 均遵守） |

### 4.3 核心如何调用模块（双轨分派）

`core.js` 的 `M.moduleOf(o)` 返回 `DP.registry.get(o.type)`。每个钩子都是：

```js
// 伪代码，真实分布在 core.js / ui.js / render.js
var mod = M.moduleOf(o);
if (mod && mod.translate) { mod.translate(o, dx, dy); } else { /* 旧 switch 分支 */ }
```

**你新增/修改模块时只需保证模块本身正确**，分派层不许动。

### 4.4 线型 / 线宽 / 端点粘附能力位（阶段 7 起强制）

- **线型**：唯一来源 `src/core/style.js`。模块渲染一律 `DP.style.dashArray(dash)`；UI 是**线样下拉**（`styleDropHtml()` 生成、`bindStyleDrops()` 绑定、`setDropValue()` 同步收起态），每个选项都是真实 dasharray 画的线样，不是文字选项。`dashdot`（点划线）是光学主光轴的教材画法，别改名。
- **线宽**：预设 `DP.style.WIDTHS`（0.75/1/1.5/2/3/4），同样是线样下拉（线样按真实粗细画 + 数字）；属性面板下拉旁保留窄的「自定义」数值框，非预设值由 `DP.style.normWidth()` 兜底（脏值回落 2，上限 24），并在 `setDropValue()` 里就地补选项。
- **线样下拉的实现要点**（改 UI 前必读）：原生 `<select>` 的 option 放不了 SVG，所以是自绘下拉。菜单用 `position:fixed` + `placeDropMenu()` 计算坐标——因为 `#ribbon` 是 `overflow-y:hidden`，普通 absolute 菜单会被裁掉；点空白/滚动/Esc 收起的全局监听在 `bindTopbar()` 只挂一次；选项点击用**事件委托**绑在 `.sdrop` 容器上，动态补进去的选项也能用。
- **线条颜色 / 填充样式 = 色板下拉**（`colorDropHtml()` / `bindColorDrop()` / `syncColorDrop()`）：分区为 自动色 → 标准 → 自定义（localStorage `drawphy.customColors`，选色即存）→ 文档中已使用的颜色（`usedColors()` 扫描对象样式）→ 无填充（仅填充面板）+ 其他颜色…（隐藏原生取色器，**不能 display:none**，否则打不开）。注意：`bindStyleDrops` 的选择器是 `.sdrop:not(.color-drop)`——色板下拉由 `bindColorDrop` 单独绑定，两边都绑会让 toggle 抵消、下拉打不开。
- **端点粘附**：模块在 `capabilities` 里声明 `bind: true`（line/arrow/ray 已声明），核心与 UI 一律用 `M.isBindable(o)` 判断。**禁止再写 `type === 'line' || type === 'arrow'` 这类硬编码**——光线就是漏改案例。

## 5. 标准任务手册

### 5.1 新增一个图元类型（12 步）

以新增 `star` 为例：

1. **复制模板**：`cp src/modules/primitives/rect.js src/modules/primitives/star.js`
2. 改文件头注释（类型、一句话说明）；
3. `DP.defineModule('rect', ...)` → `'star'`；
4. 写 `defaults`：几何字段（如 `{cx, cy, r, points:5}`）+ 默认 style；
5. 写 `bbox`：外包络 `{x,y,w,h}`；
6. 写 `hitTest`：内部实心命中 + 描边容差；
7. 写 `translate/scale/mirror`：mirror 保包围盒中心；
8. 写 `render`：返回 `{tag:'polygon', attrs:{points: ...}}`。属性值是数字不用转义，文本必须 `R.escape`；
9. （可选）`anchors` 返回顶点，`nodes/setNode` 返回外接圆半径手柄；
10. `meta` + `menu`：`{tab:'draw', category:'shape', order: 选 80-200 之间的空位}`；
11. **index.html 与两个测试页同步加 `<script>`**（评审 2.5 教训）；
12. 跑第 8 节全部验证，并在 `_check/test.html` 仿照「15.x」节补一条模块断言、在 `interact.html` 补一条创建断言。

### 5.2 修改已有类型的行为

1. 找到 `src/modules/primitives/<type>.js`；
2. 只改对应函数；`version +1`；
3. 同步检查旧 switch 兜底分支是否也要对齐（阶段 5 收尾前双轨并存，两边逻辑必须一致——**这是最容易犯错的地方，改完 diff 两个实现**）；
4. 跑全部验证。

### 5.3 新增一个部件（符号库条目）

部件 = `parts.js` 里一项 `{id, name, cat, mk(x, y, scale)}`，`mk` 返回**对象数组**（部件是多个图元的组合，缩放用模块变换做，不要手算坐标）。步骤：

1. 在 `parts.js` 找到同类 `mk` 函数照抄结构；
2. 用基本图元拼（line/circle/arc/path/text），坐标以 (x,y) 为插入中心；
3. 在 `_check/parts-gallery.html` 肉眼核对缩略图；
4. 若涉及新分类，更新 `README.md` 分类计数。

（阶段 5 后此流程改为 `registry.registerPart`，届时本小节会被替换——以 roadmap 为准。）

### 5.4 修 bug 的标准流程

1. 在 `_check/interact.html` 或 `test.html` **先写一个能复现 bug 的失败断言**（红）；
2. 修源码；
3. 断言变绿 + 全量回归不红；
4. 在 `docs/dev-progress.md` 追加一节：现象/根因/修法/验证。

## 6. 测试规范

- **测试页是唯一的质量 gate**，不许「我目测没问题」交付。
- 新增功能必须同时补：逻辑断言（`_check/test.html`）+ 交互断言（`_check/interact.html`，合成 PointerEvent 走真实 onDown/onMove/onUp）。
- 断言写法照抄文件里现有 `ok(...)` / `t(...)` 模式；测试内变量名**先 grep 确认不与现有 `const` 重名**（真实事故：新增 `const ln` 与旧断言冲突导致整页脚本崩溃）。
- 数值断言用 `Math.abs(a - b) < 1e-6`，不要用 `===` 比浮点。

## 7. 禁止事项（每一条都有出处）

| 禁止 | 原因 |
| --- | --- |
| `import` / `export` / `<script type="module">` | file:// CORS 白屏 |
| 任何 npm 包 / CDN `<link>` | 零依赖红线 |
| 改对象字段命名 / 文档 version 不变更格式 | 存量 JSON 打不开 |
| 对象里塞函数、Date、undefined | `M.clone` 的 JSON 深拷贝会静默丢弃 |
| 用 `===` 断言浮点 | 真实失败案例 |
| 测试页新变量与旧 `const` 重名 | 整页崩溃案例 |
| 正则批量替换 `src` 里单词级符号 | 真实事故：`xmlns` 被误改 |
| 多文件挂同一命名空间时写 `DP.ui = {}` | 真实事故：阶段 6 拆分后 ui.js 覆盖了 `ui/tools-data.js` 已挂的 `U.TOOLS`，工具栏全空；必须写 `DP.ui = DP.ui || {}` |
| 用 Git Bash heredoc 传含 `\n` 的 Python 脚本 | 真实事故：MSYS2 把 `\n` 篡改成 `/n`，字符串匹配静默失配；脚本先用 Write 落盘成 .py 再执行，或用 `chr(10)` |
| 在 `render` 返回里拼接未转义的用户文本 | XSS/截断，必须 `R.escape` |
| 修改吸附引擎（`S.resolve/collectPoints/intersections`） | 13 个模块的行为都依赖它，冻结 |
| 未经 afterChange/push 直接改 objects | 撤销栈漏项 |
| `rm -rf` 任何东西；删 `_check/*.png` | 证据与回滚资产 |

## 8. 验证命令（交付前全部执行，原文照抄即可）

```bash
cd "D:/Trae CN/myPro/DrawPhy"

# 1) 语法检查（30 个 js 全过）
for f in $(find src -name "*.js"); do node --check "$f" || echo "SYNTAX FAIL $f"; done

# 2) 逻辑自检（期望 TOTAL=83 FAIL=0，你新增断言后数字变大）
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu \
  --no-sandbox --allow-file-access-from-files --virtual-time-budget=5000 --dump-dom \
  "file:///D:/Trae%20CN/myPro/DrawPhy/_check/test.html" 2>/dev/null \
  | grep -o "TOTAL=[0-9]* FAIL=[0-9]*"

# 3) 交互自检（期望 FAIL=0）
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu \
  --no-sandbox --allow-file-access-from-files --virtual-time-budget=8000 --dump-dom \
  "file:///D:/Trae%20CN/myPro/DrawPhy/_check/interact.html" 2>/dev/null \
  | grep -o "TOTAL=[0-9]*  PASS=[0-9]*  FAIL=[0-9]*"

# 4) 主页面无报错 + 示例渲染
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu \
  --no-sandbox --allow-file-access-from-files --virtual-time-budget=5000 \
  --enable-logging=stderr --v=1 --dump-dom \
  "file:///D:/Trae%20CN/myPro/DrawPhy/index.html?sample=1" 2>&1 \
  | grep -o "Uncaught[^\"]*" | head -5   # 必须无输出

# 5) PNG 导出链路
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu \
  --no-sandbox --allow-file-access-from-files --virtual-time-budget=6000 --dump-dom \
  "file:///D:/Trae%20CN/myPro/DrawPhy/_check/png.html" 2>/dev/null \
  | grep -o "PNG [^<]*\|FAIL[^<]*"
```

**交付标准**：1-4 全绿，5 产出合法 PNG，且在 `docs/dev-progress.md` 留档。

## 9. 文件模板（复制即用）

```js
/* =========================================================================
 * DrawPhy <type> 模块（阶段 <N>）
 * type: <type>（<一句话说明>）
 * 通过普通 <script> 加载，file:// 可用；行为与旧 switch 分支保持一致。
 * ========================================================================= */
(function () {
  'use strict';

  DP.defineModule('<type>', function (DP) {
    var G = DP.geom;
    var C = DP.config;

    function defaultStyle() {
      return {
        stroke: C.defaults.stroke,
        width: C.defaults.strokeWidth,
        dash: 'solid',
        fill: C.defaults.fill,
        opacity: 1,
        fontSize: C.defaults.fontSize,
      };
    }

    function defaults(props) {
      var o = { /* 默认几何字段 */ };
      if (props) {
        for (var k in props) {
          if (Object.prototype.hasOwnProperty.call(props, k)) o[k] = props[k];
        }
      }
      if (!o.style) o.style = defaultStyle();
      return o;
    }

    return {
      version: 1,
      meta: { name: '<中文名>', icon: '<icon-id>', shortcut: '<Key>', hint: '<悬浮提示>' },
      menu: { tab: 'draw', category: 'shape', group: 'shape', order: 150 },
      capabilities: { fill: true, rotate: false, resize: true },
      defaults: defaults,
      bbox: function (o) { return { /* x,y,w,h */ }; },
      hitTest: function (o, p, tol) { /* 见 rect.js 范式 */ },
      render: function (o, ctx) {
        var rs = (ctx && ctx.style) || o.style || defaultStyle();
        return { tag: 'path', attrs: { d: /* ... */, stroke: rs.stroke } };
      },
      anchors: function (o) { return [ /* {id,x,y,kind} */ ]; },
      nodes: function (o) { return []; },
      setNode: function (o, id, p) {},
      translate: function (o, dx, dy) { /* ... */ },
      scale: function (o, sx, sy, ax, ay) { /* ... */ },
      mirror: function (o, axis) { /* 保包围盒中心 */ },
    };
  });
})();
```

## 10. 常见错误 TOP10

1. 测试页加了 script、index.html 忘了加（或反向）→ 测试绿、线上白。
2. 模块 `bbox` 不容忍负宽高 → 反向拖拽时吸附/手柄全飞。
3. `render` 返回的 attrs 里混入 `undefined` → SVG 属性串出现 "undefined" 字符串。
4. `mirror` 改变了包围盒中心 → 镜像后对象「跳位」，回归里 textbox 断言就是抓这个的。
5. 迁移类型只改了 render 没改 hitTest → 能看不能点。
6. 在 `onDown` 里新增工具分支但 `onMove/onUp` 没配套 → 半成品交互卡死。
7. 用 `o.style.xxx` 而用户对象恰好没有 style → 走 `ctx.style || o.style || defaultStyle()` 三级兜底。
8. 新断言里浮点直接 `===` → 随机性失败。
9. 改 registry 校验逻辑导致旧模块注册 throw → 全站白屏。registry 是地基，改动要全员回归。
10. 忘了 `version +1` → 你的修改被「低版本忽略」静默吞掉，debug 两小时。

---

## 11. 历史子系统（阶段 6 重写后）—— 改动前必读

### 结构
`DP.history` 存**差分补丁**，不存全量快照：

```js
{ label, before: { order|null, objs: {id: json|null}, groups: json },
          after:  { order|null, objs: {id: json|null}, groups: json }, t }
```

- `objs[id] === null` 表示该状态下此对象不存在；`order === null` 表示顺序未变（回放沿用当前顺序）。
- `stack[0]` 是哨兵（`label:'init'`），`idx` 指向当前状态。

### API 与语义（和旧实现一致，别改）
| 方法 | 语义 |
| --- | --- |
| `push(label?, window?)` | **提交当前已发生的状态**（懒提交）：UI 里通常是「操作开始前 / 操作结束后」各调一次，未变化时自动去重不增长栈 |
| `undo() / redo()` | 回退/前进一格，会清空选择集 |
| `reset()` | 新建文档用：栈重置为哨兵 |
| `pop()` | 回滚最后一次提交（如「填充失败」）；**不要再写 `stack.pop()`** |

### 三条铁律
1. 任何会改动 `DP.state.objects` / `groups` 的路径，改完必须让某个 `push()` 提交到——否则这一步撤销不到。
2. `push(label, window)` 的 label 只用于「连续同类操作合并」（样式取样、方向键微移）。**不要给独立手势加同一 label**，否则两次不同拖动会被合成一步。
3. 改历史实现前后，**必须先跑 `_check/history.html`**（23 项：逐步 undo/redo 深比较 + 栈上限 + 合并 + pop + 800 对象基准）。它是这个子系统的安全网。
