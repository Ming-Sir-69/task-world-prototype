/** Dependency-free reachability and read-only fact acceptance tests. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {makeScene, TOPICS} from '../dist/scenes.js';
import {createPlayer, updatePlayer, nearestInteractable, PLAYER_RADIUS, WALK_PADDING} from '../dist/engine.js';

const path = relative => fileURLToPath(new URL(relative, import.meta.url));
const contentFile = '../dist/content.js';
const sandbox = {window: {}};
vm.runInNewContext(readFileSync(path(contentFile), 'utf8'), sandbox, {filename: contentFile, timeout: 2000});
const worlds = JSON.parse(JSON.stringify(sandbox.window.TASK_WORLDS));
const originalFacts = JSON.stringify(worlds);
const freeze = value => { if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); } return value; };
freeze(worlds);
const app = readFileSync(path('../dist/app.js'), 'utf8');
const byId = id => worlds.flatMap(world => world.nodes).find(node => node.id === id);
const GRID = 16, INTERACTION_RADIUS = 84, EPSILON = 1e-6;

function isValidPosition(scene, x, y) {
  if (x < WALK_PADDING || x > scene.width - WALK_PADDING || y < WALK_PADDING || y > scene.height - WALK_PADDING) return false;
  if (scene.canWalk && !scene.canWalk(x, y, PLAYER_RADIUS)) return false;
  return scene.obstacles.every(o => {
    const nearestX = Math.max(o.x, Math.min(o.x + o.w, x));
    const nearestY = Math.max(o.y, Math.min(o.y + o.h, y));
    return Math.hypot(x - nearestX, y - nearestY) >= PLAYER_RADIUS - EPSILON;
  });
}

/**
 * Grid starts exactly at the spawn. Every BFS edge is replayed through the
 * production movement engine in substeps; a clear endpoint alone is insufficient.
 */
function explore(scene) {
  assert.ok(isValidPosition(scene, scene.spawn.x, scene.spawn.y), `${scene.id}: spawn overlaps a wall or lies outside walkable land`);
  const queue = [{x: scene.spawn.x, y: scene.spawn.y, gx: 0, gy: 0}], seen = new Set(['0,0']);
  const found = new Map(), best = new Map(scene.entities.map(e => [e.id, Infinity]));
  const offsets = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let head = 0; head < queue.length; head++) {
    const point = queue[head];
    for (const entity of scene.entities) {
      const distance = Math.hypot(point.x - entity.x, point.y - entity.y);
      if (distance < best.get(entity.id)) best.set(entity.id, distance);
      if (distance <= INTERACTION_RADIUS && !found.has(entity.id)) {
        // Confirm the production interaction helper accepts this exact position.
        assert.equal(nearestInteractable(point, [entity], INTERACTION_RADIUS), entity);
        found.set(entity.id, {x: point.x, y: point.y, distance});
      }
    }
    for (const [dx, dy] of offsets) {
      const gx = point.gx + dx, gy = point.gy + dy, key = `${gx},${gy}`;
      if (seen.has(key)) continue;
      const x = scene.spawn.x + gx * GRID, y = scene.spawn.y + gy * GRID;
      if (!isValidPosition(scene, x, y)) continue;
      const candidate = createPlayer(point.x, point.y);
      updatePlayer(candidate, {x: dx, y: dy}, GRID / candidate.speed, scene);
      if (Math.abs(candidate.x - x) > EPSILON || Math.abs(candidate.y - y) > EPSILON) continue;
      assert.ok(isValidPosition(scene, candidate.x, candidate.y), `${scene.id}: engine entered an invalid position`);
      seen.add(key); queue.push({x, y, gx, gy});
    }
  }
  return {count: queue.length, found, best};
}

const scenes = [makeScene(worlds), ...worlds.flatMap(w => [makeScene(worlds, 'region', w.id),
  ...w.nodes.map(n => makeScene(worlds, 'stage', w.id, n.id))])];

test('snapshot has six unique worlds and a distinct third-layer stage for every project node', () => {
  assert.deepEqual(worlds.map(w => w.id), ['garden', 'harbor', 'chimes', 'seeds', 'clouds', 'stars']);
  assert.equal(new Set(worlds.map(w => w.id)).size, 6);
  const nodes = worlds.flatMap(w => w.nodes);
  assert.equal(new Set(nodes.map(n => n.id)).size, nodes.length);
  for (const w of worlds) {
    assert.ok(w.nodes.length > 0, `${w.id}: missing stages`);
    assert.ok(w.nodes.some(n => n.id === w.primaryNode), `${w.id}: missing primary node`);
    const region = makeScene(worlds, 'region', w.id);
    assert.equal(region.level, 'region');
    assert.equal(region.entities.filter(e => e.type === 'stage').length, w.nodes.length);
    for (const n of w.nodes) {
      const stage = makeScene(worlds, 'stage', w.id, n.id);
      assert.equal(stage.level, 'stage'); assert.equal(stage.world, w); assert.equal(stage.node, n);
      assert.deepEqual(stage.entities.filter(e => e.type === 'topic').map(e => e.topic), TOPICS.map(t => t.id));
      assert.ok(stage.entities.some(e => e.type === 'npc'));
      assert.ok(stage.entities.some(e => e.type === 'evidence'));
      assert.ok(stage.entities.some(e => e.type === 'exit'));
    }
    for (const edge of w.edges) {
      assert.ok(w.nodes.some(n => n.id === edge.from)); assert.ok(w.nodes.some(n => n.id === edge.to));
    }
  }
});

for (const scene of scenes) {
  test(`${scene.level}/${scene.id}: spawn and all ${scene.entities.length} interactions are reachable via 16px engine-checked BFS`, t => {
    const result = explore(scene);
    const missing = scene.entities.filter(e => !result.found.has(e.id));
    const detail = missing.map(e => `${e.id} (${e.x},${e.y}); closest reachable distance ${result.best.get(e.id).toFixed(1)}px`).join('; ');
    assert.equal(missing.length, 0, `${scene.id}: unreachable interactions: ${detail}`);
    t.diagnostic(`${result.count} reachable grid positions; ${result.found.size}/${scene.entities.length} interactions reached within ${INTERACTION_RADIUS}px`);
    assert.equal(JSON.stringify(worlds), originalFacts, 'Exploration mutated source project facts');
  });
}

