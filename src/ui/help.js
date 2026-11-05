/* =========================================================================
 * DrawPhy ui/help.js — 帮助面板文案（纯字符串构造，依赖 U.TOOLS）
 * 快捷键总表：工具快捷键由 TOOLS 自动生成，其余按「怎么用」分组手写。
 * ========================================================================= */
(function () {
  'use strict';
  const DP = (window.DP = window.DP || {});
  const U = (DP.ui = DP.ui || {});
  const TOOLS = U.TOOLS || [];

  function helpHtml() {
    const kbd = (k) => `<kbd>${k}</kbd>`;
    /* 工具快捷键：每个工具一个“键 + 名”小片，flex 换行排列（长列表不散行） */
    const rowOf = (g) => `<span class="tk-list">` + TOOLS.filter((t) => t.g === g)
      .map((t) => `<span class="tk">${kbd(t.key)} ${t.name}</span>`).join('') + `</span>`;
    const sec = (title, rows) => `<div class="props-sub">${title}</div>`
      + `<div class="keys">${rows.filter(Boolean).map((r) => `<div>${r}</div>`).join('')}</div>`;
    return [
      sec('绘图工具', [rowOf('shape')]),
      sec('文字与标注', [rowOf('text')]),
      sec('编辑工具', [rowOf('edit')]),

      sec('通用', [
        `${kbd('Ctrl+Z')} 撤销 ${kbd('Ctrl+Y')} 重做 ${kbd('Ctrl+S')} 保存文件 ${kbd('Ctrl+D')} 原地复制 ${kbd('Del')} 删除`,
        `${kbd('Ctrl+A')} 全选 ${kbd('Ctrl+C')} / ${kbd('Ctrl+V')} 复制粘贴 ${kbd('Ctrl+G')} 组合 ${kbd('Ctrl+Shift+G')} 取消组合`,
        `${kbd('Ctrl+0')} 适应画布 ${kbd('=')} / ${kbd('-')} 缩放 · 滚轮缩放 · ${kbd('空格')}+拖 平移`,
        `方向键 微调 1px（${kbd('Shift')}+方向键 10px） ${kbd('Esc')} 取消/退出 ${kbd('S')} 部件抽屉 右键 菜单`,
      ]),

      sec('多步绘制（折线 / 贝塞尔 / 直角连线）', [
        `左键：逐点落笔；直角连线每点只转一次直角，${kbd('Shift')} 换「先横/先竖」`,
        `${kbd('双击')} / ${kbd('回车')} / 右键：收笔（工具不切换，可连续画） ${kbd('Esc')} 放弃`,
        `贝塞尔：单击加点自动平滑穿过 · 按住拖动拉出该点把柄 · ${kbd('Shift')}+单击 = 折角 · 点回起点闭合`,
      ]),

      sec('曲线把柄（选中贝塞尔后）', [
        `空心方块 = 锚点：拖动改形状，两侧把柄跟着走`,
        `蓝圆点 = 控制把柄：拖动调曲率，${kbd('Shift')}+拖 让两侧对称联动`,
        `双击曲线本体 = 在最近处插入锚点（形状不变）`,
      ]),

      sec('拖动与吸附', [
        `${kbd('Alt')} / ${kbd('Ctrl')}+拖 拖动复制 ${kbd('Shift')}+拖 锁轴向（15°）`,
        `端点拖到别的对象上自动粘附，移动宿主时线会跟随`,
        `缩放拖四角（${kbd('Shift')} 等比）；拖动/缩放时出现对齐参考线`,
      ]),

      sec('部件', [
        `部件库按住拖入画布；拖到导线上自动破口接入`,
        `选中部件：顶部圆点手柄旋转（${kbd('Shift')} 15° 步进）`,
      ]),
    ].join('');
  }

  U.helpHtml = helpHtml;
})();
