/* 1337ramp 1.0: speed-ramp panel for After Effects.
   Pick a clip -> shape the speed curve -> real-time proxy preview (blending + motion blur simulated) -> bake to time remap on the layer.
   Runs without CEP too (browser test mode with synthetic frames). */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var statusEl = $('status');
  function status(m, kind) { statusEl.textContent = m; statusEl.className = 'status' + (kind ? ' ' + kind : ''); }
  window.onerror = function (msg, src, line) { status('Panel error: ' + msg + ' (line ' + line + ')', 'err'); };

  // ------------------------------------------------------------------ host bridge
  var CEP = window.__adobe_cep__;
  var req = (typeof require === 'function') ? require : (window.cep_node && window.cep_node.require);
  var NODE = !!(CEP && req);
  var fs, path, cp, os, crypto, IS_WIN = false, EXT = '';
  if (NODE) {
    fs = req('fs'); path = req('path'); cp = req('child_process'); os = req('os'); crypto = req('crypto');
    IS_WIN = os.platform() === 'win32';
    EXT = decodeURIComponent(new URL('.', document.currentScript ? document.currentScript.src : location.href).pathname).replace(/\/$/, '');
    if (IS_WIN) EXT = EXT.replace(/^\/([A-Za-z]:)/, '$1').replace(/\//g, '\\');
  }
  function slash(p) { return String(p).replace(/\\/g, '/'); }
  function evalES(src, cb) { if (!CEP) { cb && cb(''); return; } CEP.evalScript(src, function (r) { cb && cb(r); }); }
  if (NODE) evalES('$.evalFile(' + JSON.stringify(slash(path.join(EXT, 'host.jsx'))) + ')');
  // drop preview caches nobody used for 14 days (they live in the OS temp folder and are only proxies)
  if (NODE && window.RAMPCACHE) setTimeout(function () { RAMPCACHE.prune(fs, path, path.join(os.tmpdir(), '1337ramp'), 14); }, 2000);
  function host(fn, arg, cb) {
    evalES(fn + '(' + (arg === undefined ? '' : JSON.stringify(arg)) + ')', function (r) {
      var o; try { o = JSON.parse(r); } catch (e) { o = { ok: false, err: 'Host said: ' + r }; } cb(o);
    });
  }

  // ------------------------------------------------------------------ state
  var DEF = { keys: RAMP.PRESETS['Flow ramp (fast-slow-fast)'], srcIn: 0, outN: 60, bpm: 100, fit: false, srcOut: 2, snap: true,
    blend: 'pixel', mblur: true, shutter: 180, loop: true };
  var S = JSON.parse(JSON.stringify(DEF));
  try { var sv = JSON.parse(localStorage.getItem('1337ramp1') || '{}'); for (var k in sv) if (k in DEF) S[k] = sv[k]; } catch (e) {}
  function save() { try { var o = {}; for (var k in DEF) o[k] = S[k]; localStorage.setItem('1337ramp1', JSON.stringify(o)); } catch (e) {} }
  var CLIPS = [], CLIP = null, COMP = { fps: 50, time: 0, name: '' }, LAYER = null;
  var FR = [], FRN = 0, PV = null, SOL = null, CONS = [], selKey = 1;

  // ------------------------------------------------------------------ project / clip list
  function refresh(cb) {
    if (!CEP) { mockProject(); cb && cb(); return; }
    host('r1337_state', undefined, function (o) {
      if (!o.ok) { status(o.err || 'Could not read the project.', 'err'); return; }
      CLIPS = o.clips; if (o.comp) COMP = o.comp; LAYER = o.layer;
      $('compPill').textContent = o.comp ? o.comp.name + ' · ' + +o.comp.fps.toFixed(2) + ' fps' : 'no comp open';
      fillList(); cb && cb(o);
    });
  }
  function fillList() {
    var q = $('q').value.trim().toLowerCase(), sel = $('clip'); sel.innerHTML = '';
    var groups = {};
    CLIPS.forEach(function (c) {
      if (q && (c.name + ' ' + c.folder).toLowerCase().indexOf(q) < 0) return;
      var g = c.folder || '(root)'; (groups[g] = groups[g] || []).push(c);
    });
    Object.keys(groups).sort().forEach(function (g) {
      var og = document.createElement('optgroup'); og.label = g;
      groups[g].forEach(function (c) { var op = document.createElement('option'); op.value = c.id; op.textContent = (c.kind === 'comp' ? '▣ ' : '') + c.name + '  ·  ' + c.dur.toFixed(1) + ' s'; if (CLIP && CLIP.id === c.id) op.selected = true; og.appendChild(op); });
      sel.appendChild(og);
    });
  }
  $('q').oninput = fillList;
  $('refresh').onclick = function () { refresh(function () { status('Project list refreshed (' + CLIPS.length + ' clips).'); }); };
  $('clip').onchange = function () {
    var id = +$('clip').value; var c = CLIPS.filter(function (x) { return x.id === id; })[0]; if (!c) return;
    LAYER = null; TGT = null; markTarget(); pickClip(c);
  };
  $('useSel').onclick = function () {
    refresh(function (o) {
      if (!o || !o.layer) { status('Select one video layer in the timeline first.', 'err'); return; }
      TGT = null; useLayer(o.layer);
    });
  };

  // ------------------------------------------------------------------ follow the timeline selection
  var TGT = null;   // {index, itemId, name, inPoint, outPoint}
  function useLayer(ly, quiet) {
    var c = CLIPS.filter(function (x) { return x.id === ly.itemId; })[0];
    if (!c) { refresh(function () { var c2 = CLIPS.filter(function (x) { return x.id === ly.itemId; })[0]; if (c2) useLayer(ly, quiet); }); return; }
    TGT = ly; LAYER = ly;
    var cm = ly.comment || '';
    if (cm.indexOf('1337ramp:') === 0) { try { var st = JSON.parse(cm.slice(9)); for (var k in st) if (k in DEF) S[k] = st[k]; } catch (e) {} if (!quiet) status('Loaded the ramp saved on "' + ly.name + '". Edit it and press Apply.', 'ok'); }
    else { S.srcIn = Math.max(0, +ly.srcAtIn.toFixed(3)); S.outN = Math.max(2, Math.round((ly.outPoint - ly.inPoint) * (COMP.fps || 50))); if (!quiet) status('Target: layer "' + ly.name + '". Shape the curve, then Apply.', 'ok'); }
    pickClip(c, true); markTarget();
  }
  function markTarget() {
    $('applySel').textContent = TGT ? 'Apply to “' + TGT.name + '”' : 'Apply to selected layer';
    $('applySel').disabled = !TGT; $('applySel').style.opacity = TGT ? 1 : 0.45;
  }
  function poll() {
    if (!CEP || playing || drag >= 0) return;
    host('r1337_sel', undefined, function (o) {
      if (!o.ok) return;
      if (o.comp) { COMP = o.comp; $('compPill').textContent = o.comp.name + ' · ' + +o.comp.fps.toFixed(2) + ' fps'; } else $('compPill').textContent = 'no comp open';
      var ly = o.layer;
      if (ly && (!TGT || TGT.index !== ly.index || TGT.itemId !== ly.itemId)) useLayer(ly);
      else if (ly && TGT) { TGT.inPoint = ly.inPoint; TGT.outPoint = ly.outPoint; }
    });
  }
  setInterval(poll, 1200);

  // ------------------------------------------------------------------ proxy frames
  function ffmpegPath() {
    var c = IS_WIN ? [path.join(EXT, 'bin', 'ffmpeg.exe'), 'C:\\ffmpeg\\bin\\ffmpeg.exe'] :
      [path.join(EXT, 'bin', 'ffmpeg'), '/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg'];
    try { var cu = localStorage.getItem('1337ramp_ffmpeg'); if (cu) c.unshift(cu); } catch (e) {}
    for (var i = 0; i < c.length; i++) try { if (fs.existsSync(c[i])) return c[i]; } catch (e) {}
    try { var w = cp.execSync(IS_WIN ? 'where ffmpeg' : '/bin/zsh -lc "command -v ffmpeg"', { encoding: 'utf8', timeout: 4000 }).split(/\r?\n/)[0].trim(); if (w) return w; } catch (e) {}
    return null;
  }
  var MAXSEC = 40, PH = 480, loadTok = 0;
  function pickClip(c, keepTiming) {
    CLIP = c; fillList();
    $('clipInfo').textContent = c.name + '  ·  ' + c.w + '×' + c.h + '  ·  ' + +c.fps.toFixed(2) + ' fps  ·  ' + c.dur.toFixed(2) + ' s' + (LAYER ? '  ·  layer #' + LAYER.index : '');
    if (!keepTiming && S.srcIn > c.dur - 0.2) S.srcIn = 0;
    syncInputs(); recompute();
    loadFrames(c);
  }
  function loadFrames(c) {
    var tok = ++loadTok; FR = []; FRN = 0; PV = null;
    if (!NODE) { mockFrames(c); return; }
    if (c.kind === 'comp' && c.pv == null && !c.pvTried) { c.pvTried = true; host('r1337_pvOf', c.id, function (o) { c.pv = o.ok ? o.pv : null; if (tok === loadTok) loadFrames(c); }); return; }
    if (!c.pv) { PV = null; showLoad(''); sizeView(); status('No video inside "' + c.name + '" to preview: showing a timing ruler. Apply works normally.', 'ok'); return; }
    var pv = c.pv; PV = pv;
    var ff = ffmpegPath(); if (!ff) { status('ffmpeg not found. Preview needs it; Apply still works.', 'err'); return; }
    // footage window that covers the clip-time range we need
    var fIn = (S.srcIn - pv.st) * pv.k, need = Math.max(2, ((SOL ? SOL.srcEnd : S.srcIn + 2) - S.srcIn) * pv.k + 1);
    var span = Math.min(pv.dur, Math.max(MAXSEC, need));
    var t0 = pv.dur > span ? Math.max(0, Math.min(fIn - 1, pv.dur - span)) : 0;
    var key = crypto.createHash('md5').update(pv.path + '|' + t0.toFixed(3) + '|' + span.toFixed(3) + '|' + PH).digest('hex').slice(0, 12);
    var dir = path.join(os.tmpdir(), '1337ramp', key), done = path.join(dir, '.done');
    pv.t0 = t0; pv.span = span;
    var total = Math.round(span * pv.fps);
    function load() {
      var files = fs.readdirSync(dir).filter(function (f) { return /^f_\d+\.jpg$/.test(f); }).sort();
      FRN = files.length; var n = 0;
      files.forEach(function (f, i) { var im = new Image(); im.onload = function () { if (tok !== loadTok) return; if (++n === FRN) { showLoad(''); status('Preview ready: ' + FRN + ' frames' + (pv.via ? ' (from "' + pv.via + '" inside the precomp; effects are not shown)' : '') + '.', 'ok'); renderAt(curF); } else if (n % 40 === 0) showLoad('Loading preview ' + Math.round(n / FRN * 100) + ' %'); };
        im.src = 'file://' + (slash(path.join(dir, f)).charAt(0) === '/' ? '' : '/') + encodeURI(slash(path.join(dir, f))); FR[i] = im; });
      sizeView();
    }
    if (fs.existsSync(done)) { window.RAMPCACHE && RAMPCACHE.touch(fs, dir); load(); return; }
    try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}
    showLoad('Making preview frames…');
    var vf = 'scale=' + (pv.w >= pv.h ? '-2:' + Math.round(PH * 9 / 16) : '-2:' + PH) + ':flags=bilinear';
    var p = cp.spawn(ff, ['-v', 'error', '-y', '-ss', String(t0), '-t', String(span), '-i', pv.path, '-vf', vf, '-q:v', '5', '-vsync', '0', path.join(dir, 'f_%05d.jpg')]);
    var iv = setInterval(function () { try { var n = fs.readdirSync(dir).length; showLoad('Making preview frames… ' + Math.min(99, Math.round(n / total * 100)) + ' %'); } catch (e) {} }, 300);
    p.on('close', function (code) { clearInterval(iv); if (tok !== loadTok) return;
      if (code !== 0) { showLoad(''); status('ffmpeg could not decode the preview video (code ' + code + ').', 'err'); return; }
      fs.writeFileSync(done, '1'); load(); });
  }
  function showLoad(m) { var l = $('load'); l.textContent = m; l.style.display = m ? 'flex' : 'none'; }

  // browser test mode: fake project + numbered frames with a moving ball
  function mockProject() {
    CLIPS = [{ id: 1, name: 'TEST_ball_50p.mov', folder: 'TEST', path: '', fps: 50, dur: 6, w: 1080, h: 1920 },
             { id: 2, name: 'TEST_spin_25p.mov', folder: 'TEST', path: '', fps: 25, dur: 4, w: 1080, h: 1920 }];
    COMP = { fps: 50, time: 0, name: 'TEST comp' }; $('compPill').textContent = 'browser test mode'; fillList();
  }
  function mockFrames(c) {
    PV = { st: 0, k: 1, fps: c.fps, t0: 0, dur: c.dur, span: c.dur }; FRN = Math.round(c.dur * c.fps);
    for (var i = 0; i < FRN; i++) {
      var cv = document.createElement('canvas'); cv.width = 270; cv.height = 480; var g = cv.getContext('2d');
      g.fillStyle = '#1b2a44'; g.fillRect(0, 0, 270, 480); var t = i / c.fps;
      g.fillStyle = '#ffd166'; g.beginPath(); g.arc(135 + 100 * Math.sin(t * 3), 240 + 180 * Math.cos(t * 2), 22, 0, 7); g.fill();
      g.fillStyle = '#fff'; g.font = 'bold 28px sans-serif'; g.fillText('src ' + i, 12, 40); FR[i] = cv;
    }
    sizeView(); status('Browser test mode: synthetic clip.', 'ok');
  }

  // ------------------------------------------------------------------ solve
  function recompute() {
    var fps = COMP.fps || 50;
    SOL = RAMP.solve({ keys: S.keys, N: S.outN, fps: fps, srcIn: S.srcIn, srcOut: S.srcOut, fit: S.fit, maxSrc: CLIP ? CLIP.dur : 0 });
    CONS = RAMP.consistency(SOL.src, CLIP ? CLIP.fps : fps, S.blend, S.mblur && S.shutter > 0);
    var dup = CONS.filter(function (x) { return x.st === 1; }).length, sk = CONS.filter(function (x) { return x.st === 2; }).length;
    $('consNote').textContent = dup || sk ? (dup ? dup + ' repeated' : '') + (dup && sk ? ' · ' : '') + (sk ? sk + ' skipping' : '') + ' frames' : 'clean';
    if (!S.fit) { S.srcOut = +SOL.srcEnd.toFixed(3); $('srcOut').value = S.srcOut; }
    $('srcNote').textContent = 'Uses source ' + S.srcIn.toFixed(2) + ' → ' + SOL.srcEnd.toFixed(2) + ' s (' + (SOL.srcEnd - S.srcIn).toFixed(2) + ' s of footage) for ' +
      S.outN + ' frames = ' + (S.outN / fps).toFixed(2) + ' s' + (S.bpm > 0 ? ' = ' + +(S.outN / fps / (60 / S.bpm)).toFixed(2) + ' beats' : '') + '.' + (SOL.warn ? '  ⚠ ' + SOL.warn : '');
    drawGraph(); drawStrip(); save();
  }

  // ------------------------------------------------------------------ graph
  var G = $('graph'), gx = G.getContext('2d'), VMIN = 5, VMAX = 1000, PADL = 34, PADR = 10, PADT = 10, PADB = 18;
  function gsize() { var r = G.getBoundingClientRect(), d = window.devicePixelRatio || 1; G.width = r.width * d; G.height = r.height * d; gx.setTransform(d, 0, 0, d, 0, 0); return r; }
  function X(t, r) { return PADL + t * (r.width - PADL - PADR); }
  function Y(v, r) { var a = Math.log(VMIN), b = Math.log(VMAX); return PADT + (1 - (Math.log(Math.max(VMIN, Math.min(VMAX, v))) - a) / (b - a)) * (r.height - PADT - PADB); }
  function iX(x, r) { return Math.max(0, Math.min(1, (x - PADL) / (r.width - PADL - PADR))); }
  function iY(y, r) { var a = Math.log(VMIN), b = Math.log(VMAX), f = 1 - (y - PADT) / (r.height - PADT - PADB); return Math.exp(a + Math.max(0, Math.min(1, f)) * (b - a)); }
  var playT = 0;
  function drawGraph() {
    var r = gsize(), fps = COMP.fps || 50, sc = SOL ? SOL.scale : 1;
    gx.clearRect(0, 0, r.width, r.height);
    gx.font = '9.5px -apple-system, sans-serif'; gx.textAlign = 'right';
    [10, 25, 50, 100, 200, 400, 800].forEach(function (v) {
      var y = Y(v, r); gx.strokeStyle = v === 100 ? 'rgba(255,255,255,.28)' : 'rgba(255,255,255,.07)'; gx.beginPath(); gx.moveTo(PADL, y); gx.lineTo(r.width - PADR, y); gx.stroke();
      gx.fillStyle = 'rgba(255,255,255,.4)'; gx.fillText(v + '%', PADL - 4, y + 3);
    });
    if (S.bpm > 0) {   // beat grid
      var bf = 60 / S.bpm * fps, nb = S.outN / bf;
      for (var b = 0; b <= nb + 1e-6; b += 0.25) { var x = X(b * bf / S.outN, r), whole = Math.abs(b - Math.round(b)) < 1e-6;
        gx.strokeStyle = whole ? 'rgba(255,159,26,.35)' : 'rgba(255,159,26,.1)'; gx.beginPath(); gx.moveTo(x, PADT); gx.lineTo(x, r.height - PADB); gx.stroke();
        if (whole) { gx.fillStyle = 'rgba(255,159,26,.7)'; gx.textAlign = 'center'; gx.fillText(String(Math.round(b)), x, r.height - 5); } }
    }
    if (!SOL) return;
    gx.strokeStyle = '#ff9f1a'; gx.lineWidth = 2; gx.beginPath();
    for (var i = 0; i <= 200; i++) { var t = i / 200, v = RAMP.speedAt(S.keys, t) * sc, px = X(t, r), py = Y(v, r); i ? gx.lineTo(px, py) : gx.moveTo(px, py); }
    gx.stroke(); gx.lineWidth = 1;
    S.keys.forEach(function (k, i) {
      var px = X(k.t, r), py = Y(k.v * sc, r);
      gx.fillStyle = i === selKey ? '#fff' : '#ff9f1a'; gx.beginPath(); gx.arc(px, py, i === selKey ? 6 : 4.5, 0, 7); gx.fill();
      if (i === selKey) { gx.fillStyle = '#fff'; gx.textAlign = 'center'; gx.fillText(Math.round(k.v * sc) + '%', px, py - 10); }
    });
    var ph = X(playT, r); gx.strokeStyle = 'rgba(255,255,255,.7)'; gx.beginPath(); gx.moveTo(ph, PADT); gx.lineTo(ph, r.height - PADB); gx.stroke();
  }
  function drawStrip() {
    var c = $('strip'), r = c.getBoundingClientRect(), g = c.getContext('2d'); c.width = r.width; c.height = 8;
    var n = CONS.length || 1;
    for (var i = 0; i < CONS.length; i++) { g.fillStyle = ['#3ecf8e', '#ffa53a', '#ff4d5e'][CONS[i].st]; g.fillRect(X(i / n, r) , 0, Math.ceil((r.width - PADL - PADR) / n) + 1, 8); }
  }
  var drag = -1;
  function hit(e) { var r = G.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, sc = SOL ? SOL.scale : 1, best = -1, bd = 12;
    S.keys.forEach(function (k, i) { var d = Math.hypot(X(k.t, r) - x, Y(k.v * sc, r) - y); if (d < bd) { bd = d; best = i; } }); return { i: best, x: x, y: y, r: r }; }
  G.onmousedown = function (e) {
    var h = hit(e);
    if (h.i >= 0 && e.altKey) { if (h.i > 0 && h.i < S.keys.length - 1) { S.keys.splice(h.i, 1); selKey = Math.min(selKey, S.keys.length - 1); syncKey(); recompute(); } return; }
    if (h.i >= 0) { drag = h.i; selKey = h.i; syncKey(); drawGraph(); return; }
    playT = iX(h.x, h.r); pause(); renderAt(Math.round(playT * S.outN)); drawGraph();      // click empty = scrub
  };
  window.addEventListener('mousemove', function (e) {
    if (drag < 0) return; var r = G.getBoundingClientRect(), k = S.keys[drag], sc = SOL ? SOL.scale : 1;
    var t = iX(e.clientX - r.left, r), v = iY(e.clientY - r.top, r) / sc;
    if (drag === 0) t = 0; else if (drag === S.keys.length - 1) t = 1;
    else { if (S.snap && S.bpm > 0) { var q = 60 / S.bpm * (COMP.fps || 50) / 4 / S.outN, st = Math.round(t / q) * q; if (Math.abs(X(st, r) - X(t, r)) < 7) t = st; }
      t = Math.max(S.keys[drag - 1].t + 0.01, Math.min(S.keys[drag + 1].t - 0.01, t)); }
    if (Math.abs(Y(100, r) - Y(v * sc, r)) < 5 && !S.fit) v = 100;          // magnet at 100 %
    k.t = +t.toFixed(4); k.v = +v.toFixed(1); syncKey(); recompute();
  });
  window.addEventListener('mouseup', function () { drag = -1; });
  G.ondblclick = function (e) {
    var r = G.getBoundingClientRect(), t = iX(e.clientX - r.left, r), sc = SOL ? SOL.scale : 1;
    var v = iY(e.clientY - r.top, r) / sc, i = 1; while (i < S.keys.length && S.keys[i].t < t) i++;
    S.keys.splice(i, 0, { t: +t.toFixed(4), v: +v.toFixed(1), e: 75 }); selKey = i; syncKey(); recompute();
  };
  // selected key sliders: speed slider is logarithmic 5..1000 %
  function v2s(v) { return Math.round((Math.log(v) - Math.log(VMIN)) / (Math.log(VMAX) - Math.log(VMIN)) * 1000); }
  function s2v(s) { return Math.exp(Math.log(VMIN) + s / 1000 * (Math.log(VMAX) - Math.log(VMIN))); }
  function syncKey() { var k = S.keys[selKey]; if (!k) return; $('kv').value = v2s(k.v); $('kvV').textContent = Math.round(k.v) + ' %'; $('ke').value = k.e; $('keV').textContent = k.e + ' %'; }
  $('kv').oninput = function () { var k = S.keys[selKey]; if (!k) return; k.v = +s2v(+this.value).toFixed(1); syncKey(); recompute(); };
  $('ke').oninput = function () { var k = S.keys[selKey]; if (!k) return; k.e = +this.value; syncKey(); recompute(); };

  // presets
  Object.keys(RAMP.PRESETS).forEach(function (n) { var o = document.createElement('option'); o.textContent = n; $('preset').appendChild(o); });
  var pre = document.createElement('option'); pre.textContent = 'Presets…'; pre.disabled = true; pre.selected = true; $('preset').insertBefore(pre, $('preset').firstChild);
  $('preset').onchange = function () { S.keys = JSON.parse(JSON.stringify(RAMP.PRESETS[this.value])); selKey = Math.min(1, S.keys.length - 1); syncKey(); recompute(); this.selectedIndex = 0; };

  // ------------------------------------------------------------------ timing inputs
  function syncInputs() {
    $('srcIn').value = S.srcIn; $('outN').value = S.outN; $('bpm').value = S.bpm; $('fit').checked = S.fit; $('srcOut').value = S.srcOut; $('srcOut').disabled = !S.fit;
    $('snap').checked = S.snap; $('blend').value = S.blend; $('mblur').checked = S.mblur; $('shutter').value = S.shutter; $('shV').textContent = S.shutter + '°';
    $('loop').checked = S.loop; $('srcScrub').value = CLIP ? Math.round(S.srcIn / CLIP.dur * 1000) : 0; syncKey();
  }
  function num(id, key, min) { $(id).onchange = function () { var v = parseFloat(this.value); if (isNaN(v)) return; S[key] = Math.max(min, v); if (key === 'outN') S.outN = Math.round(S.outN); syncInputs(); recompute(); maybeReload(); }; }
  num('srcIn', 'srcIn', 0); num('outN', 'outN', 2); num('bpm', 'bpm', 0); num('srcOut', 'srcOut', 0);
  $('srcScrub').oninput = function () { if (!CLIP) return; S.srcIn = +(this.value / 1000 * CLIP.dur).toFixed(3); $('srcIn').value = S.srcIn; recompute(); pause(); renderAt(0); };
  $('srcScrub').onchange = maybeReload;
  function maybeReload() { if (!CLIP || !PV || !NODE) return; var a = (S.srcIn - PV.st) * PV.k, b = (SOL.srcEnd - PV.st) * PV.k; if (a < PV.t0 - 0.01 || b > PV.t0 + PV.span + 0.01) loadFrames(CLIP); }
  Array.prototype.forEach.call($('beats').children, function (b) { b.onclick = function () {
    if (!(S.bpm > 0)) { status('Set the BPM first.', 'err'); return; }
    S.outN = Math.max(2, Math.round(+b.dataset.b * 60 / S.bpm * (COMP.fps || 50))); syncInputs(); recompute(); }; });
  $('fit').onchange = function () { S.fit = this.checked; if (S.fit && SOL) S.srcOut = +SOL.srcEnd.toFixed(3); syncInputs(); recompute(); };
  $('snap').onchange = function () { S.snap = this.checked; save(); };
  $('blend').onchange = function () { S.blend = this.value; recompute(); renderAt(curF); };
  $('mblur').onchange = function () { S.mblur = this.checked; recompute(); renderAt(curF); };
  $('shutter').oninput = function () { S.shutter = +this.value; $('shV').textContent = S.shutter + '°'; recompute(); renderAt(curF); };
  $('loop').onchange = function () { S.loop = this.checked; save(); };

  // ------------------------------------------------------------------ preview
  var V = $('view'), vx = V.getContext('2d'), curF = 0, playing = false, t0p = 0, raf = 0;
  function sizeView() { var f = FR[0]; var w = f ? (f.naturalWidth || f.width) : 270, h = f ? (f.naturalHeight || f.height) : 480;
    if (!w) { setTimeout(sizeView, 100); return; } V.width = w; V.height = h; V.style.height = Math.min(360, h) + 'px'; renderAt(curF); }
  function frameAt(sec) { if (!CLIP || !FRN || !PV) return null; return ((sec - PV.st) * PV.k - PV.t0) * PV.fps; }
  function img(i) { i = Math.max(0, Math.min(FRN - 1, i)); var im = FR[i]; return im && (im.complete === undefined || im.complete) ? im : null; }
  var OFF = document.createElement('canvas'), ox = OFF.getContext('2d');
  function drawSrc(sec, alpha) {          // one source sample (with frame blending) -> offscreen, then composite at alpha
    var fi = frameAt(sec); if (fi === null) return;
    var a = Math.floor(fi + 1e-6), fr = fi - a, A = img(a);
    if (!A) return;
    if (OFF.width !== V.width || OFF.height !== V.height) { OFF.width = V.width; OFF.height = V.height; }
    ox.globalAlpha = 1; ox.drawImage(A, 0, 0, V.width, V.height);
    if (S.blend !== 'none' && fr > 0.02) { var B = img(a + 1); if (B) { ox.globalAlpha = fr; ox.drawImage(B, 0, 0, V.width, V.height); } }
    vx.globalAlpha = alpha; vx.drawImage(OFF, 0, 0);
  }
  function ruler(sec) {   // timing ruler for precomps without video: ticks scroll at the ramp speed
    if (V.width < 10) { V.width = 270; V.height = 480; V.style.height = '360px'; }
    var w = V.width, h = V.height, pps = w * 0.6; vx.fillStyle = '#10131a'; vx.fillRect(0, 0, w, h);
    vx.strokeStyle = 'rgba(255,255,255,.5)'; vx.fillStyle = '#fff'; vx.font = '11px sans-serif'; vx.textAlign = 'center';
    for (var t = Math.floor(sec - 1); t <= sec + 1; t += 0.1) { var x = w / 2 + (t - sec) * pps, big = Math.abs(t - Math.round(t)) < 0.01;
      vx.beginPath(); vx.moveTo(x, h / 2 - (big ? 40 : 14)); vx.lineTo(x, h / 2 + (big ? 40 : 14)); vx.stroke(); if (big) vx.fillText(Math.round(t) + ' s', x, h / 2 + 58); }
    vx.fillStyle = '#ff9f1a'; vx.fillRect(w / 2 - 1, h / 2 - 70, 2, 140); vx.font = 'bold 18px sans-serif'; vx.fillText(sec.toFixed(2) + ' s', w / 2, h / 2 - 84);
  }
  function srcAtOut(x) {   // fractional output frame -> source seconds (linear between baked frames)
    var s = SOL.src, i = Math.max(0, Math.min(s.length - 2, Math.floor(x))), f = x - i; return s[i] + (s[i + 1] - s[i]) * f;
  }
  function renderAt(n) {
    curF = n; if (!SOL) return;
    vx.globalAlpha = 1; vx.fillStyle = '#000'; vx.fillRect(0, 0, V.width, V.height);
    var fps = COMP.fps || 50;
    if (!FRN) { ruler(SOL.src[Math.min(n, SOL.src.length - 1)]); }
    else {
    if ($('showSrc').checked) drawSrc(S.srcIn + n / fps, 1);
    else if (S.mblur && S.shutter > 0) {
      var span = S.shutter / 360, ns = 8;
      for (var k = 0; k < ns; k++) drawSrc(srcAtOut(n + span * (k / ns - 0.5) + 0.0001), 1 / (k + 1));
    } else drawSrc(SOL.src[Math.min(n, SOL.src.length - 1)], 1);
    }
    vx.globalAlpha = 1;
    var sp = SOL.speed[Math.min(n, SOL.speed.length - 1)] || 0;
    $('readout').textContent = Math.round(sp) + ' %';
    $('tc').textContent = 'frame ' + n + ' / ' + S.outN + '  ·  source ' + SOL.src[Math.min(n, SOL.src.length - 1)].toFixed(2) + ' s';
    playT = n / S.outN; drawGraph();
  }
  function tick(now) {
    if (!playing) return;
    var fps = COMP.fps || 50, n = Math.floor((now - t0p) / 1000 * fps);
    if (n > S.outN) { if (S.loop) { t0p = now; n = 0; } else { pause(); renderAt(S.outN); return; } }
    if (n !== curF) renderAt(n);
    raf = requestAnimationFrame(tick);
  }
  function play() { if (!SOL) return; playing = true; $('play').textContent = '❚❚ Pause'; t0p = performance.now() - (curF >= S.outN ? 0 : curF) / (COMP.fps || 50) * 1000; if (curF >= S.outN) curF = 0; raf = requestAnimationFrame(tick); }
  function pause() { playing = false; $('play').textContent = '▶︎ Play'; cancelAnimationFrame(raf); }
  $('play').onclick = function () { playing ? pause() : play(); };
  document.addEventListener('keydown', function (e) { if (e.code === 'Space' && e.target.tagName !== 'INPUT') { e.preventDefault(); playing ? pause() : play(); } });
  $('showSrc').onchange = function () { renderAt(curF); };

  // ------------------------------------------------------------------ apply
  function apply(toSel) {
    if (!CLIP) { status('Pick a clip first.', 'err'); return; }
    if (!CEP) { status('Browser test mode: would apply ' + S.outN + ' frames (source ' + S.srcIn.toFixed(2) + '→' + SOL.srcEnd.toFixed(2) + ' s).', 'ok'); return; }
    refresh(function (o) {
      var li = 0, at = COMP.time;
      if (toSel) {
        var ly = o.layer && TGT && o.layer.itemId === TGT.itemId ? o.layer : null;
        if (!ly) { status('Select the target layer in the timeline (one video layer), then Apply.', 'err'); return; }
        if (ly.itemId !== CLIP.id) { useLayer(ly); status('Switched to the selected layer. Check the curve and press Apply again.', 'err'); return; }
        li = ly.index; at = ly.inPoint;
      }
      if (!o.comp) { status('Open a composition first.', 'err'); return; }
      recompute();
      var settings = {}; for (var k in DEF) settings[k] = S[k];
      var payload = { itemId: CLIP.id, layerIndex: li, at: at, src: SOL.src.map(function (v) { return +v.toFixed(5); }), blend: S.blend,
        mblur: S.mblur && S.shutter > 0, shutter: S.shutter, name: CLIP.name.replace(/\.[^.]+$/, '') + ' RAMP', settings: JSON.stringify(settings) };
      status('Applying…');
      evalES('r1337_apply(' + JSON.stringify(JSON.stringify(payload)) + ')', function (r) {
        var res; try { res = JSON.parse(r); } catch (e) { res = { ok: false, err: r }; }
        status(res.ok ? res.msg + ' (Cmd/Ctrl+Z undoes it)' : res.err, res.ok ? 'ok' : 'err');
      });
    });
  }
  $('applySel').onclick = function () { apply(true); };
  $('applyNew').onclick = function () { apply(false); };

  window.addEventListener('resize', function () { drawGraph(); drawStrip(); });
  syncInputs(); markTarget();
  refresh(function (o) { if (o && o.layer) useLayer(o.layer, true); if (!CEP && CLIPS.length) pickClip(CLIPS[0]); recompute(); });
})();
