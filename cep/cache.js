/* 1337ramp preview cache housekeeping (no DOM). The panel writes proxy frames to <tmp>/1337ramp/<hash>/;
   prune() removes cache folders not used for maxDays, touch() marks a folder as used when it is reused.
   fs/path are passed in so the same code runs in the CEP panel and in node tests. */
(function (root) {
  'use strict';
  function touch(fs, dir, now) { try { var t = new Date(now || Date.now()); fs.utimesSync(dir, t, t); } catch (e) {} }
  function prune(fs, path, base, maxDays, now) {
    var removed = 0, cutoff = (now || Date.now()) - maxDays * 864e5, names = [];
    try { names = fs.readdirSync(base); } catch (e) { return 0; }
    names.forEach(function (n) {
      if (!/^[0-9a-f]{12}$/.test(n)) return;                 // only our own hash folders
      var d = path.join(base, n), st;
      try { st = fs.statSync(d); } catch (e) { return; }
      if (!st.isDirectory() || st.mtimeMs >= cutoff) return;
      try { fs.rmSync(d, { recursive: true, force: true }); removed++; } catch (e) {}
    });
    return removed;
  }
  var API = { prune: prune, touch: touch };
  if (typeof window !== 'undefined') window.RAMPCACHE = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(this);
