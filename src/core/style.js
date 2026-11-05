/* =========================================================================
 * DrawPhy style.js — 线型 / 线宽的唯一数据源（阶段 7）
 *
 * 为什么单独一个文件：
 *   旧实现里 12 个模块各写一份 `if (dash === 'dashed') ...`，
 *   新增一个线型要改 12 处，漏一处就会出现「同一文档里两种解释」的漂移。
 *   现在所有线型只在这里定义一次：
 *     - 模块：DP.style.dashArray(dash) → stroke-dasharray 字符串
 *     - 渲染：render.js 用同一个函数
 *     - UI：DP.style.DASHES / WIDTHS 直接生成按钮与下拉项
 *
 * 物理绘图约定（线型语义，改名前先看这里）：
 *   solid      实线        轮廓、实物、光线（光线另见 type:'ray'）
 *   dashed     虚线        辅助线、反向延长线、像的虚像
 *   dotted     点线        构造线、很轻的参考线
 *   dashdot    点划线      光学主光轴、对称轴（教材标准画法）
 *   dashdotdot 双点划线    中心线、次要对称轴
 *   longdash   长划线      分界线、隐藏轮廓
 *
 * 约定：stroke-dasharray 数值以「世界单位」计，不随缩放变化（与 1/k 无关），
 *       这样放大画布时虚线间隔不会被一起放大，视觉密度稳定。
 * ========================================================================= */
(function (global) {
  'use strict';
  var DP = (global.DP = global.DP || {});

  /* 线型表：id 会写进文档 JSON（style.dash），不要随意改名；
     新增线型只需在此追加一项，模块/渲染/面板自动生效。 */
  var DASHES = [
    { id: 'solid', name: '实线', pattern: '', hint: '轮廓、实物、光线' },
    { id: 'dashed', name: '虚线', pattern: '8 5', hint: '辅助线、反向延长线' },
    { id: 'dotted', name: '点线', pattern: '3 4', hint: '构造线、轻参考线' },
    { id: 'dashdot', name: '点划线（主光轴）', pattern: '14 4 3 4', hint: '光学主光轴、对称轴' },
    { id: 'dashdotdot', name: '双点划线', pattern: '14 4 3 4 3 4', hint: '中心线、次要对称轴' },
    { id: 'longdash', name: '长划线', pattern: '18 7', hint: '分界线、隐藏轮廓' },
  ];

  /* 线宽预设（世界单位）：物理图里很少超过 4，0.75 用于极细构造线 */
  var WIDTHS = [0.75, 1, 1.5, 2, 3, 4];

  var BY_ID = Object.create(null);
  DASHES.forEach(function (d) { BY_ID[d.id] = d; });

  var style = (DP.style = DP.style || {});

  style.DASHES = DASHES;
  style.WIDTHS = WIDTHS;

  /* 线型 id → stroke-dasharray 值；实线/未知值统一返回 ''（不写该属性） */
  style.dashArray = function (dash) {
    var d = BY_ID[dash];
    return d ? d.pattern : '';
  };

  /* 线型 id → 中文名（属性面板、提示文案用） */
  style.dashName = function (dash) {
    var d = BY_ID[dash];
    return d ? d.name : dash || '实线';
  };

  style.isDash = function (dash) { return !!BY_ID[dash]; };

  /* 线宽规范化：NaN/负数/非数字回落到默认 2，避免脏文档把渲染打挂 */
  style.normWidth = function (w) {
    var n = +w;
    if (!isFinite(n) || n <= 0) return (DP.config && DP.config.defaults.strokeWidth) || 2;
    return Math.min(24, Math.max(0.25, n));
  };
})(window);
