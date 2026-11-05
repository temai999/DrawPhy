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

  /* --------------------- 曲线：穿过点 → 三次贝塞尔 ---------------------
   * pts = [{ x, y, corner?, in?, out? }]
   *   corner  角点（切线归零，曲线上出现尖角）
   *   out/in  该点显式的外/内侧控制把柄（绝对坐标）
   * 没有显式把柄时按 Catmull-Rom 自动求切线 → 曲线平滑穿过每个点。
   * 这样「单击加点」即可画出顺滑曲线，不必先点控制点。 */
  G.curveThrough = function (pts, closed) {
    const n = Array.isArray(pts) ? pts.length : 0;
    if (!n) return '';
    if (n === 1) return `M${G.round(pts[0].x)} ${G.round(pts[0].y)}`;
    const P = pts.map((p) => ({
      x: p.x, y: p.y, corner: !!p.corner,
      in: p.in ? { x: p.in.x, y: p.in.y } : null,
      out: p.out ? { x: p.out.x, y: p.out.y } : null,
    }));
    const at = (i) => (closed ? P[(i + n) % n] : P[Math.max(0, Math.min(n - 1, i))]);
    const autoT = (i) => {
      const prev = at(i - 1), next = at(i + 1);
      return { x: (next.x - prev.x) / 6, y: (next.y - prev.y) / 6 };
    };
    const outOf = (i) => {
      const p = P[i];
      if (p.out) return p.out;
      if (p.corner) return { x: p.x, y: p.y };
      const t = autoT(i);
      return { x: p.x + t.x, y: p.y + t.y };
    };
    const inOf = (i) => {
      const p = P[i];
      if (p.in) return p.in;
      if (p.corner) return { x: p.x, y: p.y };
      const t = autoT(i);
      return { x: p.x - t.x, y: p.y - t.y };
    };
    const r = (v) => G.round(v, 2);
    /* 两点重合时切线退化，直接丢弃后一个点，避免出现零长段 */
    let d = `M${r(P[0].x)} ${r(P[0].y)}`;
    const last = closed ? n - 1 : n - 2;
    for (let i = 0; i <= last; i++) {
      const a = P[i], b = P[(i + 1) % n];
      if (!closed && i > 0 && G.dist(a, b) < 0.01) continue;
      const c1 = outOf(i), c2 = inOf((i + 1) % n);
      const flat = Math.abs(c1.x - a.x) < 0.01 && Math.abs(c1.y - a.y) < 0.01
        && Math.abs(c2.x - b.x) < 0.01 && Math.abs(c2.y - b.y) < 0.01;
      if (flat) d += `L${r(b.x)} ${r(b.y)}`;
      else d += `C${r(c1.x)} ${r(c1.y)} ${r(c2.x)} ${r(c2.y)} ${r(b.x)} ${r(b.y)}`;
    }
    if (closed) d += 'Z';
    return d;
  };

  /* path 的可编辑节点：锚点（a{s}_{i}）+ 控制把柄（p{s}_{j}_{1|2|0}）
     ctrl 节点带 ax/ay = 所属锚点，供 UI 画牵引虚线。 */
  G.pathNodes = function (d) {
    const out = [];
    G.parsePath(d).forEach((sub, si) => {
      out.push({ id: 'a' + si + '_0', kind: 'anchor', si, ai: 0, x: sub.start.x, y: sub.start.y });
      sub.segs.forEach((seg, j) => {
        out.push({ id: 'a' + si + '_' + (j + 1), kind: 'anchor', si, ai: j + 1, x: seg.p1.x, y: seg.p1.y });
      });
      sub.segs.forEach((seg, j) => {
        if (seg.type === 'C') {
          out.push({ id: 'p' + si + '_' + j + '_1', kind: 'ctrl', si, j, which: 1, x: seg.c1.x, y: seg.c1.y, ax: seg.p0.x, ay: seg.p0.y });
          out.push({ id: 'p' + si + '_' + j + '_2', kind: 'ctrl', si, j, which: 2, x: seg.c2.x, y: seg.c2.y, ax: seg.p1.x, ay: seg.p1.y });
        } else if (seg.type === 'Q') {
          out.push({ id: 'p' + si + '_' + j + '_0', kind: 'ctrl', si, j, which: 0, x: seg.c.x, y: seg.c.y, ax: seg.p0.x, ay: seg.p0.y });
        }
      });
    });
    return out;
  };

  /* 拖动节点回写 d：
     锚点 → 自身 + 左右相邻把柄一起平移（曲率手感不变）
     把柄 → 只动自己；opts.mirror=true 时反向把柄按锚点镜像联动（平滑点） */
  G.editPathNode = function (d, id, p, opts) {
    opts = opts || {};
    const subs = G.parsePath(d);
    const m = /^([ap])(\d+)_(\d+)(?:_(\d+))?$/.exec(String(id || ''));
    if (!m) return d;
    const sub = subs[+m[2]];
    if (!sub) return d;
    const mv = (q, dx, dy) => { q.x += dx; q.y += dy; };
    if (m[1] === 'a') {
      const ai = +m[3];
      const left = ai > 0 ? sub.segs[ai - 1] : null;
      const right = sub.segs[ai] || null;
      const cur = ai === 0 ? sub.start : left.p1;
      const dx = p.x - cur.x, dy = p.y - cur.y;
      if (!dx && !dy) return d;
      if (ai === 0) sub.start = { x: p.x, y: p.y };
      else left.p1 = { x: p.x, y: p.y };
      if (right) right.p0 = { x: p.x, y: p.y };
      if (left) { if (left.c2) mv(left.c2, dx, dy); else if (left.c) mv(left.c, dx, dy); }
      if (right) { if (right.c1) mv(right.c1, dx, dy); else if (right.c) mv(right.c, dx, dy); }
    } else {
      const j = +m[3], which = +(m[4] || 0);
      const seg = sub.segs[j];
      if (!seg) return d;
      if (which === 1 && seg.c1) {
        seg.c1 = { x: p.x, y: p.y };
        const prev = sub.segs[j - 1];
        if (opts.mirror && prev && prev.c2) {
          prev.c2 = { x: 2 * seg.p0.x - p.x, y: 2 * seg.p0.y - p.y };
        }
      } else if (which === 2 && seg.c2) {
        seg.c2 = { x: p.x, y: p.y };
        const next = sub.segs[j + 1];
        if (opts.mirror && next && next.c1) {
          next.c1 = { x: 2 * seg.p1.x - p.x, y: 2 * seg.p1.y - p.y };
        }
      } else if (seg.c) {
        seg.c = { x: p.x, y: p.y };
      }
    }
    return G.serializePath(subs);
  };

  /* 在曲线上最近处插入一个锚点（de Casteljau 拆分，形状不变）。
     找不到足够近的段（> tol）时返回 null。 */
  G.insertPathPoint = function (d, p, tol) {
    const subs = G.parsePath(d);
    const limit = tol == null ? 8 : tol;
    const quad = G._quadPoint, cubic = G._cubicPoint;
    let best = null;
    subs.forEach((sub, si) => {
      sub.segs.forEach((seg, j) => {
        const steps = 40;
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const q = seg.type === 'Q' ? quad(seg.p0, seg.c, seg.p1, t)
            : seg.type === 'C' ? cubic(seg.p0, seg.c1, seg.c2, seg.p1, t)
              : { x: seg.p0.x + (seg.p1.x - seg.p0.x) * t, y: seg.p0.y + (seg.p1.y - seg.p0.y) * t };
          const dd = G.dist(q, p);
          if (!best || dd < best.d) best = { d: dd, si, j, t };
        }
      });
    });
    if (!best || best.d > limit) return null;
    const seg = subs[best.si].segs[best.j];
    const t = best.t;
    if (seg.type === 'L') {
      const mid = { x: seg.p0.x + (seg.p1.x - seg.p0.x) * t, y: seg.p0.y + (seg.p1.y - seg.p0.y) * t };
      subs[best.si].segs.splice(best.j, 1,
        { type: 'L', p0: { ...seg.p0 }, p1: { ...mid } },
        { type: 'L', p0: { ...mid }, p1: { ...seg.p1 } });
    } else {
      const lerp = (a, b) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      const p0 = seg.p0, p1 = seg.p1;
      let left, right;
      if (seg.type === 'Q') {
        const q0 = lerp(p0, seg.c), q1 = lerp(seg.c, p1), mid = lerp(q0, q1);
        left = { type: 'Q', p0: { ...p0 }, c: q0, p1: { ...mid } };
        right = { type: 'Q', p0: { ...mid }, c: q1, p1: { ...p1 } };
      } else {
        const q0 = lerp(p0, seg.c1), q1 = lerp(seg.c1, seg.c2), q2 = lerp(seg.c2, p1);
        const r0 = lerp(q0, q1), r1 = lerp(q1, q2), mid = lerp(r0, r1);
        left = { type: 'C', p0: { ...p0 }, c1: q0, c2: r0, p1: { ...mid } };
        right = { type: 'C', p0: { ...mid }, c1: r1, c2: q2, p1: { ...p1 } };
      }
      subs[best.si].segs.splice(best.j, 1, left, right);
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
    /* 单轨收敛（阶段 5 收尾）：15 种类型全部由模块提供 bbox，
       未注册类型（模块缺失/未知类型）回退零包围盒并告警 */
    if (!M._warnedType) M._warnedType = {};
    if (!M._warnedType[o.type]) {
      M._warnedType[o.type] = 1;
      console.warn('[DrawPhy] 未注册类型缺 bbox 模块:', o.type);
    }
    return { x: 0, y: 0, w: 0, h: 0 };
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

  /* 类型是否支持端点粘附：由模块 capabilities.bind 声明（line/arrow/ray 为 true）。
     原实现硬编码 `type === 'line' || 'arrow'`，新增光线后必然漏改，故收敛到能力位。 */
  M.isBindable = function (o) {
    const mod = moduleOf(o);
    return !!(mod && mod.capabilities && mod.capabilities.bind);
  };

  M.bindEndpoint = function (o, key, host, terminal) {
    if (!host || !o || host.id === o.id) return false;
    if (!M.isBindable(o)) return false;
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

  /* ---------------- 破口接线（阶段 7-b）：元器件插入已有导线 ----------------
     把两端元器件放在导线上时，导线在该处断成两段，两段内侧端点各自粘到元器件
     的两个命名端子上（bind.terminal）。之后拖动/旋转元器件，两段导线跟着走。
     这里只放纯几何/数据逻辑（无 DOM），ui.js 负责预览、吸附与提示。 */
  function partThroughPair(def) {
    const ts = (def && def.terminals) || [];
    if (ts.length !== 2) return null;
    const a = ts[0], b = ts[1];
    /* 端子连线长度须 ≥ 部件长边一半：钟/插座这类端子挤在一角的不参与 */
    if (Math.hypot(b.x - a.x, b.y - a.y) < Math.max(def.w, def.h) * 0.5) return null;
    return [a, b];
  }
  M.partThroughPair = partThroughPair;

  function segParam(p, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const L2 = dx * dx + dy * dy;
    if (!L2) return 0;
    return ((p.x - x1) * dx + (p.y - y1) * dy) / L2;
  }

  /* 找落点附近的导线（只认 line：箭头/光线有方向语义，不参与破口） */
  M.findInsertWire = function (p, def) {
    if (!partThroughPair(def)) return null;
    const tol = Math.max(12, Math.min(def.w, def.h) * 0.6);
    let best = null;
    for (const o of DP.state.objects) {
      if (o.type !== 'line' || o.locked) continue;
      if (!M.layerVisible(o) || M.layerLocked(o)) continue; /* 隐藏/锁定图层的导线不破口 */
      const t = segParam(p, o.x1, o.y1, o.x2, o.y2);
      if (t < -0.02 || t > 1.02) continue;
      const d = G.distToSeg(p, { x: o.x1, y: o.y1 }, { x: o.x2, y: o.y2 });
      if (d > tol) continue;
      if (!best || d < best.d) best = { wire: o, d, t };
    }
    return best ? best.wire : null;
  };

  /* 在 0/90/180/270 里挑端子连线最贴合导线方向的旋转角（同分取小角度） */
  M.bestPartRot = function (def, cx, cy, angle) {
    const pair = partThroughPair(def);
    if (!pair) return 0;
    let bestRot = 0, bestScore = -1;
    for (const rot of [0, 90, 180, 270]) {
      const m = M.partMatrix({ partId: def.id, x: cx - def.w / 2, y: cy - def.h / 2, s: 1, rot, flip: false });
      const a = G.apply(m, { x: pair[0].x, y: pair[0].y });
      const b = G.apply(m, { x: pair[1].x, y: pair[1].y });
      const vx = b.x - a.x, vy = b.y - a.y;
      const vl = Math.hypot(vx, vy) || 1;
      const score = Math.abs((vx * Math.cos(angle) + vy * Math.sin(angle)) / vl);
      if (score > bestScore + 1e-6) { bestScore = score; bestRot = rot; }
    }
    return bestRot;
  };

  /* 计算一次放置的最终位置（ui 预览与真正放置共用，保证所见即所得） */
  M.planPartAt = function (def, pid, world, nudge) {
    const target = { x: world.x + (nudge ? nudge.x : 0), y: world.y + (nudge ? nudge.y : 0) };
    const wire = M.findInsertWire(target, def);
    let cx = target.x, cy = target.y, rot = 0;
    if (wire) {
      const t = Math.max(0, Math.min(1, segParam(target, wire.x1, wire.y1, wire.x2, wire.y2)));
      cx = wire.x1 + (wire.x2 - wire.x1) * t;
      cy = wire.y1 + (wire.y2 - wire.y1) * t;
      rot = M.bestPartRot(def, cx, cy, Math.atan2(wire.y2 - wire.y1, wire.x2 - wire.x1));
    }
    const mod = moduleOf({ type: 'part' });
    const obj = mod && typeof mod.defaults === 'function'
      ? mod.defaults({ partId: pid, x: cx - def.w / 2, y: cy - def.h / 2, rot })
      : { type: 'part', partId: pid, x: cx - def.w / 2, y: cy - def.h / 2, s: 1, rot, flip: false };
    obj.id = 'preview';
    obj.style = M.clone(DP.state.style);
    return { obj, wire, rot, cx, cy };
  };

  /* 把元器件插进导线：原导线 → 两段，内侧端点绑端子；外侧端点保留原有绑定 */
  M.breakWireInto = function (wire, part) {
    const def = DP.parts.byId[part.partId];
    const pair = partThroughPair(def);
    if (!pair) return false;
    const pa = M.terminalPoint(part, pair[0].id);
    const pb = M.terminalPoint(part, pair[1].id);
    if (!pa || !pb) return false;
    const ta = segParam(pa, wire.x1, wire.y1, wire.x2, wire.y2);
    const tb = segParam(pb, wire.x1, wire.y1, wire.x2, wire.y2);
    const near = ta <= tb ? { pt: pa, tid: pair[0].id } : { pt: pb, tid: pair[1].id };
    const far = ta <= tb ? { pt: pb, tid: pair[1].id } : { pt: pa, tid: pair[0].id };
    const lineMod = moduleOf({ type: 'line' });
    const mk = (props) => {
      const l = lineMod && lineMod.defaults ? lineMod.defaults(props) : Object.assign({}, props);
      l.type = 'line';                       /* defaults 不带 type，分派靠它 */
      l.style = M.clone(wire.style || DP.state.style);
      if (wire.dash) l.dash = wire.dash;
      if (wire.locked) l.locked = wire.locked;
      return l;
    };
    const L1 = mk({ x1: wire.x1, y1: wire.y1, x2: near.pt.x, y2: near.pt.y });
    L1.id = wire.id;                         /* 保留原 id：分组/选择/引用不失效 */
    if (wire.group) L1.group = wire.group;
    L1.bind = {};
    if (wire.bind && wire.bind.x1) L1.bind.x1 = M.clone(wire.bind.x1);
    L1.bind.x2 = { id: part.id, terminal: near.tid, dx: 0, dy: 0 };
    const L2 = mk({ x1: far.pt.x, y1: far.pt.y, x2: wire.x2, y2: wire.y2 });
    L2.id = M.uid('ln');
    if (wire.group) L2.group = wire.group;
    L2.bind = { x1: { id: part.id, terminal: far.tid, dx: 0, dy: 0 } };
    if (wire.bind && wire.bind.x2) L2.bind.x2 = M.clone(wire.bind.x2);
    const idx = DP.state.objects.indexOf(wire);
    if (idx < 0) return false;
    DP.state.objects.splice(idx, 1, L1, L2);
    return true;
  };

  /* 破口接线主流程：计划位置 → 入场景 → 断线接入。返回 plan（含 obj/wire/broke） */
  M.insertPartIntoScene = function (pid, world) {
    const def = DP.parts.byId[pid];
    if (!def) return null;
    const plan = M.planPartAt(def, pid, world, null);
    plan.obj.id = M.uid('pt');
    M.stampLayer(plan.obj);
    DP.state.objects.push(plan.obj);
    plan.broke = plan.wire ? M.breakWireInto(plan.wire, plan.obj) : false;
    return plan;
  };

  /* --------------------------- 修剪（阶段 8-b：圆/弧参与） ---------------------------
   * 目标：line / circle / arc；切割者：line / polyline / rect / circle / arc（含圆状 ellipse）。
   * 纯逻辑：返回 { pieces: [可直接 splice 进 objects 的替换对象] }
   * 或 { reason: '提示文案' }。首件沿用目标 id（选择/分组引用不失效）。
   */
  const trimSegsOf = (o) => {
    if (o.type === 'line') return [[o.x1, o.y1, o.x2, o.y2]];
    if (o.type === 'polyline') {
      const s = [];
      for (let i = 0; i < o.points.length - 1; i++) {
        s.push([o.points[i][0], o.points[i][1], o.points[i + 1][0], o.points[i + 1][1]]);
      }
      return s;
    }
    if (o.type === 'rect') {
      return [
        [o.x, o.y, o.x + o.w, o.y], [o.x + o.w, o.y, o.x + o.w, o.y + o.h],
        [o.x + o.w, o.y + o.h, o.x, o.y + o.h], [o.x, o.y + o.h, o.x, o.y],
      ];
    }
    return [];
  };
  const trimCircleOf = (o) => {
    if (o.type === 'circle') return { cx: o.cx, cy: o.cy, r: o.r, arc: null };
    if (o.type === 'arc') return { cx: o.cx, cy: o.cy, r: o.r, arc: o };
    if (o.type === 'ellipse' && Math.abs(o.rx - o.ry) < 0.5) return { cx: o.cx, cy: o.cy, r: o.rx, arc: null };
    return null;
  };
  const onArcAngle = (arc, q) => {
    let a = G.deg(Math.atan2(q.y - arc.cy, q.x - arc.cx));
    while (a < arc.a0) a += 360;
    return a <= arc.a1 + 0.01;
  };

  M.trimTarget = function (target, others, p) {
    const style = () => M.clone(target.style || DP.state.style);
    const carry = (q, i) => {
      if (i === 0) q.id = target.id;                /* 首件沿用 id：选择/分组不失效 */
      if (target.group) q.group = target.group;
      return q;
    };

    /* ---- 目标：直线段 ---- */
    if (target.type === 'line') {
      const A = { x: target.x1, y: target.y1 }, B = { x: target.x2, y: target.y2 };
      const LL = (B.x - A.x) * (B.x - A.x) + (B.y - A.y) * (B.y - A.y) || 1;
      const ts = [];
      for (const o of others) {
        for (const [x1, y1, x2, y2] of trimSegsOf(o)) {
          const q = G.segSeg(A, B, { x: x1, y: y1 }, { x: x2, y: y2 });
          if (q) ts.push(q.t);
        }
        const c = trimCircleOf(o);
        if (c) {
          for (const q of G.segCircle(A, B, { x: c.cx, y: c.cy }, c.r)) {
            if (!c.arc || onArcAngle(c.arc, q)) ts.push(q.t);
          }
        }
      }
      if (!ts.length) return { reason: '附近没有相交的线条，无法修剪' };
      const t0 = Math.max(0, Math.min(1, ((p.x - A.x) * (B.x - A.x) + (p.y - A.y) * (B.y - A.y)) / LL));
      const pts = [0].concat(ts.sort((a, b) => a - b), [1]);
      let lo = 0, hi = 1;
      for (let i = 0; i < pts.length - 1; i++) {
        if (t0 >= pts[i] && t0 <= pts[i + 1]) { lo = pts[i]; hi = pts[i + 1]; break; }
      }
      if (hi - lo < 0.001) return { reason: '这里没有可剪掉的部分' };
      const pieces = [];
      if (lo > 0.001) pieces.push(carry({ id: M.uid('l'), type: 'line', x1: A.x, y1: A.y, x2: A.x + lo * (B.x - A.x), y2: A.y + lo * (B.y - A.y), style: style() }, pieces.length));
      if (hi < 0.999) pieces.push(carry({ id: M.uid('l'), type: 'line', x1: A.x + hi * (B.x - A.x), y1: A.y + hi * (B.y - A.y), x2: B.x, y2: B.y, style: style() }, pieces.length));
      return pieces.length ? { pieces } : { reason: '这里没有可剪掉的部分' };
    }

    /* ---- 目标：圆 / 弧（交点换算成沿弧位置 u ∈ [0, span]） ---- */
    if (target.type === 'circle' || target.type === 'arc') {
      const full = target.type === 'circle';
      const base = full ? 0 : target.a0;
      const span = full ? 360 : target.a1 - target.a0;
      if (span <= 0.01) return { reason: '这里没有可剪掉的部分' };
      const angOf = (q) => ((G.deg(Math.atan2(q.y - target.cy, q.x - target.cx)) - base) % 360 + 360) % 360;
      const us = [];
      const addCut = (q) => {
        const u = angOf(q);
        if (u <= span + 0.4) us.push(Math.min(u, span));
      };
      for (const o of others) {
        for (const [x1, y1, x2, y2] of trimSegsOf(o)) {
          for (const q of G.segCircle({ x: x1, y: y1 }, { x: x2, y: y2 }, { x: target.cx, y: target.cy }, target.r)) addCut(q);
        }
        const c = trimCircleOf(o);
        if (c) {
          for (const q of G.circleCircle({ x: target.cx, y: target.cy }, target.r, { x: c.cx, y: c.cy }, c.r)) {
            if (!c.arc || onArcAngle(c.arc, q)) addCut(q);
          }
        }
      }
      if (!us.length) return { reason: '附近没有相交的线条，无法修剪' };
      us.sort((a, b) => a - b);
      const cuts = [];
      for (const u of us) if (!cuts.length || u - cuts[cuts.length - 1] > 0.3) cuts.push(u);
      const u0 = Math.min(angOf(p), span);
      const pts = [0].concat(cuts, [span]);
      let lo = 0, hi = span;
      for (let i = 0; i < pts.length - 1; i++) {
        if (u0 >= pts[i] && u0 <= pts[i + 1]) { lo = pts[i]; hi = pts[i + 1]; break; }
      }
      if (hi - lo < 0.4) return { reason: '这里没有可剪掉的部分' };
      /* 余弧区间（u 空间）：整圆去掉一段 → 环绕单弧（越过 360° 时归一回 0 起）；弧去掉中段 → 两段 */
      const intervals = [];
      if (full) intervals.push(hi >= span ? [0, lo] : [hi, span + lo]);
      else {
        if (lo > 0.4) intervals.push([0, lo]);
        if (hi < span - 0.4) intervals.push([hi, span]);
      }
      const pieces = intervals
        .filter((iv) => iv[1] - iv[0] > 0.4)
        .map((iv, i) => carry({
          id: M.uid('a'), type: 'arc', cx: target.cx, cy: target.cy, r: target.r,
          a0: G.round(base + iv[0]), a1: G.round(base + iv[1]), style: style(),
        }, i));
      return pieces.length ? { pieces } : { reason: '这里没有可剪掉的部分' };
    }

    return { reason: '修剪目前支持直线、圆和圆弧' };
  };

  /* --------------------------- 对象变换原语 --------------------------- */
  M.translateObj = function (o, dx, dy) {
    const mod = moduleOf(o);
    if (mod && typeof mod.translate === 'function') { mod.translate(o, dx, dy); return; }
    /* 未注册类型：不可平移（单轨收敛后无旧 switch 兜底） */
  };

  M.scaleObj = function (o, sx, sy, ax, ay) {
    const mod = moduleOf(o);
    if (mod && typeof mod.scale === 'function') { mod.scale(o, sx, sy, ax, ay); return; }
    /* 未注册类型：不可缩放 */
  };

  M.mirrorObj = function (o, axis) {
    const mod = moduleOf(o);
    if (mod && typeof mod.mirror === 'function') { mod.mirror(o, axis); return; }
    /* 未注册类型：不可镜像 */
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
      if (!M.layerVisible(o)) continue;                     /* 隐藏图层不吸附 */
      const mod = moduleOf(o);
      if (mod && typeof mod.anchors === 'function') {
        for (const a of mod.anchors(o) || []) push(a.x, a.y, anchorLabel(a), o.id, a.tid);
        continue;
      }
      /* 未注册类型：无吸附锚点（15 种类型全部由模块 anchors 提供） */
      if (!M._warnedType) M._warnedType = {};
      if (!M._warnedType[o.type]) { M._warnedType[o.type] = 1; console.warn('[DrawPhy] 未注册类型缺 anchors 模块:', o.type); }
    }
    return out;
  };

  /* 交点提示 */
  S.intersections = function (objects, near, radius) {
    const out = [];
    const close = objects.filter((o) => {
      if (!M.layerVisible(o)) return false;
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
    /* 图层（阶段 8-c）：对象缺省归第一层；先做显隐/锁定，排序后议 */
    layers: [{ id: 'L1', name: '图层 1', visible: true, locked: false }],
    currentLayer: 'L1',
  };

  /* ------------------------------- 图层 API -------------------------------
   * 对象 o.layer === undefined 视作第一层（旧文件/旧对象天然兼容）。
   * 可见性在渲染/命中/吸附/导出各消费点过滤；锁定只拦「编辑」不拦吸附。 */
  M.layerId = function (o) {
    return (o && o.layer) || (DP.state.layers[0] && DP.state.layers[0].id) || 'L1';
  };
  M.layerDef = function (o) {
    const id = M.layerId(o);
    return DP.state.layers.find((l) => l.id === id) || DP.state.layers[0] || null;
  };
  M.layerVisible = function (o) {
    const d = M.layerDef(o);
    return !d || d.visible !== false;
  };
  M.layerLocked = function (o) {
    const d = M.layerDef(o);
    return !!d && d.locked === true;
  };
  /* 新建对象打上当前图层（仅绘制创建点调用；粘贴/修剪件沿用来源） */
  M.stampLayer = function (o) {
    if (o && !o.layer) o.layer = DP.state.currentLayer || M.layerId(o);
    return o;
  };
  M.layerObjects = function (id) {
    return DP.state.objects.filter((o) => M.layerId(o) === id);
  };

  M.layerAdd = function (name) {
    const n = DP.state.layers.length + 1;
    const l = { id: 'L' + Date.now().toString(36) + n, name: name || `图层 ${n}`, visible: true, locked: false };
    DP.state.layers.push(l);
    DP.state.currentLayer = l.id;
    return l;
  };
  M.layerRemove = function (id) {
    const i = DP.state.layers.findIndex((l) => l.id === id);
    if (i < 0) return false;
    if (DP.state.layers.length <= 1) return false;          /* 至少保留一层 */
    if (M.layerObjects(id).length) return false;            /* 只删空层 */
    DP.state.layers.splice(i, 1);
    if (DP.state.currentLayer === id) DP.state.currentLayer = DP.state.layers[0].id;
    return true;
  };
  M.layerToggle = function (id, field) {
    const l = DP.state.layers.find((x) => x.id === id);
    if (!l || (field !== 'visible' && field !== 'locked')) return false;
    l[field] = !l[field];
    return true;
  };
  M.layerRename = function (id, name) {
    const l = DP.state.layers.find((x) => x.id === id);
    if (!l || !name) return false;
    l.name = String(name).slice(0, 20);
    return true;
  };
  M.layerSetCurrent = function (id) {
    if (!DP.state.layers.find((x) => x.id === id)) return false;
    DP.state.currentLayer = id;
    return true;
  };
  /* 隐藏/锁定图层时清掉其对象的选择，避免「看不见却被选中」的幽灵操作 */
  M.layerPruneSelection = function () {
    let changed = false;
    for (const id of Array.from(DP.state.selection)) {
      const o = DP.state.objects.find((q) => q.id === id);
      if (!o || !M.layerVisible(o) || M.layerLocked(o)) { DP.state.selection.delete(id); changed = true; }
    }
    return changed;
  };

  /* ------------------------------ 历史（差分式） ------------------------------
     阶段 6：不再每步序列化整篇文档。每条历史记录只保存「本次操作触碰到的对象」
     的前后镜像（差分补丁），undo/redo 按补丁回放。
     - 时间：每次 push 仍 O(n) 做一次轻量比较（逐对象 JSON 比较，短路命中率极高），
       与全量快照同量级；
     - 内存：从 O(n × 步数) 降到 O(Δ × 步数)，800 对象文档每步通常只存 1~3 个对象；
     - 语义与全量快照完全一致：push() 提交「当前已发生的状态」（懒提交）。
     记录结构：{ label, before:{order,objs,groups}, after:{...}, t }        */
  const H = (DP.history = {
    stack: [],
    idx: -1,
    limit: 200,          /* 旧实现 80 步；差分存储后提高到 200 */
    mergeWindow: 800,    /* 同标签连续提交的合并时间窗（毫秒） */
    _base: null,
    _lastPushAt: 0,

    /* 采集当前状态：{ order:[id], objs:Map(id→json), groups:json } */
    _capture() {
      const objs = DP.state.objects;
      const map = new Map();
      const order = new Array(objs.length);
      for (let i = 0; i < objs.length; i++) {
        const o = objs[i];
        order[i] = o.id;
        map.set(o.id, JSON.stringify(o));
      }
      return { order, objs: map, groups: JSON.stringify(DP.state.groups || {}) };
    },

    /* 差分：找出被新增/删除/修改的对象 id，并记录前后镜像 */
    _diff(base, cur) {
      const before = { order: null, objs: {}, groups: base.groups };
      const after = { order: null, objs: {}, groups: cur.groups };
      let touched = 0;
      for (let i = 0; i < cur.order.length; i++) {
        const id = cur.order[i], j = cur.objs.get(id);
        if (!base.objs.has(id)) { before.objs[id] = null; after.objs[id] = j; touched++; }
        else if (base.objs.get(id) !== j) { before.objs[id] = base.objs.get(id); after.objs[id] = j; touched++; }
      }
      for (let i = 0; i < base.order.length; i++) {
        const id = base.order[i];
        if (!cur.objs.has(id)) { before.objs[id] = base.objs.get(id); after.objs[id] = null; touched++; }
      }
      const orderChanged = base.order.length !== cur.order.length ||
        base.order.some((id, i) => id !== cur.order[i]);
      if (orderChanged) { before.order = base.order; after.order = cur.order; }
      const empty = touched === 0 && !orderChanged && base.groups === cur.groups;
      return { before, after, empty };
    },

    /* 按某侧镜像重建 objects/groups（O(n) 解析，undo/redo 是用户节奏，可接受） */
    _apply(snap) {
      const cur = new Map(DP.state.objects.map((o) => [o.id, o]));
      const order = snap.order || DP.state.objects.map((o) => o.id);
      const out = [];
      for (let i = 0; i < order.length; i++) {
        const id = order[i];
        if (Object.prototype.hasOwnProperty.call(snap.objs, id)) {
          const j = snap.objs[id];
          if (j == null) continue;            /* 该状态下此对象不存在 */
          out.push(JSON.parse(j));
        } else {
          const o = cur.get(id);
          if (o) out.push(o);
        }
      }
      /* 顺序未记录但补丁里出现了不在当前序列的对象（极端情况）：补到末尾保证不丢数据 */
      for (const id in snap.objs) {
        const j = snap.objs[id];
        if (j != null && !out.some((o) => o.id === id)) out.push(JSON.parse(j));
      }
      DP.state.objects = out;
      DP.state.groups = JSON.parse(snap.groups || '{}');
      DP.state.selection = new Set();
    },

    push(label, window) {
      const cur = this._capture();
      const base = this._base || { order: [], objs: new Map(), groups: '{}' };
      const d = this._diff(base, cur);
      this._base = cur;
      if (d.empty) return false;
      const now = Date.now();
      const top = this.stack[this.idx];
      const mergeable = !!label && !!top && top.label === label &&
        (now - (this._lastPushAt || 0)) <= (window == null ? this.mergeWindow : window);
      if (mergeable) {
        /* 合并：保留首条的 before，采用本次的 after；被触碰的 id 取并集 */
        for (const id in d.before.objs) if (!(id in top.before.objs)) top.before.objs[id] = d.before.objs[id];
        for (const id in d.after.objs) top.after.objs[id] = d.after.objs[id];
        top.after.order = d.after.order;
        top.after.groups = d.after.groups;
        top.t = now;
      } else {
        this.stack = this.stack.slice(0, this.idx + 1);
        this.stack.push({ label: label || '', before: d.before, after: d.after, t: now });
        if (this.stack.length > this.limit) {
          /* 丢最旧一条；第 0 条是哨兵，允许一起滚出 */
          this.stack.shift();
        }
      }
      this.idx = this.stack.length - 1;
      this._lastPushAt = now;
      DP.state.dirty = true;
      return true;
    },

    /* 撤销最近一次「已提交」的改动：用于操作失败后回滚（如填充无封闭轮廓） */
    pop() {
      if (this.idx <= 0) return false;
      const e = this.stack[this.idx];
      this._apply(e.before);
      this.stack.pop();
      this.idx = this.stack.length - 1;
      this._base = this._capture();
      DP.state.selection = new Set();
      return true;
    },

    reset() {
      this.stack = [{ label: 'init', before: null, after: null, t: Date.now() }];
      this.idx = 0;
      this._base = this._capture();
      this._lastPushAt = 0;
    },

    undo() {
      if (this.idx <= 0) return false;
      this._apply(this.stack[this.idx].before);
      this.idx--;
      this._base = this._capture();
      return true;
    },

    redo() {
      if (this.idx >= this.stack.length - 1) return false;
      this.idx++;
      this._apply(this.stack[this.idx].after);
      this._base = this._capture();
      return true;
    },

    /* 诊断用：当前历史占用的补丁对象数（性能/内存基线测试用） */
    patchCount() {
      let n = 0;
      for (const e of this.stack) if (e && e.before) n += Object.keys(e.after.objs).length;
      return n;
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
    return { version: 1, page: DP.state.page, objects: DP.state.objects, groups: DP.state.groups, layers: DP.state.layers, currentLayer: DP.state.currentLayer };
  };
  DP.model.fromJSON = function (data) {
    DP.state.page = Object.assign(DP.state.page, data.page || {});
    DP.state.objects = (data.objects || []).map((o) => o);
    DP.state.groups = data.groups || {};
    /* 图层：旧文件没有 layers 字段 → 保持默认层（对象缺 layer 即归第一层） */
    DP.state.layers = Array.isArray(data.layers) && data.layers.length ? data.layers : DP.state.layers;
    DP.state.currentLayer = DP.state.layers.find((l) => l.id === data.currentLayer) ? data.currentLayer : DP.state.layers[0].id;
    DP.state.selection = new Set();
    H.reset();
  };
})();
