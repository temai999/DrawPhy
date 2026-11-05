/* =========================================================================
 * DrawPhy render.js — SVG 渲染
 * 同一套图元渲染器同时服务：画板、部件缩略图、PNG/SVG 导出。
 * ========================================================================= */
(function () {
  'use strict';
  const DP = (window.DP = window.DP || {});
  const R = (DP.render = {});
  const r2 = (v) => Math.round(v * 100) / 100;
  const FONT = "'Microsoft YaHei', 'PingFang SC', 'Segoe UI', system-ui, sans-serif";

  R.escape = (s) =>
    String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  /* ---------------- drawable → SVG 字符串（模块渲染后端） ----------------
   * drawable = { tag, attrs, children } | drawable[] | string
   * 模块只描述指令，由这里统一创建 SVG，避免模块直接拼 DOM/字符串。 */
  R.drawable = function (node) {
    if (node == null) return '';
    if (typeof node === 'string') return node;
    if (Array.isArray(node)) return node.map((n) => R.drawable(n)).join('');
    if (!node.tag) return '';
    let attrs = '';
    const a = node.attrs || {};
    for (const k in a) {
      if (!Object.prototype.hasOwnProperty.call(a, k)) continue;
      const v = a[k];
      if (v == null || v === false) continue;
      attrs += ` ${k}="${R.escape(typeof v === 'number' ? r2(v) : v)}"`;
    }
    const children = node.children && node.children.length ? R.drawable(node.children) : '';
    if (!children) return `<${node.tag}${attrs}/>`;
    return `<${node.tag}${attrs}>${children}</${node.tag}>`;
  };

  /* ------------------- 文字上下标解析：x^{2} / A_{1} ------------------- */
  R.parseText = function (s) {
    const runs = [];
    let buf = '';
    const push = (mode) => {
      if (buf) runs.push({ text: buf, mode });
      buf = '';
    };
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if ((ch === '^' || ch === '_') && s[i + 1] === '{') {
        push('normal');
        const end = s.indexOf('}', i + 2);
        if (end > -1) {
          runs.push({ text: s.slice(i + 2, end), mode: ch === '^' ? 'sup' : 'sub' });
          i = end;
          continue;
        }
      }
      if ((ch === '^' || ch === '_') && i + 1 < s.length) {
        push('normal');
        runs.push({ text: s[i + 1], mode: ch === '^' ? 'sup' : 'sub' });
        i += 1;
        continue;
      }
      buf += ch;
    }
    push('normal');
    return runs;
  };

  function textSvg(o, rs) {
    const size = o.size || 16;
    const anchor = o.anchor === 'middle' ? 'middle' : 'start';
    const runs = R.parseText(o.text || '');
    let dy = 0;
    let out = `<text x="${r2(o.x)}" y="${r2(o.y)}" font-size="${r2(size)}" font-family="${FONT}" text-anchor="${anchor}" fill="${rs.stroke}"`;
    /* rot 为当前统一字段；rotate 兼容旧工程文件 */
    const rot = o.rot != null ? o.rot : o.rotate;
    if (rot) out += ` transform="rotate(${rot} ${r2(o.x)} ${r2(o.y)})"`;
    if (o.weight) out += ` font-weight="${o.weight}"`;
    out += '>';
    for (const run of runs) {
      if (run.mode === 'normal') {
        out += `<tspan dy="${r2(-dy)}">${R.escape(run.text)}</tspan>`;
        dy = 0;
      } else {
        const off = run.mode === 'sup' ? -size * 0.42 : size * 0.24;
        out += `<tspan dy="${r2(off - dy)}" font-size="${r2(size * 0.68)}">${R.escape(run.text)}</tspan>`;
        dy = off;
      }
    }
    out += '</text>';
    return out;
  }

  /* ------------------------------- 单图元 ------------------------------- */
  function paint(rs, extra) {
    let p = '';
    if (rs.fill && rs.fill !== 'none' && rs.fill !== 'transparent') p += ` fill="${rs.fill}"`;
    else p += ' fill="none"';
    if (extra && extra.fill === 'solid') p = ` fill="${rs.stroke}"`;
    if (extra && extra.fill === 'none') p = ' fill="none"';
    return p;
  }

  function strokeAttrs(rs, dashOverride) {
    const dash = dashOverride || rs.dash;
    let s = ` stroke="${rs.stroke}" stroke-width="${r2(rs.width)}" stroke-linecap="round" stroke-linejoin="round"`;
    if (dash === 'dashed') s += ' stroke-dasharray="8 5"';
    if (dash === 'dotted') s += ' stroke-dasharray="3 4"';
    if (rs.opacity != null && rs.opacity < 1) s += ` stroke-opacity="${rs.opacity}"`;
    return s;
  }

  R.primitive = function (o, rs) {
    /* 双轨分派：部件内部图元优先走 registry 模块，未注册类型回退旧 switch。
       （阶段 5.1：消除「顶层对象模块化、部件内部仍旧 switch」的漂移面） */
    const mod = o && DP.registry && DP.registry.get ? DP.registry.get(o.type) : null;
    if (mod && typeof mod.render === 'function') {
      return R.drawable(mod.render(o, { style: rs }));
    }
    const st = strokeAttrs(rs, o.dash);
    switch (o.type) {
      case 'line':
        return `<line x1="${r2(o.x1)}" y1="${r2(o.y1)}" x2="${r2(o.x2)}" y2="${r2(o.y2)}"${st}/>`;
      case 'polyline': {
        const pts = o.points.map(([x, y]) => `${r2(x)},${r2(y)}`).join(' ');
        return o.closed
          ? `<polygon points="${pts}"${paint(rs)}${st}/>`
          : `<polyline points="${pts}"${paint(rs)}${st}/>`;
      }
      case 'path':
        return `<path d="${o.d}"${paint(rs)}${st}/>`;
      case 'circle':
        return `<circle cx="${r2(o.cx)}" cy="${r2(o.cy)}" r="${r2(o.r)}"${paint(rs, o)}${st}/>`;
      case 'ellipse':
        return `<ellipse cx="${r2(o.cx)}" cy="${r2(o.cy)}" rx="${r2(o.rx)}" ry="${r2(o.ry)}"${paint(rs, o)}${st}/>`;
      case 'arc': {
        const d = DP.geom.arcPath(o.cx, o.cy, o.r, o.a0, o.a1);
        return `<path d="${d}"${paint(rs, o)}${st}/>`;
      }
      case 'rect':
        return `<rect x="${r2(o.x)}" y="${r2(o.y)}" width="${r2(o.w)}" height="${r2(o.h)}"${o.rx ? ` rx="${r2(o.rx)}"` : ''}${paint(rs, o)}${st}/>`;
      case 'text':
        return textSvg(o, rs);
      case 'point':
        return `<circle cx="${r2(o.x)}" cy="${r2(o.y)}" r="${r2(o.r || 3.5)}" fill="${rs.stroke || '#111'}" stroke="none"/>`;
      default:
        return '';
    }
  };

  /* --------------------------- 箭头 / 标注 / 角度 --------------------------- */
  function arrowHead(x, y, angle, size, color) {
    const s = size;
    const bx = x - s * Math.cos(angle), by = y - s * Math.sin(angle);
    const nx = s * 0.4 * Math.sin(angle), ny = -s * 0.4 * Math.cos(angle);
    return `<polygon points="${r2(x)},${r2(y)} ${r2(bx + nx)},${r2(by + ny)} ${r2(bx - nx)},${r2(by - ny)}" fill="${color}" stroke="none"/>`;
  }
  /* 模块可复用同一套箭头头几何（dim 等模块经 DP.render.arrowHead 调用，
     保证模块路径与旧 switch 的输出同源，不会出现两套公式） */
  R.arrowHead = arrowHead;

  /* ------------------------------ 对象入口 ------------------------------ */
  R.object = function (o) {
    const rs = o.style || DP.state.style;
    const mod = o && DP.registry && DP.registry.get ? DP.registry.get(o.type) : null;
    if (mod && typeof mod.render === 'function') {
      return R.drawable(mod.render(o, { style: rs }));
    }
    switch (o.type) {
      /* 复合类型（arrow/dim/angle/part/textbox/callout）已由模块 render 接管；
         未注册类型回退图元渲染（primitive 内部仍按图元类型分派） */
      default:
        return R.primitive(o, rs);
    }
  };

  /* 按数组顺序逐个渲染，保证层级正确（组合只是选择语义） */
  R.objects = function (objs) {
    let out = '';
    for (const o of objs) out += R.object(o);
    return out;
  };

  /* ------------------------------ 导出 SVG ------------------------------ */
  R.document = function (opts) {
    const o = opts || {};
    const page = DP.state.page;
    const objs = DP.state.objects;
    const bg = o.transparent ? '' : `<rect x="0" y="0" width="${page.w}" height="${page.h}" fill="${o.background || page.bg}"/>`;
    const grid = o.grid
      ? R.gridPath(page, o.gridColor || '#e3e8ee')
      : '';
    const inner = grid + R.objects(objs);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${page.w}" height="${page.h}" viewBox="0 0 ${page.w} ${page.h}">${bg}${inner}</svg>`;
  };

  R.gridPath = function (page, color, size) {
    const g = size || DP.state.snap.gridSize || 20;
    let d = '';
    for (let x = 0; x <= page.w; x += g) d += `M${x} 0 V${page.h} `;
    for (let y = 0; y <= page.h; y += g) d += `M0 ${y} H${page.w} `;
    return `<path d="${d}" stroke="${color}" stroke-width="0.5" fill="none"/>`;
  };

  /* ---------------------------- 部件缩略图 ---------------------------- */
  R.partThumb = function (id, size) {
    const def = DP.parts.byId[id];
    if (!def) return '';
    const S = size || 54;
    const pad = 5;
    const k = Math.min((S - pad * 2) / def.w, (S - pad * 2) / def.h);
    const dx = (S - def.w * k) / 2, dy = (S - def.h * k) / 2;
    // 除以缩放 k，使各部件在缩略图坐标系下呈现统一细线（屏幕约 1.27px）
    const rs = { stroke: '#334155', width: 1.7 / k, dash: 'solid', fill: 'none', opacity: 1 };
    const body = def.shapes.map((s) => R.primitive(s, rs)).join('');
    return `<svg width="${S}" height="${S}" viewBox="0 0 ${S} ${S}" xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(${r2(dx)},${r2(dy)}) scale(${r2(k)})">${body}</g></svg>`;
  };

  /* -------------------- 页面实际尺寸（自适应画布） -------------------- */
  R.exportSvgString = function (opts) {
    const o = opts || {};
    return R.document({ grid: false, transparent: !!o.transparent, background: o.background });
  };
})();
