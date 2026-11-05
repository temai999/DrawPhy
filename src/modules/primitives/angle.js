/* =========================================================================
 * DrawPhy angle 模块（阶段 4 迁移）
 * type: angle（角度标记：圆心 + 半径 + 起止角，弧 + 角度文字）
 * 注意：镜像只翻圆心，不翻 a0/a1 —— 与旧 switch 行为保持一致，
 * 避免在迁移期顺手改变角度语义。
 * ========================================================================= */
(function () {
  'use strict';

  var FONT = "'Microsoft YaHei', 'PingFang SC', 'Segoe UI', system-ui, sans-serif";

  DP.defineModule('angle', function (DP) {
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

    function paint(rs, extra) {
      var out = {};
      if (rs.fill && rs.fill !== 'none' && rs.fill !== 'transparent') out.fill = rs.fill;
      else out.fill = 'none';
      if (extra && extra.fill === 'solid') out.fill = rs.stroke;
      if (extra && extra.fill === 'none') out.fill = 'none';
      return out;
    }

    function defaults(props) {
      var o = { cx: 0, cy: 0, r: 30, a0: 0, a1: 90, size: 14 };
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
        name: '角度',
        icon: 'angle',
        shortcut: 'N',
        hint: '单击顶点 → 边1 → 边2',
      },
      menu: { tab: 'draw', category: 'text', group: 'text', order: 140 },
      capabilities: { fill: false, rotate: false, resize: true },

      defaults: defaults,

      bbox: function (o) {
        return { x: o.cx - o.r, y: o.cy - o.r, w: o.r * 2, h: o.r * 2 };
      },

      hitTest: function (o, p, tol) {
        return Math.abs(Math.hypot(p.x - o.cx, p.y - o.cy) - o.r) <= tol * 1.5;
      },

      anchors: function (o) {
        return [
          { id: 'v', x: o.cx, y: o.cy, kind: 'vertex' },
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

      nodes: function () {
        /* 角度标记不开放节点手柄（与旧行为一致） */
        return [];
      },

      setNode: function () {},

      translate: function (o, dx, dy) {
        o.cx += dx;
        o.cy += dy;
      },

      scale: function (o, sx, sy, ax, ay) {
        var px = function (x) { return ax + (x - ax) * sx; };
        var py = function (y) { return ay + (y - ay) * sy; };
        var k = (Math.abs(sx) + Math.abs(sy)) / 2;
        o.cx = px(o.cx);
        o.cy = py(o.cy);
        o.r *= k;
      },

      mirror: function (o, axis) {
        var bb = this.bbox(o);
        var cx = bb.x + bb.w / 2, cy = bb.y + bb.h / 2;
        if (axis === 'h') o.cx = 2 * cx - o.cx;
        else o.cy = 2 * cy - o.cy;
      },

      render: function (o, ctx) {
        var R = DP.render; /* 懒查找：render.js 加载晚于本文件 */
        var rs = (ctx && ctx.style) || o.style || defaultStyle();

        var pathAttrs = { d: G.arcPath(o.cx, o.cy, o.r, o.a0, o.a1) };
        var fill = paint(rs);
        for (var f in fill) pathAttrs[f] = fill[f];
        var stroke = strokeAttrs(rs, o.dash);
        for (var s in stroke) pathAttrs[s] = stroke[s];

        var mid = (o.a0 + o.a1) / 2;
        var tx = o.cx + (o.r + 16) * Math.cos(G.rad(mid));
        var ty = o.cy + (o.r + 16) * Math.sin(G.rad(mid));
        var val = o.label || (Math.round(Math.abs(o.a1 - o.a0)) + '°');

        return [
          { tag: 'path', attrs: pathAttrs },
          {
            tag: 'text',
            attrs: {
              x: tx,
              y: ty,
              'font-size': o.size || 14,
              'font-family': FONT,
              'text-anchor': 'middle',
              fill: rs.stroke,
            },
            children: R.escape(val),
          },
        ];
      },
    };
  });
})();
