// 1337ramp host side (After Effects). Returns JSON strings (hand-rolled: ExtendScript has no JSON).
function r1337_q(s) { return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '') + '"'; }
function r1337_str(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return isFinite(v) ? String(v) : 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'string') return r1337_q(v);
  if (v instanceof Array) { var a = []; for (var i = 0; i < v.length; i++) a.push(r1337_str(v[i])); return '[' + a.join(',') + ']'; }
  var o = []; for (var k in v) if (v.hasOwnProperty(k)) o.push(r1337_q(k) + ':' + r1337_str(v[k])); return '{' + o.join(',') + '}';
}
function r1337_folderPath(it) { var p = []; var f = it.parentFolder; while (f && f !== app.project.rootFolder) { p.unshift(f.name); f = f.parentFolder; } return p.join(' / '); }
function r1337_isVideo(it) {
  return (it instanceof FootageItem) && it.mainSource && (it.mainSource instanceof FileSource) && it.hasVideo && !it.mainSource.isStill && it.file;
}
function r1337_rampable(it) { return r1337_isVideo(it) || ((it instanceof CompItem) && it.numLayers > 0); }
// preview source for a precomp: the main video layer inside (recursing into nested precomps), as footage time = (t - st) * k
function r1337_pv(it, depth) {
  if (r1337_isVideo(it)) return { path: it.file.fsName.replace(/\\/g, '/'), fps: it.frameRate, dur: it.duration, st: 0, k: 1, w: it.width, h: it.height };
  if (!(it instanceof CompItem) || depth > 4) return null;
  var best = null, cover = 0;
  for (var i = 1; i <= it.numLayers; i++) {
    var L = it.layer(i); if (!L.enabled || !L.source || !L.hasVideo) continue;
    if (!(r1337_isVideo(L.source) || L.source instanceof CompItem)) continue;
    var c = Math.min(L.outPoint, it.duration) - Math.max(L.inPoint, 0);
    if (c > cover + 1e-3) { cover = c; best = L; }
  }
  if (!best) return null;
  var inner = r1337_pv(best.source, depth + 1); if (!inner) return null;
  var k1 = 100 / best.stretch;   // inner time = (t - startTime) * k1, then the inner mapping
  return { path: inner.path, fps: inner.fps, dur: inner.dur, st: best.startTime + inner.st / k1, k: k1 * inner.k, w: inner.w, h: inner.h, via: best.name };
}
function r1337_clipInfo(it) {
  var isComp = it instanceof CompItem;
  var o = { id: it.id, name: it.name, kind: isComp ? 'comp' : 'footage', folder: r1337_folderPath(it), fps: it.frameRate, dur: it.duration, w: it.width, h: it.height,
    path: isComp ? '' : it.file.fsName.replace(/\\/g, '/') };
  if (!isComp) o.pv = r1337_pv(it, 0);          // precomps: left out, fetched on demand by the panel (r1337_pvOf)
  return o;
}
// active comp even when the Layer/Footage viewer or the Project panel has focus
function r1337_comp() {
  var c = app.project.activeItem; if (c instanceof CompItem) return c;
  var best = null;
  for (var i = 1; i <= app.project.numItems; i++) { var it = app.project.item(i); if ((it instanceof CompItem) && it.selectedLayers.length > 0) { best = it; break; } }
  return best;
}
function r1337_layerInfo(c) {
  var sl = c.selectedLayers; if (sl.length !== 1) return null;
  var L = sl[0]; if (!L.source || !r1337_rampable(L.source)) return null;
  var s0 = L.timeRemapEnabled ? L.property('ADBE Time Remapping').valueAtTime(L.inPoint, false) : (L.inPoint - L.startTime) * 100 / L.stretch;
  return { index: L.index, name: L.name, itemId: L.source.id, inPoint: L.inPoint, outPoint: L.outPoint, srcAtIn: s0, comment: L.comment || '' };
}
function r1337_sel() {
  try { var c = r1337_comp(); if (!c) return r1337_str({ ok: true, comp: null, layer: null });
    return r1337_str({ ok: true, comp: { name: c.name, fps: c.frameRate, time: c.time, w: c.width, h: c.height }, layer: r1337_layerInfo(c) });
  } catch (e) { return r1337_str({ ok: false, err: e.message + ' (line ' + e.line + ')' }); }
}
function r1337_state() {
  try {
    var P = app.project, clips = [], c0 = r1337_comp();
    for (var i = 1; i <= P.numItems; i++) { var it = P.item(i); if (r1337_rampable(it) && it !== c0) clips.push(r1337_clipInfo(it)); }
    var c = c0, comp = null, layer = null;
    if (c) { comp = { name: c.name, fps: c.frameRate, time: c.time, w: c.width, h: c.height }; layer = r1337_layerInfo(c); }
    return r1337_str({ ok: true, clips: clips, comp: comp, layer: layer });
  } catch (e) { return r1337_str({ ok: false, err: e.message + ' (line ' + e.line + ')' }); }
}
// strict JSON reader (ES3, no eval): plain data only -> objects, arrays, strings, numbers, true/false/null
function r1337_parse(t) {
  var i = 0, n = t.length;
  function err(m) { throw new Error('Bad settings JSON: ' + m + ' at ' + i); }
  function ws() { while (i < n) { var c = t.charAt(i); if (c === ' ' || c === '\t' || c === '\n' || c === '\r') i++; else break; } }
  function str() {
    var out = ''; i++;
    while (i < n) {
      var c = t.charAt(i++);
      if (c === '"') return out;
      if (c === '\\') {
        var e = t.charAt(i++);
        if (e === 'n') out += '\n'; else if (e === 't') out += '\t'; else if (e === 'r') out += '\r'; else if (e === 'b') out += '\b'; else if (e === 'f') out += '\f';
        else if (e === 'u') { var h = t.substr(i, 4); if (!/^[0-9a-fA-F]{4}$/.test(h)) err('bad \\u escape'); out += String.fromCharCode(parseInt(h, 16)); i += 4; }
        else if (e === '"' || e === '\\' || e === '/') out += e; else err('bad escape');
      } else if (c < ' ') err('control character in string'); else out += c;
    }
    err('unterminated string');
  }
  function num() { var m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(t.substr(i)); if (!m) err('bad number'); i += m[0].length; return parseFloat(m[0]); }
  function lit(w, v) { if (t.substr(i, w.length) !== w) err('unexpected token'); i += w.length; return v; }
  function val() {
    ws(); if (i >= n) err('unexpected end');
    var c = t.charAt(i);
    if (c === '{') { i++; var o = {}; ws(); if (t.charAt(i) === '}') { i++; return o; }
      for (;;) { ws(); if (t.charAt(i) !== '"') err('expected key'); var k = str(); ws(); if (t.charAt(i++) !== ':') err('expected :'); o[k] = val(); ws();
        var d = t.charAt(i++); if (d === '}') return o; if (d !== ',') err('expected , or }'); } }
    if (c === '[') { i++; var a = []; ws(); if (t.charAt(i) === ']') { i++; return a; }
      for (;;) { a.push(val()); ws(); var d2 = t.charAt(i++); if (d2 === ']') return a; if (d2 !== ',') err('expected , or ]'); } }
    if (c === '"') return str();
    if (c === 't') return lit('true', true); if (c === 'f') return lit('false', false); if (c === 'n') return lit('null', null);
    return num();
  }
  var v = val(); ws(); if (i !== n) err('trailing data'); return v;
}
/* apply: o = {itemId, layerIndex (0 = add new), at (comp time), fps, src: [source seconds per output frame], blend: none|mix|pixel,
   mblur, shutter, name, settings (string saved in the layer comment so the panel can re-open the ramp)} */
function r1337_apply(js) {
  try {
    var o = r1337_parse(String(js)), c = r1337_comp();
    if (!(c instanceof CompItem)) return r1337_str({ ok: false, err: 'Open a composition first.' });
    var it = app.project.itemByID(o.itemId); if (!it) return r1337_str({ ok: false, err: 'Clip not found in the project.' });
    app.beginUndoGroup('1337ramp');
    var L;
    if (o.layerIndex > 0) { L = c.layer(o.layerIndex); if (!L || !L.source || L.source.id !== it.id) { app.endUndoGroup(); return r1337_str({ ok: false, err: 'Selected layer changed. Re-select it and try again.' }); } }
    else { L = c.layers.add(it); L.name = o.name || (it.name + ' RAMP'); }
    var fd = 1 / c.frameRate, N = o.src.length - 1, T0 = Math.round(o.at / fd) * fd;
    L.timeRemapEnabled = false; L.stretch = 100; L.startTime = T0;
    L.timeRemapEnabled = true;
    var tr = L.property('ADBE Time Remapping');
    var tt = [], vv = [], maxS = it.duration - it.frameDuration;
    for (var i = 0; i <= N; i++) { tt.push(T0 + i * fd); vv.push(Math.max(0, Math.min(maxS, o.src[i]))); }
    tr.setValuesAtTimes(tt, vv);                            // write first: removing every key hides the property in AE 26
    var tA = tt[0] - fd / 4, tB = tt[tt.length - 1] + fd / 4;
    for (var k0 = tr.numKeys; k0 >= 1; k0--) { var kt = tr.keyTime(k0); if (kt < tA || kt > tB) tr.removeKey(k0); }
    for (var k = 1; k <= tr.numKeys; k++) tr.setInterpolationTypeAtKey(k, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR);
    L.inPoint = T0; L.outPoint = T0 + N * fd;               // AE 26.5: set inPoint first, then outPoint
    try { if (o.blend === 'pixel') { L.frameBlendingType = FrameBlendingType.PIXEL_MOTION; c.frameBlending = true; }
    else if (o.blend === 'mix') { L.frameBlendingType = FrameBlendingType.FRAME_MIX; c.frameBlending = true; }
    else L.frameBlendingType = FrameBlendingType.NO_FRAME_BLEND; } catch (eb) {}
    L.motionBlur = !!o.mblur; if (o.mblur) { c.motionBlur = true; if (o.shutter) c.shutterAngle = o.shutter; }
    try { L.comment = '1337ramp:' + o.settings; } catch (e) {}
    L.label = 8; L.selected = true;
    app.endUndoGroup();
    return r1337_str({ ok: true, msg: 'Ramp applied to "' + L.name + '": ' + N + ' frames at ' + T0.toFixed(2) + ' s.' });
  } catch (e) { try { app.endUndoGroup(); } catch (x) {} return r1337_str({ ok: false, err: e.message + ' (line ' + e.line + ')' }); }
}

function r1337_pvOf(id) { try { var it = app.project.itemByID(id); var p = it ? r1337_pv(it, 0) : null; return r1337_str({ ok: true, pv: p }); } catch (e) { return r1337_str({ ok: false, err: e.message }); } }
