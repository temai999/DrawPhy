/* =========================================================================
 * DrawPhy textbox 模块（阶段 4 迁移）
 * type: textbox（带边框的文本框，文字居中）
 * 行为与旧 switch 分支逐项对齐：bbox = 矩形本体，命中含 2px 外扩，
 * 锚点为四角 + 中心，缩放时字号按 k 同步（k = (|sx|+|sy|)/2）。
 * ========================================================================= */
(function () {
  'use strict';

  var FONT = "'Microsoft YaHei', 'PingFang SC', 'Segoe UI', system-ui, sans-serif";

  DP.defineModule('textbox', function (DP) {
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
      var da = DP.style.dashArray(dash);
      if (da) out['stroke-dasharray'] = da;
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
      var o = { x: 0, y: 0, w: 0, h: 0, text: '', size: 14 };
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
        name: '文本框',
        icon: 'textbox',
        shortcut: 'Q',
        hint: '单击落文本框；双击改字',
      },
      menu: { tab: 'draw', category: 'text', group: 'text', order: 110 },
      capabilities: { fill: true, rotate: false, resize: true },

      defaults: defaults,

      bbox: function (o) {
        return { x: o.x, y: o.y, w: o.w, h: o.h };
      },

      hitTest: function (o, p) {
        return p.x >= o.x - 2 && p.x <= o.x + o.w + 2 &&
               p.y >= o.y - 2 && p.y <= o.y + o.h + 2;
      },

      anchors: function (o) {
        return [
          { id: 'nw', x: o.x, y: o.y, kind: 'endpoint' },
          { id: 'ne', x: o.x + o.w, y: o.y, kind: 'endpoint' },
          { id: 'sw', x: o.x, y: o.y + o.h, kind: 'endpoint' },
          { id: 'se', x: o.x + o.w, y: o.y + o.h, kind: 'endpoint' },
          { id: 'c', x: o.x + o.w / 2, y: o.y + o.h / 2, kind: 'center' },
        ];
      },

      nodes: function () {
        /* 文本框不开放节点手柄（与旧行为一致） */
        return [];
      },

      setNode: function () {},

      translate: function (o, dx, dy) {
        o.x += dx;
        o.y += dy;
      },

      scale: function (o, sx, sy, ax, ay) {
        var px = function (x) { return ax + (x - ax) * sx; };
        var py = function (y) { return ay + (y - ay) * sy; };
        var k = (Math.abs(sx) + Math.abs(sy)) / 2;
        var x2 = o.x + o.w, y2 = o.y + o.h;
        o.x = px(o.x);
        o.y = py(o.y);
        o.w = px(x2) - o.x;
        o.h = py(y2) - o.y;
        o.size = Math.max(6, (o.size || 14) * k);
      },

      mirror: function (o, axis) {
        var cx = o.x + o.w / 2, cy = o.y + o.h / 2;
        if (axis === 'h') o.x = 2 * cx - (o.x + o.w);
        else o.y = 2 * cy - (o.y + o.h);
      },

      render: function (o, ctx) {
        var R = DP.render; /* 懒查找：render.js 加载晚于本文件 */
        var rs = (ctx && ctx.style) || o.style || defaultStyle();
        var size = o.size || 14;

        var rectAttrs = {
          x: o.x,
          y: o.y,
          width: o.w,
          height: o.h,
          rx: 4,
        };
        var fill = paint(rs, o);
        for (var f in fill) rectAttrs[f] = fill[f];
        var stroke = strokeAttrs(rs, o.dash);
        for (var s in stroke) rectAttrs[s] = stroke[s];

        return [
          { tag: 'rect', attrs: rectAttrs },
          {
            tag: 'text',
            attrs: {
              x: o.x + o.w / 2,
              y: o.y + o.h / 2 + size * 0.35,
              'font-size': size,
              'font-family': FONT,
              'text-anchor': 'middle',
              fill: rs.stroke,
            },
            children: R.escape(o.text || ''),
          },
        ];
      },
    };
  });
})();
