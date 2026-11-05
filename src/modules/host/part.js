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
        var k = (Math.abs(sx) + Math.abs(sy)) / 2;
        var bb = this.bbox(o);
        var center = { x: bb.x + bb.w / 2, y: bb.y + bb.h / 2 };
        var nc = { x: ax + (center.x - ax) * sx, y: ay + (center.y - ay) * sy };
        o.s = (o.s == null ? 1 : o.s) * k;
        this.translate(o, nc.x - center.x, nc.y - center.y);
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
        var children = def.shapes.map(function (s) { return R.primitive(s, rs); });
        return {
          tag: 'g',
          attrs: { transform: 'matrix(' + m.map(function (v) { return Math.round(v * 100) / 100; }).join(' ') + ')' },
          children: children,
        };
      },
    };
  });
})();
