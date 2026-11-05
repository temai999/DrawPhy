/* =========================================================================
 * DrawPhy polyline 模块（阶段 2 迁移）
 * type: polyline（折线 / 多边形共用，o.closed 区分闭合）
 * ========================================================================= */
(function () {
  'use strict';

  DP.defineModule('polyline', function (DP) {
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
      var o = { points: [], closed: false };
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
        name: '折线',
        icon: 'polyline',
        shortcut: 'P',
        hint: '逐点单击；双击或回车结束',
      },
      menu: { tab: 'draw', category: 'shape', group: 'shape', order: 40 },
      capabilities: { fill: true, rotate: false, resize: true },

      defaults: defaults,

      bbox: function (o) {
        if (!o.points || !o.points.length) return { x: 0, y: 0, w: 0, h: 0 };
        var xs = o.points.map(function (p) { return p[0]; });
        var ys = o.points.map(function (p) { return p[1]; });
        var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
        var y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
        return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      },

      hitTest: function (o, p, tol) {
        if (!o.points || o.points.length < 2) return false;
        var n = o.points.length;
        for (var i = 0; i < n - 1; i++) {
          if (G.distToSeg(p,
            { x: o.points[i][0], y: o.points[i][1] },
            { x: o.points[i + 1][0], y: o.points[i + 1][1] }) <= tol) return true;
        }
        if (o.closed && n >= 3) {
          if (G.distToSeg(p,
            { x: o.points[n - 1][0], y: o.points[n - 1][1] },
            { x: o.points[0][0], y: o.points[0][1] }) <= tol) return true;
          return !!G.pointInPoly(p, o.points);
        }
        return false;
      },

      anchors: function (o) {
        if (!o.points) return [];
        return o.points.map(function (p, i) {
          return { id: 'p' + i, x: p[0], y: p[1], kind: i === 0 || i === o.points.length - 1 ? 'endpoint' : 'vertex' };
        });
      },

      nodes: function (o) {
        if (!o.points) return [];
        return o.points.map(function (p, i) {
          return { id: i, x: p[0], y: p[1] };
        });
      },

      setNode: function (o, id, p) {
        var idx = typeof id === 'number' ? id : parseInt(id, 10);
        if (!isNaN(idx) && o.points[idx]) {
          o.points[idx] = [G.round(p.x), G.round(p.y)];
        }
      },

      translate: function (o, dx, dy) {
        o.points = o.points.map(function (p) { return [p[0] + dx, p[1] + dy]; });
      },

      scale: function (o, sx, sy, ax, ay) {
        var px = function (x) { return ax + (x - ax) * sx; };
        var py = function (y) { return ay + (y - ay) * sy; };
        o.points = o.points.map(function (p) { return [px(p[0]), py(p[1])]; });
      },

      mirror: function (o, axis) {
        var bb = this.bbox(o);
        var cx = bb.x + bb.w / 2, cy = bb.y + bb.h / 2;
        var fx = function (v) { return axis === 'h' ? 2 * cx - v : v; };
        var fy = function (v) { return axis === 'v' ? 2 * cy - v : v; };
        o.points = o.points.map(function (p) { return [fx(p[0]), fy(p[1])]; });
      },

      render: function (o, ctx) {
        var rs = (ctx && ctx.style) || o.style || defaultStyle();
        var pts = o.points.map(function (p) { return p[0] + ',' + p[1]; }).join(' ');
        var attrs = { points: pts };
        var fill = paint(rs, o);
        for (var f in fill) attrs[f] = fill[f];
        var stroke = strokeAttrs(rs, o.dash);
        for (var s in stroke) attrs[s] = stroke[s];
        return { tag: o.closed ? 'polygon' : 'polyline', attrs: attrs };
      },
    };
  });
})();
