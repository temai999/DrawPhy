/* =========================================================================
 * DrawPhy eventbus.js — 全局事件总线（框架 5.7 顶部）
 * 有限事件名：pointerdown/move/up、object:change、selection:change、
 *            history:change、view:change 等；模块与 ui 经此解耦。
 * 命令式历史（commands）按计划在阶段 7 落地，本轮只做 on/emit。
 * ========================================================================= */
(function (global) {
  global.DP = global.DP || {};

  var map = Object.create(null);

  global.DP.bus = {
    /* 订阅；返回退订函数 */
    on: function (ev, fn) {
      if (typeof fn !== 'function') return function () {};
      (map[ev] = map[ev] || []).push(fn);
      return function () {
        var arr = map[ev] || [];
        var i = arr.indexOf(fn);
        if (i >= 0) arr.splice(i, 1);
      };
    },
    /* 发布（同步）；handler 异常不影响其他订阅者 */
    emit: function (ev, payload) {
      var arr = map[ev] || [];
      arr.forEach(function (fn) {
        try { fn(payload); } catch (e) { console.warn('[bus] ' + ev + ' 处理异常：', e); }
      });
    },
    /* 调试用 */
    _subs: function (ev) { return (map[ev] || []).length; },
  };
})(window);
