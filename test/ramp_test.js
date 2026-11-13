const R = require(require('path').join(__dirname, '..', 'cep', 'ramp.js'));
for (const [name, keys] of Object.entries(R.PRESETS)) {
  const r = R.solve({ keys, N: 100, fps: 50, srcIn: 1, srcOut: 4, fit: true, maxSrc: 10 });
  const mono = r.src.every((v, i) => i === 0 || v >= r.src[i - 1]);
  console.log(name.padEnd(28), 'start', r.src[0].toFixed(3), 'end', r.srcEnd.toFixed(3), 'scale', r.scale.toFixed(3), 'monotonic', mono,
    'speed min/max', Math.min(...r.speed).toFixed(0), Math.max(...r.speed).toFixed(0));
}
const k = R.PRESETS['Constant (100 %)'], r = R.solve({ keys: k, N: 50, fps: 50, srcIn: 0, fit: false });
console.log('constant 50f @50 -> src end', r.srcEnd.toFixed(4), '(expect 1.0)');
console.log('speedAt flow 0, .16, .32, .5, 1:', [0, .16, .32, .5, 1].map(x => R.speedAt(R.PRESETS['Flow ramp (fast-slow-fast)'], x).toFixed(1)).join(' '));
