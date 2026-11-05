/* =========================================================================
 * DrawPhy ui/tools-data.js — 工具表与图标（纯数据，无闭包依赖）
 * 数据驱动：工具栏按钮、快捷键、帮助面板都从 U.TOOLS 生成，只有一处定义。
 * ========================================================================= */
(function () {
  'use strict';
  const DP = (window.DP = window.DP || {});
  const U = (DP.ui = DP.ui || {});

  const TOOLS = [
    { id: 'select', ch: '选', name: '选择', key: 'V', g: 'shape', hint: '点选 / 框选；拖动移动；Shift 加选' },
    { id: 'line', ch: '线', name: '线段', key: 'L', g: 'shape', hint: '拖动绘制线段；Shift 锁 15°' },
    { id: 'arrow', ch: '箭', name: '箭头', key: 'A', g: 'shape', hint: '拖动绘制带箭头的线（力、光路）' },
    { id: 'ray', ch: '光', name: '光线', key: 'Y', g: 'shape', hint: '拖动绘制光线：实线 + 中间箭头（光学光路）' },
    { id: 'darrow', ch: '双', name: '双箭头', key: 'W', g: 'shape', hint: '拖动绘制双向箭头（标注位移、等长）' },
    { id: 'polyline', ch: '折', name: '折线', key: 'P', g: 'shape', hint: '逐点单击；双击或回车结束' },
    { id: 'polygon', ch: '多', name: '多边形', key: 'G', g: 'shape', hint: '逐点单击；双击闭合并结束' },
    { id: 'ortho', ch: '直', name: '直角连线', key: 'I', g: 'shape', hint: '左键起点 → 左键转弯（只走直角）→ 右键结束；Shift 换先横/先竖' },
    { id: 'rect', ch: '矩', name: '矩形', key: 'R', g: 'shape', hint: '拖动画矩形；Shift 正方形' },
    { id: 'ellipse', ch: '椭', name: '椭圆', key: 'E', g: 'shape', hint: '拖动画椭圆；Shift 正圆' },
    { id: 'circle', ch: '圆', name: '圆', key: 'C', g: 'shape', hint: '以按下点为圆心拖动定半径' },
    { id: 'arc', ch: '弧', name: '圆弧', key: 'U', g: 'shape', hint: '单击定圆心 → 定起点 → 定终点' },
    { id: 'freehand', ch: '徒', name: '徒手', key: 'F', g: 'shape', hint: '按住拖动自由绘制（自动平滑）' },
    { id: 'bezier', ch: '贝', name: '贝塞尔', key: 'J', g: 'shape', hint: '单击加点（平滑穿过）；按住拖动拉出把柄；双击/回车/右键结束；Shift 加点为折角；选中后可拖锚点/把柄' },
    { id: 'point', ch: '点', name: '点', key: 'O', g: 'shape', hint: '单击放置点；可被吸附和连线' },
    { id: 'roundrect', ch: '圆', name: '圆角矩形', key: 'D', g: 'shape', hint: '拖动画圆角矩形；Shift 正方形' },
    { id: 'func', ch: '函', name: '函数图像', key: 'H', g: 'shape', hint: '拖框定区域，输入解析式如 sin(x)、x^2' },
    { id: 'textbox', ch: '框', name: '文本框', key: 'Q', g: 'text', hint: '单击落文本框；双击改字' },
    { id: 'callout', ch: '注', name: '标注', key: 'Z', g: 'text', hint: '先点标注指向处，再点文本框位置' },
    { id: 'text', ch: '文', name: '文字', key: 'T', g: 'text', hint: '单击落字；支持 x^{2}、A_{1}' },
    { id: 'dim', ch: '尺', name: '尺寸', key: 'M', g: 'text', hint: '单击两点生成尺寸线' },
    { id: 'angle', ch: '角', name: '角度', key: 'N', g: 'text', hint: '单击顶点 → 边1 → 边2' },
    { id: 'trim', ch: '剪', name: '修剪', key: 'X', g: 'edit', hint: '单击线段/圆/弧上要剪掉的部分' },
    { id: 'eraser', ch: '擦', name: '橡皮', key: 'K', g: 'edit', hint: '按住拖过对象即删除' },
    { id: 'fill', ch: '漆', name: '填充', key: 'B', g: 'edit', hint: '单击封闭图形填充当前颜色' },
  ];

  const IC = (inner) => `<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="0.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
  const ICONS = {
    select: `<path d="M6 4 L6 17 L9.5 13.5 L12 19.5 L14.5 18.5 L12 12.5 L17 12.5 Z" fill="currentColor" stroke="none"/>`,
    line: `<line x1="4" y1="20" x2="20" y2="4"/>`,
    arrow: `<line x1="4" y1="19" x2="17" y2="6"/><path d="M17 6 L10 7 L15 12 Z" fill="currentColor" stroke="none"/>`,
    ray: `<line x1="3" y1="18" x2="21" y2="6"/><path d="M14.5 10.3 L11.2 14.4 L9.4 11.8 Z" fill="currentColor" stroke="none"/>`,
    darrow: `<line x1="5" y1="12" x2="19" y2="12"/><path d="M5 12 L11 9.5 L11 14.5 Z" fill="currentColor" stroke="none"/><path d="M19 12 L13 9.5 L13 14.5 Z" fill="currentColor" stroke="none"/>`,
    polyline: `<polyline points="4,17 9,9 14,14 20,6"/>`,
    polygon: `<path d="M12 5 L20 19 L4 19 Z"/>`,
    ortho: `<polyline points="4,19 4,7 12,7 12,13 20,13"/>`,
    rect: `<rect x="5" y="7" width="14" height="10" rx="1"/>`,
    ellipse: `<ellipse cx="12" cy="12" rx="8" ry="5.5"/>`,
    circle: `<circle cx="12" cy="12" r="7"/>`,
    arc: `<path d="M6 18 A 8 8 0 0 1 18 6"/>`,
    freehand: `<path d="M4 15 Q 8 7 12 12 T 20 10"/>`,
    bezier: `<path d="M4 19 Q 11 3 20 7"/><circle cx="4" cy="19" r="1.5"/><circle cx="20" cy="7" r="1.5"/><path d="M4 19 L11 11 L20 7" stroke-dasharray="2 2"/>`,
    point: `<circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>`,
    roundrect: `<rect x="4" y="7" width="16" height="10" rx="4"/>`,
    func: `<path d="M3 17 Q 8 4 12 12 T 21 7"/><line x1="3" y1="20" x2="21" y2="20" stroke-dasharray="2 2"/>`,
    textbox: `<rect x="5" y="6" width="14" height="12" rx="2"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="13" x2="14" y2="13"/>`,
    callout: `<path d="M4 20 L10 12"/><rect x="10" y="3" width="11" height="8" rx="1.5"/><circle cx="4" cy="20" r="1.4"/>`,
    text: `<path d="M7 6 h10 M12 6 v13"/>`,
    dim: `<line x1="6" y1="5" x2="6" y2="19"/><line x1="18" y1="5" x2="18" y2="19"/><line x1="6" y1="12" x2="18" y2="12"/><path d="M6 12 L9 10.5 L9 13.5 Z" fill="currentColor" stroke="none"/><path d="M18 12 L15 10.5 L15 13.5 Z" fill="currentColor" stroke="none"/>`,
    angle: `<line x1="6" y1="19" x2="6" y2="6"/><line x1="6" y1="19" x2="18" y2="19"/><path d="M10 19 A 4 4 0 0 0 8.8 15"/>`,
    trim: `<line x1="5" y1="19" x2="19" y2="5"/><circle cx="8" cy="16" r="1.8"/><circle cx="16" cy="8" r="1.8"/>`,
    eraser: `<path d="M6 14 L12 8 L19 15 L13 21 H7 Z"/><line x1="4" y1="22" x2="20" y2="22"/>`,
    fill: `<path d="M9 4 h6 l2.5 9 h-11 Z"/><line x1="12" y1="13" x2="12" y2="16"/><path d="M12 17 c-2 2.5 -2 4.5 0 5.5 c2 -1 2 -3 0 -5.5"/>`,
  };

  /* 绘图 tab 已改为竖排分类按钮（index.html 静态结构），点击由通用 [data-cat] 绑定处理 */

  U.TOOLS = TOOLS;
  U.IC = IC;
  U.ICONS = ICONS;
})();
