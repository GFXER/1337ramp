// node test/cache_test.js : prune() removes only stale 1337ramp hash folders
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const C = require(path.join(__dirname, '..', 'cep', 'cache.js'));
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ramp-cache-test-'));
const mk = (name, daysOld) => { const d = path.join(base, name); fs.mkdirSync(d); fs.writeFileSync(path.join(d, 'f_00001.jpg'), 'x');
  const t = new Date(Date.now() - daysOld * 864e5); fs.utimesSync(d, t, t); return d; };
const oldHash = mk('aaaaaaaaaaaa', 30), freshHash = mk('bbbbbbbbbbbb', 2), notOurs = mk('keep-me', 90);
const reused = mk('cccccccccccc', 30); C.touch(fs, reused);
const n = C.prune(fs, path, base, 14);
assert.strictEqual(n, 1, 'exactly one stale folder removed');
assert.ok(!fs.existsSync(oldHash), 'stale hash folder removed');
assert.ok(fs.existsSync(freshHash), 'recent folder kept');
assert.ok(fs.existsSync(notOurs), 'folders that are not ours are never touched');
assert.ok(fs.existsSync(reused), 'touch() keeps a reused folder alive');
assert.strictEqual(C.prune(fs, path, path.join(base, 'missing'), 14), 0, 'missing cache dir is fine');
fs.rmSync(base, { recursive: true, force: true });
console.log('cache_test: 6 checks passed');
