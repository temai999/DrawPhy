/* =========================================================================
 * DrawPhy path 模块（阶段 2 迁移）
 * type: path（贝塞尔 / 自由曲线，d 为 SVG path 字符串）
 * bbox / hitTest / anchors 均委托 G.parsePath 系列。
 * ========================================================================= */
(function () {
  'use strict';

  DP.defineModule('path', function (DP) {
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

    function paint(rs) {
      var out = {};
      if (rs.fill && rs.fill !== 'none' && rs.fill !== 'transparent') out.fill = rs.fill;
      else out.fill = 'none';
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
      var o = { d: '' };
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
        name: '路径',
        icon: 'path',
        shortcut: 'J',
        hint: '贝塞尔曲线 / 自由绘制',
      },
      menu: { tab: 'draw', category: 'shape', group: 'shape', order: 50 },
      capabilities: { fill: true, rotate: false, resize: true },

      defaults: defaults,

      bbox: function (o) {
        return G.pathBBox(o.d);
      },

      hitTest: function (o, p, tol) {
        return G.pathDistance(o.d, p) <= tol;
      },

      anchors: function (o) {
        var out = [];
        var subs = G.parsePath(o.d);
        for (var i = 0; i < subs.length; i++) {
          var sub = subs[i];
          out.push({ id: 's' + i, x: sub.start.x, y: sub.start.y, kind: 'endpoint' });
          if (sub.segs.length) {
            var last = sub.segs[sub.segs.length - 1].p1;
            out.push({ id: 'e' + i, x: last.x, y: last.y, kind: 'endpoint' });
          }
        }
        return out;
      },

      nodes: function (o) {
        /* 贝塞尔/自由曲线：锚点 + 控制把柄全部可拖 */
        return G.pathNodes(o.d);
      },

      setNode: function (o, id, p, opts) {
        o.d = G.editPathNode(o.d, id, p, opts);
      },

      translate: function (o, dx, dy) {
        o.d = G.mapPath(o.d, function (p) { return { x: p.x + dx, y: p.y + dy }; });
      },

      scale: function (o, sx, sy, ax, ay) {
        var px = function (x) { return ax + (x - ax) * sx; };
        var py = function (y) { return ay + (y - ay) * sy; };
        o.d = G.mapPath(o.d, function (p) { return { x: px(p.x), y: py(p.y) }; });
      },

      mirror: function (o, axis) {
        var bb = this.bbox(o);
        var cx = bb.x + bb.w / 2, cy = bb.y + bb.h / 2;
        var fx = function (v) { return axis === 'h' ? 2 * cx - v : v; };
        var fy = function (v) { return axis === 'v' ? 2 * cy - v : v; };
        o.d = G.mapPath(o.d, function (p) { return { x: fx(p.x), y: fy(p.y) }; });
      },

      render: function (o, ctx) {
        var rs = (ctx && ctx.style) || o.style || defaultStyle();
        var attrs = { d: o.d };
        var fill = paint(rs);
        for (var f in fill) attrs[f] = fill[f];
        var stroke = strokeAttrs(rs, o.dash);
        for (var s in stroke) attrs[s] = stroke[s];
        return { tag: 'path', attrs: attrs };
      },
    };
  });
})();
