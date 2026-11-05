/* 函数解析式解析器：无依赖、无 eval，EE 函数白名单 */
(function () {
  const FUNCS = {
    abs: 1, sqrt: 1, cbrt: 1, sin: 1, cos: 1, tan: 1, asin: 1, acos: 1, atan: 1,
    sinh: 1, cosh: 1, tanh: 1, exp: 1, floor: 1, ceil: 1, sign: 1, ln: 1, log10: 1,
    log: 2, max: 2, min: 2, pow: 2, mod: 2, atan2: 2,
  };

  /* 防御上限（阶段 7）：解析器是纯 AST 求值、无 eval，但超长/超深表达式会拖死主线程
     或爆栈，所以长度、词法数量、括号嵌套与试算耗时都要设闸门。 */
  const MAX_LEN = 4096;
  const MAX_TOKENS = 2048;
  const MAX_DEPTH = 48;
  const MAX_PROBE_MS = 200;

  function tokenize(s) {
    if (typeof s !== 'string' || !s.trim()) throw new Error('表达式为空');
    if (s.length > MAX_LEN) throw new Error('表达式过长（上限 ' + MAX_LEN + ' 字符）');
    const toks = [];
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (c === ' ') { i++; continue; }
      if (/[0-9.]/.test(c)) {
        let j = i;
        while (j < s.length && /[0-9.]/.test(s[j])) j++;
        toks.push({ t: 'num', v: parseFloat(s.slice(i, j)) });
        i = j; continue;
      }
      if (/[a-zA-Z]/.test(c)) {
        let j = i;
        while (j < s.length && /[a-zA-Z0-9]/.test(s[j])) j++;
        toks.push({ t: 'name', v: s.slice(i, j) });
        i = j; continue;
      }
      if ('+-*/^%(),'.includes(c)) { toks.push({ t: c }); i++; continue; }
      throw new Error('无法识别字符：' + c);
    }
    if (toks.length > MAX_TOKENS) throw new Error('表达式过于复杂（词法上限 ' + MAX_TOKENS + '）');
    return toks;
  }

  function Parser(toks) {
    let p = 0;
    let depth = 0;
    const enter = () => {
      if (++depth > MAX_DEPTH) throw new Error('表达式嵌套过深（上限 ' + MAX_DEPTH + ' 层）');
    };
    const leave = () => { depth--; };
    const peek = () => toks[p];
    const next = () => toks[p++];
    const expect = (c) => {
      const tk = next();
      if (!tk || tk.t !== c) throw new Error('缺少 ' + c);
    };

    function parseExpr() {
      enter();
      try {
        let left = parseTerm();
        while (peek() && (peek().t === '+' || peek().t === '-')) {
          const op = next().t;
          const right = parseTerm();
          const l = left;
          left = (x) => op === '+' ? l(x) + right(x) : l(x) - right(x);
        }
        return left;
      } finally { leave(); }
    }
    function parseTerm() {
      let left = parsePow();
      while (peek() && (peek().t === '*' || peek().t === '/' || peek().t === '%')) {
        const op = next().t;
        const right = parsePow();
        const l = left;
        left = (x) => {
          const b = right(x);
          if (op === '*') return l(x) * b;
          if (op === '/') return l(x) / b;
          return l(x) % b;
        };
      }
      return left;
    }
    function parsePow() {
      enter();
      try {
        const base = parseUnary();
        if (peek() && peek().t === '^') {
          next();
          const exp = parsePow();
          return (x) => Math.pow(base(x), exp(x));
        }
        return base;
      } finally { leave(); }
    }
    function parseUnary() {
      if (peek() && peek().t === '-') {
        next();
        const v = parseUnary();
        return (x) => -v(x);
      }
      if (peek() && peek().t === '+') { next(); return parseUnary(); }
      return parsePrimary();
    }
    function parsePrimary() {
      const tk = next();
      if (!tk) throw new Error('表达式不完整');
      if (tk.t === 'num') { const v = tk.v; return () => v; }
      if (tk.t === '(') {
        const e = parseExpr();
        expect(')');
        return e;
      }
      if (tk.t === 'name') {
        const name = tk.v;
        if (name === 'x') return (x) => x;
        if (name === 'pi') return () => Math.PI;
        if (name === 'e') return () => Math.E;
        if (peek() && peek().t === '(') {
          const argc = FUNCS[name];
          if (!argc) throw new Error('不支持的函数：' + name);
          next();
          const args = [parseExpr()];
          while (peek() && peek().t === ',') { next(); args.push(parseExpr()); }
          expect(')');
          if (args.length !== argc) throw new Error(`${name} 需要 ${argc} 个参数`);
          return (x) => callFunc(name, args.map((a) => a(x)));
        }
        throw new Error('未知变量：' + name);
      }
      throw new Error('意外的符号：' + tk.t);
    }
    return parseExpr();
  }

  function callFunc(name, a) {
    switch (name) {
      case 'abs': return Math.abs(a[0]);
      case 'sqrt': return Math.sqrt(a[0]);
      case 'cbrt': return Math.cbrt(a[0]);
      case 'sin': return Math.sin(a[0]);
      case 'cos': return Math.cos(a[0]);
      case 'tan': return Math.tan(a[0]);
      case 'asin': return Math.asin(a[0]);
      case 'acos': return Math.acos(a[0]);
      case 'atan': return Math.atan(a[0]);
      case 'sinh': return Math.sinh(a[0]);
      case 'cosh': return Math.cosh(a[0]);
      case 'tanh': return Math.tanh(a[0]);
      case 'exp': return Math.exp(a[0]);
      case 'floor': return Math.floor(a[0]);
      case 'ceil': return Math.ceil(a[0]);
      case 'sign': return Math.sign(a[0]);
      case 'ln': return Math.log(a[0]);
      case 'log10': return Math.log10(a[0]);
      case 'log': return Math.log(a[1]) / Math.log(a[0]);
      case 'max': return Math.max(a[0], a[1]);
      case 'min': return Math.min(a[0], a[1]);
      case 'pow': return Math.pow(a[0], a[1]);
      case 'mod': return a[0] % a[1];
      case 'atan2': return Math.atan2(a[0], a[1]);
      default: throw new Error('不支持的函数：' + name);
    }
  }

  window.DP = window.DP || {};
  DP.funcLimits = { MAX_LEN, MAX_TOKENS, MAX_DEPTH, MAX_PROBE_MS };
  DP.compileFunc = function (expr) {
    const t0 = Date.now();
    const fn = Parser(tokenize(expr));
    /* 试算验证：确认可求值；顺带用耗时闸门挡住「能算但极慢」的表达式 */
    let ok = false;
    for (const probe of [1, 0.37, -2.5]) {
      const v = fn(probe);
      if (typeof v === 'number') ok = true;
      if (Date.now() - t0 > MAX_PROBE_MS) throw new Error('表达式过于复杂（试算超时）');
    }
    if (!ok) throw new Error('解析失败');
    return fn;
  };
})();
