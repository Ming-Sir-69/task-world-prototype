/** Actual app/engine/scenes/renderer in a deterministic DOM/canvas mock.
 * Logic acceptance only: this does NOT claim browser layout or native UI testing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync, existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const file = name => fileURLToPath(new URL('../dist/' + name, import.meta.url));
const plain = value => JSON.parse(JSON.stringify(value));

function createHarness() {
  let now = 1000, serial = 0;
  const timers = new Map(), frames = new Map(), elements = new Map(), storage = new Map();
  class Events {
    constructor() { this.listeners = new Map(); }
    addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); }
    removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
    dispatch(type, options = {}) {
      const event = {type, target: this, defaultPrevented: false, repeat: false, key: '',
        preventDefault() { this.defaultPrevented = true; }, ...options};
      this['on' + type]?.(event);
      for (const fn of [...(this.listeners.get(type) || [])]) fn(event);
      return event;
    }
  }
  function fakeContext(canvas) {
    const value = {canvas, measureText: text => ({width: String(text).length * 8}),
      createRadialGradient: () => ({addColorStop() {}}), createLinearGradient: () => ({addColorStop() {}})};
    return new Proxy(value, {get(target, key) { return key in target ? target[key] : () => {}; }});
  }
  class Element extends Events {
    constructor(id, tag = 'DIV') {
      super(); this.id = id; this.tagName = tag; this.innerHTML = ''; this.textContent = '';
      this.style = {}; this.dataset = {}; this.attributes = {}; this.clientWidth = 1280; this.clientHeight = 720;
      this.width = 184; this.height = 128; this.hidden = false; this.open = false;
      this.classes = new Set(); this.classList = {add: (...names) => names.forEach(n => this.classes.add(n)),
        remove: (...names) => names.forEach(n => this.classes.delete(n)), contains: n => this.classes.has(n),
        toggle: (name, force) => { const value = force ?? !this.classes.has(name); value ? this.classes.add(name) : this.classes.delete(name); return value; }};
    }
    setAttribute(key, value) { this.attributes[key] = String(value); }
    getAttribute(key) { return this.attributes[key] ?? null; }
    hasAttribute(key) { return key in this.attributes || (key.startsWith('data-') && key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase()) in this.dataset); }
    closest(selector) {
      if (selector === 'button') return this.tagName === 'BUTTON' ? this : null;
      return /input|textarea|select|contenteditable/.test(selector) && ['INPUT', 'TEXTAREA', 'SELECT'].includes(this.tagName) ? this : null;
    }
    querySelector(selector) { return get(this.id + ' ' + selector, selector === 'button' ? 'BUTTON' : 'DIV'); }
    focus() { document.activeElement = this; }
    showModal() { this.open = true; }
    close() { if (!this.open) return; this.open = false; setTimer(() => this.dispatch('close'), 0); }
    getContext() { return this.context ||= fakeContext(this); }
    getBoundingClientRect() { return {left: 110, top: 65, width: this.clientWidth, height: this.clientHeight}; }
    setPointerCapture(id) { this.capturedPointer = id; }
    scrollTo(value) { this.scrollLeft = value.left || 0; }
  }
  function get(id, tag) {
    if (!elements.has(id)) elements.set(id, new Element(id, tag || (id.includes('button') || id === 'panel-close' ? 'BUTTON' : id.includes('canvas') || id === 'minimap' ? 'CANVAS' : 'DIV')));
    return elements.get(id);
  }
  function setTimer(fn, delay = 0) { const id = ++serial; timers.set(id, {fn, at: now + delay}); return id; }
  const document = new Events();
  document.body = get('body'); document.hidden = false;
  document.getElementById = id => get(id);
  document.querySelector = selector => get(selector);
  const touch = Object.fromEntries(['up', 'down', 'left', 'right', 'interact'].map(direction => {
    const el = get('touch-' + direction, 'BUTTON'); el.dataset.dir = direction; return [direction, el];
  }));
  document.querySelectorAll = selector => selector === '[data-dir]' ? Object.values(touch) : [];
  document.createElement = tag => new Element('created-' + (++serial), tag.toUpperCase());
  const windowEvents = new Events(), historyEntries = ['#world']; let historyIndex = 0;
  const location = {hash: ''};
  const history = {pushState(_state, _title, hash) { historyEntries.splice(historyIndex + 1); historyEntries.push(hash); historyIndex++; location.hash = hash; },
    back() { if (historyIndex > 0) { location.hash = historyEntries[--historyIndex]; windowEvents.dispatch('popstate'); } },
    forward() { if (historyIndex + 1 < historyEntries.length) { location.hash = historyEntries[++historyIndex]; windowEvents.dispatch('popstate'); } }};
  const context = {console, document, innerWidth: 1280, innerHeight: 720, devicePixelRatio: 2, location, history,
    performance: {now: () => now}, Date, setTimeout: setTimer, clearTimeout: id => timers.delete(id),
    requestAnimationFrame: fn => { const id = ++serial; frames.set(id, fn); return id; }, cancelAnimationFrame: id => frames.delete(id),
    localStorage: {getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value))},
    addEventListener: (name, fn) => windowEvents.addEventListener(name, fn), removeEventListener: (name, fn) => windowEvents.removeEventListener(name, fn),
    Image: class { set src(value) { this._src = value; setTimer(() => this.onload?.(), 0); } }};
  context.window = context; vm.createContext(context);
  const run = source => vm.runInContext(source, context, {timeout: 2000});
  const loadModule = (name, exports) => run(`Object.assign(globalThis, (()=>{${readFileSync(file(name), 'utf8').replace(/^import .*\n/gm, '').replace(/^export /gm, '')}\nreturn {${exports.join(',')}};})())`);
  run(readFileSync(file(existsSync(file('content.js')) ? 'content.js' : 'data.js'), 'utf8'));
  loadModule('vendor/pixel-agents/index.js', ['startAnimationLoop', 'drawSprite', 'sortByDepth']);
  loadModule('engine.js', ['InputState', 'createPlayer', 'updatePlayer', 'cameraFor', 'screenToWorld', 'worldToScreen', 'nearestInteractable']);
  loadModule('scenes.js', ['makeScene', 'TOPICS']);
  loadModule('renderer.js', ['renderScene', 'renderMinimap', 'drawActor', 'COLORS']);
  run(readFileSync(file('app.js'), 'utf8').replace(/^import .*\n/gm, ''));
  function tick(ms) {
    const end = now + ms;
    for (;;) {
      const due = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      now = due[1].at; timers.delete(due[0]); due[1].fn();
    }
    now = end;
  }
  function frame(ms = 17) {
    tick(ms); const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(fn => fn(now));
  }
  function key(type, key, repeat = false) {
    const code = /^[wasdemj]$/i.test(key) ? 'Key' + key.toUpperCase() : key;
    return windowEvents.dispatch(type, {key, code, repeat, target: get('world-canvas')});
  }
  function moveNear(entityId) {
    const entity = context.TASK_WORLD_VIEW.scene().entities.find(e => e.id === entityId);
    assert.ok(entity, 'Unknown test entity: ' + entityId);
    run(`player.x=${entity.x};player.y=${entity.y};`); context.TASK_WORLD_VIEW.update(0);
    return entity;
  }
  tick(0);
  return {context, view: context.TASK_WORLD_VIEW, get, run, tick, frame, key, moveNear, touch, document,
    events: windowEvents, storage, location, history, frames, historyEntries,
    state: () => plain(context.TASK_WORLD_VIEW.getState())};
}

test('actual app holds movement, clears on release, and remains camera-centered', () => {
  const h = createHarness(), before = h.state().player;
  h.key('keydown', 'ArrowLeft'); for (let i = 0; i < 30; i++) h.view.update(1 / 60);
  assert.ok(h.state().player.x < before.x - 80);
  h.key('keyup', 'ArrowLeft'); const stopped = h.state().player.x;
  h.view.update(0.1); assert.equal(h.state().player.x, stopped);
  const screen = h.view.worldToScreen(h.state().player); assert.equal(screen.x, 640); assert.equal(screen.y, 360);
});

test('overlay stops movement and closing clears keys pressed while it was open', () => {
  const h = createHarness(); h.view.enter('harbor'); h.tick(250);
  h.key('keydown', 'w'); h.view.showNpc(); const before = h.state().player;
  h.key('keydown', 'd'); for (let i = 0; i < 60; i++) h.view.update(1 / 60);
  assert.equal(h.state().overlay, 'npc'); assert.equal(h.get('panel').open, true);
  assert.equal(h.state().player.x, before.x); assert.equal(h.state().player.y, before.y);
  h.key('keydown', 'Escape'); assert.equal(h.state().overlay, null); assert.equal(h.get('panel').open, false);
  h.tick(0); h.view.update(0.1); assert.equal(h.state().player.x, before.x); assert.equal(h.view.input.keys.size, 0);
});

test('held E enters one layer only; repeats cannot enter another after transition', () => {
  const h = createHarness(); h.moveNear('portal-harbor');
  h.key('keydown', 'e'); h.view.update(0.016); assert.equal(h.state().level, 'region');
  h.moveNear('stage-harbor-stage-1'); h.key('keydown', 'e', true); h.view.update(0.016);
  assert.equal(h.state().level, 'region');
  h.tick(250); h.key('keydown', 'e', true); h.view.update(0.016); assert.equal(h.state().level, 'region');
  h.key('keyup', 'e'); h.key('keydown', 'e'); h.view.update(0.016);
  assert.equal(h.state().level, 'stage'); assert.equal(h.state().node, 'harbor-stage-1');
});

test('repeated canvas pointer clicks cannot skip two layers', () => {
  const h = createHarness(), entity = h.moveNear('portal-harbor');
  const p = h.view.worldToScreen(entity), rect = h.get('world-canvas').getBoundingClientRect();
  const click = {clientX: rect.left + p.x, clientY: rect.top + p.y};
  h.get('world-canvas').dispatch('pointerdown', click);
  h.get('world-canvas').dispatch('pointerdown', click);
  assert.equal(h.state().level, 'region'); assert.equal(h.state().world, 'harbor');
  assert.equal(h.historyEntries.length, 2);
});

test('Escape closes a dialog first, then exits one level; held repeats never cascade', () => {
  const h = createHarness(); h.view.stage('garden', 'garden-stage-2'); h.tick(250); h.view.showNpc();
  h.key('keydown', 'Escape'); assert.equal(h.state().overlay, null); assert.equal(h.state().level, 'stage');
  h.tick(250); h.key('keydown', 'Escape', true); assert.equal(h.state().level, 'stage');
  h.key('keyup', 'Escape'); h.key('keydown', 'Escape'); assert.equal(h.state().level, 'region');
  h.tick(250); h.key('keydown', 'Escape', true); assert.equal(h.state().level, 'region');
  h.key('keyup', 'Escape'); h.key('keydown', 'Escape'); assert.equal(h.state().level, 'world');
});

test('browser back/forward restores levels, including rapid popstate during transitions', () => {
  const h = createHarness(); h.view.enter('harbor'); h.tick(250); h.view.stage('harbor', 'harbor-stage-2'); h.tick(250);
  assert.equal(h.location.hash, '#harbor/harbor-stage-2');
  h.history.back(); assert.equal(h.state().level, 'region'); assert.equal(h.location.hash, '#harbor');
  h.history.back(); assert.equal(h.state().level, 'world'); assert.equal(h.location.hash, '#world');
  h.history.forward(); assert.equal(h.state().level, 'region'); assert.equal(h.location.hash, '#harbor');
  h.history.forward(); assert.equal(h.state().node, 'harbor-stage-2'); assert.equal(h.location.hash, '#harbor/harbor-stage-2');
  h.tick(250); assert.equal(h.state().node, 'harbor-stage-2');
});

test('pagehide and BFCache pageshow restart animation without stuck input', () => {
  const h = createHarness(); h.frame(); assert.ok(h.frames.size > 0);
  h.key('keydown', 'ArrowLeft'); h.events.dispatch('pagehide', {persisted: true});
  assert.equal(h.frames.size, 0); assert.equal(h.view.input.keys.size, 0);
  h.events.dispatch('pageshow', {persisted: true}); assert.ok(h.frames.size > 0);
  const before = h.state().player.x; h.frame(); h.frame(); assert.equal(h.state().player.x, before);
  h.key('keydown', 'ArrowLeft'); h.frame(); h.frame(); assert.ok(h.state().player.x < before);
});

test('mobile multi-touch, cancel, lost capture, and window blur leave no stuck motion', () => {
  const h = createHarness();
  h.touch.left.dispatch('pointerdown', {pointerId: 11}); h.touch.up.dispatch('pointerdown', {pointerId: 12});
  assert.deepEqual(plain(h.view.input.axis()), {x: -1, y: -1});
  h.touch.left.dispatch('pointercancel', {pointerId: 11}); assert.deepEqual(plain(h.view.input.axis()), {x: 0, y: -1});
  h.touch.up.dispatch('lostpointercapture', {pointerId: 12}); assert.deepEqual(plain(h.view.input.axis()), {x: 0, y: 0});
  h.touch.right.dispatch('pointerdown', {pointerId: 13}); h.key('keydown', 's'); h.events.dispatch('blur');
  assert.equal(h.view.input.keys.size, 0); assert.equal(h.view.input.pointers.size, 0);
  assert.equal(h.touch.right.classList.contains('active'), false);
});

test('distant clicks mark a route without teleporting or opening a dialog', () => {
  const h = createHarness(), entity = h.view.scene().entities.find(e => e.id === 'portal-chimes');
  const before = h.state().player, p = h.view.worldToScreen(entity), rect = h.get('world-canvas').getBoundingClientRect();
  h.get('world-canvas').dispatch('pointerdown', {clientX: rect.left + p.x, clientY: rect.top + p.y});
  assert.equal(h.state().target, entity.id); assert.equal(h.state().level, 'world'); assert.equal(h.state().overlay, null);
  assert.equal(h.state().player.x, before.x); assert.equal(h.state().player.y, before.y);
});

test('visiting every stage and reading all topics changes only local exploration records', () => {
  const h = createHarness(), before = JSON.stringify(h.context.TASK_WORLDS);
  for (const world of h.context.TASK_WORLDS) for (const node of world.nodes) {
    h.view.stage(world.id, node.id); h.tick(250);
    for (const topic of ['progress', 'results', 'blockers', 'nextSteps']) h.view.showTopic(topic);
    h.view.closePanel(); h.tick(0);
  }
  assert.equal(JSON.stringify(h.context.TASK_WORLDS), before); assert.equal(h.state().snapshotUnchanged, true);
  const saved = JSON.parse(h.storage.get('task-world-demo-exploration'));
  assert.deepEqual(Object.keys(saved).sort(), ['reads', 'visits']); assert.equal(saved.reads.length, 72);
  assert.equal(saved.visits.length, 18); assert.equal(h.context.TASK_WORLDS.find(w => w.id === 'harbor').nodes.find(n => n.id === 'harbor-stage-3').state, 'paused');
});
