/* =========================================================================
 * DrawPhy dim 模块（阶段 4 迁移）
 * type: dim（尺寸标注：两点 + 偏移尺寸线 + 双箭头 + 数值标签）
 * 箭头头复用 DP.render.arrowHead，与旧 switch 同源，避免两套公式。
 * ========================================================================= */
(function () {
  'use strict';

  var FONT = "'Microsoft YaHei', 'PingFang SC', 'Segoe UI', system-ui, sans-serif";

  DP.defineModule('dim', function (DP) {
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

    var DEFAULT_OFFSET = -24;
    function offsetOf(o) {
      return o.offset == null ? DEFAULT_OFFSET : o.offset;
    }

    /* 尺寸线两端点（沿法线偏移后的位置） */
    function dimPoints(o) {
      var dx = o.x2 - o.x1, dy = o.y2 - o.y1;
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      var nx = -dy / len, ny = dx / len;
      var off = offsetOf(o);
      return {
        p1: { x: o.x1 + nx * off, y: o.y1 + ny * off },
        p2: { x: o.x2 + nx * off, y: o.y2 + ny * off },
        nx: nx,
        ny: ny,
      };
    }

    function defaults(props) {
      var o = { x1: 0, y1: 0, x2: 0, y2: 0, offset: DEFAULT_OFFSET, value: null, unit: '', size: 14 };
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
        name: '尺寸',
        icon: 'dim',
        shortcut: 'M',
        hint: '单击两点生成尺寸线',
      },
      menu: { tab: 'draw', category: 'text', group: 'text', order: 130 },
      capabilities: { fill: false, rotate: false, resize: true },

      defaults: defaults,

      bbox: function (o) {
        var x1 = Math.min(o.x1, o.x2), y1 = Math.min(o.y1, o.y2);
        var x2 = Math.max(o.x1, o.x2), y2 = Math.max(o.y1, o.y2);
        var off = o.offset || 0;
        return {
          x: x1,
          y: y1 - Math.abs(off) - 10,
          w: x2 - x1,
          h: y2 - y1 + Math.abs(off) * 2 + 20,
        };
      },

      hitTest: function (o, p, tol) {
        if (DP.geom.distToSeg(p, { x: o.x1, y: o.y1 }, { x: o.x2, y: o.y2 }) <= tol * 2) return true;
        var d = dimPoints(o);
        return DP.geom.distToSeg(p, d.p1, d.p2) <= tol * 2 ||
          DP.geom.distToSeg(p, { x: o.x1, y: o.y1 }, d.p1) <= tol ||
          DP.geom.distToSeg(p, { x: o.x2, y: o.y2 }, d.p2) <= tol;
      },

      anchors: function (o) {
        return [
          { id: 'x1', x: o.x1, y: o.y1, kind: 'endpoint' },
          { id: 'x2', x: o.x2, y: o.y2, kind: 'endpoint' },
          { id: 'mid', x: (o.x1 + o.x2) / 2, y: (o.y1 + o.y2) / 2, kind: 'midpoint' },
        ];
      },

      nodes: function () {
        /* 尺寸标注不开放节点手柄（与旧行为一致） */
        return [];
      },

      setNode: function () {},

      translate: function (o, dx, dy) {
        o.x1 += dx; o.x2 += dx;
        o.y1 += dy; o.y2 += dy;
      },

      scale: function (o, sx, sy, ax, ay) {
        var px = function (x) { return ax + (x - ax) * sx; };
        var py = function (y) { return ay + (y - ay) * sy; };
        var k = (Math.abs(sx) + Math.abs(sy)) / 2;
        o.x1 = px(o.x1); o.x2 = px(o.x2);
        o.y1 = py(o.y1); o.y2 = py(o.y2);
        o.offset *= k;
      },

      mirror: function (o, axis) {
        var bb = this.bbox(o);
        var cx = bb.x + bb.w / 2, cy = bb.y + bb.h / 2;
        var fx = function (v) { return axis === 'h' ? 2 * cx - v : v; };
        var fy = function (v) { return axis === 'v' ? 2 * cy - v : v; };
        o.x1 = fx(o.x1); o.x2 = fx(o.x2);
        o.y1 = fy(o.y1); o.y2 = fy(o.y2);
      },

      render: function (o, ctx) {
        var R = DP.render; /* 懒查找：render.js 加载晚于本文件 */
        var G = DP.geom;
        var rs = (ctx && ctx.style) || o.style || defaultStyle();
        var d = dimPoints(o);
        var ang = Math.atan2(o.y2 - o.y1, o.x2 - o.x1);
        var thin = strokeAttrs(rs, o.dash);
        thin['stroke-width'] = rs.width * 0.7;
        var main = strokeAttrs(rs, o.dash);

        var nodes = [
          {
            tag: 'line',
            attrs: Object.assign({ x1: o.x1, y1: o.y1, x2: d.p1.x, y2: d.p1.y }, thin),
          },
          {
            tag: 'line',
            attrs: Object.assign({ x1: o.x2, y1: o.y2, x2: d.p2.x, y2: d.p2.y }, thin),
          },
          {
            tag: 'line',
            attrs: Object.assign({ x1: d.p1.x, y1: d.p1.y, x2: d.p2.x, y2: d.p2.y }, main),
          },
        ];

        /* 箭头头沿用渲染层同一套字符串生成器，指回两个端点 */
        var size = Math.max(7, rs.width * 3.4);
        nodes.push(R.arrowHead(d.p1.x, d.p1.y, ang + Math.PI, size, rs.stroke));
        nodes.push(R.arrowHead(d.p2.x, d.p2.y, ang, size, rs.stroke));

        var label = o.label || (G.round(o.value != null
          ? o.value
          : Math.hypot(o.x2 - o.x1, o.y2 - o.y1) / (o.scale || 1)) + (o.unit || ''));
        var mx = (d.p1.x + d.p2.x) / 2 + d.nx * 10;
        var my = (d.p1.y + d.p2.y) / 2 + d.ny * 10;
        nodes.push({
          tag: 'text',
          attrs: {
            x: mx,
            y: my,
            'font-size': o.size || 14,
            'font-family': FONT,
            'text-anchor': 'middle',
            fill: rs.stroke,
          },
          children: R.escape(label),
        });

        return nodes;
      },
    };
  });
})();
