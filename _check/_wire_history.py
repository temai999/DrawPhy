# -*- coding: utf-8 -*-
"""阶段 6.2 接线：ui.js 合并标签 + pop() 替换"""
import io

p = 'src/ui.js'
s = io.open(p, encoding='utf-8').read()

def rep(old, new, n=1):
    global s
    c = s.count(old)
    assert c == n, (old[:70], c)
    s = s.replace(old, new)

# 1) 填充失败回滚：改走新的 pop()
rep("DP.history.stack.pop(); return;", "DP.history.pop(); return;")

# 2) 方向键微移：连续按键合并为 1 条历史
rep("          const d = e.shiftKey ? 10 : 1;\n          DP.history.push();",
    "          const d = e.shiftKey ? 10 : 1;\n          DP.history.push('nudge');")

# 3) 工具条样式应用：连续取样合并
rep("    const sel = DP.sel.list();\n    if (sel.length) DP.history.push();",
    "    const sel = DP.sel.list();\n    if (sel.length) DP.history.push('style');")

# 4) 属性面板 apply()：拖颜色选择器/滑杆时合并
rep("    const apply = (fn) => {\n      if (sel.length) {\n        DP.history.push();",
    "    const apply = (fn) => {\n      if (sel.length) {\n        DP.history.push('style');")

io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('ui.js history wiring OK')
