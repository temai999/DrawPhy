/* =========================================================================
 * DrawPhy part 宿主模块（阶段 5.2）
 * type: part —— 部件实例：partId 引用部件定义，x/y 定位、s 统一缩放、
 *      rot 角度、flip 水平翻转；几何本体在 def.shapes（局部坐标，原点在左上）。
 * 通过普通 <script> 加载，file:// 可用；行为与旧 switch 分支保持一致。
 * ========================================================================= */
(function () {
  'use strict';

  DP.defineModule('part', function (DP) {
    var G = DP.geom;
    var M = DP.model;

    /* 部件定义查询：registry 为准，DP.parts.byId 兼容兜底 */
    function defOf(o) {
      var def = null;
      if (DP.registry && DP.registry.getPart) def = DP.registry.getPart(o.partId);
      if (!def && DP.parts && DP.parts.byId) def = DP.parts.byId[o.partId];
      return def || null;
    }

    function defaults(props) {
      var o = { type: 'part', x: 0, y: 0, partId: '', s: 1, rot: 0, flip: false };
      if (props) {
        for (var k in props) {
          if (Object.prototype.hasOwnProperty.call(props, k)) o[k] = props[k];
        }
      }
      return o;
    }

    /* 线宽/线型不随部件缩放：matrix 里的 s 会把 stroke-width 一起放大/缩小，
       这里对子图元做反向补偿。只补偿对象自身的 s（画布 zoom 仍是正常缩放），
       所以放大元器件时线条不会越来越粗，缩小后也不会细到看不见。 */
    function rescaleStroke(svg, k) {
      if (!svg || Math.abs(k - 1) < 1e-6) return svg;
      var f = function (x) { return String(Math.round(x * k * 100) / 100); };
      return svg
        .replace(/stroke-width="([0-9.]+)"/g, function (_, v) {
          return 'stroke-width="' + f(parseFloat(v)) + '"';
        })
        .replace(/stroke-dasharray="([^"]+)"/g, function (_, v) {
          return 'stroke-dasharray="' + v.split(/[ ,]+/).map(function (n) {
            var x = parseFloat(n);
            return isFinite(x) ? f(x) : n;
          }).join(' ') + '"';
        });
    }

    return {
      version: 1,
      meta: {
        name: '部件',
        icon: null,
        shortcut: null,
        hint: '从左侧部件库拖入画布',
      },
      /* part 不是 ribbon 按钮（入口在部件库），故不声明 menu */

      defaults: defaults,

      bbox: function (o) {
        var def = defOf(o);
        var w = def ? def.w : 40, h = def ? def.h : 40;
        var m = M.partMatrix(o);
        var corners = [[0, 0], [w, 0], [w, h], [0, h]].map(function (c) {
          return G.apply(m, { x: c[0], y: c[1] });
        });
        var xs = corners.map(function (p) { return p.x; });
        var ys = corners.map(function (p) { return p.y; });
        return {
          x: Math.min.apply(null, xs),
          y: Math.min.apply(null, ys),
          w: Math.max.apply(null, xs) - Math.min.apply(null, xs),
          h: Math.max.apply(null, ys) - Math.min.apply(null, ys),
        };
      },

      hitTest: function (o, p, tol) {
        var bb = this.bbox(o);
        return p.x >= bb.x - 2 && p.x <= bb.x + bb.w + 2 &&
          p.y >= bb.y - 2 && p.y <= bb.y + bb.h + 2;
      },

      anchors: function (o) {
        var bb = this.bbox(o);
        var out = [
          { id: 'nw', x: bb.x, y: bb.y, kind: 'endpoint' },
          { id: 'ne', x: bb.x + bb.w, y: bb.y, kind: 'endpoint' },
          { id: 'se', x: bb.x + bb.w, y: bb.y + bb.h, kind: 'endpoint' },
          { id: 'sw', x: bb.x, y: bb.y + bb.h, kind: 'endpoint' },
          { id: 'c', x: bb.x + bb.w / 2, y: bb.y + bb.h / 2, kind: 'center' },
        ];
        /* 命名端子（阶段 5.4）：局部端子点经 partMatrix 映射到世界坐标 */
        var def = defOf(o);
        if (def && def.terminals && def.terminals.length) {
          var m = M.partMatrix(o);
          def.terminals.forEach(function (t) {
            var wpt = G.apply(m, { x: t.x, y: t.y });
            out.push({
              id: 't_' + t.id,
              x: wpt.x,
              y: wpt.y,
              kind: 'terminal',
              label: t.label || t.id,
              tid: t.id,
            });
          });
        }
        return out;
      },

      /* 部件无可拖拽几何节点（选中后是整体 8 向缩放 + 旋转手柄） */
      nodes: function (o) { return []; },
      setNode: function (o, id, p) {},

      translate: function (o, dx, dy) {
        o.x += dx;
        o.y += dy;
      },

      scale: function (o, sx, sy, ax, ay) {
        /* 部件保持等比：取偏离 1 更多的那个方向作为统一比例。
           旧实现取 (sx+sy)/2，只横向拖手柄时宽度只变一半，缩放跟不上手，
           吸附辅助线也就对不准；改主导轴后单向拖动可以精确落在吸附线上。 */
        var k = Math.abs(sx - 1) >= Math.abs(sy - 1) ? sx : sy;
        if (!isFinite(k) || k <= 0) k = 1;
        var bb0 = this.bbox(o);
        var c0 = { x: bb0.x + bb0.w / 2, y: bb0.y + bb0.h / 2 };
        o.s = (o.s == null ? 1 : o.s) * k;
        /* 锚点必须不动：先按新 s 求「未平移时」的实际中心，再补差值。
           旧实现用旧尺寸算平移量，缩放后中心会跑掉（拖 se 时右边界对不上吸附线）。 */
        var bb1 = this.bbox(o);
        var c1 = { x: bb1.x + bb1.w / 2, y: bb1.y + bb1.h / 2 };
        var tgt = { x: ax + (c0.x - ax) * k, y: ay + (c0.y - ay) * k };
        this.translate(o, tgt.x - c1.x, tgt.y - c1.y);
      },

      /* 保持旧语义：mirror 只翻转 flip 标志（位置不动），不平移几何 */
      mirror: function (o, axis) {
        o.flip = !o.flip;
      },

      render: function (o, ctx) {
        var R = DP.render;
        var rs = (ctx && ctx.style) || o.style || DP.state.style;
        var def = defOf(o);
        if (!def) return { tag: 'g', attrs: {}, children: [] };
        var m = M.partMatrix(o);
        var sAbs = Math.abs(o.s == null ? 1 : o.s);
        if (sAbs < 1e-3) sAbs = 1e-3;
        var inv = 1 / sAbs;
        var children = def.shapes.map(function (sh) {
          return rescaleStroke(R.primitive(sh, rs), inv);
        });
        return {
          tag: 'g',
          attrs: { transform: 'matrix(' + m.map(function (v) { return Math.round(v * 100) / 100; }).join(' ') + ')' },
          children: children,
        };
      },
    };
  });
})();
