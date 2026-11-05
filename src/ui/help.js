/* =========================================================================
 * DrawPhy ui/help.js — 帮助面板文案（纯字符串构造，依赖 U.TOOLS）
 * ========================================================================= */
(function () {
  'use strict';
  const DP = (window.DP = window.DP || {});
  const U = (DP.ui = DP.ui || {});
  const TOOLS = U.TOOLS || [];

  function helpHtml() {
    const kbd = (k) => `<kbd>${k}</kbd>`;
    const rowOf = (g) => TOOLS.filter((t) => t.g === g).map((t) => `${kbd(t.key)} ${t.name}`).join('　');
    return [
      `<div class="props-sub">绘图</div>`,
      `<div class="keys"><div>${rowOf('shape')}</div></div>`,
      `<div class="props-sub">文字与标注</div>`,
      `<div class="keys"><div>${rowOf('text')}</div></div>`,
      `<div class="props-sub">编辑</div>`,
      `<div class="keys"><div>${rowOf('edit')}</div></div>`,
      `<div class="props-sub">通用</div>`,
      `<div class="keys">
        <div>${kbd('Ctrl+Z')} 撤销 ${kbd('Ctrl+Y')} 重做 ${kbd('Ctrl+S')} 保存 ${kbd('Ctrl+D')} 原地复制 ${kbd('Del')} 删除</div>
        <div>${kbd('Ctrl+A')} 全选 ${kbd('Ctrl+C')} / ${kbd('Ctrl+V')} 复制粘贴 ${kbd('Ctrl+G')} 组合 ${kbd('Ctrl+Shift+G')} 取消组合</div>
        <div>${kbd('Ctrl+0')} 适应画布 · 滚轮缩放 · ${kbd('空格')}+拖 平移 · ${kbd('S')} 部件抽屉 · 右键 快捷菜单</div>
        <div>${kbd('Alt')}+拖 拖动复制 · ${kbd('Shift')}+拖 锁轴向</div>
      </div>`,
    ].join('');
  }

  U.helpHtml = helpHtml;
})();
