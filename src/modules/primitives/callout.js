/* =========================================================================
 * DrawPhy callout 模块（阶段 4 迁移）
 * type: callout（标注：引线尖点 tx/ty + 文本框 bx/by/w/h，文字居中）
 * 行为与旧 switch 分支逐项对齐：bbox 同时包住尖点与文本框，
 * 命中 = 文本框外扩 2px 或贴近引线；锚点额外提供「指向点」。
 * ========================================================================= */
(function () {
  'use strict';

  var FONT = "'Microsoft YaHei', 'PingFang SC', 'Segoe UI', system-ui, sans-serif";

  DP.defineModule('callout', function (DP) {
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

    function bounds(o) {
      var x1 = Math.min(o.tx, o.bx), y1 = Math.min(o.ty, o.by);
      var x2 = Math.max(o.tx, o.bx + o.w), y2 = Math.max(o.ty, o.by + o.h);
      return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
    }

    function defaults(props) {
      var o = { tx: 0, ty: 0, bx: 0, by: 0, w: 0, h: 0, text: '', size: 13 };
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
        name: '标注',
        icon: 'callout',
        shortcut: 'Z',
        hint: '先点标注指向处，再点文本框位置',
      },
      menu: { tab: 'draw', category: 'text', group: 'text', order: 120 },
      capabilities: { fill: true, rotate: false, resize: true },

      defaults: defaults,

      bbox: bounds,

      hitTest: function (o, p, tol) {
        var bb = bounds(o);
        if (p.x >= bb.x - 2 && p.x <= bb.x + bb.w + 2 &&
            p.y >= bb.y - 2 && p.y <= bb.y + bb.h + 2) return true;
        return G.distToSeg(p, { x: o.tx, y: o.ty }, { x: o.bx + o.w / 2, y: o.by + o.h / 2 }) <= tol;
      },

      anchors: function (o) {
        var bb = bounds(o);
        return [
          { id: 'nw', x: bb.x, y: bb.y, kind: 'endpoint' },
          { id: 'ne', x: bb.x + bb.w, y: bb.y, kind: 'endpoint' },
          { id: 'sw', x: bb.x, y: bb.y + bb.h, kind: 'endpoint' },
          { id: 'se', x: bb.x + bb.w, y: bb.y + bb.h, kind: 'endpoint' },
          { id: 'c', x: bb.x + bb.w / 2, y: bb.y + bb.h / 2, kind: 'center' },
          /* label 优先于 kind：保留旧提示文案「指向点」 */
          { id: 'tip', x: o.tx, y: o.ty, kind: 'tip', label: '指向点' },
        ];
      },

      nodes: function () {
        /* 标注暂不开放节点手柄（与旧行为一致） */
        return [];
      },

      setNode: function () {},

      translate: function (o, dx, dy) {
        o.tx += dx; o.ty += dy;
        o.bx += dx; o.by += dy;
      },

      scale: function (o, sx, sy, ax, ay) {
        var px = function (x) { return ax + (x - ax) * sx; };
        var py = function (y) { return ay + (y - ay) * sy; };
        var k = (Math.abs(sx) + Math.abs(sy)) / 2;
        var x2 = o.bx + o.w, y2 = o.by + o.h;
        o.tx = px(o.tx);
        o.ty = py(o.ty);
        o.bx = px(o.bx);
        o.by = py(o.by);
        o.w = px(x2) - o.bx;
        o.h = py(y2) - o.by;
        o.size = Math.max(6, (o.size || 13) * k);
      },

      mirror: function (o, axis) {
        var bb = bounds(o);
        var cx = bb.x + bb.w / 2, cy = bb.y + bb.h / 2;
        if (axis === 'h') {
          o.tx = 2 * cx - o.tx;
          o.bx = 2 * cx - (o.bx + o.w);
        } else {
          o.ty = 2 * cy - o.ty;
          o.by = 2 * cy - (o.by + o.h);
        }
      },

      render: function (o, ctx) {
        var R = DP.render; /* 懒查找：render.js 加载晚于本文件 */
        var rs = (ctx && ctx.style) || o.style || defaultStyle();
        var size = o.size || 13;
        var cx = o.bx + o.w / 2, cy = o.by + o.h / 2;

        var lineStroke = strokeAttrs(rs, 'solid');
        lineStroke['stroke-width'] = rs.width * 0.8;

        var rectAttrs = {
          x: o.bx,
          y: o.by,
          width: o.w,
          height: o.h,
          rx: 5,
        };
        var fill = paint(rs, o);
        for (var f in fill) rectAttrs[f] = fill[f];
        var stroke = strokeAttrs(rs, o.dash);
        for (var s in stroke) rectAttrs[s] = stroke[s];

        return [
          {
            tag: 'line',
            attrs: Object.assign({
              x1: o.tx,
              y1: o.ty,
              x2: cx,
              y2: cy,
            }, lineStroke),
          },
          {
            tag: 'circle',
            attrs: { cx: o.tx, cy: o.ty, r: 2.5, fill: rs.stroke },
          },
          { tag: 'rect', attrs: rectAttrs },
          {
            tag: 'text',
            attrs: {
              x: cx,
              y: cy + size * 0.35,
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
