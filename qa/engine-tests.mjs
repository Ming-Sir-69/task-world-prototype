import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlayer, updatePlayer, cameraFor, worldToScreen, screenToWorld,
  nearestInteractable, InputState} from '../dist/engine.js';

const room = {width: 1600, height: 1200, obstacles: []};
const close = (actual, expected, epsilon = 1e-7) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} ≠ ${expected}`);
const advance = (player, input, seconds, scene = room, blocked = false) => {
  const frames = Math.round(seconds * 60);
  for (let i = 0; i < frames; i++) updatePlayer(player, input, 1 / 60, scene, blocked);
};
const overlaps = (p, o) => Math.hypot(p.x - Math.max(o.x, Math.min(o.x + o.w, p.x)),
  p.y - Math.max(o.y, Math.min(o.y + o.h, p.y))) < p.radius - 1e-7;

test('held key moves every frame; keyup stops without a repeated keydown', () => {
  const p = createPlayer(100, 100), input = new InputState();
  input.keyDown('ArrowRight');
  advance(p, input, 2);
  close(p.x, 460); close(p.y, 100);
  assert.equal(p.facing, 'right'); assert.equal(p.moving, true);
  input.keyUp('ArrowRight'); advance(p, input, 1);
  close(p.x, 460); assert.equal(p.moving, false); assert.equal(p.frame, 0);
});

test('WASD aliases and Arrow keys all control facing', () => {
  const input = new InputState(), p = createPlayer(500, 500);
  for (const [key, facing] of [['w', 'up'], ['a', 'left'], ['KeyS', 'down'], ['d', 'right']]) {
    input.keyDown(key); updatePlayer(p, input, 1 / 60, room);
    assert.equal(p.facing, facing); input.keyUp(key);
  }
  close(p.x, 500); close(p.y, 500); assert.equal(input.keyDown('Space'), false);
});

test('diagonal distance equals straight movement and duplicate directions add no speed', () => {
  const p = createPlayer(500, 500), input = new InputState();
  input.keyDown('KeyW'); input.keyDown('ArrowUp'); input.keyDown('ArrowRight');
  input.pointerDown(10, 'up'); advance(p, input, 1);
  close(Math.hypot(p.x - 500, p.y - 500), 180);
  close(p.x - 500, 500 - p.y);
});

test('opposing directions cancel; releasing one imgardentely restores the other', () => {
  const p = createPlayer(300, 300), input = new InputState();
  input.keyDown('a'); input.keyDown('d'); advance(p, input, 1);
  close(p.x, 300); input.keyUp('d'); advance(p, input, 1); close(p.x, 120);
});

test('frame delta is capped after stalls and invalid deltas do not move', () => {
  const p = createPlayer(100, 100);
  updatePlayer(p, {x: 1, y: 0}, 60, room); close(p.x, 118);
  for (const dt of [-1, NaN, Infinity, 0]) updatePlayer(p, {x: 1, y: 0}, dt, room);
  close(p.x, 118);
});

test('center walk bounds are 32px on all four edges', () => {
  const scene = {width: 200, height: 180, obstacles: []};
  const p = createPlayer(100, 100);
  advance(p, {x: -1, y: -1}, 2, scene); close(p.x, 32); close(p.y, 32);
  advance(p, {x: 1, y: 1}, 2, scene); close(p.x, 168); close(p.y, 148);
});

test('thin vertical wall cannot be tunneled even on a long frame', () => {
  const wall = {x: 250, y: 50, w: 1, h: 500}, scene = {...room, obstacles: [wall]};
  const p = createPlayer(238, 200);
  updatePlayer(p, {x: 1, y: 0}, 10, scene); close(p.x, 240);
  advance(p, {x: 1, y: 0}, 3, scene); close(p.x, 240);
  assert.equal(p.moving, false); assert.equal(overlaps(p, wall), false);
});

test('thin horizontal wall blocks both approach directions', () => {
  const wall = {x: 50, y: 250, w: 600, h: 0.5}, scene = {...room, obstacles: [wall]};
  const top = createPlayer(200, 238), bottom = createPlayer(200, 262);
  advance(top, {x: 0, y: 1}, 1, scene); close(top.y, 240);
  advance(bottom, {x: 0, y: -1}, 1, scene); close(bottom.y, 260.5);
});

test('holding diagonal slides along a wall without penetrating it', () => {
  const wall = {x: 250, y: 50, w: 20, h: 800}, scene = {...room, obstacles: [wall]};
  const p = createPlayer(235, 200);
  for (let i = 0; i < 90; i++) {
    updatePlayer(p, {x: 1, y: 1}, 1 / 60, scene);
    assert.equal(overlaps(p, wall), false);
  }
  close(p.x, 240); assert.ok(p.y > 350); assert.equal(p.facing, 'down');
});

test('an inside corner stops diagonal movement, but reverse motion escapes', () => {
  const obstacles = [{x: 250, y: 50, w: 20, h: 600}, {x: 50, y: 250, w: 600, h: 20}];
  const scene = {...room, obstacles}, p = createPlayer(220, 220);
  advance(p, {x: 1, y: 1}, 2, scene); close(p.x, 240); close(p.y, 240);
  for (const wall of obstacles) assert.equal(overlaps(p, wall), false);
  advance(p, {x: -1, y: -1}, 0.5, scene); assert.ok(p.x < 180 && p.y < 180);
});

test('rounded outside corners are collision safe on substepped diagonal movement', () => {
  const wall = {x: 250, y: 250, w: 80, h: 80}, scene = {...room, obstacles: [wall]};
  const p = createPlayer(220, 220);
  for (let i = 0; i < 100; i++) {
    updatePlayer(p, {x: 1, y: 1}, i % 2 ? 0.1 : 1 / 60, scene);
    assert.equal(overlaps(p, wall), false);
  }
});

test('optional island predicate prevents leaving a nonrectangular boundary', () => {
  const scene = {...room, canWalk: (x, y, radius) => Math.hypot(x - 400, y - 400) + radius <= 180};
  const p = createPlayer(400, 400);
  for (let i = 0; i < 240; i++) {
    updatePlayer(p, {x: 1, y: 1}, i % 3 ? 1 / 60 : 0.1, scene);
    assert.equal(scene.canWalk(p.x, p.y, p.radius), true);
  }
  assert.ok(Math.hypot(p.x - 400, p.y - 400) > 165);
  assert.ok(p.x < 580 && p.y < 580);
});

test('predicate boundaries and rectangle obstacles work together and allow escape', () => {
  const wall = {x: 350, y: 100, w: 1, h: 500};
  const scene = {...room, obstacles: [wall], canWalk: (x, y, radius) => x - radius >= 100 && y - radius >= 100 && x + radius <= 600 && y + radius <= 600};
  const p = createPlayer(300, 300);
  advance(p, {x: 1, y: 1}, 3, scene);
  close(p.x, 340); assert.ok(p.y <= 590 && p.y >= 586);
  assert.equal(overlaps(p, wall), false);
  advance(p, {x: -1, y: -1}, 0.5, scene);
  assert.ok(p.x < 280 && p.y < 530);
});

test('step frames animate only when moving; a modal blocks movement and animation', () => {
  const p = createPlayer(300, 300), input = new InputState(), frames = new Set();
  input.keyDown('d');
  for (let i = 0; i < 30; i++) { updatePlayer(p, input, 1 / 60, room); frames.add(p.frame); }
  assert.deepEqual([...frames].sort(), [0, 1, 2, 3]);
  const x = p.x, step = p.step;
  advance(p, input, 2, room, true);
  close(p.x, x); close(p.step, step); assert.equal(p.moving, false); assert.equal(p.frame, 0);
  input.clear(); advance(p, input, 1); close(p.x, x);
});

test('camera keeps player at viewport center at scene edges and every tested zoom', () => {
  for (const zoom of [0.65, 1, 1.5, 2.25]) {
    for (const p of [createPlayer(32, 32), createPlayer(1568, 1168)]) {
      const viewport = {width: 390, height: 650}, camera = cameraFor(p, viewport, zoom);
      const at = worldToScreen(p, camera); close(at.x, 195); close(at.y, 325);
    }
  }
  assert.ok(cameraFor(createPlayer(32, 32), {width: 800, height: 600}).x < 0);
});

test('browser client click converts back to world after viewport offset and camera pan/zoom', () => {
  const rect = {left: 278, top: 139, width: 960, height: 620};
  const marker = {x: 1385, y: 623};
  for (const zoom of [0.7, 1, 1.8]) {
    const camera = cameraFor(createPlayer(1200, 700), rect, zoom);
    const screen = worldToScreen(marker, camera);
    const browserClick = {clientX: rect.left + screen.x, clientY: rect.top + screen.y};
    const result = screenToWorld({x: browserClick.clientX - rect.left, y: browserClick.clientY - rect.top}, camera);
    close(result.x, marker.x); close(result.y, marker.y);
  }
});

test('nearest interaction is radius-limited, stable on ties, and skips disabled entities', () => {
  const p = createPlayer(300, 300), a = {id: 'a', x: 340, y: 300}, b = {id: 'b', x: 260, y: 300};
  assert.equal(nearestInteractable(p, [a, b]), a);
  assert.equal(nearestInteractable(p, [{x: 301, y: 300, disabled: true}, a]), a);
  assert.equal(nearestInteractable(p, [{x: 301, y: 300, interactive: false}, a]), a);
  assert.equal(nearestInteractable(p, [{x: 385, y: 300}])?.x, 385);
  assert.equal(nearestInteractable(p, [{x: 385.01, y: 300}]), null);
  assert.equal(nearestInteractable(p, [a], 39), null);
});

test('E/Enter interactions trigger once per press, never on key repeat', () => {
  const input = new InputState();
  for (const key of ['e', 'Enter']) {
    input.keyDown(key); assert.equal(input.consumeInteract(), true);
    input.keyDown(key); input.keyDown({key, repeat: true});
    assert.equal(input.consumeInteract(), false);
    input.keyUp(key); input.keyDown(key); assert.equal(input.consumeInteract(), true);
    assert.equal(input.consumeInteract(), false); input.keyUp(key);
  }
  input.clear(); input.keyDown({code: 'KeyE', repeat: true});
  assert.equal(input.consumeInteract(), false);
});

test('mobile pointer release and cancel stop only their own direction', () => {
  const input = new InputState(), p = createPlayer(400, 400);
  input.pointerDown(4, 'left'); input.pointerDown(7, 'up');
  assert.deepEqual(input.axis(), {x: -1, y: -1});
  input.pointerUp(4); assert.deepEqual(input.axis(), {x: 0, y: -1});
  advance(p, input, 1); close(p.x, 400); close(p.y, 220);
  input.pointerCancel(7); advance(p, input, 1); close(p.y, 220);
  assert.equal(input.pointers.size, 0);
});

test('mobile multitouch and keyboard release never clear another active source', () => {
  const input = new InputState();
  input.keyDown('w'); input.pointerDown(10, 'up'); input.pointerDown(11, 'up');
  input.keyUp('w'); input.pointerUp(10); assert.deepEqual(input.axis(), {x: 0, y: -1});
  input.pointerUp(11); assert.deepEqual(input.axis(), {x: 0, y: 0});
  input.pointerDown(12, 'left'); input.pointerDown(13, 'right');
  assert.deepEqual(input.axis(), {x: 0, y: 0});
  input.pointerCancel(13); assert.deepEqual(input.axis(), {x: -1, y: 0});
});

test('mobile interaction also triggers only once for a held pointer', () => {
  const input = new InputState();
  input.pointerDown(8, 'interact'); assert.equal(input.consumeInteract(), true);
  input.pointerDown(8, 'interact'); assert.equal(input.consumeInteract(), false);
  input.pointerUp(8); input.pointerDown(9, 'interact'); assert.equal(input.consumeInteract(), true);
});

test('clear removes held keyboard, multitouch, and pending interaction together', () => {
  const input = new InputState();
  input.keyDown('ArrowDown'); input.keyDown('e'); input.pointerDown(1, 'right');
  input.clear();
  assert.equal(input.keys.size, 0); assert.equal(input.pointers.size, 0);
  assert.deepEqual(input.axis(), {x: 0, y: 0}); assert.equal(input.consumeInteract(), false);
});

test('optional browser binding clears all input on blur/hidden and removes listeners', () => {
  const target = new EventTarget(); target.document = new EventTarget();
  const input = new InputState(), unbind = input.bind(target);
  const key = (type, code) => {
    const event = new Event(type, {cancelable: true}); Object.defineProperty(event, 'code', {value: code});
    target.dispatchEvent(event); return event;
  };
  assert.equal(key('keydown', 'KeyD').defaultPrevented, true);
  input.pointerDown(5, 'down'); input.keyDown('e'); target.dispatchEvent(new Event('blur'));
  assert.deepEqual(input.axis(), {x: 0, y: 0}); assert.equal(input.consumeInteract(), false);
  key('keydown', 'KeyW'); target.document.hidden = true;
  target.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(input.keys.size, 0);
  key('keydown', 'KeyA'); key('keyup', 'KeyA'); assert.equal(input.keys.size, 0);
  unbind(); key('keydown', 'KeyD'); assert.equal(input.keys.size, 0);
});
