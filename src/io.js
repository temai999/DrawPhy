/* =========================================================================
 * DrawPhy io.js — 导出 PNG / SVG / JSON，打开文件，示例图
 * ========================================================================= */
(function () {
  'use strict';
  const DP = (window.DP = window.DP || {});
  const IO = (DP.io = {});
  const st = DP.state;

  function download(name, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 800);
  }
  IO.download = download;

  function stamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  }

  IO.svgString = function (opts) {
    return DP.render.exportSvgString(opts || {});
  };

  IO.svg = function () {
    const s = IO.svgString({ transparent: false });
    download(`DrawPhy-${stamp()}.svg`, new Blob([s], { type: 'image/svg+xml;charset=utf-8' }));
    DP.ui.toast('已导出 SVG 矢量图');
  };

  function rasterize(svgText, w, h, scale) {
    return new Promise((resolve, reject) => {
      const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(w * scale);
          canvas.height = Math.round(h * scale);
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.setTransform(scale, 0, 0, scale, 0, 0);
          ctx.drawImage(img, 0, 0, w, h);
          URL.revokeObjectURL(url);
          canvas.toBlob((b) => resolve(b), 'image/png');
        } catch (err) { reject(err); }
      };
      img.onerror = (e) => { URL.revokeObjectURL(url); reject(new Error('SVG 光栅化失败')); };
      img.src = url;
    });
  }

  IO.pngBlob = function (scale) {
    return rasterize(IO.svgString({ transparent: false }), st.page.w, st.page.h, scale || 2);
  };

  IO.png = async function (scale, transparent) {
    try {
      const b = await IO.pngBlob(scale || 2);
      download(`DrawPhy-${stamp()}@${scale || 2}x.png`, b);
      DP.ui.toast(`已导出 PNG（${Math.round(st.page.w * (scale || 2))}×${Math.round(st.page.h * (scale || 2))}）`);
    } catch (e) {
      DP.ui.toast('导出失败：' + e.message);
    }
  };

  IO.copyPng = async function () {
    try {
      const blob = await IO.pngBlob(2);
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        DP.ui.toast('已复制到剪贴板，可直接粘贴进课件');
        return;
      }
      throw new Error('浏览器不支持剪贴板图片');
    } catch (e) {
      DP.ui.toast('复制受限（本地文件模式），已改为下载 PNG');
      IO.png(2, false);
    }
  };

  IO.saveJson = function () {
    const s = JSON.stringify(DP.model.toJSON(), null, 2);
    download(`DrawPhy-${stamp()}.json`, new Blob([s], { type: 'application/json;charset=utf-8' }));
    DP.ui.toast('已保存工程 JSON（可再次打开编辑）');
  };

  /* ------------------------------ 导出 PDF ------------------------------
   * 零依赖方案（路线图阶段 8）：生成打印 HTML + window.print()，
   * 用户在打印对话框里选「另存为 PDF」。@page 尺寸 = 画布尺寸（1px = 1/96in），
   * 所以导出与画布所见即所得，不需要引入 PDF 库。 */
  IO.pdfHtml = function () {
    const svg = IO.svgString({ transparent: false });
    const w = st.page.w, h = st.page.h;
    return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>DrawPhy 导出</title>
<style>
  @page { size: ${w}px ${h}px; margin: 0; }
  html, body { margin: 0; padding: 0; }
  svg { display: block; }
  @media screen {
    body { background: #525659; display: flex; justify-content: center; padding: 16px; }
    .print-tip { position: fixed; left: 50%; bottom: 14px; transform: translateX(-50%);
      color: #fff; background: rgba(0,0,0,.55); padding: 6px 14px; border-radius: 16px;
      font: 12.5px/1.6 "Microsoft YaHei", sans-serif; }
  }
  @media print { .print-tip { display: none; } }
</style></head>
<body><div class="print-tip">在打印对话框中选择「另存为 PDF」即可导出（纸张方向与边距保持默认）</div>${svg}
<script>setTimeout(function(){try{window.focus();window.print();}catch(e){}},250);<\/script></body></html>`;
  };

  IO.pdf = function () {
    const win = window.open('', '_blank');
    if (!win) { DP.ui.toast('浏览器拦截了打印窗口，请允许弹出窗口后重试'); return; }
    win.document.open();
    win.document.write(IO.pdfHtml());
    win.document.close();
    DP.ui.toast('已打开打印页：选择「另存为 PDF」完成导出');
  };

  IO.openJson = function (file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => {
        try {
          const data = JSON.parse(fr.result);
          DP.model.fromJSON(data);
          DP.ui.render();
          resolve(data);
        } catch (e) {
          DP.ui.toast('文件解析失败：' + e.message);
          reject(e);
        }
      };
      fr.onerror = () => reject(fr.error);
      fr.readAsText(file, 'utf-8');
    });
  };

  /* --------------------------- 本地多文档槽位 ---------------------------
   * localStorage 布局：
   *   drawphy.slots      { current, list: [{ id, name, time, count }] }
   *   drawphy.doc.<id>   该槽位的文档 JSON
   * 旧版本只有一个 drawphy.doc —— 首次读取自动迁移为名为「草稿」的槽位（旧文件兼容）。
   * 这里只管数据，弹层与交互在 ui.js。 */
  const META_KEY = 'drawphy.slots';
  const DOC_KEY = (id) => 'drawphy.doc.' + id;
  const LEGACY_KEY = 'drawphy.doc';

  function readMeta() {
    try {
      const m = JSON.parse(localStorage.getItem(META_KEY) || 'null');
      if (m && Array.isArray(m.list) && m.list.length) return m;
    } catch (_) { /* ignore */ }
    return null;
  }
  function writeMeta(m) {
    try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch (_) { /* ignore */ }
  }
  function newSlotId() {
    return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  }

  /* 读元数据（必要时迁移旧单文档） */
  IO.slots = function () {
    let m = readMeta();
    if (!m) {
      m = { current: null, list: [] };
      let legacy = null;
      try { legacy = localStorage.getItem(LEGACY_KEY); } catch (_) { /* ignore */ }
      const id = newSlotId();
      let count = 0;
      if (legacy) {
        try {
          const d = JSON.parse(legacy);
          count = (d && d.objects && d.objects.length) || 0;
          localStorage.setItem(DOC_KEY(id), legacy);
          localStorage.removeItem(LEGACY_KEY);
        } catch (_) { /* 坏数据直接丢弃 */ }
      }
      m.list.push({ id, name: '草稿', time: Date.now(), count });
      m.current = id;
      writeMeta(m);
    }
    if (!m.list.some((s) => s.id === m.current)) m.current = m.list[0].id;
    return m;
  };

  IO.currentSlot = function () { return IO.slots().current; };

  IO.slot = function (id) { return IO.slots().list.find((s) => s.id === id) || null; };

  IO.slotDoc = function (id) {
    try { return JSON.parse(localStorage.getItem(DOC_KEY(id || IO.currentSlot())) || 'null'); }
    catch (_) { return null; }
  };

  /* 把当前画布写入槽位（id 为空 = 写当前槽位；name 为空 = 不改名） */
  IO.saveSlot = function (id, name) {
    const m = IO.slots();
    const slotId = id || m.current || newSlotId();
    const doc = DP.model.toJSON();
    try { localStorage.setItem(DOC_KEY(slotId), JSON.stringify(doc)); }
    catch (e) { DP.ui.toast('本地存储已满，保存失败'); return null; }
    let slot = m.list.find((s) => s.id === slotId);
    if (!slot) {
      slot = { id: slotId, name: name || ('文档 ' + (m.list.length + 1)), time: 0, count: 0 };
      m.list.push(slot);
    }
    if (name) slot.name = name;
    slot.time = Date.now();
    slot.count = (doc.objects || []).length;
    m.current = slotId;
    writeMeta(m);
    return slotId;
  };

  /* 新建空槽位并切过去（画布由调用方清空） */
  IO.newSlot = function (name) {
    const m = IO.slots();
    const slot = { id: newSlotId(), name: name || ('文档 ' + (m.list.length + 1)), time: Date.now(), count: 0 };
    m.list.push(slot);
    m.current = slot.id;
    writeMeta(m);
    try { localStorage.setItem(DOC_KEY(slot.id), JSON.stringify(DP.model.toJSON())); } catch (_) { /* ignore */ }
    return slot.id;
  };

  IO.loadSlot = function (id) {
    const doc = IO.slotDoc(id);
    if (!doc) { DP.ui.toast('该槽位没有内容'); return false; }
    DP.model.fromJSON(doc);
    if (DP.history && DP.history.reset) DP.history.reset();
    const m = IO.slots();
    m.current = id;
    writeMeta(m);
    DP.ui.render();
    return true;
  };

  IO.renameSlot = function (id, name) {
    if (!name) return;
    const m = IO.slots();
    const s = m.list.find((x) => x.id === id);
    if (!s) return;
    s.name = name;
    writeMeta(m);
  };

  IO.removeSlot = function (id) {
    const m = IO.slots();
    const i = m.list.findIndex((s) => s.id === id);
    if (i < 0) return false;
    m.list.splice(i, 1);
    try { localStorage.removeItem(DOC_KEY(id)); } catch (_) { /* ignore */ }
    if (!m.list.length) {
      const slot = { id: newSlotId(), name: '草稿', time: 0, count: 0 };
      m.list.push(slot);
    }
    if (m.current === id) m.current = m.list[0].id;
    writeMeta(m);
    return true;
  };

  /* 自动保存：写当前槽位（ui.js 侧重试/防抖由调用方处理） */
  IO.autoSave = function () {
    return IO.saveSlot();
  };

  /* 启动恢复：返回恢复的对象数量 */
  IO.restoreDraft = function () {
    const doc = IO.slotDoc();
    if (!doc || !doc.objects || !doc.objects.length) return 0;
    DP.model.fromJSON(doc);
    return doc.objects.length;
  };

  /* ------------------------------ 示例图 ------------------------------ */
  IO.sample = function () {
    const S = (o) => Object.assign({ style: { stroke: '#1f2933', width: 2, dash: 'solid', fill: 'none', opacity: 1, fontSize: 16 } }, o);
    const line = (x1, y1, x2, y2) => S({ id: DP.model.uid('l'), type: 'line', x1, y1, x2, y2 });
    const txt = (x, y, text, size) => S({ id: DP.model.uid('t'), type: 'text', x, y, text, size: size || 16, anchor: 'start' });
    const part = (pid, x, y) => {
      const def = DP.parts.byId[pid];
      return S({ id: DP.model.uid('pt'), type: 'part', partId: pid, x, y, s: 1, rot: 0, flip: false, style: { stroke: '#1f2933', width: 2, dash: 'solid', fill: 'none', opacity: 1, fontSize: 16 } });
    };

    const objs = [];
    // —— 串联电路（下方）——
    objs.push(txt(280, 452, '串联电路', 18));
    objs.push(part('battery', 280, 624));
    objs.push(part('switchOpen', 430, 618));
    objs.push(part('lamp', 610, 622));
    objs.push(part('ammeter', 760, 618));
    objs.push(line(344, 640, 430, 640));
    objs.push(line(494, 640, 610, 640));
    objs.push(line(670, 640, 760, 640));
    objs.push(line(808, 640, 920, 640));
    objs.push(line(920, 640, 920, 480));
    objs.push(line(920, 480, 280, 480));
    objs.push(line(280, 480, 280, 640));
    objs.push(txt(296, 678, '电源', 14));
    objs.push(txt(438, 678, '开关 S', 14));
    objs.push(txt(604, 678, '灯泡 L', 14));
    objs.push(txt(742, 678, '电流表 A', 14));

    // —— 受力分析（左上）——
    objs.push(txt(300, 112, '受力分析', 18));
    objs.push(part('block', 420, 180));
    objs.push(S({ id: DP.model.uid('ar'), type: 'arrow', x1: 450, y1: 200, x2: 450, y2: 306, style: { stroke: '#1f2933', width: 2, dash: 'solid', fill: 'none', opacity: 1, fontSize: 16, arrow: 'end' } }));
    objs.push(S({ id: DP.model.uid('ar'), type: 'arrow', x1: 450, y1: 200, x2: 450, y2: 94, style: { stroke: '#1f2933', width: 2, dash: 'solid', fill: 'none', opacity: 1, fontSize: 16, arrow: 'end' } }));
    objs.push(S({ id: DP.model.uid('ar'), type: 'arrow', x1: 450, y1: 200, x2: 344, y2: 200, style: { stroke: '#1f2933', width: 2, dash: 'solid', fill: 'none', opacity: 1, fontSize: 16, arrow: 'end' } }));
    objs.push(txt(462, 322, 'G', 16));
    objs.push(txt(440, 88, 'N', 16));
    objs.push(txt(324, 194, 'f', 16));
    objs.push(txt(600, 170, 'G — 重力', 14));
    objs.push(txt(600, 196, 'N — 支持力', 14));
    objs.push(txt(600, 222, 'f — 摩擦力', 14));

    // —— 凸透镜（右上）——
    objs.push(txt(700, 168, '凸透镜聚光', 18));
    objs.push(part('convexLens', 878, 208));
    objs.push(line(700, 250, 1120, 250));
    objs.push(part('rayArrow', 706, 216));
    objs.push(line(790, 225, 878, 225));
    objs.push(S({ id: DP.model.uid('ar'), type: 'arrow', x1: 878, y1: 225, x2: 1052, y2: 248, style: { stroke: '#1f2933', width: 1.8, dash: 'solid', fill: 'none', opacity: 1, fontSize: 16, arrow: 'end' } }));
    objs.push(part('dot', 1055, 244));
    objs.push(txt(1044, 286, 'F', 15));
    objs.push(txt(712, 202, '平行光', 13));

    DP.history.push();
    st.objects = objs;
    st.selection = new Set();
    DP.ui.fit();
    DP.ui.render();
    DP.ui.autosave && DP.ui.autosave();
    DP.ui.toast('已插入示例（可直接编辑）');
  };
})();
