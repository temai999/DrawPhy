/* =========================================================================
 * DrawPhy rect 模块（阶段 2 试点）
 * type: rect（含圆角矩形，rx > 0）
 * 通过普通 <script> 加载，file:// 可用；行为与旧 switch 分支保持一致。
 * ========================================================================= */
(function () {
  'use strict';

  DP.defineModule('rect', function (DP) {
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
      var o = { x: 0, y: 0, w: 0, h: 0, rx: 0 };
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
        name: '矩形',
        icon: 'rect',
        shortcut: 'R',
        hint: '拖动画矩形；Shift 正方形',
      },
      menu: { tab: 'draw', category: 'shape', group: 'shape', order: 70 },
      capabilities: { fill: true, rotate: true, resize: true },  /* rotation 字段法 */

      defaults: defaults,

      bbox: function (o) {
        return {
          x: Math.min(o.x, o.x + o.w),
          y: Math.min(o.y, o.y + o.h),
          w: Math.abs(o.w),
          h: Math.abs(o.h),
        };
      },

      hitTest: function (o, p, tol) {
        var x = o.x, y = o.y, w = o.w, h = o.h;
        var inside = p.x > x && p.x < x + w && p.y > y && p.y < y + h;
        if (inside) return true;
        return Math.abs(p.x - x) < tol || Math.abs(p.x - x - w) < tol ||
          Math.abs(p.y - y) < tol || Math.abs(p.y - y - h) < tol;
      },

      anchors: function (o) {
        return [
          { id: 'nw', x: o.x, y: o.y, kind: 'endpoint' },
          { id: 'ne', x: o.x + o.w, y: o.y, kind: 'endpoint' },
          { id: 'se', x: o.x + o.w, y: o.y + o.h, kind: 'endpoint' },
          { id: 'sw', x: o.x, y: o.y + o.h, kind: 'endpoint' },
          { id: 'c', x: o.x + o.w / 2, y: o.y + o.h / 2, kind: 'center' },
        ];
      },

      nodes: function (o) {
        return [
          { id: 'nw', x: o.x, y: o.y },
          { id: 'ne', x: o.x + o.w, y: o.y },
          { id: 'se', x: o.x + o.w, y: o.y + o.h },
          { id: 'sw', x: o.x, y: o.y + o.h },
        ];
      },

      setNode: function (o, id, p) {
        var x2 = o.x + o.w, y2 = o.y + o.h;
        var nx = o.x, ny = o.y, nx2 = x2, ny2 = y2;
        if (id === 'nw') { nx = p.x; ny = p.y; }
        if (id === 'ne') { nx2 = p.x; ny = p.y; }
        if (id === 'se') { nx2 = p.x; ny2 = p.y; }
        if (id === 'sw') { nx = p.x; ny2 = p.y; }
        o.x = Math.min(nx, nx2);
        o.y = Math.min(ny, ny2);
        o.w = Math.abs(nx2 - nx);
        o.h = Math.abs(ny2 - ny);
      },

      translate: function (o, dx, dy) {
        o.x += dx;
        o.y += dy;
      },

      scale: function (o, sx, sy, ax, ay) {
        var px = function (x) { return ax + (x - ax) * sx; };
        var py = function (y) { return ay + (y - ay) * sy; };
        var x2 = o.x + o.w, y2 = o.y + o.h;
        o.x = px(o.x);
        o.y = py(o.y);
        o.w = px(x2) - o.x;
        o.h = py(y2) - o.y;
      },

      mirror: function (o, axis) {
        var x1 = Math.min(o.x, o.x + o.w), y1 = Math.min(o.y, o.y + o.h);
        var x2 = Math.max(o.x, o.x + o.w), y2 = Math.max(o.y, o.y + o.h);
        if (axis === 'h') o.x = 2 * ((x1 + x2) / 2) - (o.x + o.w);
        if (axis === 'v') o.y = 2 * ((y1 + y2) / 2) - (o.y + o.h);
      },

      render: function (o, ctx) {
        var rs = (ctx && ctx.style) || o.style || defaultStyle();
        var attrs = {
          x: o.x,
          y: o.y,
          width: o.w,
          height: o.h,
        };
        if (o.rx) attrs.rx = o.rx;

        var fill = paint(rs, o);
        for (var f in fill) attrs[f] = fill[f];

        var stroke = strokeAttrs(rs, o.dash);
        for (var s in stroke) attrs[s] = stroke[s];

        return { tag: 'rect', attrs: attrs };
      },
    };
  });
})();
