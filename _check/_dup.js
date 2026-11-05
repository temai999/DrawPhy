global.window = {};
require('D:/Trae CN/myPro/DrawPhy/src/parts.js');
const ids = window.DP.parts.list.map(p => p.id);
const seen = {};
ids.forEach(i => seen[i] = (seen[i] || 0) + 1);
console.log('count=' + ids.length);
console.log('dups=' + JSON.stringify(Object.entries(seen).filter(([k, v]) => v > 1)));