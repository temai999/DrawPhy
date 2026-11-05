/* =========================================================================
 * DrawPhy arc 模块（阶段 2 迁移）
 * type: arc（圆弧：圆心 + 半径 + 起止角）
 * bbox 用采样法；镜像需特殊角度变换。
 * ========================================================================= */
(function () {
  'use strict';

  DP.defineModule('arc', function (DP) {
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

    function paint(rs, extra) {
      var out = {};
      if (rs.fill && rs.fill !== 'none' && rs.fill !== 'transparent') out.fill = rs.fill;
      else out.fill = 'none';
      if (extra && extra.fill === 'solid') out.fill = rs.stroke;
      if (extra && extra.fill === 'none') out.fill = 'none';
      return out;
    }

    function strokeAttrs(rs, dashOverride) {
      var dash = dashOverride || rs.dash;
      var out = {
        stroke: rs.stroke,
        'stroke-width': rs.width,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      };
      var da = DP.style.dashArray(dash);
      if (da) out['stroke-dasharray'] = da;
      if (rs.opacity != null && rs.opacity < 1) out['stroke-opacity'] = rs.opacity;
      return out;
    }

    function defaults(props) {
      var o = { cx: 0, cy: 0, r: 0, a0: 0, a1: 90 };
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
      meta: {
        name: '圆弧',
        icon: 'arc',
        shortcut: 'U',
        hint: '单击定圆心 → 定起点 → 定终点',
      },
      menu: { tab: 'draw', category: 'shape', group: 'shape', order: 85 },
      capabilities: { fill: true, rotate: true, resize: true },

      /* 任意角旋转（阶段 8-d）：圆心不动，起止角平移 */
      rotate: function (o, rad) {
        var d = rad * 180 / Math.PI;
        o.a0 += d;
        o.a1 += d;
      },

      defaults: defaults,

      bbox: function (o) {
        var a0 = o.a0, a1 = o.a1;
        var pts = [];
        for (var a = a0; a <= a1 + 0.001; a += Math.max(2, (a1 - a0) / 24)) {
          pts.push([o.cx + o.r * Math.cos(G.rad(a)), o.cy + o.r * Math.sin(G.rad(a))]);
        }
        var xs = pts.map(function (p) { return p[0]; });
        var ys = pts.map(function (p) { return p[1]; });
        var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
        var y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
        return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      },

      hitTest: function (o, p, tol) {
        var d = Math.hypot(p.x - o.cx, p.y - o.cy);
        if (Math.abs(d - o.r) > tol) return false;
        var a = G.deg(Math.atan2(p.y - o.cy, p.x - o.cx));
        while (a < o.a0) a += 360;
        return a <= o.a1 + 1;
      },

      anchors: function (o) {
        return [
          { id: 'c', x: o.cx, y: o.cy, kind: 'center' },
          {
            id: 'a0',
            x: o.cx + o.r * Math.cos(G.rad(o.a0)),
            y: o.cy + o.r * Math.sin(G.rad(o.a0)),
            kind: 'endpoint',
          },
          {
            id: 'a1',
            x: o.cx + o.r * Math.cos(G.rad(o.a1)),
            y: o.cy + o.r * Math.sin(G.rad(o.a1)),
            kind: 'endpoint',
          },
        ];
      },

      nodes: function (o) {
        return [
          { id: 'c', x: o.cx, y: o.cy },
          { id: 'r', x: o.cx + o.r, y: o.cy },
        ];
      },

      setNode: function (o, id, p) {
        if (id === 'c') { o.cx = p.x; o.cy = p.y; }
        else o.r = Math.max(1, G.dist({ x: o.cx, y: o.cy }, p));
      },

      translate: function (o, dx, dy) {
        o.cx += dx; o.cy += dy;
      },

      scale: function (o, sx, sy, ax, ay) {
        var px = function (x) { return ax + (x - ax) * sx; };
        var py = function (y) { return ay + (y - ay) * sy; };
        var k = (Math.abs(sx) + Math.abs(sy)) / 2;
        o.cx = px(o.cx); o.cy = py(o.cy);
        o.r *= k;
      },

      mirror: function (o, axis) {
        /* 角度镜像（先缓存旧值，避免链式覆盖）：
           axis='v'（上下翻 y→2cy-y）：a0'=-A1, a1'=-A0
           axis='h'（左右翻 x→2cx-x）：a0'=180-A1, a1'=180-A0
           镜像后 a1'-a0' 仍等于原跨度，large/sweep 标志不变。 */
        var bb = this.bbox(o);
        var cx = bb.x + bb.w / 2, cy = bb.y + bb.h / 2;
        var fx = function (v) { return axis === 'h' ? 2 * cx - v : v; };
        var fy = function (v) { return axis === 'v' ? 2 * cy - v : v; };
        o.cx = fx(o.cx); o.cy = fy(o.cy);
        var A0 = o.a0, A1 = o.a1;
        if (axis === 'v') { o.a0 = -A1; o.a1 = -A0; }
        else { o.a0 = 180 - A1; o.a1 = 180 - A0; }
      },

      render: function (o, ctx) {
        var rs = (ctx && ctx.style) || o.style || defaultStyle();
        var d = G.arcPath(o.cx, o.cy, o.r, o.a0, o.a1);
        var attrs = { d: d };
        var fill = paint(rs, o);
        for (var f in fill) attrs[f] = fill[f];
        var stroke = strokeAttrs(rs, o.dash);
        for (var s in stroke) attrs[s] = stroke[s];
        return { tag: 'path', attrs: attrs };
      },
    };
  });
})();
