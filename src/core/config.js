/* =========================================================================
 * DrawPhy config.js — 全局可调常数（核心地基，第一个加载）
 * 集中全部可调参数；旧代码本轮暂不回流（保持行为零变化），
 * 新模块与后续迁移一律读 DP.config。
 * ========================================================================= */
(function (global) {
  global.DP = global.DP || {};

  global.DP.config = {
    /* 屏幕像素类（当前均指「屏幕 px」，使用处按 1/k 换算为世界单位） */
    hitTol: 10,        // 橡皮/点选命中半径（屏幕 px）
    snapTol: 8,        // 吸附/智能参考线容差（屏幕 px）
    handleTol: 8,     // 节点手柄/包围盒角点命中半径（屏幕 px）

    /* 角度与网格 */
    shiftAngle: 15,    // Shift 约束角度（度）
    gridSize: 20,     // 网格间距（世界单位，现 state.snap.gridSize 同名同值）
    gridStep: 5,       // 网格细分步长（预留）

    /* 徒手绘制：采样/RDP/角切/速度 */
    freehand: {
      minDist: 2.5,   // 相邻采样最小间距（世界单位）
      rdpTol: 1.5,     // RDP 默认抽稀容差（世界单位）
      rdpSlow: 1,      // 慢速绘制容差系数
      rdpFast: 3,      // 快速绘制容差系数
      cornerAngle: 20, // 角切判定阈值（度）
      fastSpeed: 1500, // 「快速」速度阈值（世界单位/秒）
    },

    /* 箭头头几何（Excalidraw 公式族，供后续 arrow 升级使用） */
    arrow: {
      sizeFactor: 25, // 头长 = sizeFactor * (strokeWidth/2)
      min: 10,         // 头长下限
      max: 40,         // 头长上限
      halfAngle: 20,   // 半翼张角（度）
      shortRatio: 0.5, // 短箭头：头长不超过线长 * shortRatio
    },

    /* 多边形 */
    polygon: { closeDist: 4, minArea: 20 },

    /* 函数图像自适应采样 */
    func: { initialSegs: 32, chordTol: 0.5, maxDepth: 12, jumpFactor: 5 },

    /* 标注（dim/angle/ext 引线） */
    annotation: { extOffset: 7, arrowLen: 11, labelOffset: 6, angleArcR: 25 },

    /* 现有默认样式（已核对 core.js DP.state.style 真实值，保持一致）：
       stroke #22303c / width 2 / dash solid / fill none / opacity 1 / fontSize 18 */
    defaults: {
      stroke: '#22303c',
      fill: 'none',
      strokeWidth: 2,
      fontSize: 18,
    },
  };
})(window);
