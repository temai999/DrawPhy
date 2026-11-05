/* =========================================================================
 * DrawPhy ui.js — 工具栏 / 画布交互 / 属性面板 / 快捷键
 * ========================================================================= */
(function () {
  'use strict';
  const DP = (window.DP = window.DP || {});
  const U = (DP.ui = DP.ui || {});   /* 保留 ui/tools-data.js 等先行文件已挂载的内容 */
  const st = DP.state;
  const M = DP.model;
  const G = DP.geom;
  /* 阶段 6.4：工具表 / 帮助文案 / 图形工厂已外移到 src/ui/*.js，这里只留别名与薄包装 */
  const TOOLS = U.TOOLS || [];
  const IC = U.IC || ((x) => x);
  const ICONS = U.ICONS || {};

  let board, worldLayer, hintEl, zoomEl, toastEl, textInput;
  let spaceDown = false;
  let D = null; // 当前交互
  /* 部件放置预览 + 方向键微调偏移（破口接线预览共用） */
  let partPreview = null;
  let partNudge = { x: 0, y: 0 };
  U.snapInfo = null;
  const inlineOrder = []; // 已展开面板的打开顺序（key），用于 LRU 收起，不依赖 DOM 位置


  /* ------------------------------ 初始化 ------------------------------ */
  U.init = function () {
    board = document.getElementById('board');
    hintEl = document.getElementById('hint');
    zoomEl = document.getElementById('zoomLabel');
    toastEl = document.getElementById('toast');
    textInput = document.getElementById('inlineText');

    buildTools();
    buildParts();
    bindPartButtons(document);
    bindTopbar();
    bindBoard();
    bindKeys();
    renderProps();
    U.render();
    const activeTab = document.querySelector('#tabs button.on');
    if (activeTab) {
      /* index.html 里所有 rgroup 默认 hidden；启动时必须按当前标签页显式展开 */
      document.querySelectorAll('#ribbon .rgroup').forEach((g) => {
        g.hidden = g.dataset.r !== activeTab.dataset.tab;
      });
      const first = document.querySelector(`.rgroup[data-r="${activeTab.dataset.tab}"] [data-cat]`);
      if (first) { first.classList.add('on'); U.showPartCat(first.dataset.cat, first); }
    }
    U.toast('就绪：上方选工具或部件，右侧调样式');

    // 恢复本地草稿
    try {
      const s = localStorage.getItem('drawphy.doc');
      if (s) {
        const d = JSON.parse(s);
        if (d && d.objects && d.objects.length) {
          M.fromJSON(d);
          U.render();
          U.toast('已恢复上次的草稿');
        }
      }
    } catch (e) { /* ignore */ }
  };

  /* 工具图标：统一 24×24、描边 currentColor，细线（明显比分类小组图标更细） */
  function buildTools() {}

  /* 统一应用样式：全局默认 + 选中对象 */
  function applyStyle(patch) {
    const sel = DP.sel.list();
    if (sel.length) DP.history.push('style');
    Object.assign(st.style, patch);
    sel.forEach((o) => { o.style = o.style || {}; Object.assign(o.style, patch); });
    autosave(); U.render(); renderProps();
    if (sel.length) U.toast('已应用样式到 ' + sel.length + ' 个对象');
  }

  /* ---------------------- 线型 / 线宽：线样下拉（不是平铺按钮） ----------------------
     原生 <select> 的 <option> 只能放文字、放不了图形，所以这里用轻量自绘下拉：
     收起态 = 当前取值的真实线样 + 名称/数值；展开态 = 一条纵向选项列表，每项也是真实线样。
     ribbon 样式面板与右侧属性面板共用同一套 HTML 生成器与事件绑定，避免两处漂移。
     菜单用 position:fixed 逃出 ribbon 的 overflow 裁剪（ribbon 高度固定、横向可滚动）。 */
  const CHEV = '<svg class="sdrop-chev" viewBox="0 0 10 6" width="8" height="5" fill="none" '
    + 'stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M1 1.2 5 5 9 1.2"/></svg>';

  /* 一段真实线样：pattern 为 dasharray，sw 为实际线宽（已按 viewBox 上限裁剪） */
  function lineSampleSvg(pattern, sw, color, wPx, hPx) {
    const da = pattern ? ` stroke-dasharray="${pattern}"` : '';
    return `<svg viewBox="0 0 40 12" width="${wPx}" height="${hPx}" fill="none" `
      + `stroke="${color || 'currentColor'}" stroke-width="${sw}" stroke-linecap="butt">`
      + `<line x1="1" y1="6" x2="39" y2="6"${da}/></svg>`;
  }
  function dashItemHtml(d, color) {
    return `<button type="button" class="sdrop-item" data-v="${d.id}">`
      + `<span class="sdrop-swatch">${lineSampleSvg(d.pattern, 2, color, 34, 11)}</span>`
      + `<span class="sdrop-txt">${d.name}</span></button>`;
  }
  function widthItemHtml(w, color) {
    /* 线样粗细按真实值画（上限 9，避免超出 12 高的 viewBox） */
    const sw = Math.min(9, Math.max(0.75, +w));
    return `<button type="button" class="sdrop-item" data-v="${w}">`
      + `<span class="sdrop-swatch">${lineSampleSvg('', sw, color, 26, 11)}</span>`
      + `<span class="sdrop-txt">${w}</span></button>`;
  }
  /* 线宽选项：预设 6 档 + 文档里的非预设值（打开旧文件时值不被悄悄改掉） */
  function widthOpts(cur) {
    const list = DP.style.WIDTHS.slice();
    if (list.indexOf(cur) < 0) list.push(cur);
    return list.sort((a, b) => a - b);
  }
  function styleDropHtml(id, kind, itemsHtml, cur) {
    const menu = itemsHtml.join('');
    const curEl = `<span class="sdrop-swatch"></span><span class="sdrop-txt"></span>`;
    return `<span class="sdrop" id="${id}" data-kind="${kind}">`
      + `<button type="button" class="sdrop-btn" title="点击选择">${curEl}${CHEV}</button>`
      + `<div class="sdrop-menu">${menu}</div></span>`;
  }
  /* 把下拉收起态同步到某个取值（找不到就补一项，非预设线宽用得上） */
  function setDropValue(drop, v, sampleFn) {
    if (!drop) return;
    const key = String(v);
    const items = Array.prototype.slice.call(drop.querySelectorAll('.sdrop-item'));
    let hit = items.filter((b) => b.dataset.v === key)[0];
    if (!hit && sampleFn) {
      const menu = drop.querySelector('.sdrop-menu');
      if (!menu) return;
      menu.insertAdjacentHTML('beforeend', sampleFn(v));
      hit = menu.lastElementChild;
    }
    if (!hit) return;
    items.forEach((b) => b.classList.toggle('on', b === hit));
    hit.classList.add('on');
    syncDropBtn(drop, hit);
  }
  function syncDropBtn(drop, item) {
    const sw = drop.querySelector('.sdrop-btn .sdrop-swatch');
    const tx = drop.querySelector('.sdrop-btn .sdrop-txt');
    const is = item.querySelector('.sdrop-swatch');
    const it = item.querySelector('.sdrop-txt');
    if (sw && is) sw.innerHTML = is.innerHTML;
    if (tx && it) tx.textContent = it.textContent;
  }
  /* 菜单 fixed 定位：贴按钮下方，空间不够就翻到上方，左右夹在视口内。
     data-menu-w 可指定菜单宽度（色板需要比按钮宽）。 */
  function placeDropMenu(drop) {
    const btn = drop.querySelector('.sdrop-btn');
    const menu = drop.querySelector('.sdrop-menu');
    if (!btn || !menu) return;
    const r = btn.getBoundingClientRect();
    const w = Math.max(r.width, +drop.dataset.menuW || 140);
    const h = menu.offsetHeight || 0;
    let top = r.bottom + 3;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 3);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    menu.style.width = w + 'px';
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
  }
  function closeDrops() {
    document.querySelectorAll('.sdrop.open').forEach((d) => d.classList.remove('open'));
  }
  function toggleDrop(drop) {
    const wasOpen = drop.classList.contains('open');
    closeDrops();
    if (!wasOpen) { drop.classList.add('open'); placeDropMenu(drop); }
  }
  /* 绑定一组线样下拉：事件委托在容器上，动态补进去的选项也能用。
     色板下拉(color-drop)由 bindColorDrop 单独绑定，这里跳过，避免 toggle 两次相互抵消 */
  function bindStyleDrops(root, onPick) {
    root.querySelectorAll('.sdrop:not(.color-drop)').forEach((drop) => {
      drop.addEventListener('click', (e) => {
        const t = e.target;
        const item = t.closest && t.closest('.sdrop-item');
        if (item && drop.contains(item)) {
          e.preventDefault();
          e.stopPropagation();
          drop.querySelectorAll('.sdrop-item').forEach((b) => b.classList.toggle('on', b === item));
          syncDropBtn(drop, item);
          drop.classList.remove('open');
          if (onPick) onPick(drop.dataset.kind, item.dataset.v, drop);
          return;
        }
        const btn = t.closest && t.closest('.sdrop-btn');
        if (btn && drop.contains(btn)) {
          e.stopPropagation();
          toggleDrop(drop);
        }
      });
    });
  }

  /* ------------------- 线条颜色 / 填充样式：色板下拉（参照经典办公布局） -------------------
     分区：自动色 → 标准 → 自定义(localStorage) → 文档中已使用的颜色 → 无填充(仅填充) / 其他颜色…
     「其他颜色…」唤起隐藏的原生取色器；新颜色自动存入自定义区。收起态 = 色块 + 颜色名。 */
  const COLOR_AUTO = ['#1f2d3d', '#ffffff', '#d64545', '#e08a1e', '#f2c14e', '#2fa860', '#0f9bb0', '#2e6fdb', '#7a3fb5', '#8c4510'];
  const COLOR_STD = [
    /* 灰阶 */
    '#000000', '#1a1a1a', '#333333', '#4d4d4d', '#666666', '#808080', '#999999', '#b3b3b3', '#d9d9d9', '#ffffff',
    /* 深色 */
    '#7f1d1d', '#7c2d12', '#78350f', '#713f12', '#365314', '#14532d', '#134e4a', '#164e63', '#1e3a8a', '#3b0764',
    /* 标准 */
    '#dc2626', '#ea580c', '#d97706', '#ca8a04', '#65a30d', '#16a34a', '#0d9488', '#0891b2', '#2563eb', '#7c3aed',
    /* 亮色 */
    '#f87171', '#fb923c', '#fbbf24', '#a3e635', '#4ade80', '#2dd4bf', '#38bdf8', '#818cf8', '#c084fc', '#f472b6',
    /* 浅色 */
    '#fecaca', '#fed7aa', '#fde68a', '#d9f99d', '#bbf7d0', '#99f6e4', '#bae6fd', '#c7d2fe', '#e9d5ff', '#fbcfe8',
  ];
  const COLOR_NAMES = {
    '#1f2d3d': '黑', '#22303c': '黑', '#000000': '黑', '#ffffff': '白', '#d64545': '红', '#e08a1e': '橙',
    '#f2c14e': '黄', '#2fa860': '绿', '#0f9bb0': '青', '#2e6fdb': '蓝', '#7a3fb5': '紫', '#8c4510': '棕',
  };
  function colorName(c) {
    if (!c || c === 'none') return '无填充';
    return COLOR_NAMES[String(c).toLowerCase()] || String(c).toUpperCase();
  }
  function customColors() {
    try { return JSON.parse(localStorage.getItem('drawphy.customColors') || '[]'); } catch (_) { return []; }
  }
  function addCustomColor(c) {
    if (!/^#[0-9a-f]{6}$/i.test(c)) return false;
    const saved = customColors();
    if (saved.indexOf(c) >= 0) return false;
    saved.unshift(c);
    localStorage.setItem('drawphy.customColors', JSON.stringify(saved.slice(0, 10)));
    return true;
  }
  /* 文档里已用到的颜色：扫描所有对象样式（排除 none），最多 20 个 */
  function usedColors(kind) {
    const out = [];
    st.objects.forEach((o) => {
      const c = (o.style || {})[kind];
      if (c && c !== 'none' && out.indexOf(c) < 0) out.push(c);
    });
    return out.slice(0, 20);
  }
  function palCell(c) {
    return `<button type="button" class="pal-c" data-c="${c}" title="${colorName(c)}" `
      + `style="background:${c}"></button>`;
  }
  function palGrid(list, cls) {
    if (!list.length) return '';
    return `<div class="pal-grid${cls ? ' ' + cls : ''}">${list.map(palCell).join('')}</div>`;
  }
  function colorDropHtml(id, kind) {
    const customs = customColors();
    const used = usedColors(kind);
    const isFill = kind === 'fill';
    const menu = `<div class="pal-sec">自动色</div>${palGrid(COLOR_AUTO)}`
      + `<div class="pal-sec">标准</div>${palGrid(COLOR_STD)}`
      + (customs.length ? `<div class="pal-sec">自定义</div>${palGrid(customs, 'pal-custom')}` : '<div class="pal-custom"></div>')
      + (used.length ? `<div class="pal-sec">文档中已使用的颜色</div>${palGrid(used)}` : '')
      + `<div class="pal-foot">`
      + (isFill ? `<button type="button" class="pal-none" data-c="none">无填充</button>` : '')
      + `<button type="button" class="pal-more">其他颜色…</button>`
      + `<input type="color" class="pal-input" aria-hidden="true" tabindex="-1"></div>`;
    return `<span class="sdrop color-drop" id="${id}" data-kind="${kind}" data-menu-w="204">`
      + `<button type="button" class="sdrop-btn" title="点击选择颜色">`
      + `<span class="cswatch"></span><span class="sdrop-txt"></span>${CHEV}</button>`
      + `<div class="sdrop-menu pal">${menu}</div></span>`;
  }
  /* 同步色板下拉收起态：色块、文字、菜单里的选中格 */
  function syncColorDrop(drop, c) {
    if (!drop) return;
    const cur = c || 'none';
    drop.dataset.cur = cur;
    const sw = drop.querySelector('.sdrop-btn .cswatch');
    if (sw) {
      sw.classList.toggle('is-none', cur === 'none');
      sw.style.background = cur === 'none' ? 'transparent' : cur;
    }
    const tx = drop.querySelector('.sdrop-btn .sdrop-txt');
    if (tx) tx.textContent = colorName(cur);
    drop.querySelectorAll('.pal-c').forEach((b) => b.classList.toggle('on', b.dataset.c.toLowerCase() === String(cur).toLowerCase()));
  }
  /* 重建所有打开中的色板的自定义区（新存的自定义色立即出现） */
  function refreshPaletteCustoms() {
    const saved = customColors();
    document.querySelectorAll('.sdrop-menu.pal').forEach((menu) => {
      const box = menu.querySelector('.pal-custom');
      if (!box) return;
      box.outerHTML = saved.length
        ? `<div class="pal-sec">自定义</div>${palGrid(saved, 'pal-custom')}`
        : '<div class="pal-custom"></div>';
    });
  }
  /* 绑定一个色板下拉：onPick(颜色或 'none')；其他颜色… 走隐藏原生取色器 */
  function bindColorDrop(drop, onPick) {
    if (!drop) return;
    drop.addEventListener('click', (e) => {
      const t = e.target;
      const cell = t.closest && t.closest('.pal-c');
      if (cell && drop.contains(cell)) {
        e.preventDefault();
        e.stopPropagation();
        drop.classList.remove('open');
        onPick(cell.dataset.c);
        return;
      }
      const none = t.closest && t.closest('.pal-none');
      if (none && drop.contains(none)) {
        e.preventDefault();
        e.stopPropagation();
        drop.classList.remove('open');
        onPick('none');
        return;
      }
      const more = t.closest && t.closest('.pal-more');
      if (more && drop.contains(more)) {
        e.stopPropagation();
        const inp = drop.querySelector('.pal-input');
        if (inp) {
          const cur = drop.dataset.cur;
          inp.value = /^#[0-9a-f]{6}$/i.test(cur) ? cur : '#1f2d3d';
          inp.click();
        }
        return;
      }
      const btn = t.closest && t.closest('.sdrop-btn');
      if (btn && drop.contains(btn)) {
        e.stopPropagation();
        toggleDrop(drop);
      }
    });
    const inp = drop.querySelector('.pal-input');
    if (inp) inp.addEventListener('change', () => onPick(inp.value));
  }

  /* ------------------------------ 数据驱动面板 ------------------------------ */
  /* 文件/排列/视图 的竖排分类按钮（index.html 静态）→ 展开面板（本表驱动）。
     每个动作保留原有 id 或 data-act 契约；按钮在 #ribInline 打开时动态生成、
     在 toggleRibInline 构建块内一次性绑定。 */
  const ACT = {
    btnNew: () => {
      if (!confirm('新建会清空当前画布，继续？')) return;
      st.objects = []; st.selection = new Set(); st.groups = {};
      DP.history.reset(); U.render(); renderProps(); autosave();
    },
    btnOpen: () => document.getElementById('fileInput').click(),
    btnSave: () => DP.io.saveJson(),
    btnUndo: () => { if (DP.history.undo()) { U.render(); renderProps(); } },
    btnRedo: () => { if (DP.history.redo()) { U.render(); renderProps(); } },
    btnPng: () => DP.io.png(2, false),
    btnSvg: () => DP.io.svg(),
    btnCopy: () => DP.io.copyPng(),
    btnSample: () => DP.io.sample(),
    btnHelp: () => toggleHelp(),
    btnGroup: () => group(),
    btnUngroup: () => ungroup(),
    btnFit: () => U.fit(),
    btnZoomIn: () => U.zoomBy(1.2),
    btnZoomOut: () => U.zoomBy(1 / 1.2),
  };
  const PANELS = {
    'file.action': { items: [
      { id: 'btnNew', label: '新建' }, { id: 'btnOpen', label: '打开' }, { id: 'btnSave', label: '保存' },
      { id: 'btnUndo', label: '撤销' }, { id: 'btnRedo', label: '重做' }] },
    'file.export': { items: [
      { id: 'btnPng', label: '导出 PNG' }, { id: 'btnSvg', label: '导出 SVG' }, { id: 'btnCopy', label: '复制图片' }] },
    'file.sample': { items: [{ id: 'btnSample', label: '示例' }] },
    'file.help': { items: [{ id: 'btnHelp', label: '快捷键' }] },
    'align.group': { items: [{ id: 'btnGroup', label: '组合' }, { id: 'btnUngroup', label: '取消组合' }] },
    'align.layer': { items: [
      { act: 'top', label: '置顶' }, { act: 'bottom', label: '置底' }, { act: 'up', label: '上移' }, { act: 'down', label: '下移' }] },
    'align.transform': { items: [
      { act: 'r90', label: '旋转+90°' }, { act: 'r-90', label: '旋转-90°' }, { act: 'mh', label: '水平镜像' }, { act: 'mv', label: '垂直镜像' }] },
    'align.align': { items: [
      { act: 'a-left', label: '左对齐' }, { act: 'a-cx', label: '水平居中' }, { act: 'a-right', label: '右对齐' },
      { act: 'a-top', label: '顶对齐' }, { act: 'a-cy', label: '垂直居中' }, { act: 'a-bottom', label: '底对齐' }] },
    'view.display': { items: [
      { id: 'bgToggle', label: '网格', check: true }, { id: 'snapToggle', label: '吸附', check: true }] },
    'view.zoom': { items: [
      { id: 'btnFit', label: '适应画布' }, { id: 'btnZoomIn', label: '放大' }, { id: 'btnZoomOut', label: '缩小' }] },
  };

  /* 从 registry 生成工具列表：模块工具按 registry order 排序，
     非模块工具（alias / 独立工具）按 TOOLS 原序追加。
     'select' 恒定首位；跳过无对应 TOOLS 条目的间接类型（如 path）。 */
  function toolsFromRegistry(group) {
    const regSlots = DP.registry.menuSlots('draw', group);
    const seen = {};
    const out = [];
    const sel = TOOLS.find(t => t.g === group && t.id === 'select');
    if (sel) { out.push(sel); seen.select = true; }
    for (const slot of regSlots) {
      if (seen[slot.type]) continue;
      const tool = TOOLS.find(t => t.id === slot.type);
      if (tool) { out.push(tool); seen[slot.type] = true; }
    }
    for (const t of TOOLS) {
      if (t.g === group && !seen[t.id]) { out.push(t); seen[t.id] = true; }
    }
    return out;
  }

  /* 在 ribbon 内就地展开/收起：可同时多个，超宽时关最早开的 */
  function toggleRibInline(key, anchor) {
    const existing = document.querySelector(`#ribInline[data-key="${key}"]`);
    if (existing) {
      existing.remove();
      const oi = inlineOrder.indexOf(key);
      if (oi >= 0) inlineOrder.splice(oi, 1);
      return;
    }
    const toolBtn = (t) => `<button class="tool rib-part" data-tool="${t.id}" title="${t.name}（${t.key}）">
      <span class="part-thumb">${IC(ICONS[t.id] || '')}</span><span class="part-name">${t.name}</span></button>`;
    const actBtn = (label, act) => `<button class="rib-act" data-act="${act}">${label}</button>`;
    let inner = '';
    if (key === 'shape' || key === 'text') {
      let list = toolsFromRegistry(key);
      inner = `<div class="part-grid3">${list.map(toolBtn).join('')}</div>`;
    } else if (key === 'edit') {
      let list = TOOLS.filter((t) => t.g === key);
      inner = `<div class="part-grid3">${list.map(toolBtn).join('')}</div>`;
    } else if (key === 'style') {
      /* 线型/线宽一律从 DP.style 取（唯一数据源）：新增线型只改 core/style.js */
      const curW = DP.style.normWidth(st.style.width);
      const dashDrop = styleDropHtml('swDash', 'dash',
        DP.style.DASHES.map((d) => dashItemHtml(d)), st.style.dash);
      const widthDrop = styleDropHtml('swWidth', 'width',
        widthOpts(curW).map((w) => widthItemHtml(w)), curW);
      inner = `<div class="style-grid3">
        <div class="style-row">
          <span class="style-label">线条颜色</span>
          ${colorDropHtml('swStroke', 'stroke')}
        </div>
        <div class="style-row">
          <span class="style-label">线型</span>
          ${dashDrop}
        </div>
        <div class="style-row">
          <span class="style-label">线宽</span>
          ${widthDrop}
        </div>
        <div class="style-row">
          <span class="style-label">填充样式</span>
          ${colorDropHtml('swFill', 'fill')}
        </div>
      </div>`;
    } else if (PANELS[key]) {
      /* 文件/排列/视图：数据驱动动作面板（沿用 rib-acts/pp-row/rib-act 风格） */
      const itemBtn = (it) => it.check
        ? `<label class="chk"><input type="checkbox" id="${it.id}">${it.label}</label>`
        : it.act
          ? `<button class="rib-act" data-act="${it.act}">${it.label}</button>`
          : `<button class="rib-act" id="${it.id}">${it.label}</button>`;
      inner = `<div class="rib-acts"><div class="pp-row">${PANELS[key].items.map(itemBtn).join('')}</div></div>`;
    } else {
      const items = DP.parts.list.filter((p) => p.cat === key);
      inner = `<div class="part-grid3">${items.map((p) =>
        `<button class="part rib-part" data-part="${p.id}" title="${p.name}">
          <span class="part-thumb">${DP.render.partThumb(p.id, 48)}</span><span class="part-name">${p.name}</span></button>`).join('')}</div>`;
    }
    const el = document.createElement('div');
    el.id = 'ribInline';
    el.dataset.key = key;
    el.innerHTML = inner;
    anchor.parentNode.insertBefore(el, anchor.nextSibling);
    inlineOrder.push(key);
    el.querySelectorAll('[data-tool]').forEach((b) => b.addEventListener('click', () => U.setTool(b.dataset.tool)));
    el.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
      const a = b.dataset.act;
      if (a === 'r90') U.rotate(90); else if (a === 'r-90') U.rotate(-90);
      else if (a === 'mh') U.mirror('h'); else if (a === 'mv') U.mirror('v');
      else if (['top','bottom','up','down'].includes(a)) U.layer(a);
      else if (a.startsWith('a-')) U.align(a.slice(2));
    }));
    /* 动态 id 按钮 → ACT 表一次性绑定（面板每次打开时绑定，随面板销毁） */
    el.querySelectorAll('button[id]').forEach((b) => b.addEventListener('click', () => {
      const fn = ACT[b.id];
      if (fn) fn();
    }));
    /* 视图 checkbox：勾选交互 + 打开面板时同步当前状态 */
    el.querySelectorAll('input[type=checkbox][id]').forEach((c) => c.addEventListener('change', () => {
      if (c.id === 'bgToggle') { st.page.grid = c.checked; U.render(); autosave(); }
      else if (c.id === 'snapToggle') { st.snap.anchors = c.checked; st.snap.grid = c.checked; U.render(); }
    }));
    const bgCk = el.querySelector('#bgToggle'), snCk = el.querySelector('#snapToggle');
    if (bgCk) bgCk.checked = st.page.grid !== false;
    if (snCk) snCk.checked = st.snap.anchors !== false;
    bindPartButtons(el);
    /* 样式控件的取值随当前对象/全局样式同步（线样下拉 + 色板下拉） */
    const markStyleBtns = () => {
      const cur = (DP.sel.list()[0] || {}).style || st.style;
      setDropValue(el.querySelector('#swDash'), cur.dash,
        (v) => dashItemHtml({ id: v, name: v, pattern: DP.style.dashArray(v) }, cur.stroke));
      setDropValue(el.querySelector('#swWidth'), DP.style.normWidth(cur.width),
        (v) => widthItemHtml(v, cur.stroke));
      syncColorDrop(el.querySelector('#swStroke'), cur.stroke);
      syncColorDrop(el.querySelector('#swFill'), cur.fill || 'none');
    };
    const applyAndMark = (patch) => { applyStyle(patch); markStyleBtns(); };
    /* 色板选色：新颜色进自定义区并立即在打开中的色板里出现 */
    const pickColor = (key) => (c) => {
      if (c !== 'none' && addCustomColor(c)) refreshPaletteCustoms();
      applyAndMark(key === 'stroke' ? { stroke: c } : { fill: c });
    };
    bindColorDrop(el.querySelector('#swStroke'), pickColor('stroke'));
    bindColorDrop(el.querySelector('#swFill'), pickColor('fill'));
    bindStyleDrops(el, (kind, v) => applyAndMark(kind === 'dash' ? { dash: v } : { width: +v }));
    markStyleBtns();
    const rib = document.getElementById('ribbon');
    while (rib.scrollWidth > rib.clientWidth + 2) {
      if (inlineOrder.length <= 1) break;
      const oldest = inlineOrder[0];
      const oldEl = document.querySelector(`#ribInline[data-key="${oldest}"]`);
      if (oldEl) oldEl.remove();
      inlineOrder.shift();
    }
  }

  /* 部件：点第二层分类按钮 → 在 ribbon 内就地展开该类部件网格 */
  function buildParts() {
    U.showPartCat = (cat, anchor) => toggleRibInline(cat, anchor);
  }

  function overBoard(ev) {
    const r = board.getBoundingClientRect();
    return ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
  }

  /* -------------------- 破口接线：把元器件插入到已有导线上 --------------------
     几何/数据逻辑在 core.js（M.planPartAt / M.insertPartIntoScene / M.breakWireInto），
     这里只做吸附、历史、选中、提示与预览。 */
  function placePartAt(pid, world, keepTool) {
    const def = DP.parts.byId[pid];
    if (!def) return;
    const sp = DP.snap.resolve(world, { radius: 11 / st.view.k });
    DP.history.push();
    const plan = M.insertPartIntoScene(pid, { x: sp.x + partNudge.x, y: sp.y + partNudge.y });
    const broke = !!(plan && plan.broke);
    partNudge = { x: 0, y: 0 };
    DP.sel.set([plan.obj.id]);
    if (!keepTool) U.setTool('select');
    afterChange();
    U.toast(broke
      ? `已把「${def.name}」接入导线：导线自动断成两段，拖动元器件导线会跟随`
      : `已放入「${def.name}」，可直接拖动调整位置`);
  }
  /* 自检钩子：按世界坐标直接放置（_check/test.html 驱动破口接线断言用） */
  U._testInsertPart = function (pid, wx, wy) {
    placePartAt(pid, { x: wx, y: wy }, false);
    const objs = DP.state.objects;
    return objs[objs.length - 1];
  };

  /* ---------------------- 部件库拖入画布（带预览） ---------------------- */
  let partDrag = null;
  let suppressPartClick = false;

  function startPartDrag(ev, pid) {
    if (ev.button !== 0) return;
    const def = DP.parts.byId[pid];
    if (!def) return;
    const drag = { pid, def, sx: ev.clientX, sy: ev.clientY, active: false, ghost: null, over: false };

    const move = (e) => {
      if (partDrag !== drag) return;
      if (!drag.active) {
        if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 5) return;
        drag.active = true;
        drag.ghost = document.createElement('div');
        drag.ghost.className = 'drag-ghost';
        drag.ghost.innerHTML =
          `<span class="dg-thumb">${DP.render.partThumb(pid, 44)}</span>` +
          `<span class="dg-name">${DP.render.escape(def.name)}</span>`;
        document.body.appendChild(drag.ghost);
        if (e.cancelable) e.preventDefault();
      }
      drag.over = overBoard(e);
      drag.ghost.style.left = e.clientX + 'px';
      drag.ghost.style.top = e.clientY + 'px';
      drag.ghost.classList.toggle('over', drag.over);
    };

    const up = (e) => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      if (drag.ghost) drag.ghost.remove();
      partDrag = null;
      if (!drag.active) return; // 未移动：交给 click 走「选中部件工具」
      suppressPartClick = true;
      setTimeout(() => { suppressPartClick = false; }, 0);
      if (overBoard(e)) placePartAt(pid, toWorld(e), false);
      else U.toast('已取消放置：请把部件拖到画布内再松手');
    };

    partDrag = drag;
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
  }

  function bindPartButton(btn) {
    if (btn.dataset.dpBound) return;
    btn.dataset.dpBound = '1';
    const pid = btn.dataset.part;
    btn.addEventListener('pointerdown', (e) => startPartDrag(e, pid));
    btn.addEventListener('click', () => {
      if (suppressPartClick) { suppressPartClick = false; return; }
      const def = DP.parts.byId[pid];
      /* 连接线类（drawTool）：点击 = 直接进入绘制工具，连线是「画」出来的而不是摆固定件；
         想放固定符号时仍可把按钮拖到画布。 */
      if (def && def.drawTool) {
        if (def.drawStyle) Object.assign(st.style, def.drawStyle);
        U.setTool(def.drawTool);
        U.toast(`${def.name}：${def.drawHint || '在画布上绘制'}（拖到画布可放固定符号）`);
        return;
      }
      U.setTool('part', { partId: pid });
    });
  }

  function bindPartButtons(root) {
    root.querySelectorAll('.part[data-part]').forEach(bindPartButton);
  }

  /* ------------------------------ 部件浮层 ------------------------------ */
  U.closePartPop = function () {
    const pop = document.getElementById('partPop');
    if (pop) pop.hidden = true;
  };
  /* S 键：打开第一个分类的部件 */
  U.toggleDrawer = function () {
    const b = document.querySelector('#ribbon [data-cat]');
    if (b) U.showPartCat(b.dataset.cat, b);
  };
  /* ------------------------------ 右键菜单 ------------------------------ */
  function onContext(e) {
    e.preventDefault();
    closeCtx();
    /* 多步绘制：右键收笔（折线 / 贝塞尔 / 直角连线），不弹菜单、不切工具 */
    if (D && isMultiStep(D)) { finishMulti(e.shiftKey); return; }
    /* 右键出现菜单时：释放当前选中的工具图标，自动回到选择模式 */
    if (st.tool !== 'select') U.setTool('select');
    const p = toWorld(e);
    const hit = hitTest(p, 7 / st.view.k);
    if (hit && !st.selection.has(hit.id)) {
      st.selection = DP.sel.expand(new Set([hit.id]));
      renderProps();
      U.render();
    }
    openCtx(e.clientX, e.clientY, p);
  }

  function closeCtx() {
    const m = document.getElementById('ctxMenu');
    if (m) m.remove();
  }

  function pasteAt(world) {
    if (!st.clipboard) return;
    DP.history.push();
    const cloned = M.clone(st.clipboard);
    const bb = M.bbox(cloned);
    const dx = world.x - (bb.x + bb.w / 2);
    const dy = world.y - (bb.y + bb.h / 2);
    const ids = [];
    for (const o of cloned) {
      o.id = M.uid(o.type.slice(0, 2));
      M.translateObj(o, dx, dy);
      delete o.group;
      st.objects.push(o);
      ids.push(o.id);
    }
    DP.sel.set(ids);
    afterChange();
  }

  function openCtx(x, y, world) {
    const n = DP.sel.list().length;
    const hasClip = !!st.clipboard;
    const items = [];
    const add = (label, kbd, fn, danger) => items.push({ label, kbd, fn, danger });
    if (n) {
      add('复制', 'Ctrl+C', () => copySelection());
      add('原地复制一份', 'Ctrl+D', () => duplicateSelection());
      if (hasClip) add('粘贴到此处', 'Ctrl+V', () => pasteAt(world));
      items.push('sep');
      add('旋转 +90°', '', () => U.rotate(90));
      add('旋转 -90°', '', () => U.rotate(-90));
      add('水平镜像', '', () => U.mirror('h'));
      add('垂直镜像', '', () => U.mirror('v'));
      items.push('sep');
      add('置顶', '', () => U.layer('top'));
      add('置底', '', () => U.layer('bottom'));
      add('上移一层', '', () => U.layer('up'));
      add('下移一层', '', () => U.layer('down'));
      items.push('sep');
      add('组合', 'Ctrl+G', () => group());
      add('取消组合', '', () => ungroup());
      items.push('sep');
      add('删除', 'Del', () => deleteSelection(), true);
    } else {
      if (hasClip) add('粘贴', 'Ctrl+V', () => pasteAt(world));
      add('全选', 'Ctrl+A', () => {
        st.selection = new Set(st.objects.map((o) => o.id));
        renderProps(); U.render();
      });
      items.push('sep');
      add('撤销', 'Ctrl+Z', () => { if (DP.history.undo()) { U.render(); renderProps(); } });
      add('重做', 'Ctrl+Y', () => { if (DP.history.redo()) { U.render(); renderProps(); } });
      items.push('sep');
      add('适应画布', 'Ctrl+0', () => U.fit());
      add('打开部件库', 'S', () => U.toggleDrawer(true));
    }

    const m = document.createElement('div');
    m.id = 'ctxMenu';
    m.innerHTML = items.map((it, i) => (it === 'sep')
      ? '<div class="sep"></div>'
      : `<div class="mi${it.danger ? ' danger' : ''}" data-i="${i}"><span>${it.label}</span>${it.kbd ? `<span class="kbd">${it.kbd}</span>` : ''}</div>`
    ).join('');
    document.body.appendChild(m);
    m.querySelectorAll('.mi').forEach((el) => el.addEventListener('click', () => {
      const it = items[+el.dataset.i];
      closeCtx();
      if (it && it.fn) it.fn();
    }));
    const r = m.getBoundingClientRect();
    m.style.left = Math.min(x, innerWidth - r.width - 8) + 'px';
    m.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
    /* 点菜单外任意处关闭 */
    const off = (ev) => {
      if (m.contains(ev.target)) return;
      closeCtx();
      document.removeEventListener('pointerdown', off, true);
    };
    document.addEventListener('pointerdown', off, true);
  }

  U.setTool = function (id, opts) {
    st.tool = id;
    st.toolOpts = opts || {};
    D = null;
    U.snapInfo = null;
    partPreview = null;
    partNudge = { x: 0, y: 0 };
    document.querySelectorAll('.tool').forEach((b) => b.classList.toggle('on', b.dataset.tool === id));
    document.querySelectorAll('.part').forEach((b) => {
      const on = id === 'part' && st.toolOpts.partId === b.dataset.part;
      b.classList.toggle('on', on);
    });
    board.style.cursor = CURSORS[id] || 'default';
    const t = TOOLS.find((x) => x.id === id);
    U.hint(id === 'part' ? `放置部件：${DP.parts.byId[st.toolOpts.partId] ? DP.parts.byId[st.toolOpts.partId].name : ''}（放在导线上会自动破口接入；方向键微调，Esc 退出）` : t ? `${t.name}：${t.hint}` : '');
    U.render();
  };

  const CURSORS = {
    select: 'default', line: 'crosshair', arrow: 'crosshair', ray: 'crosshair', darrow: 'crosshair', polyline: 'crosshair',
    polygon: 'crosshair', ortho: 'crosshair', rect: 'crosshair', ellipse: 'crosshair', circle: 'crosshair',
    arc: 'crosshair', freehand: 'crosshair', text: 'text', dim: 'crosshair',
    angle: 'crosshair', trim: 'crosshair', eraser: 'crosshair', fill: 'crosshair', part: 'copy',
    bezier: 'crosshair', textbox: 'crosshair', callout: 'crosshair',
  };

  /* --------------------------- 顶栏 / 属性面板 --------------------------- */
  function bindTopbar() {
    /* 顶部样式控件实际在 ribbon 内联面板中，由 toggleRibInline 绑定；此处只挂全局收起逻辑 */
    /* 线样/色板下拉：点空白处 / 滚动 / 按 Esc 收起（全局一次，避免面板反复打开时重复挂载） */
    document.addEventListener('click', (e) => {
      if (!e.target.closest || !e.target.closest('.sdrop')) closeDrops();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrops(); });
    window.addEventListener('scroll', closeDrops, true);
    document.getElementById('fileInput').addEventListener('change', (e) => {
      const f = e.target.files[0];
      if (!f) return;
      DP.io.openJson(f).then(() => { U.fit(); renderProps(); U.toast('已打开：' + f.name); });
      e.target.value = '';
    });
    /* 部件分类按钮：点击就地展开/收起 */
    document.querySelectorAll('#ribbon [data-cat]').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const bar = b.parentElement;
        bar.querySelectorAll(':scope > button.on').forEach((o) => { if (o !== b) o.classList.remove('on'); });
        b.classList.toggle('on');
        U.showPartCat(b.dataset.cat, b);
      });
    });
    /* 标签页切换 */
    document.querySelectorAll('#tabs button').forEach((b) => {
      b.addEventListener('click', () => {
        document.querySelectorAll('#tabs button').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
        const t = b.dataset.tab;
        document.querySelectorAll('#ribbon .rgroup').forEach((g) => { g.hidden = g.dataset.r !== t; });
        const first = document.querySelector(`.rgroup[data-r="${t}"] [data-cat]`);
        if (first && !document.querySelector(`#ribInline[data-key="${first.dataset.cat}"]`)) {
          first.classList.add('on');
          U.showPartCat(first.dataset.cat, first);
        }
      });
    });
    board.addEventListener('contextmenu', onContext);
  }

  /* ------------------------------ 快捷键帮助面板 ------------------------------ */
  /* 数据驱动：工具快捷键一律从 TOOLS 生成，避免与 TOOLS 两处不一致。
     旧 aside 速查表已删除（原表 M=标注 为错记，且漏 J/O/D/H/Q/Z），
     本面板自动与 TOOLS 保持一致。 */
  let helpPanelEl = null;
  function buildHelpHtml() { return U.helpHtml ? U.helpHtml() : ''; }
  function closeHelp() {
    if (helpPanelEl) { helpPanelEl.remove(); helpPanelEl = null; }
  }
  function toggleHelp() {
    if (helpPanelEl) { closeHelp(); return; }
    const stage = document.querySelector('.stage');
    if (!stage) return;
    helpPanelEl = document.createElement('div');
    helpPanelEl.id = 'helpPanel';
    helpPanelEl.setAttribute('style',
      'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:8;' +
      'background:rgba(255,255,255,.98);border:1px solid #e5eaf0;border-radius:12px;' +
      'box-shadow:0 12px 32px rgba(20,40,60,.18);padding:16px 20px;' +
      'max-width:440px;max-height:80%;overflow:auto;');
    helpPanelEl.innerHTML =
      `<div class="props-title" style="display:flex;align-items:center;justify-content:space-between;margin:0 0 8px">` +
      `<span>快捷键</span>` +
      `<button class="mini" id="btnHelpClose" style="height:22px;padding:0 10px">关闭</button></div>` +
      buildHelpHtml();
    stage.appendChild(helpPanelEl);
    helpPanelEl.querySelector('#btnHelpClose').addEventListener('click', closeHelp);
  }
  U.toggleHelp = toggleHelp;
  U.closeHelp = closeHelp;

  /* ------------------------------ 渲染主循环 ------------------------------ */
  U.render = function () {
    if (!board) return;
    if (M.applyBindings) M.applyBindings();
    const rect = board.getBoundingClientRect();
    const W = Math.max(1, Math.round(rect.width)), H = Math.max(1, Math.round(rect.height));
    const v = st.view;
    const page = st.page;
    let s = '';
    s += `<rect x="0" y="0" width="${W}" height="${H}" fill="#f3f5f8"/>`;
    s += `<g transform="translate(${G.round(v.x)},${G.round(v.y)}) scale(${v.k})">`;
    s += `<rect x="0" y="0" width="${page.w}" height="${page.h}" fill="${page.bg}" stroke="#c9d2dc" stroke-width="${1 / v.k}"/>`;
    if (page.grid && v.k > 0.35) s += DP.render.gridPath(page, '#e6ebf1', st.snap.gridSize);
    s += DP.render.objects(st.objects);
    if (partPreview) s += previewPartSvg();
    if (D && D.preview) s += `<g opacity="0.8">${DP.render.object(D.preview)}</g>`;
    s += overlaySvg();
    s += `</g>`;
    board.setAttribute('viewBox', `0 0 ${W} ${H}`);
    board.innerHTML = s;
    if (zoomEl) zoomEl.textContent = Math.round(v.k * 100) + '%';
  };

  /* 部件放置预览：导线会被破口时先盖掉那一小段（页面底色），再画半透明部件与端子点 */
  function previewPartSvg() {
    const pv = partPreview;
    if (!pv || !pv.obj) return '';
    const pvStyle = pv.obj.style || st.style;
    let out = '';
    if (pv.wire) {
      const pair = M.partThroughPair(DP.parts.byId[pv.obj.partId]);
      const a = pair && M.terminalPoint(pv.obj, pair[0].id);
      const b = pair && M.terminalPoint(pv.obj, pair[1].id);
      if (a && b) {
        /* 破口：先盖住导线上将被替换的一段 */
        out += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${st.page.bg}" `
          + `stroke-width="${(pvStyle.width || 2) + 10}" stroke-linecap="butt"/>`;
        const r = 3.2 / st.view.k;
        out += `<circle cx="${a.x}" cy="${a.y}" r="${r}" fill="#0a84ff"/>`
          + `<circle cx="${b.x}" cy="${b.y}" r="${r}" fill="#0a84ff"/>`;
      }
    }
    out += `<g opacity="0.72">${DP.render.object(pv.obj)}</g>`;
    return out;
  }

  function overlaySvg() {
    let s = '';
    const objs = DP.sel.list();
    if (objs.length) {
      const bb = M.bbox(objs);
      if (bb && bb.w >= 0) {
        const pad = 3 / st.view.k;
        s += `<rect x="${bb.x - pad}" y="${bb.y - pad}" width="${bb.w + 2 * pad}" height="${bb.h + 2 * pad}"
          fill="none" stroke="#0a84ff" stroke-width="${1.4 / st.view.k}" stroke-dasharray="${4 / st.view.k} ${3 / st.view.k}"/>`;
        if (st.tool === 'select') {
          const hs = 5 / st.view.k;
          const k = st.view.k;
          /* 节点手柄：锚点空心小方块；曲线控制把柄圆点 + 牵引虚线（EE 节点控制） */
          if (objs.length === 1) {
            const nodes = getNodes(objs[0]);
            const hs2 = 4.5 / k;
            const cr = 3.2 / k;
            for (const n of nodes) {
              if (n.kind !== 'ctrl' || n.ax == null) continue;
              s += `<line x1="${G.round(n.ax)}" y1="${G.round(n.ay)}" x2="${G.round(n.x)}" y2="${G.round(n.y)}"
                stroke="#0a84ff" stroke-width="${G.round(1 / k)}" stroke-dasharray="${G.round(3 / k)} ${G.round(2.5 / k)}" opacity="0.7"/>`;
            }
            for (const n of nodes) {
              if (n.kind === 'ctrl') {
                s += `<circle cx="${G.round(n.x)}" cy="${G.round(n.y)}" r="${G.round(cr)}"
                  fill="#0a84ff" stroke="#ffffff" stroke-width="${G.round(1.1 / k)}"/>`;
                continue;
              }
              const bound = objs[0].bind && objs[0].bind[n.key];
              s += `<rect x="${G.round(n.x - hs2)}" y="${G.round(n.y - hs2)}" width="${G.round(hs2 * 2)}" height="${G.round(hs2 * 2)}"
                fill="${bound ? '#ff9f0a' : '#ffffff'}" stroke="#0a84ff" stroke-width="${G.round(1.3 / k)}"/>`;
            }
          }
          /* 部件旋转手柄 */
          if (objs.length === 1 && objs[0].type === 'part') {
            const cx = G.round(bb.x + bb.w / 2);
            const top = G.round(bb.y - 26 / k);
            s += `<line x1="${cx}" y1="${G.round(bb.y)}" x2="${cx}" y2="${top}" stroke="#0a84ff" stroke-width="${G.round(1 / k)}"/>`;
            s += `<circle cx="${cx}" cy="${top}" r="${G.round(5 / k)}" fill="#ffffff" stroke="#0a84ff" stroke-width="${G.round(1.3 / k)}"/>`;
            s += `<path d="M${G.round(bb.x + bb.w / 2 - 3 / k)} ${G.round(top + 5 / k)} A ${G.round(4 / k)} ${G.round(4 / k)} 0 0 1 ${G.round(bb.x + bb.w / 2 + 3.4 / k)} ${G.round(top + 3.6 / k)}" fill="none" stroke="#0a84ff" stroke-width="${G.round(1.2 / k)}"/>`;
          }
          const pts = [
            [bb.x, bb.y], [bb.x + bb.w, bb.y], [bb.x + bb.w, bb.y + bb.h], [bb.x, bb.y + bb.h],
          ];
          s += pts.map(([x, y]) =>
            `<rect x="${x - hs}" y="${y - hs}" width="${hs * 2}" height="${hs * 2}" fill="#fff" stroke="#0a84ff" stroke-width="${1.2 / st.view.k}"/>`
          ).join('');
        }
      }
    }
    if (D && D.mode === 'marquee' && D.start && D.cur) {      const x = Math.min(D.start.x, D.cur.x), y = Math.min(D.start.y, D.cur.y);
      const w = Math.abs(D.cur.x - D.start.x), h = Math.abs(D.cur.y - D.start.y);
      s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="rgba(10,132,255,.08)" stroke="#0a84ff" stroke-width="${1 / st.view.k}" stroke-dasharray="${4 / st.view.k} ${3 / st.view.k}"/>`;
    }
    if (D && D.mode === 'zoombox' && D.start && D.cur) {
      const x = Math.min(D.start.x, D.cur.x), y = Math.min(D.start.y, D.cur.y);
      const w = Math.abs(D.cur.x - D.start.x), h = Math.abs(D.cur.y - D.start.y);
      s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="rgba(255,159,10,.1)" stroke="#ff9f0a" stroke-width="${1.2 / st.view.k}" stroke-dasharray="${5 / st.view.k} ${3 / st.view.k}"/>`;
    }
    if (U.snapInfo) {
      const { x, y, label } = U.snapInfo;
      const r = 5 / st.view.k;
      s += `<g stroke="#ff9f0a" stroke-width="${1.6 / st.view.k}" fill="none">
        <circle cx="${x}" cy="${y}" r="${r}"/>
        <line x1="${x - r * 2}" y1="${y}" x2="${x + r * 2}" y2="${y}"/>
        <line x1="${x}" y1="${y - r * 2}" x2="${x}" y2="${y + r * 2}"/></g>`;
      if (label && st.view.k > 0.5) {
        s += `<text x="${x + r * 2.4}" y="${y - r * 1.6}" font-size="${11 / st.view.k}" fill="#ff9f0a"
          font-family="'Microsoft YaHei',sans-serif">${label}</text>`;
      }
    }
    /* 对齐参考线（拖动时） */
    if (D && D.guides && D.guides.length) {
      const k = st.view.k;
      s += `<g stroke="#ff2d78" stroke-width="${G.round(1 / k)}" stroke-dasharray="${G.round(5 / k)} ${G.round(4 / k)}" opacity="0.9">` +
        D.guides.map((g) => `<line x1="${G.round(g.x1)}" y1="${G.round(g.y1)}" x2="${G.round(g.x2)}" y2="${G.round(g.y2)}"/>`).join('') + '</g>';
    }
    /* 尺寸/位移浮动标签 */
    if (D && D.badge) {
      const k = st.view.k;
      const fs = Math.round(11 / k);
      const w = D.badge.text.length * fs * 0.62 + 10 / k;
      s += `<g><rect x="${G.round(D.badge.x)}" y="${G.round(D.badge.y - fs * 1.5)}" width="${G.round(w)}" height="${G.round(fs * 1.9)}"
        fill="rgba(20,32,42,.88)" rx="${G.round(3 / k)}"/>
        <text x="${G.round(D.badge.x + 5 / k)}" y="${G.round(D.badge.y - fs * 0.22)}" font-size="${fs}" fill="#fff"
        font-family="'Microsoft YaHei',sans-serif">${D.badge.text}</text></g>`;
    }
    return s;
  }

  /* ------------------------------- 坐标换算 ------------------------------- */
  function toWorld(ev) {
    const r = board.getBoundingClientRect();
    return {
      x: (ev.clientX - r.left - st.view.x) / st.view.k,
      y: (ev.clientY - r.top - st.view.y) / st.view.k,
    };
  }

  function snap(p, opts) {
    opts = opts || {};
    const res = DP.snap.resolve(p, {
      exclude: opts.exclude || null,
      from: opts.from || null,
      shift: opts.shift || false,
      radius: opts.radius || 11 / st.view.k,
    });
    U.snapInfo = res.label ? { x: res.x, y: res.y, label: res.label } : null;
    return { x: res.x, y: res.y, oid: res.oid || null, terminal: res.terminal || null };
  }

  /* ------------------------------- 命中测试 ------------------------------- */
  function hitObject(o, p, tol) {
    const mod = M.moduleOf(o);
    if (mod && typeof mod.hitTest === 'function') return !!mod.hitTest(o, p, tol);
    /* 单轨收敛：未注册类型不可命中 */
    return false;
  }

  /* 两段式命中（阶段 6.3）：先用包围盒（容差外扩 4px）粗筛，再交给模块精细命中。
     800 对象场景下把绝大多数对象挡在 O(1) 的包围盒判断里。 */
  function hitTest(p, tol) {
    const pad = tol + 4;
    for (let i = st.objects.length - 1; i >= 0; i--) {
      const o = st.objects[i];
      const bb = M.localBBox(o);
      if (bb.w > 0 || bb.h > 0) {
        if (p.x < bb.x - pad || p.x > bb.x + bb.w + pad || p.y < bb.y - pad || p.y > bb.y + bb.h + pad) continue;
      }
      if (hitObject(o, p, tol)) return o;
    }
    return null;
  }

  /* 节点控制：列出单个对象可编辑的节点（EE 空心小方块）
     kind: 'anchor' 形状锚点 / 'ctrl' 曲线控制把柄（画成圆点 + 牵引虚线） */
  function getNodes(o) {
    const mod = M.moduleOf(o);
    if (mod && typeof mod.nodes === 'function') {
      return (mod.nodes(o) || []).map((n) => ({
        key: n.id, x: n.x, y: n.y,
        kind: n.kind || 'anchor',
        ax: n.ax, ay: n.ay,
      }));
    }
    return [];
  }

  function setNode(o, key, p, opts) {
    const mod = M.moduleOf(o);
    if (mod && typeof mod.setNode === 'function') { mod.setNode(o, key, p, opts); return; }
  }

  function handleAt(p) {
    const objs = DP.sel.list();
    if (!objs.length) return null;
    const bb = M.bbox(objs);
    if (!bb) return null;
    const tol = 8 / st.view.k;
    /* 节点手柄：单个可编辑图形（把柄与锚点重叠时优先锚点） */
    if (objs.length === 1) {
      const nodes = getNodes(objs[0]);
      const eps = 2 / st.view.k;
      let bestN = null, bestD = Infinity;
      for (const n of nodes) {
        const d = Math.hypot(p.x - n.x, p.y - n.y);
        if (d > tol) continue;
        if (n.kind === 'ctrl' ? d + eps >= bestD : d >= bestD) continue;
        bestD = d;
        bestN = n;
      }
      if (bestN) return { kind: 'node', key: bestN.key, ctrl: bestN.kind === 'ctrl', bb };
    }
    /* 旋转手柄：单个部件 */
    if (objs.length === 1 && objs[0].type === 'part') {
      const cx = bb.x + bb.w / 2, cy = bb.y - 26 / st.view.k;
      if (Math.hypot(p.x - cx, p.y - cy) <= tol) {
        return { kind: 'rot', bb, cx: bb.x + bb.w / 2, cy: bb.y + bb.h / 2 };
      }
    }
    const hs = [
      ['nw', bb.x, bb.y], ['ne', bb.x + bb.w, bb.y],
      ['se', bb.x + bb.w, bb.y + bb.h], ['sw', bb.x, bb.y + bb.h],
    ];
    for (const [id, x, y] of hs) if (Math.hypot(p.x - x, p.y - y) <= tol) return { kind: 'scale', id, bb };
    return null;
  }

  /* -------------------------------- 事件 -------------------------------- */
  function bindBoard() {
    board.addEventListener('pointerdown', onDown);
    board.addEventListener('pointermove', onMove);
    board.addEventListener('pointerup', onUp);
    board.addEventListener('pointerleave', () => { U.snapInfo = null; });
    board.addEventListener('dblclick', onDbl);
    board.addEventListener('wheel', onWheel, { passive: false });
    board.addEventListener('contextmenu', (e) => e.preventDefault());

    textInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); commitText(); }
      if (e.key === 'Escape') { e.preventDefault(); cancelText(); }
    });
    textInput.addEventListener('blur', () => commitText());
  }

  /* 指针捕获：真实指针正常；合成事件/无效 pointerId 时静默跳过 */
  function cap(e) {
    try { board.setPointerCapture(e.pointerId); } catch (_) { /* noop */ }
  }

  function onDown(e) {
    if (e.button === 1 || spaceDown) {
      D = { mode: 'pan', sx: e.clientX, sy: e.clientY, vx: st.view.x, vy: st.view.y, button: e.button };
            cap(e);
      return;
    }
    if (e.button === 2) {
      /* 多步绘制进行中：右键 = 「结束并完成」，不进框选缩放。
         真正的提交在 onContext 里做（contextmenu 在下拉前触发），这里只让开。 */
      if (D && isMultiStep(D)) { e.preventDefault(); return; }
      D = { mode: 'zoombox', start: toWorld(e), cur: toWorld(e), sx: e.clientX, sy: e.clientY };
      cap(e);
      return;
    }
    if (e.button !== 0) return;
    const p0 = toWorld(e);
    const tool = st.tool;

    if (tool === 'select') {
      const h = handleAt(p0);
      if (h && h.kind === 'node') {
        const obj = DP.sel.list()[0];
        if (!h.ctrl) M.unbind(obj, h.key);
        DP.history.push();
        D = { mode: 'node', key: h.key, obj, orig: M.clone(obj), ctrl: !!h.ctrl, snapOid: null, moved: false };
        cap(e);
        return;
      }
      if (h && h.kind === 'rot') {
        const obj = DP.sel.list()[0];
        const a0 = G.deg(Math.atan2(p0.y - h.cy, p0.x - h.cx));
        D = { mode: 'rotate', obj, cx: h.cx, cy: h.cy, a0, rot0: obj.rot || 0, moved: false };
        cap(e);
        return;
      }
      if (h) {
        const sel = DP.sel.list();
        D = {
          mode: 'scale', handle: h.id, bb: h.bb, orig: M.clone(sel),
          anchor: {
            nw: { x: h.bb.x + h.bb.w, y: h.bb.y + h.bb.h },
            ne: { x: h.bb.x, y: h.bb.y + h.bb.h },
            se: { x: h.bb.x, y: h.bb.y },
            sw: { x: h.bb.x + h.bb.w, y: h.bb.y },
          }[h.id],
          start: p0,
        };
        cap(e);
        return;
      }
      const hit = hitTest(p0, 7 / st.view.k);
      if (hit) {
        let ids = new Set([hit.id]);
        if (e.shiftKey) {
          if (st.selection.has(hit.id)) {
            st.selection.delete(hit.id);
            U.render();
            renderProps();
            return;
          }
          st.selection.add(hit.id);
          ids = new Set(st.selection);
        } else {
          ids = DP.sel.expand(ids);
          st.selection = new Set(ids);
        }
        /* Alt / Ctrl + 拖动 = 拖动复制（EE 的拖出一份） */
        const copyMode = (e.altKey || e.ctrlKey) && !e.shiftKey;
        let sel = DP.sel.list();
        if (copyMode) {
          DP.history.push();
          const copies = M.clone(sel).map((o) => {
            o.id = M.uid(o.type.slice(0, 2));
            delete o.group;
            delete o.bind;
            st.objects.push(o);
            return o;
          });
          st.selection = new Set(copies.map((o) => o.id));
          sel = copies;
        }
        D = { mode: 'move', start: p0, orig: M.clone(sel), bb: M.bbox(sel), moved: false, copy: !!copyMode, guides: [] };
        cap(e);
        renderProps();
        U.render();
        return;
      }
      if (!e.shiftKey) { DP.sel.clear(); }
      D = { mode: 'marquee', start: p0, cur: p0, addMode: !!e.shiftKey };
            cap(e);
      renderProps();
      U.render();
      return;
    }

    if (tool === 'part') {
      const def = DP.parts.byId[st.toolOpts.partId];
      if (!def) return;
      placePartAt(def.id, p0, true);
      return;
    }

    if (tool === 'text') { openTextEditor(snap(p0, {})); return; }

    if (tool === 'trim') { doTrim(p0); return; }

    if (tool === 'fill') {
      const hit = hitTest(p0, 9 / st.view.k);
      if (hit && (hit.type === 'rect' || hit.type === 'circle' || hit.type === 'ellipse' || hit.type === 'polyline' || hit.type === 'part')) {
        DP.history.push();
        if (hit.type === 'part') {
          // 部件整体填色：给部件内部的封闭图元加上填充标记
          const def = DP.parts.byId[hit.partId];
          if (def) {
            const hasClosed = def.shapes.some((s) => s.type === 'rect' || s.type === 'circle' || s.type === 'polyline' || s.type === 'path');
            if (!hasClosed) { U.toast('该部件没有可填充的封闭轮廓'); DP.history.pop(); return; }
          }
          hit.fillAll = !hit.fillAll;
        } else {
          const cur = (hit.style || st.style);
          cur.fill = cur.fill && cur.fill !== 'none' ? 'none' : (st.style.fill !== 'none' ? st.style.fill : '#dbeafe');
        }
        afterChange();
      } else {
        U.toast('请点击封闭图形（矩形/圆/椭圆/多边形/部件）');
      }
      return;
    }

    if (tool === 'eraser') {
      DP.history.push();
      D = { mode: 'erase' };
      eraseAt(p0);
      return;
    }

    // 绘制类工具
    const p = snap(p0, {});
    if (tool === 'polyline' || tool === 'polygon') {
      if (!D || D.mode !== 'poly') {
        D = { mode: 'poly', pts: [[p.x, p.y]], cur: p, tool };
      } else {
        D.pts.push([p.x, p.y]);
        D.cur = p;
      }
            cap(e);
      U.render();
      return;
    }
    /* 直角连线：只走水平/垂直。左键落起点，之后每按一次左键加一个直角弯，右键收笔。 */
    if (tool === 'ortho') {
      if (!D || D.mode !== 'ortho') {
        D = { mode: 'ortho', pts: [[p.x, p.y]], cur: p };
      } else {
        const lastOrtho = D.pts[D.pts.length - 1];
        D.pts = simplifyOrtho(D.pts.concat(orthoSeg({ x: lastOrtho[0], y: lastOrtho[1] }, p, e.shiftKey)));
        D.cur = p;
      }
      cap(e);
      U.render();
      return;
    }
    if (tool === 'arc') {
      if (!D || D.mode !== 'arc') {
        D = { mode: 'arc', stage: 0, cx: p.x, cy: p.y, cur: p };
      } else if (D.stage === 0) {
        D.r = Math.hypot(p.x - D.cx, p.y - D.cy);
        D.a0 = G.deg(Math.atan2(p.y - D.cy, p.x - D.cx));
        D.stage = 1;
      } else {
        const a1 = G.deg(Math.atan2(p.y - D.cy, p.x - D.cx));
        const [n0, n1] = G.normArc(D.a0, a1);
        DP.history.push();
        st.objects.push({
          id: M.uid('a'), type: 'arc', cx: D.cx, cy: D.cy, r: Math.max(1, D.r), a0: n0, a1: n1,
          style: M.clone(st.style),
        });
        D = null;
        afterChange();
        return;
      }
            cap(e);
      U.render();
      return;
    }
    if (tool === 'dim') {
      if (!D || D.mode !== 'dim') {
        D = { mode: 'dim', stage: 0, a: p, cur: p };
      } else {
        const len = G.dist(D.a, p);
        DP.history.push();
        st.objects.push({
          id: M.uid('d'), type: 'dim', x1: D.a.x, y1: D.a.y, x2: p.x, y2: p.y,
          offset: -26, value: Math.round(len), unit: '', size: 14,
          style: M.clone(st.style),
        });
        D = null;
        afterChange();
        return;
      }
            cap(e);
      U.render();
      return;
    }
    if (tool === 'angle') {
      if (!D || D.mode !== 'angle') {
        D = { mode: 'angle', stage: 0, cx: p.x, cy: p.y, cur: p };
      } else if (D.stage === 0) {
        D.r = Math.max(12, Math.hypot(p.x - D.cx, p.y - D.cy));
        D.a0 = G.deg(Math.atan2(p.y - D.cy, p.x - D.cx));
        D.stage = 1;
      } else {
        const a1 = G.deg(Math.atan2(p.y - D.cy, p.x - D.cx));
        const [n0, n1] = G.normArc(D.a0, a1);
        DP.history.push();
        st.objects.push({
          id: M.uid('ag'), type: 'angle', cx: D.cx, cy: D.cy, r: D.r, a0: n0, a1: n1, size: 14,
          style: M.clone(st.style),
        });
        D = null;
        afterChange();
        return;
      }
            cap(e);
      U.render();
      return;
    }
    if (tool === 'bezier') {
      /* 贝塞尔：单击加锚点（自动平滑穿过）→ 按下后拖动即拉出该点把柄；
         双击 / 回车 / 右键 / 点回起点（闭合）结束；Shift 加点为折角。 */
      if (D && D.mode === 'bez') {
        D.drag = null;
        const first = D.pts[0];
        const last = D.pts[D.pts.length - 1];
        if (D.pts.length >= 3 && G.dist(first, p) <= 9 / st.view.k) {
          D.closed = true;
          finishBez();
          return;
        }
        if (last && G.dist(last, p) <= 1.5 / st.view.k) {
          D.drag = { i: D.pts.length - 1, at: { x: p.x, y: p.y }, moved: false };
        } else {
          D.pts.push({ x: p.x, y: p.y, corner: !!(e.shiftKey || e.ctrlKey || e.metaKey) });
          D.drag = { i: D.pts.length - 1, at: { x: p.x, y: p.y }, moved: false };
        }
        D.cur = p;
        cap(e);
        U.render();
        return;
      }
      D = {
        mode: 'bez', pts: [{ x: p.x, y: p.y }], cur: p,
        drag: { i: 0, at: { x: p.x, y: p.y }, moved: false },
        style: M.clone(st.style),
      };
      cap(e);
      U.render();
      return;
    }

    // 文本框：单击落一个默认大小的框
    if (tool === 'textbox') {
      DP.history.push();
      st.objects.push({
        id: M.uid('tb'), type: 'textbox',
        x: p.x - 60, y: p.y - 18, w: 120, h: 36,
        text: '双击编辑文字', size: st.style.fontSize || 14,
        style: M.clone(st.style),
      });
      afterChange();
      return;
    }
    // 标注：第一下点指向处，第二下点文本框位置
    if (tool === 'callout') {
      if (!D || D.mode !== 'callout') {
        D = { mode: 'callout', tx: p.x, ty: p.y, cur: p };
      } else {
        DP.history.push();
        st.objects.push({
          id: M.uid('co'), type: 'callout',
          tx: D.tx, ty: D.ty, bx: p.x - 55, by: p.y - 16, w: 110, h: 32,
          text: '标注文字', size: st.style.fontSize || 13,
          style: M.clone(st.style),
        });
        D = null;
        afterChange();
        return;
      }
      cap(e);
      U.render();
      return;
    }

    // 点工具：单击放置
    if (tool === 'point') {
      DP.history.push();
      st.objects.push({
        id: M.uid('p'), type: 'point', x: p.x, y: p.y, r: 3.5,
        style: M.clone(st.style),
      });
      afterChange();
      return;
    }

    // 线条类：line / arrow / ray / darrow —— 左键点击定起点，再点击定终点（也支持按住拖拽）
    if (tool === 'line' || tool === 'arrow' || tool === 'ray' || tool === 'darrow') {
      if (D && D.mode === 'line2' && D.waiting) {
        // 第二下：定终点
        const end = p;
        if (G.dist(D.start, end) > 3 / st.view.k) {
          const shape = createShape(D.tool, D.start, end, null);
          if (shape) {
            if (D.startOid) {
              const host = st.objects.find((o) => o.id === D.startOid && o !== shape);
              if (host && M.bindEndpoint(shape, 'x1', host, D.startTerminal)) U.toast('起点已粘附到对象，移动它时线会跟随');
            }
            if (end.oid) {
              const host = st.objects.find((o) => o.id === end.oid && o !== shape);
              if (host && M.bindEndpoint(shape, 'x2', host, end.terminal)) U.toast('终点已粘附到对象，移动它时线会跟随');
            }
          }
        }
        D = null;
        afterChange();
        return;
      }
      // 第一下：定起点
      D = {
        mode: 'line2', tool, start: p, cur: p, waiting: false,
        startOid: p.oid || null, startTerminal: p.terminal || null, curOid: null, style: M.clone(st.style),
      };
      cap(e);
      U.render();
      return;
    }

    // 拖动式：rect / ellipse / circle / freehand / roundrect / func
    D = {
      mode: 'draw', tool, start: p, cur: p,
      startOid: p.oid || null, startTerminal: p.terminal || null,
      style: M.clone(st.style),
      pts: tool === 'freehand' ? [[p.x, p.y]] : null,
    };
          cap(e);
    U.render();
  }

  function refreshPartPreview(world) {
    const def = DP.parts.byId[st.toolOpts.partId];
    if (!def) { partPreview = null; return; }
    const sp = DP.snap.resolve(world, { radius: 11 / st.view.k });
    partPreview = M.planPartAt(def, def.id, sp, partNudge);
    partPreview.world = world;
  }

  function onMove(e) {
    if (!D) {
      /* 部件工具：跟随光标给出放置预览（含破口效果），方向键可微调 */
      if (st.tool === 'part') {
        refreshPartPreview(toWorld(e));
        U.render();
        return;
      }
      if (partPreview) { partPreview = null; U.render(); }
      // 悬停提示
      if (st.tool === 'select') {
        const p = toWorld(e);
        const h = handleAt(p);
        let cur = 'default';
        if (h) {
          if (h.kind === 'node') cur = 'crosshair';
          else if (h.kind === 'rot') cur = 'grab';
          else cur = h.id === 'nw' || h.id === 'se' ? 'nwse-resize' : 'nesw-resize';
        } else if (hitTest(p, 7 / st.view.k)) cur = 'move';
        board.style.cursor = cur;
      }
      return;
    }
    if (D.mode === 'pan') {
      st.view.x = D.vx + (e.clientX - D.sx);
      st.view.y = D.vy + (e.clientY - D.sy);
      U.render();
      return;
    }
    if (D.mode === 'zoombox') {
      D.cur = toWorld(e);
      U.render();
      return;
    }
    const p = toWorld(e);
    /* 贝塞尔：按下后拖动 = 拉出当前锚点的控制把柄（两侧对称） */
    if (D.mode === 'bez' && D.drag) {
      const pt = D.pts[D.drag.i];
      if (pt) {
        if (G.dist(p, D.drag.at) > 2.5 / st.view.k) D.drag.moved = true;
        if (D.drag.moved) {
          pt.out = { x: p.x, y: p.y };
          pt.in = { x: 2 * pt.x - p.x, y: 2 * pt.y - p.y };
          D.badge = { x: p.x + 16 / st.view.k, y: p.y - 10 / st.view.k, text: '把柄' };
        }
      }
      D.cur = p;
      buildPreview(e.shiftKey);
      U.render();
      return;
    }
    if (D.mode === 'line2') {
      D.cur = snap(p, { from: D.start, shift: e.shiftKey });
      D.curOid = D.cur.oid || null;
      buildPreview(e.shiftKey);
      U.render();
      return;
    }
    if (D.mode === 'draw' || D.mode === 'dim' || D.mode === 'angle') {
      if (D.mode === 'draw' && D.tool === 'freehand') {
        const last = D.pts[D.pts.length - 1];
        if (Math.hypot(p.x - last[0], p.y - last[1]) > 1.2) D.pts.push([p.x, p.y]);
      }
      D.cur = snap(p, { from: D.start || D.a, shift: e.shiftKey });
      if (D.mode === 'draw') {
        D.curOid = D.cur.oid || null;
        const dx = D.cur.x - D.start.x, dy = D.cur.y - D.start.y;
        let txt = '';
        if (D.tool === 'rect') txt = `${Math.abs(G.round(dx))} × ${Math.abs(G.round(dy))}`;
        else if (D.tool === 'ellipse') txt = `${Math.abs(G.round(dx / 2))} / ${Math.abs(G.round(dy / 2))}`;
        else if (D.tool === 'circle') txt = `r ${G.round(Math.hypot(dx, dy))}`;
        else if (D.tool !== 'freehand') {
          txt = `${G.round(Math.hypot(dx, dy))}${Math.abs(((G.deg(Math.atan2(dy, dx)) + 360) % 360) - 0) < 120 ? ' · ' + G.round(Math.abs(G.deg(Math.atan2(dy, dx))) % 360) + '°' : ''}`;
        }
        D.badge = txt ? { x: D.cur.x + 16 / st.view.k, y: D.cur.y - 10 / st.view.k, text: txt } : null;
      }
      buildPreview(e.shiftKey);
      U.render();
      return;
    }
    if (D.mode === 'poly' || D.mode === 'arc' || D.mode === 'bez' || D.mode === 'ortho') {
      D.cur = snap(p, { shift: e.shiftKey });
      buildPreview(e.shiftKey);
      U.render();
      return;
    }
    if (D.mode === 'marquee') {
      D.cur = p;
      U.render();
      return;
    }
    if (D.mode === 'erase') { eraseAt(p); return; }
    if (D.mode === 'move') {
      let dx = p.x - D.start.x, dy = p.y - D.start.y;
      /* Shift：锁在主轴方向（EE 里拖动物体常用来对齐一条水平/竖直线） */
      if (e.shiftKey) {
        if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      const sel = DP.sel.list();
      D.guides = [];

      /* 1) 网格吸附 */
      if (st.snap.grid && D.bb) {
        const g = st.snap.gridSize;
        const cand = [[D.bb.x + dx, D.bb.y + dy], [D.bb.x + D.bb.w + dx, D.bb.y + dy]];
        let bestX = dx, bestY = dy, bd = 1e9;
        for (const [cx, cy] of cand) {
          const gx = Math.round(cx / g) * g, gy = Math.round(cy / g) * g;
          const d = Math.hypot(gx - cx, gy - cy);
          if (d < bd) { bd = d; bestX = dx + (gx - cx); bestY = dy + (gy - cy); }
        }
        if (bd <= g * 0.5) { dx = bestX; dy = bestY; }
      }

      /* 2) 智能参考线：左/中/右、上/中/下 与其它对象对齐（带吸附倾向） */
      if (st.snap.anchors && D.bb && !e.shiftKey) {
        const tol = 10 / st.view.k;
        const ex = [D.bb.x + dx, D.bb.x + D.bb.w / 2 + dx, D.bb.x + D.bb.w + dx];
        const ey = [D.bb.y + dy, D.bb.y + D.bb.h / 2 + dy, D.bb.y + D.bb.h + dy];
        let fx = null, fy = null;
        for (const o of st.objects) {
          if (st.selection.has(o.id)) continue;
          const b = M.localBBox(o);
          if (!b.w && !b.h) continue;
          const ox = [b.x, b.x + b.w / 2, b.x + b.w];
          const oy = [b.y, b.y + b.h / 2, b.y + b.h];
          for (const q of ox) {
            for (let i = 0; i < 3; i++) {
              const d = q - ex[i];
              if (Math.abs(d) <= tol && (!fx || Math.abs(d) < Math.abs(fx.d))) fx = { d, v: q, b };
            }
          }
          for (const q of oy) {
            for (let i = 0; i < 3; i++) {
              const d = q - ey[i];
              if (Math.abs(d) <= tol && (!fy || Math.abs(d) < Math.abs(fy.d))) fy = { d, v: q, b };
            }
          }
        }
        if (fx) {
          dx += fx.d;
          D.guides.push({
            x1: fx.v, x2: fx.v,
            y1: Math.min(D.bb.y + dy, fx.b.y) - 12 / st.view.k,
            y2: Math.max(D.bb.y + D.bb.h + dy, fx.b.y + fx.b.h) + 12 / st.view.k,
          });
        }
        if (fy) {
          dy += fy.d;
          D.guides.push({
            y1: fy.v, y2: fy.v,
            x1: Math.min(D.bb.x + dx, fy.b.x) - 12 / st.view.k,
            x2: Math.max(D.bb.x + D.bb.w + dx, fy.b.x + fy.b.w) + 12 / st.view.k,
          });
        }
      }

      sel.forEach((o, i) => {
        restoreGeom(o, D.orig[i]);
        M.translateObj(o, dx, dy);
      });
      D.moved = Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01;
      D.badge = D.moved ? { x: p.x + 16 / st.view.k, y: p.y - 10 / st.view.k, text: `${G.round(dx)} , ${G.round(dy)}` } : null;
      U.render();
      return;
    }
    /* 节点拖动：改形状，并实时吸附（控制把柄不吸附，Shift = 平滑点两侧联动） */
    if (D.mode === 'node') {
      const sp = D.ctrl ? p : snap(p, { exclude: new Set([D.obj.id]) });
      setNode(D.obj, D.key, sp, { mirror: !!e.shiftKey });
      D.snapOid = D.ctrl ? null : sp.oid;
      D.snapTerminal = sp.terminal || null;
      D.moved = true;
      D.badge = {
        x: sp.x + 14 / st.view.k, y: sp.y - 10 / st.view.k,
        text: D.ctrl ? (e.shiftKey ? '对称把柄' : '把柄') : `${G.round(sp.x)} , ${G.round(sp.y)}`,
      };
      U.render();
      return;
    }
    /* 旋转拖动 */
    if (D.mode === 'rotate') {
      const a = G.deg(Math.atan2(p.y - D.cy, p.x - D.cx));
      let rot = D.rot0 + (a - D.a0);
      if (e.shiftKey) rot = Math.round(rot / 15) * 15;
      rot = ((Math.round(rot * 10) / 10) % 360 + 360) % 360;
      D.obj.rot = rot;
      D.moved = true;
      D.badge = { x: p.x + 14 / st.view.k, y: p.y - 10 / st.view.k, text: `${Math.round(rot)}°` };
      U.render();
      return;
    }
    if (D.mode === 'scale') {
      const raw = { x: p.x, y: p.y };
      const a = D.anchor;
      const bb = D.bb;
      /* 四角缩放：比例按「被拖动的那条边」求。
         旧实现两个轴都用右下/左下边作分母，nw/sw 的分母恒为 0，
         表现为「西北、西南角手柄拖不动」，这里一并修掉。 */
      const east = D.handle === 'ne' || D.handle === 'se';
      const south = D.handle === 'se' || D.handle === 'sw';
      const denx = east ? bb.x + bb.w - a.x : bb.x - a.x;
      const deny = south ? bb.y + bb.h - a.y : bb.y - a.y;

      /* 缩放吸附：拖动侧的那条边吸附到其它对象的左/中/右、上/中/下。
         Shift 等比缩放时不吸附（否则会被拉离等比）。 */
      D.guides = [];
      let snapX = null, snapY = null;
      if (st.snap.anchors && !e.shiftKey) {
        const tol = 10 / st.view.k;
        for (const o of st.objects) {
          if (st.selection.has(o.id)) continue;
          const b = M.localBBox(o);
          if (!b.w && !b.h) continue;
          for (const q of [b.x, b.x + b.w / 2, b.x + b.w]) {
            const d = Math.abs(q - raw.x);
            if (d <= tol && (!snapX || d < snapX.d)) snapX = { d, v: q, b };
          }
          for (const q of [b.y, b.y + b.h / 2, b.y + b.h]) {
            const d = Math.abs(q - raw.y);
            if (d <= tol && (!snapY || d < snapY.d)) snapY = { d, v: q, b };
          }
        }
        if (snapX) raw.x = snapX.v;
        if (snapY) raw.y = snapY.v;
      }

      let sx = Math.abs(denx) > 0.5 ? (raw.x - a.x) / denx : 1;
      let sy = Math.abs(deny) > 0.5 ? (raw.y - a.y) / deny : 1;
      if (!isFinite(sx) || Math.abs(sx) < 0.02) sx = 0.02 * Math.sign(sx || 1);
      if (!isFinite(sy) || Math.abs(sy) < 0.02) sy = 0.02 * Math.sign(sy || 1);
      // 只取正方向缩放（避免翻转）
      sx = Math.max(0.02, sx); sy = Math.max(0.02, sy);
      if (e.shiftKey) { const k = (sx + sy) / 2; sx = k; sy = k; }
      const sel = DP.sel.list();
      sel.forEach((o, i) => {
        restoreGeom(o, D.orig[i]);
        M.scaleObj(o, sx, sy, a.x, a.y);
      });
      D.scaled = true;

      /* 参考线用缩放后的真实包围盒画（拉长到参照对象），并给出实时尺寸 */
      const nb = M.bbox(sel);
      if (nb) {
        const pad = 12 / st.view.k;
        if (snapX) {
          D.guides.push({
            x1: snapX.v, x2: snapX.v,
            y1: Math.min(nb.y, snapX.b.y) - pad,
            y2: Math.max(nb.y + nb.h, snapX.b.y + snapX.b.h) + pad,
          });
        }
        if (snapY) {
          D.guides.push({
            y1: snapY.v, y2: snapY.v,
            x1: Math.min(nb.x, snapY.b.x) - pad,
            x2: Math.max(nb.x + nb.w, snapY.b.x + snapY.b.w) + pad,
          });
        }
        D.badge = {
          x: p.x + 16 / st.view.k, y: p.y - 10 / st.view.k,
          text: `${G.round(nb.w)} × ${G.round(nb.h)}`,
        };
      }
      U.render();
      return;
    }
  }

  function onUp(e) {
    if (!D) return;
    const p = toWorld(e);
    if (D.mode === 'line2') {
      const b = D.cur;
      if (G.dist(D.start, b) > 3 / st.view.k) {
        // 按住拖拽：松手即完成
        const shape = createShape(D.tool, D.start, b, null);
        if (shape) {
          if (D.startOid) {
            const host = st.objects.find((o) => o.id === D.startOid && o !== shape);
            if (host && M.bindEndpoint(shape, 'x1', host, D.startTerminal)) U.toast('起点已粘附到对象，移动它时线会跟随');
          }
          if (D.curOid) {
            const host = st.objects.find((o) => o.id === D.curOid && o !== shape);
            if (host && M.bindEndpoint(shape, 'x2', host, end.terminal)) U.toast('终点已粘附到对象，移动它时线会跟随');
          }
        }
        D = null;
        afterChange();
      } else {
        // 单纯点击：进入等待第二下状态
        D.waiting = true;
      }
      return;
    }
    if (D.mode === 'draw' && D.tool === 'func') {
      const a = D.start, b = D.cur;
      D = null;
      if (G.dist(a, b) > 3 / st.view.k) createFunction(a, b);
      else afterChange();
      return;
    }
    if (D.mode === 'draw') {
      const a = D.start, b = D.cur || snap(p, { from: D.start, shift: e.shiftKey });
      if (G.dist(a, b) > 3 / st.view.k) {
        const shape = createShape(D.tool, a, b, D.pts);
        /* 端点落在别的对象锚点上 → 自动粘附 */
        if (shape && M.isBindable(shape)) {
          if (D.startOid) {
            const host = st.objects.find((o) => o.id === D.startOid && o !== shape);
            if (host && M.bindEndpoint(shape, 'x1', host, D.startTerminal)) U.toast('起点已粘附到对象，移动它时线会跟随');
          }
          if (D.curOid) {
            const host = st.objects.find((o) => o.id === D.curOid && o !== shape);
            if (host && M.bindEndpoint(shape, 'x2', host, end.terminal)) U.toast('终点已粘附到对象，移动它时线会跟随');
          }
        }
      }
      D = null;
      afterChange();
      return;
    }
    if (D.mode === 'dim' || D.mode === 'angle') { return; } // 等待后续点击
    if (D.mode === 'move' || D.mode === 'scale') {
      const changed = D.mode === 'move' ? D.moved : D.scaled;
      if (changed) {
        DP.history.push();
        autosave();
        if (D.copy) U.toast('已复制一份并拖动');
      }
      D = null;
      U.snapInfo = null;
      renderProps();
      U.render();
      return;
    }
    if (D.mode === 'node') {
      if (D.moved) { DP.history.push(); autosave(); }
      if (D.snapOid && M.isBindable(D.obj)) {
        const host = st.objects.find((x) => x.id === D.snapOid);
        if (host && M.bindEndpoint(D.obj, D.key, host, D.snapTerminal)) {
          U.toast('已粘附：移动该对象时，端点会跟着走');
        }
      }
      D = null;
      U.snapInfo = null;
      renderProps();
      U.render();
      return;
    }
    if (D.mode === 'rotate') {
      if (D.moved) { DP.history.push(); autosave(); }
      D = null;
      renderProps();
      U.render();
      return;
    }
    if (D.mode === 'marquee') {
      const x1 = Math.min(D.start.x, D.cur.x), y1 = Math.min(D.start.y, D.cur.y);
      const x2 = Math.max(D.start.x, D.cur.x), y2 = Math.max(D.start.y, D.cur.y);
      const ids = new Set();
      if (Math.abs(x2 - x1) > 3 || Math.abs(y2 - y1) > 3) {
        /* EE 约定：从左往右拉 = 完全框住才选；从右往左拉 = 碰到即选 */
        const forward = D.start.x < D.cur.x;
        for (const o of st.objects) {
          const bb = M.localBBox(o);
          const hit = forward
            ? (bb.x >= x1 && bb.x + bb.w <= x2 && bb.y >= y1 && bb.y + bb.h <= y2)
            : (bb.x < x2 && bb.x + bb.w > x1 && bb.y < y2 && bb.y + bb.h > y1);
          if (hit) DP.sel.expand(new Set([o.id])).forEach((id) => ids.add(id));
        }
      }
      if (D.addMode) ids.forEach((id) => st.selection.add(id));
      else st.selection = new Set(ids);
      D = null;
      U.render();
      renderProps();
      return;
    }
    if (D.mode === 'erase') { autosave(); D = null; return; }
    if (D.mode === 'bez') { D.drag = null; return; } // 多次单击完成，松手不收笔
    if (D.mode === 'poly' || D.mode === 'arc' || D.mode === 'ortho') return; // 多次点击完成
    if (D.mode === 'pan') {
      /* EE 习惯：中键单击（没拖动）= 适应画布；拖动了就是平移 */
      if (D.button === 1 && Math.hypot(e.clientX - D.sx, e.clientY - D.sy) < 4) U.fit();
      D = null;
      return;
    }
    if (D.mode === 'zoombox') {
      const moved = Math.hypot(e.clientX - D.sx, e.clientY - D.sy);
      const zoomA = D.start, zoomB = D.cur;
      D = null;
      if (moved < 6) { U.render(); return; }
      const rect = board.getBoundingClientRect();
      const W = rect.width, H = rect.height;
      const zx = Math.min(zoomA.x, zoomB.x), zy = Math.min(zoomA.y, zoomB.y);
      const zw = Math.abs(zoomB.x - zoomA.x), zh = Math.abs(zoomB.y - zoomA.y);
      if (zw > 2 && zh > 2) {
        const k = Math.min(W / zw, H / zh) * 0.96;
        st.view.k = Math.min(4, Math.max(0.12, k));
        st.view.x = W / 2 - (zx + zw / 2) * st.view.k;
        st.view.y = H / 2 - (zy + zh / 2) * st.view.k;
      }
      U.render();
      return;
    }
  }

  function onDbl(e) {
    if (D && isMultiStep(D)) { finishMulti(false); return; }
    /* 曲线编辑：双击曲线本体 = 在最近处插入一个可拖动锚点（形状不变） */
    const pd = toWorld(e);
    const hitPath = hitTest(pd, 7 / st.view.k);
    if (hitPath && hitPath.type === 'path') {
      const nd = G.insertPathPoint(hitPath.d, pd, 10 / st.view.k);
      if (nd) {
        DP.history.push();
        hitPath.d = nd;
        st.selection = new Set([hitPath.id]);
        afterChange();
        U.toast('已插入锚点：拖动方块改形状，拖圆点调曲率（Shift 对称）');
      }
      return;
    }
    /* EE 习惯：双击已有文字/文本框/标注 直接进入编辑 */
    const p = pd;
    const hit = hitTest(p, 7 / st.view.k);
    if (hit && (hit.type === 'text' || hit.type === 'textbox' || hit.type === 'callout')) {
      const size = hit.size || 14;
      let ex, ey;
      if (hit.type === 'text') { ex = hit.x; ey = hit.y; }
      else if (hit.type === 'textbox') { ex = hit.x + hit.w / 2; ey = hit.y + hit.h / 2; }
      else { ex = hit.bx + hit.w / 2; ey = hit.by + hit.h / 2; }
      textInput.hidden = false;
      textInput.value = hit.text || '';
      textInput.style.left = (ex * st.view.k + st.view.x - (textInput.value.length * size * 0.3)) + 'px';
      textInput.style.top = (ey * st.view.k + st.view.y - size * st.view.k * 0.6) + 'px';
      textInput.style.fontSize = (size * st.view.k) + 'px';
      textInput.style.color = (hit.style && hit.style.stroke) || st.style.stroke;
      textInput.focus();
      textInput.select();
      editing = { editObj: hit };
    }
  }

  /* ------------------------- 多步绘制（左键累加 / 右键收笔） -------------------------
   * 用户习惯：折线、贝塞尔、直角连线都是「左键定第一点 → 左键继续 → 右键结束」。
   * 之前右键会走 contextmenu → setTool('select')，把 D 直接丢掉，图形消失；
   * 现在右键统一交给 finishMulti 提交。 */
  function isMultiStep(d) {
    return !!d && (d.mode === 'poly' || d.mode === 'bez' || d.mode === 'ortho');
  }

  function finishMulti(shift) {
    if (!D) return;
    if (D.mode === 'poly') finishPoly(true);
    else if (D.mode === 'bez') finishBez();
    else if (D.mode === 'ortho') finishOrtho(true, shift);
  }

  /* 直角连线的单段：把「上一点→目标点」拆成只含水平/垂直的折点。
     vertFirst=true（Shift）先竖后横，否则按主运动方向自动选先横还是先竖。 */
  function orthoSeg(from, to, vertFirst) {
    const dx = to.x - from.x, dy = to.y - from.y;
    if (Math.abs(dx) < 0.5 || Math.abs(dy) < 0.5) return [[to.x, to.y]];
    const hFirst = vertFirst ? false : Math.abs(dx) >= Math.abs(dy);
    return hFirst ? [[to.x, from.y], [to.x, to.y]] : [[from.x, to.y], [to.x, to.y]];
  }

  /* 去掉重复点与共线的中间点，避免一条直线存成三个点 */
  function simplifyOrtho(pts) {
    const dedup = [];
    for (const p of pts) {
      const last = dedup[dedup.length - 1];
      if (last && Math.abs(p[0] - last[0]) < 0.5 && Math.abs(p[1] - last[1]) < 0.5) continue;
      dedup.push(p);
    }
    const out = [];
    for (let i = 0; i < dedup.length; i++) {
      const a = out[out.length - 1], b = dedup[i], c = dedup[i + 1];
      if (a && c) {
        const sameX = Math.abs(a[0] - b[0]) < 0.5 && Math.abs(b[0] - c[0]) < 0.5;
        const sameY = Math.abs(a[1] - b[1]) < 0.5 && Math.abs(b[1] - c[1]) < 0.5;
        if (sameX || sameY) continue;
      }
      out.push(b);
    }
    return out;
  }

  function finishOrtho(useCur, vertFirst) {
    if (!D || D.mode !== 'ortho') return;
    let pts = D.pts.slice();
    if (useCur && D.cur) {
      const last = pts[pts.length - 1];
      if (Math.abs(D.cur.x - last[0]) > 0.5 || Math.abs(D.cur.y - last[1]) > 0.5) {
        pts = pts.concat(orthoSeg({ x: last[0], y: last[1] }, D.cur, vertFirst));
      }
    }
    pts = simplifyOrtho(pts);
    if (pts.length >= 2) {
      DP.history.push();
      st.objects.push({
        id: M.uid('ol'), type: 'polyline', points: pts, closed: false,
        style: M.clone(D.style || st.style),
      });
    }
    D = null;
    afterChange();
  }

  /* 贝塞尔收笔：以已落锚点成曲线（不再依赖「控制点 + 光标」三步）。
     少于两点则视为取消；closed 时首尾相连。 */
  function finishBez() {
    if (!D || D.mode !== 'bez') return;
    const pts = [];
    for (const q of D.pts) {
      const last = pts[pts.length - 1];
      if (last && G.dist(last, q) <= 1.5) continue;
      pts.push(q);
    }
    if (pts.length < 2) { D = null; U.render(); return; }
    const closed = !!D.closed && pts.length >= 3;
    const obj = {
      id: M.uid('bz'), type: 'path',
      d: G.curveThrough(pts, closed),
      style: M.clone(D.style || st.style),
    };
    DP.history.push();
    st.objects.push(obj);
    st.selection = new Set([obj.id]);
    D = null;
    afterChange();
  }

  function finishPoly(useCur) {
    if (!D || D.mode !== 'poly') return;
    const closed = D.tool === 'polygon';
    const raw = useCur && D.cur ? D.pts.concat([[D.cur.x, D.cur.y]]) : D.pts;
    let pts = raw.filter((p, i) => i === 0 ||
      G.dist({ x: p[0], y: p[1] }, { x: raw[i - 1][0], y: raw[i - 1][1] }) > 2);
    /* 多边形右键收笔时若最后一点又回到起点附近，不重复追加 */
    if (closed && pts.length > 2) {
      const a = pts[0], b = pts[pts.length - 1];
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 3) pts.pop();
    }
    if (pts.length >= (closed ? 3 : 2)) {
      DP.history.push();
      st.objects.push({
        id: M.uid('pl'), type: 'polyline', points: pts, closed,
        style: M.clone(D.style || st.style),
      });
    }
    D = null;
    afterChange();
  }

  function buildPreview(shift) {
    if (!D) return;
    const stl = M.clone(D.style || st.style);
    if (D.mode === 'draw') {
      D.preview = shapeFrom(D.tool, D.start, D.cur, D.pts, stl, shift);
    } else if (D.mode === 'line2') {
      D.preview = shapeFrom(D.tool, D.start, D.cur, null, stl, shift);
    } else if (D.mode === 'dim') {
      if (D.stage === 0) {
        D.preview = { type: 'line', x1: D.a.x, y1: D.a.y, x2: D.cur.x, y2: D.cur.y, style: stl };
      } else {
        D.preview = { type: 'dim', x1: D.a.x, y1: D.a.y, x2: D.cur.x, y2: D.cur.y, offset: -26, value: Math.round(G.dist(D.a, D.cur)), unit: '', size: 14, style: stl };
      }
    } else if (D.mode === 'angle') {
      if (D.stage === 0) {
        D.preview = { type: 'line', x1: D.cx, y1: D.cy, x2: D.cur.x, y2: D.cur.y, style: stl };
      } else {
        const a1 = G.deg(Math.atan2(D.cur.y - D.cy, D.cur.x - D.cx));
        const [n0, n1] = G.normArc(D.a0, a1);
        D.preview = { type: 'angle', cx: D.cx, cy: D.cy, r: D.r || 30, a0: n0, a1: n1, size: 14, style: stl };
      }
    } else if (D.mode === 'poly') {
      const pts = D.pts.concat([[D.cur.x, D.cur.y]]);
      D.preview = { type: 'polyline', points: pts, closed: false, style: stl };
    } else if (D.mode === 'ortho') {
      const last = D.pts[D.pts.length - 1];
      const seg = orthoSeg({ x: last[0], y: last[1] }, D.cur, !!shift);
      D.preview = { type: 'polyline', points: D.pts.concat(seg), closed: false, style: stl };
    } else if (D.mode === 'arc') {
      if (D.stage === 0) {
        D.preview = { type: 'line', x1: D.cx, y1: D.cy, x2: D.cur.x, y2: D.cur.y, style: stl };
      } else {
        const a1 = G.deg(Math.atan2(D.cur.y - D.cy, D.cur.x - D.cx));
        const [n0, n1] = G.normArc(D.a0, a1);
        D.preview = { type: 'arc', cx: D.cx, cy: D.cy, r: D.r, a0: n0, a1: n1, style: stl };
      }
    } else if (D.mode === 'bez') {
      /* 预览：已落点 + 光标点（平滑穿过），与收笔后的曲线形状一致 */
      const pts = D.pts.slice();
      const last = pts[pts.length - 1];
      if (!last || G.dist(last, D.cur) > 0.8) pts.push({ x: D.cur.x, y: D.cur.y });
      D.preview = {
        type: 'path',
        d: G.curveThrough(pts, !!D.closed && pts.length >= 3),
        style: Object.assign({}, stl, { fill: 'none' }),
      };
    }
  }

  /* 阶段 2：rect / arrow 由 registry 模块工厂生成，旧 switch 仅作兜底 */
  /* 图形工厂见 src/ui/shapes.js（纯函数） */
  function moduleShapeFrom(tool, a, b, stl, shift) { return DP.shape.moduleFrom(tool, a, b, stl, shift); }
  function shapeFrom(tool, a, b, pts, stl, shift) { return DP.shape.from(tool, a, b, pts, stl, shift); }
  function simplifyPts(pts) { return DP.shape.simplifyPts(pts); }

  function createFunction(a, b) {
    const expr = window.prompt('输入函数解析式（变量用 x），例如：sin(x)、x^2、sqrt(x)、exp(-x)*cos(x)', 'sin(x)');
    if (!expr) { afterChange(); return; }
    let fn;
    try { fn = DP.compileFunc(expr); }
    catch (err) { U.toast('公式错误：' + err.message); afterChange(); return; }
    const bx = Math.min(a.x, b.x), by = Math.min(a.y, b.y);
    const bw = Math.abs(b.x - a.x), bh = Math.abs(b.y - a.y);
    const N = 240;
    const xmin = -10, xmax = 10;
    const samples = [];
    for (let i = 0; i <= N; i++) {
      const x = xmin + (xmax - xmin) * i / N;
      let y;
      try { y = fn(x); } catch (_) { y = NaN; }
      samples.push({ x, y: isFinite(y) ? y : NaN });
    }
    const valid = samples.filter((s) => isFinite(s.y));
    if (!valid.length) { U.toast('该区间内没有可绘制的有效点'); afterChange(); return; }
    let ymin = Math.min(...valid.map((s) => s.y));
    let ymax = Math.max(...valid.map((s) => s.y));
    if (ymin === ymax) { ymin -= 1; ymax += 1; }
    const pad = (ymax - ymin) * 0.08;
    ymin -= pad; ymax += pad;
    const sx = (x) => bx + (x - xmin) / (xmax - xmin) * bw;
    const sy = (y) => by + (ymax - y) / (ymax - ymin) * bh;
    const stl = M.clone(st.style);
    DP.history.push();
    // 非连续点分段
    let seg = [];
    const flush = () => {
      if (seg.length > 1) {
        st.objects.push({
          id: M.uid('fn'), type: 'polyline',
          points: seg.map((p) => [G.round(p[0]), G.round(p[1])]),
          closed: false, style: M.clone(stl),
        });
      }
      seg = [];
    };
    for (const s of samples) {
      if (!isFinite(s.y)) { flush(); continue; }
      seg.push([sx(s.x), sy(s.y)]);
    }
    flush();
    U.toast(`已绘制 y = ${expr}（x: ${xmin}~${xmax}，y 自动适配）`);
    afterChange();
  }

  function createShape(tool, a, b, pts) {    const stl = M.clone(st.style);
    const shape = shapeFrom(tool, a, b, pts, stl, false);
    if (!shape) return null;
    DP.history.push();
    shape.id = M.uid(shape.type.slice(0, 2));
    st.objects.push(shape);
    if (tool === 'freehand') DP.sel.set([shape.id]);
    return shape;
  }

  /* 手绘折线抽稀（Ramer–Douglas–Peucker） */
  function restoreGeom(target, src) {
    const keep = ['id', 'style', 'group', 'partId'];
    for (const k of Object.keys(target)) if (!keep.includes(k)) delete target[k];
    for (const k of Object.keys(src)) if (!keep.includes(k)) target[k] = M.clone(src[k]);
  }

  function afterChange() {
    DP.history.push();
    autosave();
    renderProps();
    U.render();
  }

  function eraseAt(p) {
    const tol = 10 / st.view.k;
    let removed = false;
    for (let i = st.objects.length - 1; i >= 0; i--) {
      if (hitObject(st.objects[i], p, tol)) {
        st.selection.delete(st.objects[i].id);
        st.objects.splice(i, 1);
        removed = true;
      }
    }
    if (removed) { U.render(); autosave(); }
  }

  /* ------------------------------- 修剪 ------------------------------- */
  function doTrim(p) {
    const tol = 9 / st.view.k;
    let target = null;
    for (let i = st.objects.length - 1; i >= 0; i--) {
      const o = st.objects[i];
      if (o.type === 'line' && G.distToSeg(p, { x: o.x1, y: o.y1 }, { x: o.x2, y: o.y2 }) <= tol) { target = o; break; }
    }
    if (!target) { U.toast('修剪目前支持直线段（请对准线段点击）'); return; }
    const A = { x: target.x1, y: target.y1 }, B = { x: target.x2, y: target.y2 };
    const L = G.dist(A, B) || 1;
    const ts = [0, 1];
    const project = (q) => {
      const t = ((q.x - A.x) * (B.x - A.x) + (q.y - A.y) * (B.y - A.y)) / (L * L);
      return t >= 0 && t <= 1 ? t : null;
    };
    for (const o of st.objects) {
      if (o.id === target.id) continue;
      if (o.type === 'line') {
        const q = G.segSeg(A, B, { x: o.x1, y: o.y1 }, { x: o.x2, y: o.y2 });
        if (q) ts.push(q.t);
      } else if (o.type === 'polyline') {
        for (let k = 0; k < o.points.length - 1; k++) {
          const q = G.segSeg(A, B, { x: o.points[k][0], y: o.points[k][1] }, { x: o.points[k + 1][0], y: o.points[k + 1][1] });
          if (q) ts.push(q.t);
        }
      } else if (o.type === 'rect') {
        const cs = [[o.x, o.y], [o.x + o.w, o.y], [o.x + o.w, o.y + o.h], [o.x, o.y + o.h]];
        for (let k = 0; k < 4; k++) {
          const q = G.segSeg(A, B, { x: cs[k][0], y: cs[k][1] }, { x: cs[(k + 1) % 4][0], y: cs[(k + 1) % 4][1] });
          if (q) ts.push(q.t);
        }
      } else if (o.type === 'circle' || (o.type === 'ellipse' && Math.abs(o.rx - o.ry) < 0.5)) {
        const r = o.type === 'circle' ? o.r : o.rx;
        for (const q of G.segCircle(A, B, { x: o.cx, y: o.cy }, r)) ts.push(q.t);
      }
    }
    const sorted = ts.sort((x, y) => x - y);
    const t0 = project(p);
    let lo = 0, hi = 1;
    for (let i = 0; i < sorted.length - 1; i++) {
      if (t0 != null && t0 >= sorted[i] && t0 <= sorted[i + 1]) { lo = sorted[i]; hi = sorted[i + 1]; break; }
    }
    if (hi - lo < 0.001) { U.toast('这里没有可剪掉的部分'); return; }
    DP.history.push();
    const P0 = { x: A.x + lo * (B.x - A.x), y: A.y + lo * (B.y - A.y) };
    const P1 = { x: A.x + hi * (B.x - A.x), y: A.y + hi * (B.y - A.y) };
    const pieces = [];
    if (lo > 0.001) pieces.push({ x1: A.x, y1: A.y, x2: P0.x, y2: P0.y });
    if (hi < 0.999) pieces.push({ x1: P1.x, y1: P1.y, x2: B.x, y2: B.y });
    const idx = st.objects.indexOf(target);
    st.objects.splice(idx, 1, ...pieces.map((q) => Object.assign({ id: M.uid('l'), type: 'line', style: M.clone(target.style) }, q)));
    U.toast('已修剪一段');
    afterChange();
  }

  /* ------------------------------ 缩放 / 平移 ------------------------------ */
  function onWheel(e) {
    e.preventDefault();
    const r = board.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    /* 滚轮始终以光标为中心缩放；Ctrl/⌘ 不再是隐藏开关（旧代码 `|| true` 使判断失效） */
    const factor = Math.exp(-e.deltaY * 0.0016);
    const k0 = st.view.k;
    const k1 = Math.min(6, Math.max(0.12, k0 * factor));
    const wx = (sx - st.view.x) / k0, wy = (sy - st.view.y) / k0;
    st.view.k = k1;
    st.view.x = sx - wx * k1;
    st.view.y = sy - wy * k1;
    U.render();
  }

  U.fit = function () {
    const rect = board.getBoundingClientRect();
    const W = rect.width, H = rect.height;
    if (W < 10 || H < 10) return;
    const bb = M.bbox(st.objects);
    const target = bb && bb.w > 4 && bb.h > 4
      ? { x: bb.x - 40, y: bb.y - 40, w: bb.w + 80, h: bb.h + 80 }
      : { x: -20, y: -20, w: st.page.w + 40, h: st.page.h + 40 };
    const k = Math.min(W / target.w, H / target.h) * 0.94;
    st.view.k = Math.min(2.5, Math.max(0.12, k));
    st.view.x = W / 2 - (target.x + target.w / 2) * st.view.k;
    st.view.y = H / 2 - (target.y + target.h / 2) * st.view.k;
    U.render();
  };

  /* 窗口大小变化时自适应 */
  let _fitT = null;
  window.addEventListener('resize', () => {
    clearTimeout(_fitT);
    _fitT = setTimeout(() => U.fit(), 120);
  });

  /* ------------------------------ 内联文字框 ------------------------------ */
  let editing = null;
  function openTextEditor(p) {
    const rect = board.getBoundingClientRect();
    const size = st.style.fontSize || 18;
    textInput.hidden = false;
    textInput.value = '';
    textInput.style.left = (p.x * st.view.k + st.view.x) + 'px';
    textInput.style.top = (p.y * st.view.k + st.view.y - size * st.view.k) + 'px';
    textInput.style.fontSize = (size * st.view.k) + 'px';
    textInput.style.color = st.style.stroke;
    textInput.focus();
    editing = { p, size };
  }

  function commitText() {
    if (!editing) return;
    const val = textInput.value.trim();
    const e = editing;
    editing = null;
    textInput.hidden = true;
    if (e.editObj) {
      if (!val) {
        st.objects = st.objects.filter((o) => o !== e.editObj);
      } else {
        DP.history.push();
        e.editObj.text = val;
      }
      afterChange();
      return;
    }
    if (!val) { U.render(); return; }
    DP.history.push();
    st.objects.push({
      id: M.uid('t'), type: 'text', x: e.p.x, y: e.p.y, text: val,
      size: e.size, anchor: 'start', style: M.clone(st.style),
    });
    afterChange();
  }

  function cancelText() {
    editing = null;
    textInput.hidden = true;
    U.render();
  }

  /* ------------------------------- 快捷键 ------------------------------- */
  function bindKeys() {
    window.addEventListener('keydown', (e) => {
      const tgt = e.target;
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) return;
      if (e.key === ' ' && !e.repeat) { spaceDown = true; board.style.cursor = 'grab'; return; }
      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl) {
        const k = e.key.toLowerCase();
        if (k === 'z') { e.preventDefault(); if (e.shiftKey ? DP.history.redo() : DP.history.undo()) { U.render(); renderProps(); } return; }
        if (k === 'y') { e.preventDefault(); if (DP.history.redo()) { U.render(); renderProps(); } return; }
        if (k === 'a') { e.preventDefault(); st.selection = new Set(st.objects.map((o) => o.id)); U.render(); renderProps(); return; }
        if (k === 'c') { e.preventDefault(); copySelection(); return; }
        if (k === 'v') { e.preventDefault(); pasteSelection(); return; }
        if (k === 'd') { e.preventDefault(); duplicateSelection(); return; }
        if (k === 'g') {
          e.preventDefault();
          if (e.shiftKey) ungroup(); else group();
          return;
        }
        if (k === 's') { e.preventDefault(); DP.io.saveJson(); return; }
        if (k === '0') { e.preventDefault(); U.fit(); return; }
        if (k === '=' || k === '+') { e.preventDefault(); U.zoomBy(1.2); return; }
        if (k === '-') { e.preventDefault(); U.zoomBy(1 / 1.2); return; }
        return;
      }

      switch (e.key) {
        case 'Escape': {
          const m = document.getElementById('ctxMenu');
          if (m) { closeCtx(); break; }
          if (helpPanelEl) { closeHelp(); break; }
          U.closePartPop();
          if (D && (D.mode === 'poly' || D.mode === 'bez' || D.mode === 'ortho' || D.mode === 'line2' ||
                    D.mode === 'arc' || D.mode === 'dim' || D.mode === 'angle' || D.mode === 'callout')) {
            D = null; U.render();
          } else {
            DP.sel.clear(); U.setTool('select'); renderProps();
          }
          break;
        }
        case 'Enter':
          if (isMultiStep(D)) finishMulti(false);
          break;
        case 'Delete':
        case 'Backspace':
          deleteSelection();
          break;
        case 'ArrowUp': case 'ArrowDown': case 'ArrowLeft': case 'ArrowRight': {
          /* 部件工具：方向键微调放置预览（1px / Shift 10px），不移动已选对象 */
          if (st.tool === 'part' && partPreview) {
            e.preventDefault();
            const step = e.shiftKey ? 10 : 1;
            if (e.key === 'ArrowLeft') partNudge.x -= step;
            else if (e.key === 'ArrowRight') partNudge.x += step;
            else if (e.key === 'ArrowUp') partNudge.y -= step;
            else partNudge.y += step;
            refreshPartPreview(partPreview.world || { x: 0, y: 0 });
            U.render();
            return;
          }
          if (!st.selection.size) return;
          e.preventDefault();
          const d = e.shiftKey ? 10 : 1;
          DP.history.push('nudge');
          const dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0;
          const dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0;
          DP.sel.list().forEach((o) => M.translateObj(o, dx, dy));
          autosave(); U.render();
          break;
        }
        default: {
          if (e.key.toLowerCase() === 's') { e.preventDefault(); U.toggleDrawer(); return; }
          const t = TOOLS.find((x) => x.key.toLowerCase() === e.key.toLowerCase());
          if (t) { U.setTool(t.id); }
        }
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === ' ') { spaceDown = false; if (!D) board.style.cursor = CURSORS[st.tool] || 'default'; }
    });
  }

  U.zoomBy = function (f) {
    const rect = board.getBoundingClientRect();
    const k1 = Math.min(6, Math.max(0.12, st.view.k * f));
    const cx = rect.width / 2, cy = rect.height / 2;
    const wx = (cx - st.view.x) / st.view.k, wy = (cy - st.view.y) / st.view.k;
    st.view.k = k1;
    st.view.x = cx - wx * k1;
    st.view.y = cy - wy * k1;
    U.render();
  };

  /* ------------------------------ 选中操作 ------------------------------ */
  function copySelection() {
    const sel = DP.sel.list();
    if (!sel.length) return;
    st.clipboard = M.clone(sel);
    U.toast(`已复制 ${sel.length} 个对象`);
  }
  function pasteSelection() {
    if (!st.clipboard) return;
    DP.history.push();
    const ids = [];
    for (const o of M.clone(st.clipboard)) {
      o.id = M.uid(o.type.slice(0, 2));
      M.translateObj(o, 18, 18);
      delete o.group;
      st.objects.push(o);
      ids.push(o.id);
    }
    DP.sel.set(ids);
    afterChange();
  }
  function duplicateSelection() {
    const sel = DP.sel.list();
    if (!sel.length) return;
    st.clipboard = M.clone(sel);
    pasteSelection();
  }
  U.deleteSelection = deleteSelection;
  function deleteSelection() {
    const sel = DP.sel.list();
    if (!sel.length) return;
    DP.history.push();
    st.objects = st.objects.filter((o) => !st.selection.has(o.id));
    st.selection = new Set();
    afterChange();
  }
  function group() {
    const sel = DP.sel.list();
    if (sel.length < 2) { U.toast('至少选中 2 个对象才能组合'); return; }
    DP.history.push();
    const gid = M.uid('g');
    sel.forEach((o) => (o.group = gid));
    st.groups[gid] = true;
    afterChange();
    U.toast('已组合（Ctrl+Shift+G 取消）');
  }
  function ungroup() {
    const sel = DP.sel.list();
    if (!sel.length) return;
    DP.history.push();
    sel.forEach((o) => delete o.group);
    afterChange();
  }

  U.layer = function (dir) {
    const sel = DP.sel.list();
    if (!sel.length) return;
    DP.history.push();
    for (const o of sel) {
      const i = st.objects.indexOf(o);
      if (i < 0) continue;
      st.objects.splice(i, 1);
      if (dir === 'top') st.objects.push(o);
      else if (dir === 'bottom') st.objects.unshift(o);
      else if (dir === 'up') st.objects.splice(Math.min(st.objects.length, i + 1), 0, o);
      else st.objects.splice(Math.max(0, i - 1), 0, o);
    }
    afterChange();
  };

  U.mirror = function (axis) {
    const sel = DP.sel.list();
    if (!sel.length) return;
    DP.history.push();
    sel.forEach((o) => M.mirrorObj(o, axis));
    afterChange();
  };

  U.rotate = function (delta) {
    const sel = DP.sel.list();
    if (!sel.length) return;
    DP.history.push();
    for (const o of sel) {
      if (o.type === 'part' || o.type === 'text') {
        const cur = o.rot != null ? o.rot : (o.rotate || 0);
        o.rot = ((cur + delta) % 360 + 360) % 360;
        delete o.rotate; // 兼容旧工程后统一到 rot
      } else {
        M.translateObj(o, 0, 0);
      }
    }
    afterChange();
    if (sel.some((o) => o.type !== 'part' && o.type !== 'text')) {
      U.toast('当前版本仅部件与文字支持旋转');
    }
  };

  U.align = function (mode) {
    const sel = DP.sel.list();
    if (sel.length < 2) { U.toast('至少选中 2 个对象'); return; }
    DP.history.push();
    const bb = M.bbox(sel);
    for (const o of sel) {
      const b = M.localBBox(o);
      let dx = 0, dy = 0;
      if (mode === 'left') dx = bb.x - b.x;
      if (mode === 'right') dx = bb.x + bb.w - (b.x + b.w);
      if (mode === 'cx') dx = bb.x + bb.w / 2 - (b.x + b.w / 2);
      if (mode === 'top') dy = bb.y - b.y;
      if (mode === 'bottom') dy = bb.y + bb.h - (b.y + b.h);
      if (mode === 'cy') dy = bb.y + bb.h / 2 - (b.y + b.h / 2);
      M.translateObj(o, dx, dy);
    }
    afterChange();
  };

  /* ------------------------------ 属性面板 ------------------------------ */
  function renderProps() {
    const box = document.getElementById('props');
    const sel = DP.sel.list();
    const stl = sel.length ? sel[0].style : st.style;
    const s = stl || st.style;
    /* 线宽/线型用「实际线样」按钮（不是文字下拉）：线型按真实 dasharray 画线，
       线宽按真实粗细画线并附数字；线样用当前线色，所见即所得。 */
    const curW = +s.width || DP.config.defaults.strokeWidth;
    const wList = widthOpts(curW);
    /* 线型/线宽=线样下拉（收起态一条，展开态列表）；线样用当前线色，所见即所得 */
    const dashDrop = styleDropHtml('pDash', 'dash',
      DP.style.DASHES.map((d) => dashItemHtml(d, s.stroke)), s.dash);
    const widthDrop = styleDropHtml('pWidth', 'width',
      wList.map((w) => widthItemHtml(w, s.stroke)), curW);
    /* 线色/填充=色板下拉（自动色/标准/自定义/文档已用色 + 其他颜色…），与 ribbon 同源 */
    const strokeDrop = colorDropHtml('pStrokeDrop', 'stroke');
    const fillDrop = colorDropHtml('pFillDrop', 'fill');
    const common = `
      <div class="row"><label>线色</label>${strokeDrop}</div>
      <div class="row"><label>线型</label>${dashDrop}</div>
      <div class="row"><label>线宽</label>${widthDrop}<input type="number" id="pWidthNum" min="0.25" max="24" step="0.25" value="${curW}" title="自定义线宽"></div>
      <div class="row"><label>填充</label>${fillDrop}</div>
      <div class="row"><label>字号</label><input type="number" id="pFontSize" min="8" max="120" value="${s.fontSize || 18}"></div>
    `;
    if (!sel.length) {
      box.innerHTML = `<div class="props-title">画布</div>
        <div class="row"><label>宽</label><input type="number" id="pageW" value="${st.page.w}"><label>高</label><input type="number" id="pageH" value="${st.page.h}"></div>
        ${common}
        <p class="tip">未选中对象。选择工具为「选」，点击图形可选中。</p>`;
    } else {
      const bb = M.bbox(sel);
      const types = [...new Set(sel.map((o) => o.type))].join('/');
      let extra = '';
      if (sel.length === 1 && sel[0].type === 'dim') {
        extra = `<div class="row"><label>标注</label><input type="text" id="pDimLabel" value="${sel[0].label || ''}" placeholder="${sel[0].value ?? ''}"></div>`;
      }
      if (sel.length === 1 && sel[0].type === 'ray') {
        const n = (sel[0].style && sel[0].style.rayArrows) === 2 ? 2 : 1;
        extra = `<div class="row"><label>箭头</label><select id="pRayCount">
          <option value="1"${n === 1 ? ' selected' : ''}>中点 1 个</option>
          <option value="2"${n === 2 ? ' selected' : ''}>三等分 2 个</option>
        </select></div>`;
      }
      if (sel.length === 1 && sel[0].type === 'part') {
        const def = DP.parts.byId[sel[0].partId];
        const terms = (def && def.terminals) || [];
        const tHtml = terms.length
          ? `<div class="props-sub">端子（${terms.length}）</div><p class="tip">${terms.map((t) => t.label || t.id).join(' · ')}</p>`
          : '';
        extra = `<div class="row"><label>旋转</label>
          <button class="mini" data-rot="-90">-90°</button><button class="mini" data-rot="90">+90°</button>
          <button class="mini" data-flip="1">翻转</button></div>${tHtml}`;
      }
      if (sel.length === 1 && M.isBindable(sel[0])) {
        const b = sel[0].bind || {};
        const desc = [];
        ['x1', 'x2'].forEach((k) => {
          if (!b[k]) return;
          const host = st.objects.find((o) => o.id === b[k].id);
          if (!host) { desc.push(`${k === 'x1' ? '起点' : '终点'}→已删除对象`); return; }
          const hname = host.type === 'part' ? ((DP.parts.byId[host.partId] || {}).name || host.partId) : host.type;
          let tname = '';
          if (b[k].terminal) {
            const tlist = ((DP.parts.byId[host.partId] || {}).terminals) || [];
            const t = tlist.find((x) => x.id === b[k].terminal);
            tname = ' ' + ((t && (t.label || t.id)) || b[k].terminal);
          }
          desc.push(`${k === 'x1' ? '起点' : '终点'}→${hname}${tname}`);
        });
        if (desc.length) extra += `<div class="props-sub">粘附</div><p class="tip">${desc.join('<br>')}</p>`;
      }
      box.innerHTML = `<div class="props-title">已选 ${sel.length} 个 · ${types}</div>
        <div class="kv"><span>X</span><b>${G.round(bb.x)}</b><span>Y</span><b>${G.round(bb.y)}</b>
          <span>W</span><b>${G.round(bb.w)}</b><span>H</span><b>${G.round(bb.h)}</b></div>
        ${common}${extra}
        <div class="grid2">
          <button class="mini" data-layer="top">置顶</button>
          <button class="mini" data-layer="bottom">置底</button>
          <button class="mini" data-layer="up">上移</button>
          <button class="mini" data-layer="down">下移</button>
          <button class="mini" data-mirror="h">左右镜像</button>
          <button class="mini" data-mirror="v">上下镜像</button>
          <button class="mini" data-rot="90">旋转90°</button>
          <button class="mini" data-del="1">删除</button>
        </div>
        <div class="props-sub">对齐（≥2 个对象）</div>
        <div class="grid3">
          <button class="mini" data-align="left">左</button><button class="mini" data-align="cx">中</button><button class="mini" data-align="right">右</button>
          <button class="mini" data-align="top">上</button><button class="mini" data-align="cy">中</button><button class="mini" data-align="bottom">下</button>
        </div>`;
    }
    bindProps(sel);
  }

  function bindProps(sel) {
    const box = document.getElementById('props');
    const styleTargets = sel.length ? sel : [null];
    const apply = (fn) => {
      if (sel.length) {
        DP.history.push('style');
        sel.forEach((o) => { o.style = o.style || {}; fn(o); });
        autosave();
      } else fn({ style: st.style });
      U.render();
    };
    const on = (id, ev, fn) => {
      const el = box.querySelector('#' + id);
      if (el) el.addEventListener(ev, fn);
    };
    /* 色板下拉（线色/填充）：收起态补填 + 选色即改样式；新色进自定义区 */
    const s0 = (sel.length ? sel[0].style : st.style) || st.style;
    syncColorDrop(box.querySelector('#pStrokeDrop'), s0.stroke);
    syncColorDrop(box.querySelector('#pFillDrop'), s0.fill || 'none');
    const pickPropsColor = (key) => (c) => {
      if (c !== 'none' && addCustomColor(c)) refreshPaletteCustoms();
      apply((o) => { (o.style || st.style)[key] = c; });
    };
    bindColorDrop(box.querySelector('#pStrokeDrop'), pickPropsColor('stroke'));
    bindColorDrop(box.querySelector('#pFillDrop'), pickPropsColor('fill'));
    /* 线型/线宽：线样下拉。收起态在面板重建后补填；选中项直接改对象样式 */
    const pDash = box.querySelector('#pDash');
    const pWidth = box.querySelector('#pWidth');
    setDropValue(pDash, s0.dash,
      (v) => dashItemHtml({ id: v, name: v, pattern: DP.style.dashArray(v) }, s0.stroke));
    setDropValue(pWidth, DP.style.normWidth(s0.width), (v) => widthItemHtml(v, s0.stroke));
    bindStyleDrops(box, (kind, v) => {
      if (kind === 'dash') {
        apply((o) => { (o.style || st.style).dash = v; });
      } else {
        const w = DP.style.normWidth(v);
        const num = box.querySelector('#pWidthNum');
        if (num) num.value = w;
        apply((o) => { (o.style || st.style).width = w; });
      }
    });
    const syncWidthPicks = (v) => setDropValue(pWidth, v, (x) => widthItemHtml(x, s0.stroke));
    on('pWidthNum', 'change', (e) => {
      const v = DP.style.normWidth(e.target.value);
      e.target.value = v;
      apply((o) => { (o.style || st.style).width = v; });
      syncWidthPicks(v);
    });
    on('pFontSize', 'change', (e) => {
      const v = +e.target.value;
      apply((o) => { if (o.type === 'text') o.size = v; (o.style || st.style).fontSize = v; });
    });
    on('pDimLabel', 'change', (e) => {
      const v = e.target.value;
      apply((o) => { if (o.type === 'dim') o.label = v; });
    });
    on('pRayCount', 'change', (e) => {
      const v = +e.target.value === 2 ? 2 : 1;
      apply((o) => { (o.style || st.style).rayArrows = v; });
    });
    on('pageW', 'change', (e) => { st.page.w = Math.max(200, +e.target.value || 1240); U.render(); });
    on('pageH', 'change', (e) => { st.page.h = Math.max(200, +e.target.value || 820); U.render(); });

    box.querySelectorAll('[data-layer]').forEach((b) => b.addEventListener('click', () => U.layer(b.dataset.layer)));
    box.querySelectorAll('[data-align]').forEach((b) => b.addEventListener('click', () => U.align(b.dataset.align)));
    box.querySelectorAll('[data-mirror]').forEach((b) => b.addEventListener('click', () => U.mirror(b.dataset.mirror)));
    box.querySelectorAll('[data-rot]').forEach((b) => b.addEventListener('click', () => U.rotate(+b.dataset.rot)));
    box.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => deleteSelection()));
    const flip = box.querySelector('[data-flip]');
    if (flip) flip.addEventListener('click', () => {
      DP.history.push();
      sel.forEach((o) => { o.flip = !o.flip; });
      afterChange();
    });
  }

  /* ------------------------------ 提示 / 存储 ------------------------------ */
  let toastTimer = null;
  U.toast = function (msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('on'), 2200);
  };
  U.hint = function (msg) { if (hintEl) hintEl.textContent = msg; };

  let saveTimer = null;
  function autosave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem('drawphy.doc', JSON.stringify(M.toJSON())); } catch (e) { /* ignore */ }
    }, 500);
  }
  U.autosave = autosave;
})();
