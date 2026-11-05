/* =========================================================================
 * DrawPhy ray 模块（阶段 7）
 * type: ray（光线：实线 + 线段中点处的箭头）
 *
 * 和 arrow 的区别（别合并，语义不同）：
 *   arrow —— 箭头在**端点**，表示「力、速度、位移」这类矢量方向
 *   ray   —— 箭头在**中间**，表示「光沿这条线传播」，端点不带箭头，
 *            所以光线可以首尾相接、折线连续传播而不出现一堆端点箭头
 * style.rayArrows: 1 = 中点一个箭头（默认）；2 = 三等分两点各一个（长光路）
 * ========================================================================= */
(function () {
  'use strict';

  DP.defineModule('ray', function (DP) {
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
        rayArrows: 1,
      };
    }

    function strokeAttrs(rs) {
      var out = {
        stroke: rs.stroke,
        'stroke-width': rs.width,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      };
      var da = DP.style.dashArray(rs.dash);
      if (da) out['stroke-dasharray'] = da;
      if (rs.opacity != null && rs.opacity < 1) out['stroke-opacity'] = rs.opacity;
      return out;
    }

    /* 箭头三角形：尖端在 (x,y)，尾部向后 size 长、半宽 0.4*size */
    function head(x, y, angle, size, color) {
      var bx = x - size * Math.cos(angle), by = y - size * Math.sin(angle);
      var nx = size * 0.4 * Math.sin(angle), ny = -size * 0.4 * Math.cos(angle);
      return {
        tag: 'polygon',
        attrs: {
          points: [x, y, bx + nx, by + ny, bx - nx, by - ny]
            .map(function (v) { return G.round(v); })
            .join(' '),
          fill: color,
          stroke: 'none',
        },
      };
    }

    function defaults(props) {
      var o = { x1: 0, y1: 0, x2: 0, y2: 0 };
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
        name: '光线',
        icon: 'ray',
        shortcut: 'Y',
        hint: '拖动绘制光线（实线 + 中间箭头）；Shift 锁 15°',
      },
      menu: { tab: 'draw', category: 'shape', group: 'shape', order: 35 },
      capabilities: { fill: false, rotate: true, resize: true, bind: true },

      /* 任意角旋转（阶段 8-d）：绕局部 bbox 中心转端点（几何法，粘附/吸附保持正确） */
      rotate: function (o, rad) {
        var cx = (o.x1 + o.x2) / 2, cy = (o.y1 + o.y2) / 2;
        var cos = Math.cos(rad), sin = Math.sin(rad);
        var ax = o.x1, ay = o.y1, bx = o.x2, by = o.y2;
        o.x1 = cx + (ax - cx) * cos - (ay - cy) * sin;
        o.y1 = cy + (ax - cx) * sin + (ay - cy) * cos;
        o.x2 = cx + (bx - cx) * cos - (by - cy) * sin;
        o.y2 = cy + (bx - cx) * sin + (by - cy) * cos;
      },


      defaults: defaults,

      bbox: function (o) {
        return {
          x: Math.min(o.x1, o.x2),
          y: Math.min(o.y1, o.y2),
          w: Math.abs(o.x2 - o.x1),
          h: Math.abs(o.y2 - o.y1),
        };
      },

      hitTest: function (o, p, tol) {
        return G.distToSeg(p, { x: o.x1, y: o.y1 }, { x: o.x2, y: o.y2 }) <= tol;
      },

      anchors: function (o) {
        return [
          { id: 'tail', x: o.x1, y: o.y1, kind: 'endpoint' },
          { id: 'tip', x: o.x2, y: o.y2, kind: 'endpoint' },
          { id: 'mid', x: (o.x1 + o.x2) / 2, y: (o.y1 + o.y2) / 2, kind: 'midpoint' },
        ];
      },

      nodes: function (o) {
        return [
          { id: 'x1', x: o.x1, y: o.y1 },
          { id: 'x2', x: o.x2, y: o.y2 },
        ];
      },

      setNode: function (o, id, p) {
        if (id === 'x1') { o.x1 = p.x; o.y1 = p.y; }
        else { o.x2 = p.x; o.y2 = p.y; }
      },

      translate: function (o, dx, dy) {
        o.x1 += dx; o.x2 += dx;
        o.y1 += dy; o.y2 += dy;
      },

      scale: function (o, sx, sy, ax, ay) {
        var px = function (x) { return ax + (x - ax) * sx; };
        var py = function (y) { return ay + (y - ay) * sy; };
        o.x1 = px(o.x1); o.x2 = px(o.x2);
        o.y1 = py(o.y1); o.y2 = py(o.y2);
      },

      mirror: function (o, axis) {
        var cx = (Math.min(o.x1, o.x2) + Math.max(o.x1, o.x2)) / 2;
        var cy = (Math.min(o.y1, o.y2) + Math.max(o.y1, o.y2)) / 2;
        if (axis === 'h') {
          o.x1 = 2 * cx - o.x1;
          o.x2 = 2 * cx - o.x2;
        } else {
          o.y1 = 2 * cy - o.y1;
          o.y2 = 2 * cy - o.y2;
        }
      },

      render: function (o, ctx) {
        var rs = (ctx && ctx.style) || o.style || defaultStyle();
        var dx = o.x2 - o.x1, dy = o.y2 - o.y1;
        var len = Math.hypot(dx, dy);
        var ang = Math.atan2(dy, dx);
        var two = rs.rayArrows === 2;
        /* 头长随线宽走（与 arrow 同一公式），并用线长夹住，短光路不会糊成一团 */
        var size = Math.max(7, rs.width * 4.2);
        size = Math.min(size, len * (two ? 0.26 : 0.45));

        var children = [{
          tag: 'line',
          attrs: Object.assign({
            x1: o.x1,
            y1: o.y1,
            x2: o.x2,
            y2: o.y2,
          }, strokeAttrs(rs)),
        }];

        if (len > 0.01) {
          var picks = two ? [0.34, 0.68] : [0.5];
          for (var i = 0; i < picks.length; i++) {
            var t = picks[i];
            /* 三角形骑在中点两侧：尖端 = 中点 + 前进方向 * size/2 */
            var cx = o.x1 + dx * t + Math.cos(ang) * size / 2;
            var cy = o.y1 + dy * t + Math.sin(ang) * size / 2;
            children.push(head(cx, cy, ang, size, rs.stroke));
          }
        }
        return { tag: 'g', children: children };
      },
    };
  });
})();
