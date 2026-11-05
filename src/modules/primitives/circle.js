/* =========================================================================
 * DrawPhy circle 模块（阶段 2 迁移）
 * type: circle（以圆心 + 半径定义）
 * 非等比缩放时自动降级为 ellipse（与旧 switch 行为一致）。
 * ========================================================================= */
(function () {
  'use strict';

  DP.defineModule('circle', function (DP) {
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
      if (dash === 'dashed') out['stroke-dasharray'] = '8 5';
      if (dash === 'dotted') out['stroke-dasharray'] = '3 4';
      if (rs.opacity != null && rs.opacity < 1) out['stroke-opacity'] = rs.opacity;
      return out;
    }

    function defaults(props) {
      var o = { cx: 0, cy: 0, r: 0 };
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
        name: '圆',
        icon: 'circle',
        shortcut: 'C',
        hint: '以按下点为圆心拖动定半径',
      },
      menu: { tab: 'draw', category: 'shape', group: 'shape', order: 80 },
      capabilities: { fill: true, rotate: false, resize: true },

      defaults: defaults,

      bbox: function (o) {
        return { x: o.cx - o.r, y: o.cy - o.r, w: o.r * 2, h: o.r * 2 };
      },

      hitTest: function (o, p, tol) {
        var rs = o.style || C.defaults;
        var d = Math.hypot(p.x - o.cx, p.y - o.cy);
        if (rs.fill !== 'none' && rs.fill && d < o.r) return true;
        return Math.abs(d - o.r) <= tol;
      },

      anchors: function (o) {
        return [
          { id: 'c', x: o.cx, y: o.cy, kind: 'center' },
          { id: 'e', x: o.cx + o.r, y: o.cy, kind: 'quadrant' },
          { id: 'n', x: o.cx, y: o.cy - o.r, kind: 'quadrant' },
          { id: 'w', x: o.cx - o.r, y: o.cy, kind: 'quadrant' },
          { id: 's', x: o.cx, y: o.cy + o.r, kind: 'quadrant' },
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
        o.cx = px(o.cx); o.cy = py(o.cy);
        if (Math.abs(sx - sy) > 0.01) {
          o.type = 'ellipse';
          o.rx = o.r * Math.abs(sx);
          o.ry = o.r * Math.abs(sy);
          delete o.r;
        } else {
          o.r *= Math.abs(sx);
        }
      },

      mirror: function (o, axis) {
        var bb = { x: o.cx - o.r, y: o.cy - o.r, w: o.r * 2, h: o.r * 2 };
        var cx = bb.x + bb.w / 2, cy = bb.y + bb.h / 2;
        if (axis === 'h') o.cx = 2 * cx - o.cx;
        else o.cy = 2 * cy - o.cy;
      },

      render: function (o, ctx) {
        var rs = (ctx && ctx.style) || o.style || defaultStyle();
        var attrs = { cx: o.cx, cy: o.cy, r: o.r };
        var fill = paint(rs, o);
        for (var f in fill) attrs[f] = fill[f];
        var stroke = strokeAttrs(rs, o.dash);
        for (var s in stroke) attrs[s] = stroke[s];
        return { tag: 'circle', attrs: attrs };
      },
    };
  });
})();
