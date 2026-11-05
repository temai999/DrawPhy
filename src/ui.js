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
      inner = `<div class="style-grid3">
        <div class="style-row">
          <span class="style-label">线色</span>
          <span class="swatches" id="swStroke">
            <i data-c="#1f2d3d" style="--c:#1f2d3d" title="黑"></i>
            <i data-c="#d64545" style="--c:#d64545" title="红"></i>
            <i data-c="#2e6fdb" style="--c:#2e6fdb" title="蓝"></i>
            <i data-c="#2fa860" style="--c:#2fa860" title="绿"></i>
            <i data-c="#e08a1e" style="--c:#e08a1e" title="橙"></i>
            <i data-c="#7a3fb5" style="--c:#7a3fb5" title="紫"></i>
            <i data-c="#0f9bb0" style="--c:#0f9bb0" title="青"></i>
            <span id="customSwatches" style="display:contents"></span>
            <label class="color-pick" title="自定义颜色">
              <input type="color" id="customColor" value="#1f2d3d">
              <svg viewBox="0 0 24 24"><path d="M12 5a7 7 0 1 0 7 7h-2a5 5 0 1 1-5-5z"/><circle cx="12" cy="12" r="2.4"/></svg>
            </label>
          </span>
        </div>
        <div class="style-row">
          <span class="style-label">线型</span>
          <span class="toolbtns" id="swDash">
            <button data-d="solid" title="实线">━</button>
            <button data-d="dashed" title="虚线">╌</button>
            <button data-d="dotted" title="点线">┄</button>
          </span>
        </div>
        <div class="style-row">
          <span class="style-label">填充</span>
          <span class="toolbtns" id="swFill">
            <button data-f="none" title="无填充">□</button>
            <button data-f="#ffffff" title="白底填充">▢</button>
            <button data-f="#1f2d3d" title="实心填充">■</button>
          </span>
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
    el.querySelectorAll('#swStroke i').forEach((s) =>
      s.addEventListener('click', () => applyStyle({ stroke: s.dataset.c })));
    el.querySelectorAll('#swDash button').forEach((b) =>
      b.addEventListener('click', () => applyStyle({ dash: b.dataset.d })));
    el.querySelectorAll('#swFill button').forEach((b) =>
      b.addEventListener('click', () => applyStyle({ fill: b.dataset.f })));
    const customInput = el.querySelector('#customColor');
    let saved = [];
    try { saved = JSON.parse(localStorage.getItem('drawphy.customColors') || '[]'); } catch (_) {}
    const renderCustom = () => {
      const box = el.querySelector('#customSwatches');
      if (!box) return;
      box.outerHTML = `<span id="customSwatches" style="display:contents">${saved.map((c) =>
        `<i data-c="${c}" style="--c:${c}" title="自定义 ${c}"></i>`).join('')}</span>`;
      el.querySelectorAll('#customSwatches i').forEach((s) =>
        s.addEventListener('click', () => applyStyle({ stroke: s.dataset.c })));
    };
    renderCustom();
    if (customInput) {
      customInput.addEventListener('input', (e) => applyStyle({ stroke: e.target.value }));
      customInput.addEventListener('change', (e) => {
        const c = e.target.value;
        if (!saved.includes(c)) {
          saved.unshift(c);
          saved = saved.slice(0, 6);
          localStorage.setItem('drawphy.customColors', JSON.stringify(saved));
          renderCustom();
        }
      });
    }
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

  /* 在世界坐标处放入一个部件；keepTool=true 时保持连续放置 */
  function placePartAt(pid, world, keepTool) {
    const def = DP.parts.byId[pid];
    if (!def) return;
    const sp = DP.snap.resolve(world, { radius: 11 / st.view.k });
    DP.history.push();
    /* 构造走模块 defaults 工厂（阶段 5）：模块缺失时回退内联构造，字段保持一致 */
    const mod = M.moduleOf({ type: 'part' });
    const o = mod && typeof mod.defaults === 'function'
      ? mod.defaults({ partId: pid, x: sp.x - def.w / 2, y: sp.y - def.h / 2 })
      : {
        id: M.uid('pt'), type: 'part', partId: pid,
        x: sp.x - def.w / 2, y: sp.y - def.h / 2, s: 1, rot: 0, flip: false,
      };
    o.id = M.uid('pt');
    o.style = M.clone(st.style);
    st.objects.push(o);
    DP.sel.set([o.id]);
    if (!keepTool) U.setTool('select');
    afterChange();
    U.toast(`已放入「${def.name}」，可直接拖动调整位置`);
  }

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
    document.querySelectorAll('.tool').forEach((b) => b.classList.toggle('on', b.dataset.tool === id));
    document.querySelectorAll('.part').forEach((b) => {
      const on = id === 'part' && st.toolOpts.partId === b.dataset.part;
      b.classList.toggle('on', on);
    });
    board.style.cursor = CURSORS[id] || 'default';
    const t = TOOLS.find((x) => x.id === id);
    U.hint(id === 'part' ? `放置部件：${DP.parts.byId[st.toolOpts.partId] ? DP.parts.byId[st.toolOpts.partId].name : ''}（Esc 退出）` : t ? `${t.name}：${t.hint}` : '');
    U.render();
  };

  const CURSORS = {
    select: 'default', line: 'crosshair', arrow: 'crosshair', darrow: 'crosshair', polyline: 'crosshair',
    polygon: 'crosshair', rect: 'crosshair', ellipse: 'crosshair', circle: 'crosshair',
    arc: 'crosshair', freehand: 'crosshair', text: 'text', dim: 'crosshair',
    angle: 'crosshair', trim: 'crosshair', eraser: 'crosshair', fill: 'crosshair', part: 'copy',
    bezier: 'crosshair', textbox: 'crosshair', callout: 'crosshair',
  };

  /* --------------------------- 顶栏 / 属性面板 --------------------------- */
  function bindTopbar() {
    /* 顶部样式快捷条（静态部分若存在则绑定；#swStroke 等实际在内联面板中由 toggleRibInline 绑定） */
    document.querySelectorAll('#swStroke i').forEach((el) =>
      el.addEventListener('click', () => applyStyle({ stroke: el.dataset.c })));
    document.querySelectorAll('#swDash button').forEach((el) =>
      el.addEventListener('click', () => applyStyle({ dash: el.dataset.d })));
    document.querySelectorAll('#swFill button').forEach((el) =>
      el.addEventListener('click', () => applyStyle({ fill: el.dataset.f })));
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
    if (D && D.preview) s += `<g opacity="0.8">${DP.render.object(D.preview)}</g>`;
    s += overlaySvg();
    s += `</g>`;
    board.setAttribute('viewBox', `0 0 ${W} ${H}`);
    board.innerHTML = s;
    if (zoomEl) zoomEl.textContent = Math.round(v.k * 100) + '%';
  };

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
          /* 节点手柄：空心小方块（EE 节点控制） */
          if (objs.length === 1) {
            const nodes = getNodes(objs[0]);
            const hs2 = 4.5 / k;
            for (const n of nodes) {
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

  /* 节点控制：列出单个对象可编辑的节点（EE 空心小方块） */
  function getNodes(o) {
    const mod = M.moduleOf(o);
    if (mod && typeof mod.nodes === 'function') {
      return (mod.nodes(o) || []).map((n) => ({ key: n.id, x: n.x, y: n.y }));
    }
    return [];
  }

  function setNode(o, key, p) {
    const mod = M.moduleOf(o);
    if (mod && typeof mod.setNode === 'function') { mod.setNode(o, key, p); return; }
  }

  function handleAt(p) {
    const objs = DP.sel.list();
    if (!objs.length) return null;
    const bb = M.bbox(objs);
    if (!bb) return null;
    const tol = 8 / st.view.k;
    /* 节点手柄：单个可编辑图形 */
    if (objs.length === 1) {
      const nodes = getNodes(objs[0]);
      if (nodes.length) {
        for (const n of nodes) {
          if (Math.hypot(p.x - n.x, p.y - n.y) <= tol) return { kind: 'node', key: n.key, bb };
        }
      }
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
        M.unbind(obj, h.key);
        DP.history.push();
        D = { mode: 'node', key: h.key, obj, orig: M.clone(obj), snapOid: null, moved: false };
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
      if (!D || D.mode !== 'bez') {
        D = { mode: 'bez', stage: 0, p0: p, p1: null, cur: p };
      } else if (D.stage === 0) {
        D.p1 = p; D.stage = 1;
      } else {
        DP.history.push();
        st.objects.push({
          id: M.uid('bz'), type: 'path',
          d: `M ${G.round(D.p0.x)} ${G.round(D.p0.y)} Q ${G.round(D.p1.x)} ${G.round(D.p1.y)} ${G.round(p.x)} ${G.round(p.y)}`,
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

    // 线条类：line / arrow / darrow —— 左键点击定起点，再点击定终点（也支持按住拖拽）
    if (tool === 'line' || tool === 'arrow' || tool === 'darrow') {
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

  function onMove(e) {
    if (!D) {
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
    if (D.mode === 'poly' || D.mode === 'arc' || D.mode === 'bez') {
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
    /* 节点拖动：改形状，并实时吸附 */
    if (D.mode === 'node') {
      const sp = snap(p, { exclude: new Set([D.obj.id]) });
      setNode(D.obj, D.key, sp);
      D.snapOid = sp.oid;
      D.snapTerminal = sp.terminal || null;
      D.moved = true;
      D.badge = { x: sp.x + 14 / st.view.k, y: sp.y - 10 / st.view.k, text: `${G.round(sp.x)} , ${G.round(sp.y)}` };
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
      let sx = Math.abs(D.bb.x + D.bb.w - a.x) > 0.5 ? (raw.x - a.x) / (D.bb.x + D.bb.w - a.x) : 1;
      let sy = Math.abs(D.bb.y + D.bb.h - a.y) > 0.5 ? (raw.y - a.y) / (D.bb.y + D.bb.h - a.y) : 1;
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
        if (shape && (shape.type === 'line' || shape.type === 'arrow')) {
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
      if (D.snapOid && (D.obj.type === 'line' || D.obj.type === 'arrow')) {
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
    if (D.mode === 'poly' || D.mode === 'arc') return; // 多次点击完成
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
    if (D && D.mode === 'poly') finishPoly();
    /* EE 习惯：双击已有文字/文本框/标注 直接进入编辑 */
    const p = toWorld(e);
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

  function finishPoly() {
    if (!D || D.mode !== 'poly') return;
    const closed = D.tool === 'polygon';
    let pts = D.pts.filter((p, i) => i === 0 || G.dist({ x: p[0], y: p[1] }, { x: D.pts[i - 1][0], y: D.pts[i - 1][1] }) > 2);
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
    } else if (D.mode === 'arc') {
      if (D.stage === 0) {
        D.preview = { type: 'line', x1: D.cx, y1: D.cy, x2: D.cur.x, y2: D.cur.y, style: stl };
      } else {
        const a1 = G.deg(Math.atan2(D.cur.y - D.cy, D.cur.x - D.cx));
        const [n0, n1] = G.normArc(D.a0, a1);
        D.preview = { type: 'arc', cx: D.cx, cy: D.cy, r: D.r, a0: n0, a1: n1, style: stl };
      }
    } else if (D.mode === 'bez') {
      if (D.stage === 0) {
        D.preview = { type: 'line', x1: D.p0.x, y1: D.p0.y, x2: D.cur.x, y2: D.cur.y, style: stl };
      } else {
        D.preview = {
          type: 'path',
          d: `M ${G.round(D.p0.x)} ${G.round(D.p0.y)} Q ${G.round(D.p1.x)} ${G.round(D.p1.y)} ${G.round(D.cur.x)} ${G.round(D.cur.y)}`,
          style: stl,
        };
      }
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
          if (D && (D.mode === 'poly' || D.mode === 'bez' || D.mode === 'line2' ||
                    D.mode === 'arc' || D.mode === 'dim' || D.mode === 'angle' || D.mode === 'callout')) {
            D = null; U.render();
          } else {
            DP.sel.clear(); U.setTool('select'); renderProps();
          }
          break;
        }
        case 'Enter':
          if (D && D.mode === 'poly') finishPoly();
          break;
        case 'Delete':
        case 'Backspace':
          deleteSelection();
          break;
        case 'ArrowUp': case 'ArrowDown': case 'ArrowLeft': case 'ArrowRight': {
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
    const common = `
      <div class="row"><label>线色</label><input type="color" id="pStroke" value="${s.stroke}"></div>
      <div class="row"><label>线宽</label><input type="range" id="pWidth" min="0.5" max="8" step="0.5" value="${s.width}"><span id="pWidthVal">${s.width}</span></div>
      <div class="row"><label>线型</label><select id="pDash">
        <option value="solid"${s.dash === 'solid' ? ' selected' : ''}>实线</option>
        <option value="dashed"${s.dash === 'dashed' ? ' selected' : ''}>虚线</option>
        <option value="dotted"${s.dash === 'dotted' ? ' selected' : ''}>点线</option>
      </select></div>
      <div class="row"><label>填充</label><input type="color" id="pFill" value="${s.fill && s.fill !== 'none' ? s.fill : '#ffffff'}">
        <button class="mini" id="pFillNone">无</button></div>
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
      if (sel.length === 1 && (sel[0].type === 'line' || sel[0].type === 'arrow')) {
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
    on('pStroke', 'input', (e) => apply((o) => { (o.style || st.style).stroke = e.target.value; if (!sel.length) st.style.stroke = e.target.value; }));
    on('pWidth', 'input', (e) => {
      const v = +e.target.value;
      box.querySelector('#pWidthVal').textContent = v;
      apply((o) => { (o.style || st.style).width = v; });
    });
    on('pDash', 'change', (e) => apply((o) => { (o.style || st.style).dash = e.target.value; }));
    on('pFill', 'input', (e) => apply((o) => { (o.style || st.style).fill = e.target.value; }));
    on('pFillNone', 'click', () => apply((o) => { (o.style || st.style).fill = 'none'; }));
    on('pFontSize', 'change', (e) => {
      const v = +e.target.value;
      apply((o) => { if (o.type === 'text') o.size = v; (o.style || st.style).fontSize = v; });
    });
    on('pDimLabel', 'change', (e) => {
      const v = e.target.value;
      apply((o) => { if (o.type === 'dim') o.label = v; });
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
