# -*- coding: utf-8 -*-
"""阶段 6.2：把 core.js 的全量快照历史替换为 id 级差分命令历史。
用法：python _check/_rewrite_history.py
"""
import io

NL = chr(10)
p = 'src/core.js'
s = io.open(p, encoding='utf-8').read()

start = s.index('  const H = (DP.history = {')
end_marker = '  /* --------------------------- 选择 / 分组辅助 --------------------------- */'
end = s.index(end_marker, start)

new_block = '''  /* ------------------------------ 历史（差分式） ------------------------------
     阶段 6：不再每步序列化整篇文档。每条历史记录只保存「本次操作触碰到的对象」
     的前后镜像（差分补丁），undo/redo 按补丁回放。
     - 时间：每次 push 仍 O(n) 做一次轻量比较（逐对象 JSON 比较，短路命中率极高），
       与全量快照同量级；
     - 内存：从 O(n × 步数) 降到 O(Δ × 步数)，800 对象文档每步通常只存 1~3 个对象；
     - 语义与全量快照完全一致：push() 提交「当前已发生的状态」（懒提交）。
     记录结构：{ label, before:{order,objs,groups}, after:{...}, t }        */
  const H = (DP.history = {
    stack: [],
    idx: -1,
    limit: 200,          /* 旧实现 80 步；差分存储后提高到 200 */
    mergeWindow: 800,    /* 同标签连续提交的合并时间窗（毫秒） */
    _base: null,
    _lastPushAt: 0,

    /* 采集当前状态：{ order:[id], objs:Map(id→json), groups:json } */
    _capture() {
      const objs = DP.state.objects;
      const map = new Map();
      const order = new Array(objs.length);
      for (let i = 0; i < objs.length; i++) {
        const o = objs[i];
        order[i] = o.id;
        map.set(o.id, JSON.stringify(o));
      }
      return { order, objs: map, groups: JSON.stringify(DP.state.groups || {}) };
    },

    /* 差分：找出被新增/删除/修改的对象 id，并记录前后镜像 */
    _diff(base, cur) {
      const before = { order: base.order, objs: {}, groups: base.groups };
      const after = { order: cur.order, objs: {}, groups: cur.groups };
      let touched = 0;
      for (let i = 0; i < cur.order.length; i++) {
        const id = cur.order[i], j = cur.objs.get(id);
        if (!base.objs.has(id)) { before.objs[id] = null; after.objs[id] = j; touched++; }
        else if (base.objs.get(id) !== j) { before.objs[id] = base.objs.get(id); after.objs[id] = j; touched++; }
      }
      for (let i = 0; i < base.order.length; i++) {
        const id = base.order[i];
        if (!cur.objs.has(id)) { before.objs[id] = base.objs.get(id); after.objs[id] = null; touched++; }
      }
      const orderChanged = base.order.length !== cur.order.length ||
        base.order.some((id, i) => id !== cur.order[i]);
      const empty = touched === 0 && !orderChanged && base.groups === cur.groups;
      return { before, after, empty };
    },

    /* 按某侧镜像重建 objects/groups（O(n) 解析，undo/redo 是用户节奏，可接受） */
    _apply(snap) {
      const cur = new Map(DP.state.objects.map((o) => [o.id, o]));
      const out = [];
      for (let i = 0; i < snap.order.length; i++) {
        const id = snap.order[i];
        if (Object.prototype.hasOwnProperty.call(snap.objs, id)) {
          const j = snap.objs[id];
          if (j == null) continue;            /* 该状态下此对象不存在 */
          out.push(JSON.parse(j));
        } else {
          const o = cur.get(id);
          if (o) out.push(o);
        }
      }
      DP.state.objects = out;
      DP.state.groups = JSON.parse(snap.groups || '{}');
      DP.state.selection = new Set();
    },

    push(label, window) {
      const cur = this._capture();
      const base = this._base || { order: [], objs: new Map(), groups: '{}' };
      const d = this._diff(base, cur);
      this._base = cur;
      if (d.empty) return false;
      const now = Date.now();
      const top = this.stack[this.idx];
      const mergeable = !!label && !!top && top.label === label &&
        (now - (this._lastPushAt || 0)) <= (window == null ? this.mergeWindow : window);
      if (mergeable) {
        /* 合并：保留首条的 before，采用本次的 after；被触碰的 id 取并集 */
        for (const id in d.before.objs) if (!(id in top.before.objs)) top.before.objs[id] = d.before.objs[id];
        for (const id in d.after.objs) top.after.objs[id] = d.after.objs[id];
        top.after.order = d.after.order;
        top.after.groups = d.after.groups;
        top.t = now;
      } else {
        this.stack = this.stack.slice(0, this.idx + 1);
        this.stack.push({ label: label || '', before: d.before, after: d.after, t: now });
        if (this.stack.length > this.limit) {
          /* 丢最旧一条；第 0 条是哨兵，允许一起滚出 */
          this.stack.shift();
        }
      }
      this.idx = this.stack.length - 1;
      this._lastPushAt = now;
      DP.state.dirty = true;
      return true;
    },

    /* 撤销最近一次「已提交」的改动：用于操作失败后回滚（如填充无封闭轮廓） */
    pop() {
      if (this.idx <= 0) return false;
      const e = this.stack[this.idx];
      this._apply(e.before);
      this.stack.pop();
      this.idx = this.stack.length - 1;
      this._base = this._capture();
      DP.state.selection = new Set();
      return true;
    },

    reset() {
      this.stack = [{ label: 'init', before: null, after: null, t: Date.now() }];
      this.idx = 0;
      this._base = this._capture();
      this._lastPushAt = 0;
    },

    undo() {
      if (this.idx <= 0) return false;
      this._apply(this.stack[this.idx].before);
      this.idx--;
      this._base = this._capture();
      return true;
    },

    redo() {
      if (this.idx >= this.stack.length - 1) return false;
      this.idx++;
      this._apply(this.stack[this.idx].after);
      this._base = this._capture();
      return true;
    },

    /* 诊断用：当前历史占用的补丁对象数（性能/内存基线测试用） */
    patchCount() {
      let n = 0;
      for (const e of this.stack) if (e && e.before) n += Object.keys(e.after.objs).length;
      return n;
    },
  });

'''

s = s[:start] + new_block + s[end:]
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('history rewritten OK')
