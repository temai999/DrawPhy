/* =========================================================================
 * DrawPhy module-wrap.js — 统一模块定义入口（框架 5.2）
 * 普通 <script> 加载，file:// 无 CORS；工厂立即执行，type 由 wrap 注入。
 * ========================================================================= */
(function (global) {
  global.DP = global.DP || {};

  /* type: 全局唯一类型名（如 'rect' / 'physics.xxx'）
   * factory(DP): 返回模块字面量对象（不必自带 type 字段） */
  global.DP.defineModule = function (type, factory) {
    if (typeof factory !== 'function') {
      throw new Error('DP.defineModule: factory 必须是函数');
    }
    var mod = factory(global.DP);
    if (!mod || typeof mod !== 'object') {
      throw new Error('DP.defineModule(' + type + '): factory 必须返回模块对象');
    }
    mod.type = type;
    if (!global.DP.registry) {
      throw new Error('DP.defineModule: registry 尚未加载');
    }
    global.DP.registry.register(mod);
    return mod;
  };
})(window);
