// node test/ramp_test.js : checks for cep/ramp.js (exits non-zero on the first failure)
const assert = require('assert');
const R = require(require('path').join(__dirname, '..', 'cep', 'ramp.js'));
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const near = (a, b, eps, m) => ok(Math.abs(a - b) <= eps, `${m}: ${a} vs ${b}`);

// every preset: source time never runs backwards, fit hits the target exactly, speeds stay in the panel's 5–1000 % range
for (const [name, keys] of Object.entries(R.PRESETS)) {
  const r = R.solve({ keys, N: 100, fps: 50, srcIn: 1, srcOut: 4, fit: true, maxSrc: 10 });
  ok(r.src.length === 101, `${name}: N+1 source times`);
  ok(r.src.every((v, i) => i === 0 || v >= r.src[i - 1]), `${name}: monotonic`);
  near(r.src[0], 1, 1e-9, `${name}: starts at srcIn`);
  near(r.srcEnd, 4, 1e-9, `${name}: fit ends at srcOut`);
  ok(r.speed.every(s => s > 0 && s <= 1000 * r.scale + 1e-6), `${name}: speeds positive and in range`);
  ok(r.warn === '', `${name}: no overrun warning inside a 10 s clip`);
}
// 100 % for 50 frames at 50 fps = exactly 1 s of source
const c = R.solve({ keys: R.PRESETS['Constant (100 %)'], N: 50, fps: 50, srcIn: 0, fit: false });
near(c.srcEnd, 1, 1e-9, 'constant 100 % = real time');
ok(c.scale === 1, 'no scaling without fit');
// speedAt hits the key values on the keys and stays between neighbours
const flow = R.PRESETS['Flow ramp (fast-slow-fast)'];
near(R.speedAt(flow, 0), 400, 1e-6, 'speedAt first key');
near(R.speedAt(flow, 0.5), 22, 1e-6, 'speedAt flat middle');
near(R.speedAt(flow, 1), 400, 1e-6, 'speedAt last key');
for (let x = 0; x <= 0.32; x += 0.01) { const v = R.speedAt(flow, x); ok(v <= 400 + 1e-6 && v >= 22 - 1e-6, `speedAt(${x.toFixed(2)}) between keys`); }
// running past the clip end warns
const long = R.solve({ keys: R.PRESETS['Constant (100 %)'], N: 100, fps: 25, srcIn: 0, fit: false, maxSrc: 2 });
ok(/past the end/.test(long.warn), 'overrun warning when the ramp outlasts the clip');
// consistency: 50 % speed without blending = duplicate frames, 400 % without motion blur = strobe
const slow = R.solve({ keys: [{ t: 0, v: 50, e: 33 }, { t: 1, v: 50, e: 33 }], N: 10, fps: 25, srcIn: 0, fit: false });
ok(R.consistency(slow.src, 25, 'none', false).every(f => f.st === 1), 'slow-mo without blending flagged');
ok(R.consistency(slow.src, 25, 'mix', false).every(f => f.st === 0), 'slow-mo with frame mix is clean');
const fast = R.solve({ keys: [{ t: 0, v: 400, e: 33 }, { t: 1, v: 400, e: 33 }], N: 10, fps: 25, srcIn: 0, fit: false });
ok(R.consistency(fast.src, 25, 'none', false).every(f => f.st === 2), '4x without motion blur flagged as strobe');
ok(R.consistency(fast.src, 25, 'none', true).every(f => f.st === 0), '4x with motion blur is clean');
console.log(`ramp_test: ${n} checks passed`);
