/* 1337ramp core math (no DOM): speed curve -> per-output-frame source times.
   Keys: [{t: 0..1 (fraction of output length), v: speed % , e: ease influence 0..100}]
   Between two keys the speed follows a 2D cubic bezier in (time, speed) with flat tangents at the keys,
   influence = how far the flat handle reaches (AE-style "ease"). 100 % speed = real time. */
(function (root) {
  'use strict';
  function bez(p0, p1, p2, p3, u) { var m = 1 - u; return m * m * m * p0 + 3 * m * m * u * p1 + 3 * m * u * u * p2 + u * u * u * p3; }
  // speed at normalised time x
  function speedAt(keys, x) {
    if (x <= keys[0].t) return keys[0].v;
    var n = keys.length; if (x >= keys[n - 1].t) return keys[n - 1].v;
    for (var i = 0; i < n - 1; i++) {
      var a = keys[i], b = keys[i + 1]; if (x > b.t) continue;
      var w = b.t - a.t; if (w <= 1e-9) return b.v;
      var x0 = a.t, x1 = a.t + w * (a.e / 100) * 0.999, x2 = b.t - w * (b.e / 100) * 0.999, x3 = b.t;
      if (x2 < x1) { var mid = (x1 + x2) / 2; x1 = Math.min(x1, mid); x2 = Math.max(x2, mid); }
      var lo = 0, hi = 1, u = 0.5;
      for (var it = 0; it < 40; it++) { u = (lo + hi) / 2; if (bez(x0, x1, x2, x3, u) < x) lo = u; else hi = u; }
      return bez(a.v, a.v, b.v, b.v, u);
    }
    return keys[n - 1].v;
  }
  /* solve(opts) -> {src: [source seconds per output frame, length N+1], speed: [% per frame], scale, srcEnd, warn}
     opts: keys, N (output frames), fps (comp fps), srcIn (s), srcOut (s, used when fit), fit (bool), maxSrc (clip duration s) */
  function solve(o) {
    var N = Math.max(1, Math.round(o.N)), fps = o.fps, sub = 8, raw = [0], sp = [];
    var acc = 0;
    for (var f = 0; f < N; f++) {
      sp.push(speedAt(o.keys, (f + 0.5) / N));
      for (var s = 0; s < sub; s++) acc += speedAt(o.keys, (f + (s + 0.5) / sub) / N) / 100 / fps / sub;
      raw.push(acc);
    }
    var scale = 1;
    if (o.fit && o.srcOut > o.srcIn && acc > 0) scale = (o.srcOut - o.srcIn) / acc;
    var src = raw.map(function (v) { return o.srcIn + v * scale; });
    var end = src[src.length - 1], warn = '';
    if (o.maxSrc && end > o.maxSrc - 0.5 / fps) warn = 'Ramp runs past the end of the clip by ' + (end - o.maxSrc).toFixed(2) + ' s; the last frame will hold.';
    return { src: src, speed: sp.map(function (v) { return v * scale; }), scale: scale, srcEnd: end, warn: warn };
  }
  /* per-output-frame consistency: source frames advanced per output frame.
     <1 without blending = repeated frames (stutter); >2.5 without motion blur = strobing (skips) */
  function consistency(src, srcFps, blend, mblur) {
    var out = [];
    for (var i = 0; i < src.length - 1; i++) {
      var d = (src[i + 1] - src[i]) * srcFps, st = 0;
      if (d < 0.98 && blend === 'none') st = 1;           // duplicate frames
      if (d > 2.5 && !mblur) st = 2;                      // skipping / strobe
      out.push({ d: d, st: st });
    }
    return out;
  }
  var PRESETS = {
    'Flow ramp (fast-slow-fast)': [{ t: 0, v: 400, e: 80 }, { t: 0.32, v: 22, e: 85 }, { t: 0.68, v: 22, e: 85 }, { t: 1, v: 400, e: 80 }],
    'Slow-mo hit':               [{ t: 0, v: 100, e: 60 }, { t: 0.35, v: 100, e: 85 }, { t: 0.48, v: 15, e: 90 }, { t: 0.85, v: 15, e: 80 }, { t: 1, v: 100, e: 70 }],
    'Ramp into slow-mo':         [{ t: 0, v: 300, e: 70 }, { t: 0.45, v: 20, e: 90 }, { t: 1, v: 20, e: 50 }],
    'Ramp out of slow-mo':       [{ t: 0, v: 20, e: 50 }, { t: 0.55, v: 20, e: 90 }, { t: 1, v: 300, e: 70 }],
    'Speed burst':               [{ t: 0, v: 100, e: 50 }, { t: 0.38, v: 100, e: 80 }, { t: 0.5, v: 600, e: 70 }, { t: 0.62, v: 100, e: 80 }, { t: 1, v: 100, e: 50 }],
    'Bullet time':               [{ t: 0, v: 250, e: 75 }, { t: 0.42, v: 8, e: 92 }, { t: 0.58, v: 8, e: 92 }, { t: 1, v: 250, e: 75 }],
    'Constant (100 %)':          [{ t: 0, v: 100, e: 33 }, { t: 1, v: 100, e: 33 }]
  };
  var API = { speedAt: speedAt, solve: solve, consistency: consistency, PRESETS: PRESETS };
  if (typeof window !== 'undefined') window.RAMP = API;          // CEP mixed context also has `module`, so always set the global
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(this);
