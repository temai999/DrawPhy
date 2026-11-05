/* =========================================================================
 * DrawPhy ellipse 模块（阶段 2 迁移）
 * type: ellipse（以中心 + rx/ry 定义）
 * ========================================================================= */
(function () {
  'use strict';

  DP.defineModule('ellipse', function (DP) {
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
      var o = { cx: 0, cy: 0, rx: 0, ry: 0 };
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
        name: '椭圆',
        icon: 'ellipse',
        shortcut: 'E',
        hint: '拖动画椭圆；Shift 正圆',
      },
      menu: { tab: 'draw', category: 'shape', group: 'shape', order: 75 },
      capabilities: { fill: true, rotate: false, resize: true },

      defaults: defaults,

      bbox: function (o) {
        return { x: o.cx - o.rx, y: o.cy - o.ry, w: o.rx * 2, h: o.ry * 2 };
      },

      hitTest: function (o, p, tol) {
        var rs = o.style || C.defaults;
        var v = Math.pow((p.x - o.cx) / (o.rx || 1), 2) +
                Math.pow((p.y - o.cy) / (o.ry || 1), 2);
        if (rs.fill !== 'none' && rs.fill && v <= 1) return true;
        return Math.abs(Math.sqrt(v) - 1) * Math.min(o.rx, o.ry) <= tol;
      },

      anchors: function (o) {
        return [
          { id: 'c', x: o.cx, y: o.cy, kind: 'center' },
          { id: 'e', x: o.cx + o.rx, y: o.cy, kind: 'quadrant' },
          { id: 'n', x: o.cx, y: o.cy - o.ry, kind: 'quadrant' },
          { id: 'w', x: o.cx - o.rx, y: o.cy, kind: 'quadrant' },
          { id: 's', x: o.cx, y: o.cy + o.ry, kind: 'quadrant' },
        ];
      },

      nodes: function (o) {
        return [
          { id: 'c', x: o.cx, y: o.cy },
          { id: 'rx', x: o.cx + o.rx, y: o.cy },
          { id: 'ry', x: o.cx, y: o.cy + o.ry },
        ];
      },

      setNode: function (o, id, p) {
        if (id === 'c') { o.cx = p.x; o.cy = p.y; }
        else if (id === 'rx') o.rx = Math.max(1, Math.abs(p.x - o.cx));
        else if (id === 'ry') o.ry = Math.max(1, Math.abs(p.y - o.cy));
      },

      translate: function (o, dx, dy) {
        o.cx += dx; o.cy += dy;
      },

      scale: function (o, sx, sy, ax, ay) {
        var px = function (x) { return ax + (x - ax) * sx; };
        var py = function (y) { return ay + (y - ay) * sy; };
        o.cx = px(o.cx); o.cy = py(o.cy);
        o.rx *= Math.abs(sx);
        o.ry *= Math.abs(sy);
      },

      mirror: function (o, axis) {
        var cx = o.cx, cy = o.cy;
        if (axis === 'h') o.cx = 2 * cx - o.cx;
        else o.cy = 2 * cy - o.cy;
      },

      render: function (o, ctx) {
        var rs = (ctx && ctx.style) || o.style || defaultStyle();
        var attrs = { cx: o.cx, cy: o.cy, rx: o.rx, ry: o.ry };
        var fill = paint(rs, o);
        for (var f in fill) attrs[f] = fill[f];
        var stroke = strokeAttrs(rs, o.dash);
        for (var s in stroke) attrs[s] = stroke[s];
        return { tag: 'ellipse', attrs: attrs };
      },
    };
  });
})();
