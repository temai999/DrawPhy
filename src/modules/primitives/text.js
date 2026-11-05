/* =========================================================================
 * DrawPhy text 模块（阶段 2 迁移）
 * type: text（独立文字，支持上标 x^{2} / 下标 A_{1}）
 * bbox 为字号估算值；render 返回 text + tspan drawable 树。
 * ========================================================================= */
(function () {
  'use strict';

  var FONT = "'Microsoft YaHei', 'PingFang SC', 'Segoe UI', system-ui, sans-serif";

  DP.defineModule('text', function (DP) {
    var G = DP.geom;
    var C = DP.config;
    /* DP.render 在 render.js 中定义，加载顺序晚于本文件，
       因此 R 延迟到 render 方法内按需获取（懒查找）。 */

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
      var o = { x: 0, y: 0, text: '', size: C.defaults.fontSize, anchor: 'start' };
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
        name: '文字',
        icon: 'text',
        shortcut: 'T',
        hint: '单击落字；支持 x^{2}、A_{1}',
      },
      menu: { tab: 'draw', category: 'text', group: 'text', order: 100 },
      capabilities: { fill: false, rotate: true, resize: true },

      defaults: defaults,

      bbox: function (o) {
        var size = o.size || 16;
        var len = (o.text || '').length * size * 0.62 + 4;
        var w = len, h = size * 1.2;
        var ax = o.anchor === 'middle' ? w / 2 : 0;
        return { x: o.x - ax, y: o.y - size * 0.85, w: w, h: h };
      },

      hitTest: function (o, p, tol) {
        var bb = this.bbox(o);
        return p.x >= bb.x - 4 && p.x <= bb.x + bb.w + 4 &&
               p.y >= bb.y - 4 && p.y <= bb.y + bb.h + 4;
      },

      anchors: function (o) {
        var bb = this.bbox(o);
        return [
          { id: 'nw', x: bb.x, y: bb.y, kind: 'endpoint' },
          { id: 'ne', x: bb.x + bb.w, y: bb.y, kind: 'endpoint' },
          { id: 'sw', x: bb.x, y: bb.y + bb.h, kind: 'endpoint' },
          { id: 'se', x: bb.x + bb.w, y: bb.y + bb.h, kind: 'endpoint' },
          { id: 'c', x: bb.x + bb.w / 2, y: bb.y + bb.h / 2, kind: 'center' },
        ];
      },

      nodes: function (o) {
        /* 文字暂不开放节点编辑 */
        return [];
      },

      setNode: function (o, id, p) {
        /* 预留 */
      },

      translate: function (o, dx, dy) {
        o.x += dx; o.y += dy;
      },

      scale: function (o, sx, sy, ax, ay) {
        var px = function (x) { return ax + (x - ax) * sx; };
        var py = function (y) { return ay + (y - ay) * sy; };
        var k = (Math.abs(sx) + Math.abs(sy)) / 2;
        o.x = px(o.x); o.y = py(o.y);
        o.size = Math.max(6, (o.size || 16) * k);
      },

      mirror: function (o, axis) {
        var bb = this.bbox(o);
        var cx = bb.x + bb.w / 2, cy = bb.y + bb.h / 2;
        if (axis === 'h') o.x = 2 * cx - o.x;
        else o.y = 2 * cy - o.y;
      },

      render: function (o, ctx) {
        var R = DP.render; /* 懒查找：render.js 已加载 */
        var rs = (ctx && ctx.style) || o.style || defaultStyle();
        var size = o.size || 16;
        var anchor = o.anchor === 'middle' ? 'middle' : 'start';

        var attrs = {
          x: o.x,
          y: o.y,
          'font-size': size,
          'font-family': FONT,
          'text-anchor': anchor,
          fill: rs.stroke,
        };

        /* rot 为当前统一字段；rotate 兼容旧工程文件 */
        var rot = o.rot != null ? o.rot : o.rotate;
        if (rot) {
          attrs.transform = 'rotate(' + G.round(rot) + ' ' + G.round(o.x) + ' ' + G.round(o.y) + ')';
        }
        if (o.weight) attrs['font-weight'] = o.weight;

        /* 解析上下标，生成 tspan drawable 数组 */
        var runs = R.parseText(o.text || '');
        var children = [];
        var dy = 0;
        for (var i = 0; i < runs.length; i++) {
          var run = runs[i];
          if (run.mode === 'normal') {
            children.push({
              tag: 'tspan',
              attrs: { dy: -dy },
              children: R.escape(run.text),
            });
            dy = 0;
          } else {
            var off = run.mode === 'sup' ? -size * 0.42 : size * 0.24;
            children.push({
              tag: 'tspan',
              attrs: { dy: off - dy, 'font-size': size * 0.68 },
              children: R.escape(run.text),
            });
            dy = off;
          }
        }

        return { tag: 'text', attrs: attrs, children: children };
      },
    };
  });
})();
