// node test/parse_test.js : r1337_parse() in cep/host.jsx accepts plain JSON and rejects everything else
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'cep', 'host.jsx'), 'utf8'), ctx);
const P = ctx.r1337_parse;
const sample = { itemId: 12, layerIndex: 0, at: 1.25, fps: 50, src: [0, 0.02, 0.0399, 0.0601], blend: 'pixel', mblur: true, shutter: 180,
  name: 'RAMP "quoted" \\ back', settings: JSON.stringify({ bpm: 124, pts: [[0, 1], [0.5, 0.2]] }), none: null, uni: 'Ə ş ç ✓' };
assert.deepStrictEqual(JSON.parse(JSON.stringify(P(JSON.stringify(sample)))), sample, 'round-trips the real apply payload');
assert.deepStrictEqual(JSON.parse(JSON.stringify(P(' {"a":[1,2,{"b":"\\u0259"}]} '))), { a: [1, 2, { b: 'ə' }] }, 'nested + \\u escape + whitespace');
assert.strictEqual(P('-1.5e3'), -1500, 'exponent numbers');
const bad = ['{"a":1,}', "{'a':1}", '{a:1}', '[1 2]', '{"a":1} x', 'alert(1)', '(function(){})()', '"unterminated', '01', 'tru', ''];
for (const b of bad) assert.throws(() => P(b), /Bad settings JSON/, 'rejects ' + JSON.stringify(b));
console.log('parse_test: ' + (3 + bad.length) + ' checks passed');
