/* =========================================================================
 * DrawPhy registry.js — 全局模块注册表（框架 5.3）
 * 三表：shapes（类型行为）/ menu（主页按钮槽位）/ parts（部件定义）
 * 其他子系统只经此取行为，不再硬编码 type 分支。
 * ========================================================================= */
(function (global) {
  global.DP = global.DP || {};

  var shapes = Object.create(null); // type -> module
  var menu = [];                     // 主页按钮槽位（已按 order 排序）
  var parts = Object.create(null);  // partId -> 部件定义

  /* 模块必需字段（框架 4.2 / 5.3） */
  var REQUIRED = ['version', 'meta', 'defaults', 'bbox', 'hitTest', 'render'];

  function register(mod) {
    if (!mod || !mod.type) throw new Error('模块缺少 type');
    if (typeof mod.version !== 'number') throw new Error('模块 ' + mod.type + ' 缺少 version(number)');
    REQUIRED.forEach(function (k) {
      if (mod[k] === undefined) throw new Error('模块 ' + mod.type + ' 缺少必需字段 ' + k);
    });
    if (mod.meta && typeof mod.meta !== 'object') throw new Error('模块 ' + mod.type + ' 的 meta 必须是对象');

    var old = shapes[mod.type];
    if (old && old.version > mod.version) {
      console.warn('[registry] 已存在更高版本，忽略重复注册：' + mod.type +
        '（现有 v' + old.version + '，传入 v' + mod.version + '）');
      return;
    }
    if (old && old.version === mod.version) {
      console.warn('[registry] 同版本重复注册，覆盖：' + mod.type + '（v' + mod.version + '）');
    }
    shapes[mod.type] = mod;

    /* 有 menu 描述 → 同步写入主页按钮槽位（先替换旧槽位再重排） */
    if (mod.menu) {
      var slot = {
        type: mod.type,
        order: mod.menu.order || 100,
        tab: mod.menu.tab,
        category: mod.menu.category,
        group: mod.menu.group,
        name: (mod.meta && mod.meta.name) || mod.type,
        icon: (mod.meta && mod.meta.icon) || null,
        shortcut: (mod.meta && mod.meta.shortcut) || null,
      };
      menu = menu.filter(function (m) { return m.type !== mod.type; });
      menu.push(slot);
      menu.sort(function (a, b) { return a.order - b.order; });
    }
  }

  global.DP.registry = {
    register: register,
    get: function (type) { return shapes[type] || null; },
    has: function (type) { return !!shapes[type]; },
    list: function (filter) {
      var all = Object.keys(shapes).map(function (t) { return shapes[t]; });
      return filter ? all.filter(filter) : all;
    },
    /* 主页按钮槽位：tab/category 过滤 */
    menuSlots: function (tab, category) {
      return menu.filter(function (m) {
        return (!tab || m.tab === tab) && (!category || m.category === category);
      });
    },
    /* 部件定义专用入口 */
    registerPart: function (def) {
      if (!def || !def.id) throw new Error('registerPart: 缺少 id');
      if (parts[def.id]) console.warn('[registry] 部件重复注册：' + def.id);
      parts[def.id] = def;
    },
    getPart: function (id) { return parts[id] || null; },
    /* 调试用 */
    _tables: function () { return { shapeCount: Object.keys(shapes).length, menuCount: menu.length, partCount: Object.keys(parts).length }; },
  };
})(window);
