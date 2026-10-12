/** Small, DOM-independent player engine. All distances are world pixels. */
export const PLAYER_SPEED = 180;
export const PLAYER_RADIUS = 10;
export const WALK_PADDING = 32;
export const MAX_FRAME_TIME = 0.1;

const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const directions = {
  up: {x: 0, y: -1}, down: {x: 0, y: 1},
  left: {x: -1, y: 0}, right: {x: 1, y: 0},
};
const movementKeys = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
};
const interactionKeys = new Set(['KeyE', 'Enter']);

export function createPlayer(x, y) {
  return {x: finite(x), y: finite(y), radius: PLAYER_RADIUS, speed: PLAYER_SPEED,
    facing: 'down', moving: false, frame: 0, step: 0, vx: 0, vy: 0};
}

/** Sweep a circle along one axis, allowing it to slide along walls. */
function moveAxis(player, delta, axis, obstacles) {
  if (!delta) return;
  const crossAxis = axis === 'x' ? 'y' : 'x';
  const size = axis === 'x' ? 'w' : 'h';
  const crossSize = axis === 'x' ? 'h' : 'w';
  const start = player[axis], cross = player[crossAxis], radius = player.radius;
  let destination = start + delta;
  for (const obstacle of obstacles) {
    if (![obstacle.x, obstacle.y, obstacle.w, obstacle.h].every(Number.isFinite) ||
        obstacle.w <= 0 || obstacle.h <= 0) continue;
    const low = obstacle[axis], high = low + obstacle[size];
    const crossLow = obstacle[crossAxis], crossHigh = crossLow + obstacle[crossSize];
    const separation = Math.max(crossLow - cross, cross - crossHigh, 0);
    if (separation >= radius) continue;
    const extension = Math.sqrt(radius * radius - separation * separation);
    const near = low - extension, far = high + extension;
    if (delta > 0 && start <= near && destination > near) destination = near;
    if (delta < 0 && start >= far && destination < far) destination = far;
    // A scene edit may place a player inside a collider. Permit movement out,
    // but do not let a held direction carry it further through the obstacle.
    if (start > near && start < far) {
      const midpoint = (near + far) / 2;
      if ((start < midpoint && delta > 0) || (start >= midpoint && delta < 0)) destination = start;
    }
  }
  player[axis] = destination;
}

/**
 * Mutates/returns player. input is InputState or {x,y}; dt is seconds.
 * Player center stays 32px inside the scene; circles collide with obstacles.
 * Optional scene.canWalk(x,y,radius) further restricts island/polygon bounds.
 * blocked stops motion/animation without consuming or modifying input.
 */
export function updatePlayer(player, input, dt, scene, blocked = false) {
  const elapsed = clamp(finite(dt), 0, MAX_FRAME_TIME);
  player.moving = false;
  player.vx = player.vy = 0;
  player.frame = 0;
  if (blocked || elapsed === 0) return player;
  const axis = typeof input?.axis === 'function' ? input.axis() : (input || {});
  let x = finite(axis.x), y = finite(axis.y);
  const length = Math.hypot(x, y);
  if (!length) return player;
  // Digital diagonal and overlapping keyboard/touch sources have equal speed.
  if (length > 1) { x /= length; y /= length; }
  player.facing = Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : (y > 0 ? 'down' : 'up');
  const dx = x * player.speed * elapsed, dy = y * player.speed * elapsed;
  const count = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / (player.radius / 2)));
  const obstacles = scene?.obstacles || [];
  const width = Math.max(0, finite(scene?.width)), height = Math.max(0, finite(scene?.height));
  const padX = Math.min(WALK_PADDING, width / 2), padY = Math.min(WALK_PADDING, height / 2);
  const originalX = player.x, originalY = player.y;
  for (let i = 0; i < count; i++) {
    const beforeX = player.x;
    moveAxis(player, dx / count, 'x', obstacles);
    player.x = clamp(player.x, padX, width - padX);
    if (scene?.canWalk && !scene.canWalk(player.x, player.y, player.radius)) player.x = beforeX;
    const beforeY = player.y;
    moveAxis(player, dy / count, 'y', obstacles);
    player.y = clamp(player.y, padY, height - padY);
    if (scene?.canWalk && !scene.canWalk(player.x, player.y, player.radius)) player.y = beforeY;
  }
  const distance = Math.hypot(player.x - originalX, player.y - originalY);
  player.moving = distance > 0.000001;
  player.vx = (player.x - originalX) / elapsed;
  player.vy = (player.y - originalY) / elapsed;
  if (player.moving) {
    player.step = (player.step + distance / 18) % 4;
    player.frame = Math.floor(player.step);
  }
  return player;
}

/** Unclamped camera: callers render padding beyond scene edges. */
export function cameraFor(player, viewport, zoom = 1) {
  zoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const width = Math.max(0, finite(viewport?.width)), height = Math.max(0, finite(viewport?.height));
  return {x: player.x - width / (2 * zoom), y: player.y - height / (2 * zoom), width, height, zoom};
}

/** Screen points are local CSS pixels, not device pixels or page coordinates. */
export function worldToScreen(point, camera) {
  return {x: (point.x - camera.x) * camera.zoom, y: (point.y - camera.y) * camera.zoom};
}

/** Subtract the viewport's bounding-client-rect left/top from clientX/Y first. */
export function screenToWorld(point, camera) {
  return {x: point.x / camera.zoom + camera.x, y: point.y / camera.zoom + camera.y};
}

/** Returns the original closest entity (stable list order for ties), or null. */
export function nearestInteractable(player, entities, radius = 85) {
  let nearest = null, best = Math.max(0, finite(radius, 85));
  for (const entity of entities || []) {
    if (entity.disabled || entity.interactive === false || !Number.isFinite(entity.x) || !Number.isFinite(entity.y)) continue;
    const distance = Math.hypot(entity.x - player.x, entity.y - player.y);
    if (distance <= best && (!nearest || distance < best)) { nearest = entity; best = distance; }
  }
  return nearest;
}

function keyCode(keyOrEvent) {
  const key = typeof keyOrEvent === 'string' ? keyOrEvent : (keyOrEvent?.code || keyOrEvent?.key || '');
  if (/^[wasde]$/i.test(key)) return 'Key' + key.toUpperCase();
  return key === 'NumpadEnter' ? 'Enter' : key;
}

export class InputState {
  constructor() {
    this.keys = new Set();
    this.pointers = new Map();
    this.interactPending = false;
  }

  /** Returns whether the key belongs to game controls; never repeats E/Enter. */
  keyDown(keyOrEvent) {
    const key = keyCode(keyOrEvent);
    if (!movementKeys[key] && !interactionKeys.has(key)) return false;
    const repeat = typeof keyOrEvent === 'object' && keyOrEvent?.repeat;
    if (interactionKeys.has(key) && !this.keys.has(key) && !repeat) this.interactPending = true;
    this.keys.add(key);
    return true;
  }

  keyUp(keyOrEvent) {
    const key = keyCode(keyOrEvent);
    const recognized = !!movementKeys[key] || interactionKeys.has(key);
    this.keys.delete(key);
    return recognized;
  }

  /** Keep each pointer ID until pointerup, pointercancel, or lostpointercapture. */
  pointerDown(id, direction) {
    if (!directions[direction] && direction !== 'interact') return false;
    if (direction === 'interact' && !this.pointers.has(id)) this.interactPending = true;
    this.pointers.set(id, direction);
    return true;
  }

  pointerUp(id) { return this.pointers.delete(id); }
  pointerCancel(id) { return this.pointerUp(id); }

  axis() {
    // Deduplicate directions so two fingers or W + ArrowUp cannot boost speed.
    const active = new Set([...this.keys].map(key => movementKeys[key]));
    for (const direction of this.pointers.values()) active.add(direction);
    return {x: Number(active.has('right')) - Number(active.has('left')),
      y: Number(active.has('down')) - Number(active.has('up'))};
  }

  consumeInteract() {
    const pending = this.interactPending;
    this.interactPending = false;
    return pending;
  }

  /** Call on blur, scene changes, and when opening overlays to prevent stuck keys. */
  clear() {
    this.keys.clear();
    this.pointers.clear();
    this.interactPending = false;
  }

  /** Optional browser binding; returns cleanup. Touch controls bind separately. */
  bind(target) {
    const down = event => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing ||
          event.target?.closest?.('input,textarea,select,[contenteditable="true"]')) return;
      if (this.keyDown(event)) event.preventDefault?.();
    };
    const up = event => { if (this.keyUp(event)) event.preventDefault?.(); };
    const clear = () => this.clear();
    const visibility = () => { if (target.document?.hidden) clear(); };
    target.addEventListener('keydown', down);
    target.addEventListener('keyup', up);
    target.addEventListener('blur', clear);
    target.document?.addEventListener('visibilitychange', visibility);
    return () => {
      target.removeEventListener('keydown', down);
      target.removeEventListener('keyup', up);
      target.removeEventListener('blur', clear);
      target.document?.removeEventListener('visibilitychange', visibility);
      clear();
    };
  }
}
