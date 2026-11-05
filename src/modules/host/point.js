/* =========================================================================
 * DrawPhy point 模块（阶段 5.3）
 * type: point —— 标记点（实心小圆），用于受力分析等场景的锚点标记。
 * 通过普通 <script> 加载，file:// 可用；行为与旧 switch 分支保持一致。
 * ========================================================================= */
(function () {
  'use strict';

  DP.defineModule('point', function (DP) {
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

    function defaults(props) {
      var o = { x: 0, y: 0, r: 3.5 };
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
        name: '点',
        icon: 'point',
        shortcut: null,
        hint: '单击放置标记点',
      },
      /* point 由点工具内建入口创建，无 ribbon 按钮槽位变化 */

      defaults: defaults,

      bbox: function (o) {
        var r = o.r || 3.5;
        return { x: o.x - r, y: o.y - r, w: r * 2, h: r * 2 };
      },

      hitTest: function (o, p, tol) {
        return Math.hypot(p.x - o.x, p.y - o.y) <= Math.max(tol, o.r || 3.5);
      },

      anchors: function (o) {
        return [{ id: 'c', x: o.x, y: o.y, kind: 'point', label: '点' }];
      },

      nodes: function (o) { return []; },
      setNode: function (o, id, p) {},

      translate: function (o, dx, dy) {
        o.x += dx;
        o.y += dy;
      },

      scale: function (o, sx, sy, ax, ay) {
        o.x = ax + (o.x - ax) * sx;
        o.y = ay + (o.y - ay) * sy;
      },

      mirror: function (o, axis) {
        var bb = this.bbox(o);
        var cx = bb.x + bb.w / 2, cy = bb.y + bb.h / 2;
        if (axis === 'h') o.x = 2 * cx - o.x;
        if (axis === 'v') o.y = 2 * cy - o.y;
      },

      render: function (o, ctx) {
        var rs = (ctx && ctx.style) || o.style || defaultStyle();
        return {
          tag: 'circle',
          attrs: {
            cx: o.x,
            cy: o.y,
            r: o.r || 3.5,
            fill: rs.stroke || '#111',
            stroke: 'none',
          },
        };
      },
    };
  });
})();
