/* =========================================================================
 * DrawPhy line 模块（阶段 2 迁移）
 * type: line（直线段，无箭头）
 * 通过普通 <script> 加载，file:// 可用；行为与旧 switch 分支保持一致。
 * ========================================================================= */
(function () {
  'use strict';

  DP.defineModule('line', function (DP) {
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
      var o = { x1: 0, y1: 0, x2: 0, y2: 0 };
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
        name: '线段',
        icon: 'line',
        shortcut: 'L',
        hint: '拖动绘制线段；Shift 锁 15°',
      },
      menu: { tab: 'draw', category: 'shape', group: 'shape', order: 20 },
      capabilities: { fill: false, rotate: false, resize: true },

      defaults: defaults,

      bbox: function (o) {
        return {
          x: Math.min(o.x1, o.x2),
          y: Math.min(o.y1, o.y2),
          w: Math.abs(o.x2 - o.x1),
          h: Math.abs(o.y2 - o.y1),
        };
      },

      hitTest: function (o, p, tol) {
        return G.distToSeg(p, { x: o.x1, y: o.y1 }, { x: o.x2, y: o.y2 }) <= tol;
      },

      anchors: function (o) {
        return [
          { id: 'x1', x: o.x1, y: o.y1, kind: 'endpoint' },
          { id: 'x2', x: o.x2, y: o.y2, kind: 'endpoint' },
          { id: 'mid', x: (o.x1 + o.x2) / 2, y: (o.y1 + o.y2) / 2, kind: 'midpoint' },
        ];
      },

      nodes: function (o) {
        return [
          { id: 'x1', x: o.x1, y: o.y1 },
          { id: 'x2', x: o.x2, y: o.y2 },
        ];
      },

      setNode: function (o, id, p) {
        if (id === 'x1') { o.x1 = p.x; o.y1 = p.y; }
        else { o.x2 = p.x; o.y2 = p.y; }
      },

      translate: function (o, dx, dy) {
        o.x1 += dx; o.x2 += dx;
        o.y1 += dy; o.y2 += dy;
      },

      scale: function (o, sx, sy, ax, ay) {
        var px = function (x) { return ax + (x - ax) * sx; };
        var py = function (y) { return ay + (y - ay) * sy; };
        o.x1 = px(o.x1); o.x2 = px(o.x2);
        o.y1 = py(o.y1); o.y2 = py(o.y2);
      },

      mirror: function (o, axis) {
        var cx = (Math.min(o.x1, o.x2) + Math.max(o.x1, o.x2)) / 2;
        var cy = (Math.min(o.y1, o.y2) + Math.max(o.y1, o.y2)) / 2;
        if (axis === 'h') {
          o.x1 = 2 * cx - o.x1;
          o.x2 = 2 * cx - o.x2;
        } else {
          o.y1 = 2 * cy - o.y1;
          o.y2 = 2 * cy - o.y2;
        }
      },

      render: function (o, ctx) {
        var rs = (ctx && ctx.style) || o.style || defaultStyle();
        var attrs = {
          x1: o.x1,
          y1: o.y1,
          x2: o.x2,
          y2: o.y2,
        };
        var stroke = strokeAttrs(rs, o.dash);
        for (var s in stroke) attrs[s] = stroke[s];
        return { tag: 'line', attrs: attrs };
      },
    };
  });
})();
