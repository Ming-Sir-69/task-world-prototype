import {readFileSync, writeFileSync, renameSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root = new URL('../', import.meta.url);
const data = JSON.parse(readFileSync(new URL('demo.json', root), 'utf8'));
assert.equal(data.snapshot.synthetic, true, 'Only synthetic demo content is accepted');
assert.equal(data.snapshot.readOnly, true);
assert.equal(data.snapshot.runtimeAI, false);
assert.deepEqual(data.worlds.map(w => w.id), ['garden','harbor','chimes','seeds','clouds','stars']);
const states = new Set(['done','blocked','review','paused','planned','unknown']);
const seen = new Set();
for (const world of data.worlds) {
  assert.equal(world.nodes.length, 3, 'The frozen demo uses three stages per area');
  for (const node of world.nodes) {
    assert.ok(!seen.has(node.id)); seen.add(node.id);
    assert.ok(states.has(node.state));
    assert.deepEqual(Object.keys(node.sections).sort(), ['blockers','nextSteps','progress','results']);
  }
  for (const edge of world.edges) {
    assert.ok(world.nodes.some(n => n.id === edge.from));
    assert.ok(world.nodes.some(n => n.id === edge.to));
  }
}
const content = '// Generated only from synthetic demo.json. Do not enter private data.\nwindow.TASK_WORLD_CONTENT = ' + JSON.stringify(data).replace(/</g, '\\u003c') + ';\nwindow.TASK_WORLDS = window.TASK_WORLD_CONTENT.worlds;\nwindow.TASK_WORLD_SNAPSHOT = window.TASK_WORLD_CONTENT.snapshot;\n';
if (!process.argv.includes('--validate-only')) {
  const output = fileURLToPath(new URL('dist/content.js', root));
  writeFileSync(output + '.tmp', content); renameSync(output + '.tmp', output);
}
console.log(`Validated synthetic demo: ${data.worlds.length} areas, ${seen.size} stages.`);
