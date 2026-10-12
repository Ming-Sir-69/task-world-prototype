import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
test('generated content is exactly the synthetic input and exposes no source integrations', () => {
  const sandbox = {window: {}};
  vm.runInNewContext(read('dist/content.js'), sandbox, {timeout: 2000});
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.window.TASK_WORLD_CONTENT)), JSON.parse(read('demo.json')));
  assert.equal(sandbox.window.TASK_WORLD_CONTENT.snapshot.synthetic, true);
  assert.doesNotMatch(read('dist/app.js'), /(?:fetch\s*\(|XMLHttpRequest|sendBeacon\s*\(|new\s+WebSocket)/);
});
test('responsive CSS retains recognized media rules after sanitization', () => {
  const css = read('dist/style.css');
  assert.ok((css.match(/@media/g) || []).length >= 4);
  const atRules = [...css.matchAll(/@([a-z-]+)/g)].map(m => m[1]);
  assert.ok(atRules.every(rule => ['media','keyframes','supports','container','layer'].includes(rule)));
});
