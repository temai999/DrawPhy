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
