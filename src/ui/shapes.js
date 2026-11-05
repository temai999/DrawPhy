/* =========================================================================
 * DrawPhy ui/shapes.js — 图形工厂（纯函数：入参出对象，不读 UI 状态）
 *   DP.shape.from(tool, a, b, pts, stl, shift)  工具 + 两点/多点 → 新对象
 *   DP.shape.moduleFrom(...)                    仅走 registry 模块工厂
 *   DP.shape.simplifyPts(pts)                   徒手线抽稀
 * 未注册工具（trim/eraser/fill/func/select 等）由调用方处理。
 * ========================================================================= */
(function () {
  'use strict';
  const DP = (window.DP = window.DP || {});
  const G = DP.geom;

  function moduleShapeFromImpl(tool, a, b, stl, shift) {
    const type = tool === 'darrow' ? 'arrow' : tool === 'roundrect' ? 'rect' : tool;
    const mod = DP.registry && DP.registry.get ? DP.registry.get(type) : null;
    if (!mod || typeof mod.defaults !== 'function') return null;
    if (type === 'rect') {
      let w = b.x - a.x, h = b.y - a.y;
      if (shift) {
        const m = Math.max(Math.abs(w), Math.abs(h));
        w = Math.sign(w || 1) * m;
        h = Math.sign(h || 1) * m;
      }
      const rx = tool === 'roundrect' ? Math.min(12, Math.abs(w) / 4, Math.abs(h) / 4) : 0;
      return Object.assign(mod.defaults({
        x: Math.min(a.x, a.x + w), y: Math.min(a.y, a.y + h),
        w: Math.abs(w), h: Math.abs(h), rx,
        style: stl,
      }), { type: mod.type });
    }
    if (type === 'arrow' || type === 'ray') {
      /* arrow 的箭头在端点（style.arrow 区分单/双），ray 的箭头在中点（无 arrow 字段） */
      const style = type === 'arrow'
        ? Object.assign({}, stl, { arrow: tool === 'darrow' ? 'both' : 'end' })
        : stl;
      return Object.assign(mod.defaults({
        x1: a.x, y1: a.y, x2: b.x, y2: b.y, style,
      }), { type: mod.type });
    }
    if (type === 'line') {
      return Object.assign(mod.defaults({
        x1: a.x, y1: a.y, x2: b.x, y2: b.y,
        style: stl,
      }), { type: mod.type });
    }
    if (type === 'circle') {
      return Object.assign(mod.defaults({
        cx: a.x, cy: a.y, r: Math.max(1, G.dist(a, b)),
        style: stl,
      }), { type: mod.type });
    }
    if (type === 'ellipse') {
      let rx = Math.abs(b.x - a.x) / 2, ry = Math.abs(b.y - a.y) / 2;
      if (shift) { rx = ry = Math.max(rx, ry); }
      return Object.assign(mod.defaults({
        cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, rx, ry,
        style: stl,
      }), { type: mod.type });
    }
    return null;
  }

  function shapeFromImpl(tool, a, b, pts, stl, shift) {
    const fromModule = moduleShapeFromImpl(tool, a, b, stl, shift);
    if (fromModule) return fromModule;
    switch (tool) {
      case 'line': return { type: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y, style: stl };
      case 'arrow': return { type: 'arrow', x1: a.x, y1: a.y, x2: b.x, y2: b.y, style: Object.assign({}, stl, { arrow: 'end' }) };
      case 'darrow': return { type: 'arrow', x1: a.x, y1: a.y, x2: b.x, y2: b.y, style: Object.assign({}, stl, { arrow: 'both' }) };
      case 'ray': return { type: 'ray', x1: a.x, y1: a.y, x2: b.x, y2: b.y, style: Object.assign({}, stl, { rayArrows: 1 }) };
      case 'rect': {
        let w = b.x - a.x, h = b.y - a.y;
        if (shift) { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m; }
        return { type: 'rect', x: Math.min(a.x, a.x + w), y: Math.min(a.y, a.y + h), w: Math.abs(w), h: Math.abs(h), rx: 0, style: stl };
      }
      case 'roundrect': {
        let w = b.x - a.x, h = b.y - a.y;
        if (shift) { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m; }
        const rx = Math.min(12, Math.abs(w) / 4, Math.abs(h) / 4);
        return { type: 'rect', x: Math.min(a.x, a.x + w), y: Math.min(a.y, a.y + h), w: Math.abs(w), h: Math.abs(h), rx, style: stl };
      }
      case 'ellipse': {
        let rx = Math.abs(b.x - a.x) / 2, ry = Math.abs(b.y - a.y) / 2;
        if (shift) { rx = ry = Math.max(rx, ry); }
        return { type: 'ellipse', cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, rx, ry, style: stl };
      }
      case 'circle': return { type: 'circle', cx: a.x, cy: a.y, r: Math.max(1, G.dist(a, b)), style: stl };
      case 'freehand': {
        return { type: 'polyline', points: simplifyPts(pts), closed: false, style: stl };
      }
      default: return null;
    }
  }

  /* 函数图像：拖框定区域，输入解析式，采样生成折线 */

  function simplifyPtsImpl(pts) {
    if (pts.length <= 3) return pts;
    const tol = 1.6;
    const keep = [pts[0]];
    const rec = (i, j) => {
      let maxD = 0, idx = -1;
      const a = { x: pts[i][0], y: pts[i][1] }, b = { x: pts[j][0], y: pts[j][1] };
      for (let k = i + 1; k < j; k++) {
        const d = G.distToSeg({ x: pts[k][0], y: pts[k][1] }, a, b);
        if (d > maxD) { maxD = d; idx = k; }
      }
      if (maxD > tol && idx > -1) { rec(i, idx); keep.push(pts[idx]); rec(idx, j); }
    };
    rec(0, pts.length - 1);
    keep.push(pts[pts.length - 1]);
    return keep;
  }

  DP.shape = {
    from: shapeFromImpl,
    moduleFrom: moduleShapeFromImpl,
    simplifyPts: simplifyPtsImpl,
  };
})();

