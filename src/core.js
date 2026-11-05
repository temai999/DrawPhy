/* =========================================================================
 * DrawPhy core.js
 * 几何工具 + 文档模型 + 吸附引擎 + 撤销栈
 * 说明：所有坐标使用"世界坐标"（1 单位 ≈ 100% 缩放下的 1 像素）。
 * ========================================================================= */
(function () {
  'use strict';

  const DP = (window.DP = window.DP || {});
  const G = (DP.geom = {});
  const M = (DP.model = {});
  DP.geometry = G; // 框架约定名；旧代码继续使用 DP.geom

  /* ----------------------------- 基础工具 ----------------------------- */
  /* registry 优先、旧 switch 兜底（阶段 2 双轨分派） */
  function moduleOf(o) {
    return o && DP.registry && DP.registry.get ? DP.registry.get(o.type) : null;
  }
  M.moduleOf = moduleOf;

  const ANCHOR_LABELS = {
    endpoint: '端点',
    midpoint: '中点',
    center: '中心',
    quadrant: '象限',
    vertex: '顶点',
    point: '点',
    tip: '端点',
    tail: '端点',
  };
  function anchorLabel(a) {
    return (a && a.label) || ANCHOR_LABELS[a && a.kind] || (a && a.kind) || '锚点';
  }

  let _seq = 0;
  M.uid = (p) => `${p || 'o'}${++_seq}`;
  M.clone = (v) => JSON.parse(JSON.stringify(v));
  const DEG = (G.DEG = Math.PI / 180);
  G.deg = (rad) => rad / DEG;
  G.rad = (deg) => deg * DEG;
  G.round = (v, n = 2) => Math.round(v * 10 ** n) / 10 ** n;
  G.dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  /* 点到线段距离 */
  G.distToSeg = function (p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return G.dist(p, a);
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  };

  /* 线段交点（返回参数 t,u 及世界点） */
  G.segSeg = function (p1, p2, p3, p4) {
    const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
    if (Math.abs(d) < 1e-9) return null;
    const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
    const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
    if (t < -1e-6 || t > 1 + 1e-6 || u < -1e-6 || u > 1 + 1e-6) return null;
    return { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y), t, u };
  };

  /* 无限直线交点 */
  G.lineLine = function (p1, p2, p3, p4) {
    const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
    if (Math.abs(d) < 1e-9) return null;
    const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
    return { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
  };

  /* 线段与圆交点 */
  G.segCircle = function (a, b, c, r) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const fx = a.x - c.x, fy = a.y - c.y;
    const A = dx * dx + dy * dy;
    if (A < 1e-12) return [];
    const B = 2 * (fx * dx + fy * dy);
    const C = fx * fx + fy * fy - r * r;
    const disc = B * B - 4 * A * C;
    if (disc < 0) return [];
    const sq = Math.sqrt(disc);
    const out = [];
    for (const t of [(-B - sq) / (2 * A), (-B + sq) / (2 * A)]) {
      if (t >= -1e-6 && t <= 1 + 1e-6) out.push({ x: a.x + t * dx, y: a.y + t * dy, t });
    }
    return out;
  };

  /* 圆与圆交点 */
  G.circleCircle = function (c1, r1, c2, r2) {
    const d = G.dist(c1, c2);
    if (d < 1e-9 || d > r1 + r2 || d < Math.abs(r1 - r2)) return [];
    const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
    const mx = c1.x + (a * (c2.x - c1.x)) / d;
    const my = c1.y + (a * (c2.y - c1.y)) / d;
    const rx = -(c2.y - c1.y) * (h / d);
    const ry = (c2.x - c1.x) * (h / d);
    return [
      { x: mx + rx, y: my + ry },
      { x: mx - rx, y: my - ry },
    ];
  };

  G.pointInPoly = function (p, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if (yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };

  G.angleOf = (from, to) => Math.atan2(to.y - from.y, to.x - from.x);

  /* 归一化角度，使 a1 > a0 */
  G.normArc = function (a0, a1) {
    while (a1 <= a0) a1 += 360;
    while (a1 - a0 > 360) a1 -= 360;
    return [a0, a1];
  };

  /* 圆弧 path（世界坐标） */
  G.arcPath = function (cx, cy, r, a0, a1) {
    const s = G.rad(a0), e = G.rad(a1);
    const x1 = cx + r * Math.cos(s), y1 = cy + r * Math.sin(s);
    const x2 = cx + r * Math.cos(e), y2 = cy + r * Math.sin(e);
    const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
    const sweep = a1 > a0 ? 1 : 0;
    return `M${G.round(x1)} ${G.round(y1)} A${G.round(r)} ${G.round(r)} 0 ${large} ${sweep} ${G.round(x2)} ${G.round(y2)}`;
  };

  /* --------------------------- SVG path 几何 --------------------------- */
  /* 解析 path d，支持 M/L/H/V/Q/T/C/S/Z（含相对命令）。
     A 命令暂按终点直线近似（顶层 path 目前只由贝塞尔工具生成，不使用弧命令）。 */
  G.parsePath = function (d) {
    const subs = [];
    if (typeof d !== 'string' || !d.trim()) return subs;
    const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) || [];
    let i = 0, cmd = null, switched = false;
    let cur = { x: 0, y: 0 }, start = { x: 0, y: 0 };
    let sub = null, lastC = null, lastQ = null;
    const num = () => {
      const v = parseFloat(tokens[i++]);
      return isFinite(v) ? v : 0;
    };
    const pt = (x, y) => ({ x, y });
    const begin = (x, y) => {
      cur = pt(x, y); start = pt(x, y);
      sub = { start: pt(x, y), segs: [], closed: false };
      subs.push(sub);
      lastC = lastQ = null;
    };
    const ensure = () => { if (!sub) begin(cur.x, cur.y); };
    const lineTo = (x, y) => {
      ensure();
      sub.segs.push({ type: 'L', p0: pt(cur.x, cur.y), p1: pt(x, y) });
      cur = pt(x, y); lastC = lastQ = null;
    };
    const quadPoint = (p0, c, p1, t) => {
      const u = 1 - t;
      return {
        x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x,
        y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y,
      };
    };
    const cubicPoint = (p0, c1, c2, p1, t) => {
      const u = 1 - t;
      return {
        x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p1.x,
        y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p1.y,
      };
    };
    G._quadPoint = quadPoint;
    G._cubicPoint = cubicPoint;

    while (i < tokens.length) {
      if (/^[a-zA-Z]$/.test(tokens[i])) {
        cmd = tokens[i++];
        switched = true;
      }
      if (!cmd) { i++; continue; }
      const C = cmd.toUpperCase();
      const rel = cmd !== C;
      const rx = (v) => (rel ? cur.x + v : v);
      const ry = (v) => (rel ? cur.y + v : v);

      if (C === 'Z') {
        if (sub) { sub.closed = true; cur = pt(start.x, start.y); sub = null; }
        lastC = lastQ = null;
        cmd = null;
        continue;
      }
      if (C === 'M') {
        let x = rx(num()), y = ry(num());
        if (switched) { begin(x, y); switched = false; cmd = rel ? 'l' : 'L'; }
        else lineTo(x, y);
        continue;
      }
      if (C === 'L') { const x = rx(num()), y = ry(num()); lineTo(x, y); continue; }
      if (C === 'H') { lineTo(rx(num()), cur.y); continue; }
      if (C === 'V') { lineTo(cur.x, ry(num())); continue; }
      if (C === 'Q') {
        const c = pt(rx(num()), ry(num()));
        const end = pt(rx(num()), ry(num()));
        ensure();
        sub.segs.push({ type: 'Q', p0: pt(cur.x, cur.y), c, p1: end });
        cur = end; lastQ = c; lastC = null;
        continue;
      }
      if (C === 'T') {
        const c = lastQ ? pt(2 * cur.x - lastQ.x, 2 * cur.y - lastQ.y) : pt(cur.x, cur.y);
        const end = pt(rx(num()), ry(num()));
        ensure();
        sub.segs.push({ type: 'Q', p0: pt(cur.x, cur.y), c, p1: end });
        cur = end; lastQ = c; lastC = null;
        continue;
      }
      if (C === 'C') {
        const c1 = pt(rx(num()), ry(num()));
        const c2 = pt(rx(num()), ry(num()));
        const end = pt(rx(num()), ry(num()));
        ensure();
        sub.segs.push({ type: 'C', p0: pt(cur.x, cur.y), c1, c2, p1: end });
        cur = end; lastC = c2; lastQ = null;
        continue;
      }
      if (C === 'S') {
        const c1 = lastC ? pt(2 * cur.x - lastC.x, 2 * cur.y - lastC.y) : pt(cur.x, cur.y);
        const c2 = pt(rx(num()), ry(num()));
        const end = pt(rx(num()), ry(num()));
        ensure();
        sub.segs.push({ type: 'C', p0: pt(cur.x, cur.y), c1, c2, p1: end });
        cur = end; lastC = c2; lastQ = null;
        continue;
      }
      if (C === 'A') {
        /* 极简实现：读掉 7 个参数，用终点直线段占位 */
        num(); num(); num(); num(); num();
        const end = pt(rx(num()), ry(num()));
        lineTo(end.x, end.y);
        continue;
      }
      i++;
    }
    return subs;
  };

  /* path 精确包围盒：直线取端点，二次/三次贝塞尔取导数极值点 */
  G.pathBBox = function (d) {
    const subs = G.parsePath(d);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const add = (x, y) => {
      if (!isFinite(x) || !isFinite(y)) return;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    };
    const addPt = (p) => add(p.x, p.y);
    const quad = G._quadPoint;
    const cubic = G._cubicPoint;
    const cubicRoots = (p0, c1, c2, p1) => {
      const a = -p0 + 3 * c1 - 3 * c2 + p1;
      const b = 2 * (p0 - 2 * c1 + c2);
      const c = -p0 + c1;
      const out = [];
      if (Math.abs(a) < 1e-9) {
        if (Math.abs(b) > 1e-9) out.push(-c / b);
      } else {
        const disc = b * b - 4 * a * c;
        if (disc >= 0) {
          const sq = Math.sqrt(disc);
          out.push((-b - sq) / (2 * a), (-b + sq) / (2 * a));
        }
      }
      return out.filter((t) => t > 1e-9 && t < 1 - 1e-9);
    };
    for (const sub of subs) {
      addPt(sub.start);
      for (const seg of sub.segs) {
        addPt(seg.p1);
        if (seg.type === 'Q') {
          for (const axis of ['x', 'y']) {
            const den = seg.p0[axis] - 2 * seg.c[axis] + seg.p1[axis];
            if (Math.abs(den) > 1e-9) {
              const t = (seg.p0[axis] - seg.c[axis]) / den;
              if (t > 1e-9 && t < 1 - 1e-9) addPt(quad(seg.p0, seg.c, seg.p1, t));
            }
          }
        } else if (seg.type === 'C') {
          for (const axis of ['x', 'y']) {
            for (const t of cubicRoots(seg.p0[axis], seg.c1[axis], seg.c2[axis], seg.p1[axis])) {
              addPt(cubic(seg.p0, seg.c1, seg.c2, seg.p1, t));
            }
          }
        }
      }
    }
    if (!isFinite(minX)) return { x: 0, y: 0, w: 0, h: 0 };
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  };

  /* path 到点的最近距离（曲线按 16 段折线逼近，用于命中测试） */
  G.pathDistance = function (d, p) {
    const subs = G.parsePath(d);
    let best = Infinity;
    const addSeg = (a, b) => { best = Math.min(best, G.distToSeg(p, a, b)); };
    const quad = G._quadPoint, cubic = G._cubicPoint;
    for (const sub of subs) {
      let last = sub.start;
      for (const seg of sub.segs) {
        if (seg.type === 'L') addSeg(seg.p0, seg.p1);
        else {
          const steps = seg.type === 'Q' ? 12 : 18;
          let prev = seg.p0;
          for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const pt = seg.type === 'Q'
              ? quad(seg.p0, seg.c, seg.p1, t)
              : cubic(seg.p0, seg.c1, seg.c2, seg.p1, t);
            addSeg(prev, pt);
            prev = pt;
          }
        }
        last = seg.p1;
      }
      if (sub.closed && sub.segs.length) addSeg(last, sub.start);
    }
    return best;
  };

  /* path 端点锚点（每个子路径的起点与终点） */
  G.pathAnchors = function (d) {
    const out = [];
    for (const sub of G.parsePath(d)) {
      out.push(sub.start);
      if (sub.segs.length) out.push(sub.segs[sub.segs.length - 1].p1);
    }
    return out;
  };

  /* 将 path 规范化为绝对坐标并序列化（供移动/缩放/镜像回写 d） */
  G.serializePath = function (subs) {
    const r = (v) => G.round(v, 2);
    let out = '';
    for (const sub of subs) {
      if (!sub.segs.length) continue;
      out += `M${r(sub.start.x)} ${r(sub.start.y)} `;
      for (const seg of sub.segs) {
        if (seg.type === 'L') out += `L${r(seg.p1.x)} ${r(seg.p1.y)} `;
        else if (seg.type === 'Q') out += `Q${r(seg.c.x)} ${r(seg.c.y)} ${r(seg.p1.x)} ${r(seg.p1.y)} `;
        else if (seg.type === 'C') out += `C${r(seg.c1.x)} ${r(seg.c1.y)} ${r(seg.c2.x)} ${r(seg.c2.y)} ${r(seg.p1.x)} ${r(seg.p1.y)} `;
      }
      if (sub.closed) out += 'Z ';
    }
    return out.trim();
  };

  G.mapPath = function (d, fn) {
    const subs = G.parsePath(d);
    for (const sub of subs) {
      sub.start = fn(sub.start);
      for (const seg of sub.segs) {
        seg.p0 = fn(seg.p0);
        seg.p1 = fn(seg.p1);
        if (seg.c) seg.c = fn(seg.c);
        if (seg.c1) seg.c1 = fn(seg.c1);
        if (seg.c2) seg.c2 = fn(seg.c2);
      }
    }
    return G.serializePath(subs);
  };

  /* --------------------------- 矩阵（部件用） --------------------------- */
  G.mul = (m1, m2) => [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
  G.apply = (m, p) => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] });
  G.invert = function (m) {
    const det = m[0] * m[3] - m[1] * m[2] || 1e-9;
    return [
      m[3] / det, -m[1] / det, -m[2] / det, m[0] / det,
      (m[2] * m[5] - m[3] * m[4]) / det,
      (m[1] * m[4] - m[0] * m[5]) / det,
    ];
  };

  /* 部件的局部→世界矩阵 */
  M.partMatrix = function (o) {
    const def = DP.parts.byId[o.partId];
    const w = def ? def.w : 40, h = def ? def.h : 40;
    const cx = w / 2, cy = h / 2;
    const s = o.s == null ? 1 : o.s;
    const rot = o.rot || 0;
    const fx = o.flip ? -1 : 1;
    let m = [1, 0, 0, 1, o.x, o.y];
    m = G.mul(m, [s, 0, 0, s, 0, 0]);
    m = G.mul(m, [1, 0, 0, 1, cx, cy]);
    const r = G.rad(rot);
    m = G.mul(m, [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]);
    m = G.mul(m, [fx, 0, 0, 1, 0, 0]);
    m = G.mul(m, [1, 0, 0, 1, -cx, -cy]);
    return m;
  };

  /* ------------------------------ 包围盒 ------------------------------ */
  M.localBBox = function (o) {
    const mod = moduleOf(o);
    if (mod && typeof mod.bbox === 'function') return mod.bbox(o);
    switch (o.type) {
      case 'line':
      case 'arrow':
        return { x: Math.min(o.x1, o.x2), y: Math.min(o.y1, o.y2), w: Math.abs(o.x2 - o.x1), h: Math.abs(o.y2 - o.y1) };
      case 'polyline': {
        const xs = o.points.map((p) => p[0]), ys = o.points.map((p) => p[1]);
        return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
      }
      case 'circle':
        return { x: o.cx - o.r, y: o.cy - o.r, w: o.r * 2, h: o.r * 2 };
      case 'ellipse':
        return { x: o.cx - o.rx, y: o.cy - o.ry, w: o.rx * 2, h: o.ry * 2 };
      case 'arc': {
        let bb = Infinity;
        const [a0, a1] = [o.a0, o.a1];
        // 采样求包围盒（足够精确）
        const pts = [];
        for (let a = a0; a <= a1 + 0.001; a += Math.max(2, (a1 - a0) / 24)) {
          pts.push([o.cx + o.r * Math.cos(G.rad(a)), o.cy + o.r * Math.sin(G.rad(a))]);
        }
        const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
        return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
      }
      case 'path':
        return G.pathBBox(o.d);
      case 'rect':
        return { x: Math.min(o.x, o.x + o.w), y: Math.min(o.y, o.y + o.h), w: Math.abs(o.w), h: Math.abs(o.h) };
      case 'point': {
        const r = o.r || 3.5;
        return { x: o.x - r, y: o.y - r, w: r * 2, h: r * 2 };
      }
      case 'text': {
        const size = o.size || 16;
        const len = (o.text || '').length * size * 0.62 + 4;
        const w = len, h = size * 1.2;
        const ax = o.anchor === 'middle' ? w / 2 : 0;
        return { x: o.x - ax, y: o.y - size * 0.85, w, h };
      }
      case 'dim': {
        const x1 = Math.min(o.x1, o.x2), y1 = Math.min(o.y1, o.y2);
        const x2 = Math.max(o.x1, o.x2), y2 = Math.max(o.y1, o.y2);
        const off = o.offset || 0;
        return { x: x1, y: y1 - Math.abs(off) - 10, w: x2 - x1, h: y2 - y1 + Math.abs(off) * 2 + 20 };
      }
      case 'angle':
        return { x: o.cx - o.r, y: o.cy - o.r, w: o.r * 2, h: o.r * 2 };
      case 'textbox':
        return { x: o.x, y: o.y, w: o.w, h: o.h };
      case 'callout': {
        const x1 = Math.min(o.tx, o.bx), y1 = Math.min(o.ty, o.by);
        const x2 = Math.max(o.tx, o.bx + o.w), y2 = Math.max(o.ty, o.by + o.h);
        return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
      }
      case 'part': {
        const def = DP.parts.byId[o.partId];
        const w = def ? def.w : 40, h = def ? def.h : 40;
        const m = M.partMatrix(o);
        const corners = [[0, 0], [w, 0], [w, h], [0, h]].map(([x, y]) => G.apply(m, { x, y }));
        const xs = corners.map((p) => p.x), ys = corners.map((p) => p.y);
        return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
      }
      default:
        return { x: 0, y: 0, w: 0, h: 0 };
    }
  };

  M.bbox = function (objs) {
    if (!objs.length) return null;
    const bs = objs.map(M.localBBox);
    const x = Math.min(...bs.map((b) => b.x)), y = Math.min(...bs.map((b) => b.y));
    const x2 = Math.max(...bs.map((b) => b.x + b.w)), y2 = Math.max(...bs.map((b) => b.y + b.h));
    return { x, y, w: x2 - x, h: y2 - y };
  };

  /* ------------------------- 连接粘附（端点跟随宿主） ------------------------- */
  /* 端点吸附到某个对象后，记录相对宿主的偏移；宿主移动时端点自动跟随。
     这是 EE 里"把线接到部件上，移动部件线跟着走"的核心手感。 */
  M.refPoint = function (o) {
    const bb = M.localBBox(o);
    return { x: bb.x + bb.w / 2, y: bb.y + bb.h / 2 };
  };

  /* 部件命名端子的世界坐标（阶段 5.4）；无此端子返回 null */
  M.terminalPoint = function (o, tid) {
    if (!o || o.type !== 'part') return null;
    const def = DP.parts.byId[o.partId];
    if (!def || !def.terminals) return null;
    const t = def.terminals.find((x) => x.id === tid);
    if (!t) return null;
    return G.apply(M.partMatrix(o), { x: t.x, y: t.y });
  };

  M.bindEndpoint = function (o, key, host, terminal) {
    if (!host || !o || host.id === o.id) return false;
    if (o.type !== 'line' && o.type !== 'arrow') return false;
    const ex = key === 'x1' ? o.x1 : o.x2;
    const ey = key === 'x1' ? o.y1 : o.y2;
    o.bind = o.bind || {};
    /* 端子粘附：偏移相对端子点记录；宿主缩放/旋转/翻转时按 partMatrix 精确重算 */
    if (terminal && host.type === 'part') {
      const tp = M.terminalPoint(host, terminal);
      if (tp) {
        o.bind[key] = { id: host.id, terminal, dx: ex - tp.x, dy: ey - tp.y };
        return true;
      }
    }
    const rp = M.refPoint(host);
    o.bind[key] = { id: host.id, dx: ex - rp.x, dy: ey - rp.y };
    return true;
  };

  M.unbind = function (o, key) {
    if (!o || !o.bind) return;
    if (key) delete o.bind[key];
    else delete o.bind;
    if (o.bind && !o.bind.x1 && !o.bind.x2) delete o.bind;
  };

  /* 按绑定重算所有端点；宿主不存在时自动解绑 */
  M.applyBindings = function () {
    const objs = DP.state.objects;
    for (const o of objs) {
      if (!o.bind) continue;
      let alive = false;
      for (const key of ['x1', 'x2']) {
        const b = o.bind[key];
        if (!b) continue;
        const host = objs.find((x) => x.id === b.id);
        if (!host) { delete o.bind[key]; continue; }
        alive = true;
        /* 端子绑定优先按端子精确点解析；端子缺失（如部件定义更新）回退包围盒中心 */
        let rp = null;
        if (b.terminal) {
          rp = M.terminalPoint(host, b.terminal);
          if (!rp) b.terminal = undefined;
        }
        if (!rp) rp = M.refPoint(host);
        if (key === 'x1') { o.x1 = rp.x + b.dx; o.y1 = rp.y + b.dy; }
        else { o.x2 = rp.x + b.dx; o.y2 = rp.y + b.dy; }
      }
      if (!alive) delete o.bind;
    }
  };

  M.boundCount = function () {
    let n = 0;
    for (const o of DP.state.objects) if (o.bind) n++;
    return n;
  };

  /* --------------------------- 对象变换原语 --------------------------- */
  M.translateObj = function (o, dx, dy) {
    const mod = moduleOf(o);
    if (mod && typeof mod.translate === 'function') { mod.translate(o, dx, dy); return; }
    switch (o.type) {
      case 'line':
      case 'arrow': o.x1 += dx; o.x2 += dx; o.y1 += dy; o.y2 += dy; break;
      case 'polyline': o.points = o.points.map(([x, y]) => [x + dx, y + dy]); break;
      case 'circle': case 'ellipse': case 'arc': case 'angle': o.cx += dx; o.cy += dy; break;
      case 'rect': o.x += dx; o.y += dy; break;
      case 'text': o.x += dx; o.y += dy; break;
      case 'textbox': o.x += dx; o.y += dy; break;
      case 'callout': o.tx += dx; o.ty += dy; o.bx += dx; o.by += dy; break;
      case 'path': o.d = G.mapPath(o.d, (p) => ({ x: p.x + dx, y: p.y + dy })); break;
      case 'dim': o.x1 += dx; o.x2 += dx; o.y1 += dy; o.y2 += dy; break;
      case 'point': o.x += dx; o.y += dy; break;
      case 'part': o.x += dx; o.y += dy; break;
    }
  };

  M.scaleObj = function (o, sx, sy, ax, ay) {
    const mod = moduleOf(o);
    if (mod && typeof mod.scale === 'function') { mod.scale(o, sx, sy, ax, ay); return; }
    const px = (x) => ax + (x - ax) * sx;
    const py = (y) => ay + (y - ay) * sy;
    const k = (Math.abs(sx) + Math.abs(sy)) / 2;
    switch (o.type) {
      case 'line':
      case 'arrow': o.x1 = px(o.x1); o.x2 = px(o.x2); o.y1 = py(o.y1); o.y2 = py(o.y2); break;
      case 'polyline': o.points = o.points.map(([x, y]) => [px(x), py(y)]); break;
      case 'circle': {
        o.cx = px(o.cx); o.cy = py(o.cy);
        if (Math.abs(sx - sy) > 0.01) { o.type = 'ellipse'; o.rx = o.r * Math.abs(sx); o.ry = o.r * Math.abs(sy); delete o.r; }
        else o.r *= Math.abs(sx);
        break;
      }
      case 'ellipse': o.cx = px(o.cx); o.cy = py(o.cy); o.rx *= Math.abs(sx); o.ry *= Math.abs(sy); break;
      case 'arc': o.cx = px(o.cx); o.cy = py(o.cy); o.r *= k; break;
      case 'rect': {
        const x2 = o.x + o.w, y2 = o.y + o.h;
        o.x = px(o.x); o.y = py(o.y);
        o.w = px(x2) - o.x; o.h = py(y2) - o.y;
        break;
      }
      case 'text': o.x = px(o.x); o.y = py(o.y); o.size = Math.max(6, (o.size || 16) * k); break;
      case 'textbox': {
        const x2 = o.x + o.w, y2 = o.y + o.h;
        o.x = px(o.x); o.y = py(o.y);
        o.w = px(x2) - o.x; o.h = py(y2) - o.y;
        o.size = Math.max(6, (o.size || 14) * k);
        break;
      }
      case 'callout': {
        const x2 = o.bx + o.w, y2 = o.by + o.h;
        o.tx = px(o.tx); o.ty = py(o.ty);
        o.bx = px(o.bx); o.by = py(o.by);
        o.w = px(x2) - o.bx; o.h = py(y2) - o.by;
        o.size = Math.max(6, (o.size || 13) * k);
        break;
      }
      case 'path': o.d = G.mapPath(o.d, (p) => ({ x: px(p.x), y: py(p.y) })); break;
      case 'dim': o.x1 = px(o.x1); o.x2 = px(o.x2); o.y1 = py(o.y1); o.y2 = py(o.y2); o.offset *= k; break;
      case 'angle': o.cx = px(o.cx); o.cy = py(o.cy); o.r *= k; break;
      case 'point': o.x = px(o.x); o.y = py(o.y); break;
      case 'part': {
        const bb = M.localBBox(o);
        // 先定位旋转中心，再缩放
        const center = { x: bb.x + bb.w / 2, y: bb.y + bb.h / 2 };
        const nc = { x: px(center.x), y: py(center.y) };
        o.s = (o.s == null ? 1 : o.s) * k;
        M.translateObj(o, nc.x - center.x, nc.y - center.y);
        break;
      }
    }
  };

  M.mirrorObj = function (o, axis) {
    const mod = moduleOf(o);
    if (mod && typeof mod.mirror === 'function') { mod.mirror(o, axis); return; }
    const bb = M.localBBox(o);
    const cx = bb.x + bb.w / 2, cy = bb.y + bb.h / 2;
    const fx = (v) => (axis === 'h' ? 2 * cx - v : v);
    const fy = (v) => (axis === 'v' ? 2 * cy - v : v);
    switch (o.type) {
      case 'line':
      case 'arrow': o.x1 = fx(o.x1); o.x2 = fx(o.x2); o.y1 = fy(o.y1); o.y2 = fy(o.y2); break;
      case 'polyline': o.points = o.points.map(([x, y]) => [fx(x), fy(y)]); break;
      case 'circle': case 'ellipse': o.cx = fx(o.cx); o.cy = fy(o.cy); break;
      case 'rect': o.x = fx(o.x + o.w); o.y = fy(o.y + o.h); break;
      case 'textbox': o.x = fx(o.x + o.w); o.y = fy(o.y + o.h); break;
      case 'callout':
        o.tx = fx(o.tx); o.ty = fy(o.ty);
        o.bx = fx(o.bx + o.w); o.by = fy(o.by + o.h);
        break;
      case 'path': o.d = G.mapPath(o.d, (p) => ({ x: fx(p.x), y: fy(p.y) })); break;
      case 'arc': {
        /* 角度镜像（先缓存旧值，避免链式覆盖）：
           axis='v'（上下翻 y→2cy-y）：a0'=-A1, a1'=-A0
           axis='h'（左右翻 x→2cx-x）：a0'=180-A1, a1'=180-A0
           镜像后 a1'-a0' 仍等于原跨度，large/sweep 标志不变，弧集合正确。 */
        o.cx = fx(o.cx); o.cy = fy(o.cy);
        const A0 = o.a0, A1 = o.a1;
        if (axis === 'v') { o.a0 = -A1; o.a1 = -A0; }
        else { o.a0 = 180 - A1; o.a1 = 180 - A0; }
        break;
      }
      case 'text': o.x = fx(o.x); o.y = fy(o.y); if (o.anchor === 'middle') o.anchor = 'middle'; break;
      case 'part': o.flip = !o.flip; break;
      case 'angle': o.cx = fx(o.cx); o.cy = fy(o.cy); break;
      case 'dim': o.x1 = fx(o.x1); o.x2 = fx(o.x2); o.y1 = fy(o.y1); o.y2 = fy(o.y2); break;
      case 'point': o.x = fx(o.x); o.y = fy(o.y); break;
    }
  };

  /* ------------------------------- 吸附 ------------------------------- */
  const S = (DP.snap = {});

  /* 收集所有可吸附点 */
  S.collectPoints = function (objects, exclude) {
    const out = [];
    const push = (x, y, type, oid, tid) => {
      if (!isFinite(x) || !isFinite(y)) return;
      const e = { x, y, type, oid };
      if (tid) e.tid = tid;
      out.push(e);
    };
    for (const o of objects) {
      if (exclude && exclude.has(o.id)) continue;
      const mod = moduleOf(o);
      if (mod && typeof mod.anchors === 'function') {
        for (const a of mod.anchors(o) || []) push(a.x, a.y, anchorLabel(a), o.id, a.tid);
        continue;
      }
      switch (o.type) {
        case 'line':
        case 'arrow':
          push(o.x1, o.y1, '端点', o.id);
          push(o.x2, o.y2, '端点', o.id);
          push((o.x1 + o.x2) / 2, (o.y1 + o.y2) / 2, '中点', o.id);
          break;
        case 'polyline':
          o.points.forEach(([x, y]) => push(x, y, '端点', o.id));
          for (let i = 0; i < o.points.length - 1; i++) {
            const [x1, y1] = o.points[i], [x2, y2] = o.points[i + 1];
            push((x1 + x2) / 2, (y1 + y2) / 2, '中点', o.id);
          }
          break;
        case 'circle': case 'ellipse': {
          const rx = o.type === 'circle' ? o.r : o.rx, ry = o.type === 'circle' ? o.r : o.ry;
          push(o.cx, o.cy, '圆心', o.id);
          push(o.cx + rx, o.cy, '象限', o.id);
          push(o.cx - rx, o.cy, '象限', o.id);
          push(o.cx, o.cy + ry, '象限', o.id);
          push(o.cx, o.cy - ry, '象限', o.id);
          break;
        }
        case 'arc':
          push(o.cx, o.cy, '圆心', o.id);
          push(o.cx + o.r * Math.cos(G.rad(o.a0)), o.cy + o.r * Math.sin(G.rad(o.a0)), '端点', o.id);
          push(o.cx + o.r * Math.cos(G.rad(o.a1)), o.cy + o.r * Math.sin(G.rad(o.a1)), '端点', o.id);
          break;
        case 'rect':
          push(o.x, o.y, '端点', o.id);
          push(o.x + o.w, o.y, '端点', o.id);
          push(o.x + o.w, o.y + o.h, '端点', o.id);
          push(o.x, o.y + o.h, '端点', o.id);
          push(o.x + o.w / 2, o.y + o.h / 2, '中心', o.id);
          break;
        case 'point':
          push(o.x, o.y, '点', o.id);
          break;
        case 'text': case 'part': case 'textbox': case 'callout': {
          const bb = M.localBBox(o);
          push(bb.x, bb.y, '端点', o.id);
          push(bb.x + bb.w, bb.y, '端点', o.id);
          push(bb.x, bb.y + bb.h, '端点', o.id);
          push(bb.x + bb.w, bb.y + bb.h, '端点', o.id);
          push(bb.x + bb.w / 2, bb.y + bb.h / 2, '中心', o.id);
          /* 标注的指向尖点单独作为吸附锚点 */
          if (o.type === 'callout') push(o.tx, o.ty, '指向点', o.id);
          break;
        }
        case 'dim':
          push(o.x1, o.y1, '端点', o.id);
          push(o.x2, o.y2, '端点', o.id);
          push((o.x1 + o.x2) / 2, (o.y1 + o.y2) / 2, '中点', o.id);
          break;
        case 'angle': {
          push(o.cx, o.cy, '顶点', o.id);
          push(o.cx + o.r * Math.cos(G.rad(o.a0)), o.cy + o.r * Math.sin(G.rad(o.a0)), '端点', o.id);
          push(o.cx + o.r * Math.cos(G.rad(o.a1)), o.cy + o.r * Math.sin(G.rad(o.a1)), '端点', o.id);
          break;
        }
        case 'path':
          for (const p of G.pathAnchors(o.d)) push(p.x, p.y, '端点', o.id);
          break;
      }
    }
    return out;
  };

  /* 交点提示 */
  S.intersections = function (objects, near, radius) {
    const out = [];
    const close = objects.filter((o) => {
      const bb = M.localBBox(o);
      return near.x > bb.x - radius && near.x < bb.x + bb.w + radius && near.y > bb.y - radius && near.y < bb.y + bb.h + radius;
    });
    const segsOf = (o) => {
      if (o.type === 'line') return [[{ x: o.x1, y: o.y1 }, { x: o.x2, y: o.y2 }]];
      if (o.type === 'polyline') {
        const s = [];
        for (let i = 0; i < o.points.length - 1; i++) s.push([{ x: o.points[i][0], y: o.points[i][1] }, { x: o.points[i + 1][0], y: o.points[i + 1][1] }]);
        return s;
      }
      if (o.type === 'rect') {
        const { x, y, w, h } = o;
        return [
          [{ x, y }, { x: x + w, y }], [{ x: x + w, y }, { x: x + w, y: y + h }],
          [{ x: x + w, y: y + h }, { x, y: y + h }], [{ x, y: y + h }, { x, y }],
        ];
      }
      return [];
    };
    for (let i = 0; i < close.length; i++) {
      for (let j = i + 1; j < close.length; j++) {
        const A = close[i], B = close[j];
        for (const [a1, a2] of segsOf(A)) {
          for (const [b1, b2] of segsOf(B)) {
            const p = G.segSeg(a1, a2, b1, b2);
            if (p && Math.hypot(p.x - near.x, p.y - near.y) < radius * 2.2) out.push({ x: p.x, y: p.y, type: '交点' });
          }
        }
        // 线—圆
        for (const [a1, a2] of segsOf(A)) {
          const c = B.type === 'circle' ? B : B.type === 'ellipse' && Math.abs(B.rx - B.ry) < 0.5 ? { cx: B.cx, cy: B.cy, r: B.rx } : null;
          if (c) for (const p of G.segCircle(a1, a2, { x: c.cx, y: c.cy }, c.r)) {
            if (Math.hypot(p.x - near.x, p.y - near.y) < radius * 2.2) out.push({ x: p.x, y: p.y, type: '交点' });
          }
        }
        for (const [b1, b2] of segsOf(B)) {
          const c = A.type === 'circle' ? A : A.type === 'ellipse' && Math.abs(A.rx - A.ry) < 0.5 ? { cx: A.cx, cy: A.cy, r: A.rx } : null;
          if (c) for (const p of G.segCircle(b1, b2, { x: c.cx, y: c.cy }, c.r)) {
            if (Math.hypot(p.x - near.x, p.y - near.y) < radius * 2.2) out.push({ x: p.x, y: p.y, type: '交点' });
          }
        }
        // 圆—圆
        if ((A.type === 'circle') && (B.type === 'circle')) {
          for (const p of G.circleCircle({ x: A.cx, y: A.cy }, A.r, { x: B.cx, y: B.cy }, B.r)) {
            out.push({ x: p.x, y: p.y, type: '交点' });
          }
        }
      }
    }
    return out;
  };

  /* 主吸附函数
   * p: {x,y}；ctx: {state, exclude, from, radius}
   * 返回 {x, y, label, guides:[{type,a,b}]}
   */
  S.resolve = function (p, ctx) {
    const st = DP.state;
    const tol = ctx.radius || 9 / st.view.k;
    const cands = [];
    if (st.snap.grid) {
      const g = st.snap.gridSize;
      cands.push({ x: Math.round(p.x / g) * g, y: Math.round(p.y / g) * g, label: '栅格' });
    }
    if (st.snap.anchors) {
      for (const c of S.collectPoints(st.objects, ctx.exclude)) {
        if (Math.hypot(c.x - p.x, c.y - p.y) <= tol) cands.push({ x: c.x, y: c.y, label: c.type, weak: true, oid: c.oid, terminal: c.tid || null });
      }
      for (const c of S.intersections(st.objects, p, tol * 1.4)) {
        if (Math.hypot(c.x - p.x, c.y - p.y) <= tol) cands.push({ x: c.x, y: c.y, label: '交点', weak: true });
      }
    }
    // 方向约束：起点 + 15° 或 3° 磁吸正交
    let best = null, bestD = Infinity;
    for (const c of cands) {
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      // 端点/交点优先于栅格：给几何锚点一个与捕捉半径成正比的优先级奖励
      const score = d - (c.weak ? tol * 0.35 : 0);
      if (score < bestD) { bestD = score; best = c; }
    }
    let res = best ? { x: best.x, y: best.y, label: best.label, oid: best.oid || null, terminal: best.terminal || null } : { x: p.x, y: p.y, label: '', oid: null, terminal: null };

    // 角度约束（正交 / Shift 15°）
    if (ctx.from) {
      const a = G.deg(G.angleOf(ctx.from, res));
      let snapped = null, step = ctx.shift ? 15 : 0;
      if (step) {
        const s = Math.round(a / step) * step;
        if (Math.abs(((a - s + 180) % 360 + 360) % 360 - 180) < 4) snapped = s;
      } else {
        // 自动正交磁吸：接近水平/垂直即锁定
        if (Math.abs(((a + 360) % 360)) < 3 || Math.abs(((a + 360) % 360) - 180) < 3) snapped = 0;
        if (Math.abs(((a + 360) % 360) - 90) < 3 || Math.abs(((a + 360) % 360) - 270) < 3) snapped = 90;
      }
      if (snapped != null && !res.label) {
        const L = G.dist(ctx.from, res);
        res = {
          x: ctx.from.x + L * Math.cos(G.rad(snapped)),
          y: ctx.from.y + L * Math.sin(G.rad(snapped)),
          label: snapped % 90 === 0 ? '正交' : `${G.round(snapped)}°`,
        };
      }
    }
    return res;
  };

  /* ----------------------------- 状态与历史 ----------------------------- */
  DP.state = {
    objects: [],
    selection: new Set(),
    tool: 'select',
    view: { x: 60, y: 40, k: 1 },
    page: { w: 1240, h: 820, bg: '#ffffff', grid: true },
    snap: { grid: true, gridSize: 20, anchors: true },
    style: { stroke: '#22303c', width: 2, dash: 'solid', fill: 'none', opacity: 1, fontSize: 18, arrow: 'end' },
    groups: {}, // groupId -> true
    clipboard: null,
  };

  const H = (DP.history = {
    stack: [],
    idx: -1,
    snapshot() {
      return JSON.stringify({ objects: DP.state.objects, groups: DP.state.groups });
    },
    push() {
      const s = this.snapshot();
      if (this.stack[this.idx] === s) return;
      this.stack = this.stack.slice(0, this.idx + 1);
      this.stack.push(s);
      if (this.stack.length > 80) this.stack.shift();
      this.idx = this.stack.length - 1;
      DP.state.dirty = true;
    },
    reset() { this.stack = [this.snapshot()]; this.idx = 0; },
    undo() {
      if (this.idx <= 0) return false;
      this.idx--;
      this.load(this.stack[this.idx]);
      return true;
    },
    redo() {
      if (this.idx >= this.stack.length - 1) return false;
      this.idx++;
      this.load(this.stack[this.idx]);
      return true;
    },
    load(s) {
      const d = JSON.parse(s);
      DP.state.objects = d.objects;
      DP.state.groups = d.groups || {};
      DP.state.selection = new Set();
    },
  });

  /* --------------------------- 选择 / 分组辅助 --------------------------- */
  DP.sel = {
    list() { return DP.state.objects.filter((o) => DP.state.selection.has(o.id)); },
    expand(ids) {
      const out = new Set(ids);
      for (const o of DP.state.objects) {
        if (o.group && ids.has(o.id)) {
          for (const p of DP.state.objects) if (p.group === o.group) out.add(p.id);
        }
      }
      return out;
    },
    clear() { DP.state.selection.clear(); },
    set(ids) { DP.state.selection = new Set(ids); },
  };

  DP.model.toJSON = function () {
    return { version: 1, page: DP.state.page, objects: DP.state.objects, groups: DP.state.groups };
  };
  DP.model.fromJSON = function (data) {
    DP.state.page = Object.assign(DP.state.page, data.page || {});
    DP.state.objects = (data.objects || []).map((o) => o);
    DP.state.groups = data.groups || {};
    DP.state.selection = new Set();
    H.reset();
  };
})();
