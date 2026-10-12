/**
 * Pixel Agents minimal rendering/movement adaptation.
 * Upstream Copyright (c) 2026 Pablo De Lucca. MIT; see ./LICENSE.
 * Pinned upstream commit: d1e007a9fdf3003c252d2973abe1999ae59aec33
 *
 * This is not an official Pixel Agents package. No upstream artwork is bundled.
 * Source ranges and project-original glue are recorded in provenance.json and
 * docs/PIXEL-AGENTS-REUSE.md. These functions never control real task state.
 */

export const UPSTREAM_COMMIT = 'd1e007a9fdf3003c252d2973abe1999ae59aec33';
export const TILE_SIZE = 16;
export const MAX_DELTA_TIME_SEC = 0.1;
export const WALK_FRAME_DURATION_SEC = 0.15;
export const WALK_SPEED_PX_PER_SEC = 48;
export const Direction = Object.freeze({ DOWN: 0, LEFT: 1, RIGHT: 2, UP: 3 });

/**
 * ADAPTED: https://github.com/pixel-agents-hq/pixel-agents/blob/d1e007a9fdf3003c252d2973abe1999ae59aec33/webview-ui/src/office/engine/gameLoop.ts#L9-L36
 * Same rAF lifecycle, seconds conversion, delta clamp, update/render order and
 * stop closure. Original project glue: callback-only signature; null sentinel;
 * lower dt bound; stop-inside-callback safety; returns stop without a canvas.
 * onUpdate(dtSeconds), onRender(dtSeconds, timestampMilliseconds).
 */
export function startAnimationLoop(onUpdate, onRender) {
  if (typeof onUpdate !== 'function' || typeof onRender !== 'function') {
    throw new TypeError('Animation callbacks must be functions');
  }
  let lastTime = null;
  let rafId = 0;
  let stopped = false;

  const frame = (time) => {
    if (stopped) return;
    const dt = lastTime === null ? 0 : Math.max(0, Math.min((time - lastTime) / 1000, MAX_DELTA_TIME_SEC));
    lastTime = time;
    onUpdate(dt);
    if (stopped) return;
    onRender(dt, time);
    if (!stopped) rafId = requestAnimationFrame(frame);
  };

  rafId = requestAnimationFrame(frame);
  return () => {
    stopped = true;
    cancelAnimationFrame(rafId);
  };
}

/** Project-original grid adapter: only boolean true denotes a walkable cell. */
function isWalkable(col, row, grid) {
  return Number.isInteger(col) && Number.isInteger(row) &&
    row >= 0 && col >= 0 && Array.isArray(grid) &&
    Array.isArray(grid[row]) && grid[row][col] === true;
}

/**
 * ADAPTED (light extraction): https://github.com/pixel-agents-hq/pixel-agents/blob/d1e007a9fdf3003c252d2973abe1999ae59aec33/webview-ui/src/office/layout/tileMap.ts#L37-L105
 * The BFS queue, neighbor order, visited/parent maps and reconstruction below
 * are upstream, with TypeScript annotations removed. Original project glue:
 * boolean grid/point arguments and start-cell validation.
 * Returns {col,row}[] excluding start, including target; [] if no route or at target.
 */
export function findPath(grid, start, target) {
  const startCol = start?.col ?? start?.x;
  const startRow = start?.row ?? start?.y;
  const endCol = target?.col ?? target?.x;
  const endRow = target?.row ?? target?.y;
  if (!isWalkable(startCol, startRow, grid)) return [];
  if (startCol === endCol && startRow === endRow) return [];

  const key = (c, r) => `${c},${r}`;
  const startKey = key(startCol, startRow);
  const endKey = key(endCol, endRow);

  const endWalkable = isWalkable(endCol, endRow, grid);
  if (!endWalkable) {
    return [];
  }

  const visited = new Set();
  visited.add(startKey);

  const parent = new Map();
  const queue = [{ col: startCol, row: startRow }];

  const dirs = [
    { dc: 0, dr: -1 }, // up
    { dc: 0, dr: 1 }, // down
    { dc: -1, dr: 0 }, // left
    { dc: 1, dr: 0 }, // right
  ];

  while (queue.length > 0) {
    const curr = queue.shift();
    const currKey = key(curr.col, curr.row);

    if (currKey === endKey) {
      // Reconstruct path
      const path = [];
      let k = endKey;
      while (k !== startKey) {
        const [c, r] = k.split(',').map(Number);
        path.unshift({ col: c, row: r });
        k = parent.get(k);
      }
      return path;
    }

    for (const d of dirs) {
      const nc = curr.col + d.dc;
      const nr = curr.row + d.dr;
      const nk = key(nc, nr);

      if (visited.has(nk)) continue;
      if (!isWalkable(nc, nr, grid)) continue;

      visited.add(nk);
      parent.set(nk, currKey);
      queue.push({ col: nc, row: nr });
    }
  }

  // No path found
  return [];
}

/**
 * ADAPTED: https://github.com/pixel-agents-hq/pixel-agents/blob/d1e007a9fdf3003c252d2973abe1999ae59aec33/webview-ui/src/office/engine/characters.ts#L26-L47
 * Tile size is a parameter; direction enum and arithmetic are unchanged.
 */
function tileCenter(col, row, tileSize) {
  return { x: col * tileSize + tileSize / 2, y: row * tileSize + tileSize / 2 };
}

function directionBetween(fromCol, fromRow, toCol, toRow) {
  const dc = toCol - fromCol;
  const dr = toRow - fromRow;
  if (dc > 0) return Direction.RIGHT;
  if (dc < 0) return Direction.LEFT;
  if (dr > 0) return Direction.DOWN;
  return Direction.UP;
}

/**
 * Project-original visual-only data factory. Related upstream field subset:
 * https://github.com/pixel-agents-hq/pixel-agents/blob/d1e007a9fdf3003c252d2973abe1999ae59aec33/webview-ui/src/office/engine/characters.ts#L56-L73
 * Input col/row are tile coordinates; returned x/y are pixel tile centers.
 * Assign walker.path = findPath(...) when stationary.
 */
export function createWalker(col, row, options = {}) {
  const tileSize = options.tileSize ?? TILE_SIZE;
  const speed = options.speed ?? WALK_SPEED_PX_PER_SEC;
  if (!Number.isInteger(col) || !Number.isInteger(row) ||
      !Number.isFinite(tileSize) || tileSize <= 0 ||
      !Number.isFinite(speed) || speed < 0) {
    throw new TypeError('Walker requires integer tile coordinates, positive tileSize and nonnegative speed');
  }
  return {
    ...tileCenter(col, row, tileSize),
    tileCol: col, tileRow: row, tileSize, speed,
    path: [], moveProgress: 0, dir: Direction.DOWN,
    moving: false, frame: 0, frameTimer: 0,
  };
}

/**
 * ADAPTED interpolation/frame arithmetic:
 * https://github.com/pixel-agents-hq/pixel-agents/blob/d1e007a9fdf3003c252d2973abe1999ae59aec33/webview-ui/src/office/engine/characters.ts#L213-L218
 * https://github.com/pixel-agents-hq/pixel-agents/blob/d1e007a9fdf3003c252d2973abe1999ae59aec33/webview-ui/src/office/engine/characters.ts#L271-L291
 * Removes the office/seat/typing/task state machine entirely. Project-original
 * glue carries remaining frame distance across tiles, validates cardinal steps,
 * resets an idle pose and allows configurable tileSize/speed. dt is seconds.
 * This mutates only the supplied visual walker. Returns the same object.
 */
export function tickWalker(walker, dt) {
  if (!Number.isFinite(dt) || dt < 0) dt = 0;
  dt = Math.min(dt, MAX_DELTA_TIME_SEC);
  walker.moving = walker.path.length > 0 && walker.speed > 0;
  if (!walker.moving) {
    walker.frame = 0;
    walker.frameTimer = 0;
    return walker;
  }

  walker.frameTimer += dt;
  while (walker.frameTimer >= WALK_FRAME_DURATION_SEC) {
    walker.frameTimer -= WALK_FRAME_DURATION_SEC;
    walker.frame = (walker.frame + 1) % 4;
  }

  let distance = (walker.speed / walker.tileSize) * dt;
  while (walker.path.length > 0) {
    const nextTile = walker.path[0];
    const stepLength = Math.abs(nextTile.col - walker.tileCol) +
      Math.abs(nextTile.row - walker.tileRow);
    if (!Number.isInteger(nextTile.col) || !Number.isInteger(nextTile.row) || stepLength !== 1) {
      throw new RangeError('Walker path must contain adjacent cardinal {col,row} tiles');
    }
    walker.dir = directionBetween(walker.tileCol, walker.tileRow, nextTile.col, nextTile.row);
    const step = Math.min(distance, 1 - walker.moveProgress);
    walker.moveProgress += step;
    distance -= step;

    const fromCenter = tileCenter(walker.tileCol, walker.tileRow, walker.tileSize);
    const toCenter = tileCenter(nextTile.col, nextTile.row, walker.tileSize);
    const t = Math.min(walker.moveProgress, 1);
    walker.x = fromCenter.x + (toCenter.x - fromCenter.x) * t;
    walker.y = fromCenter.y + (toCenter.y - fromCenter.y) * t;

    if (walker.moveProgress >= 1 - 1e-10) {
      walker.tileCol = nextTile.col;
      walker.tileRow = nextTile.row;
      walker.x = toCenter.x;
      walker.y = toCenter.y;
      walker.path.shift();
      walker.moveProgress = 0;
    }
    if (distance <= 1e-10) break;
  }

  walker.moving = walker.path.length > 0;
  if (!walker.moving) {
    walker.frame = 0;
    walker.frameTimer = 0;
  }
  return walker;
}

/**
 * ADAPTED comparator: https://github.com/pixel-agents-hq/pixel-agents/blob/d1e007a9fdf3003c252d2973abe1999ae59aec33/webview-ui/src/office/engine/renderer.ts#L486-L491
 * Project-original non-mutating wrapper accepts zY, depth or y in that order.
 * Lower depth is drawn first; ECMAScript stable sort preserves equal-depth order.
 */
export function sortByDepth(entities) {
  return [...entities].sort((a, b) =>
    (a.zY ?? a.depth ?? a.y ?? 0) - (b.zY ?? b.depth ?? b.y ?? 0));
}

/**
 * LIGHT EXTRACTION: https://github.com/pixel-agents-hq/pixel-agents/blob/d1e007a9fdf3003c252d2973abe1999ae59aec33/webview-ui/src/office/sprites/spriteCache.ts#L48-L77
 * Below is upstream getCachedSprite with only TypeScript types/non-null assertion
 * removed and its export made private. Cache declaration is upstream line 3.
 */
const zoomCaches = new Map();
function getCachedSprite(sprite, zoom) {
  let cache = zoomCaches.get(zoom);
  if (!cache) {
    cache = new WeakMap();
    zoomCaches.set(zoom, cache);
  }

  const cached = cache.get(sprite);
  if (cached) return cached;

  const rows = sprite.length;
  const cols = sprite[0].length;
  const canvas = document.createElement('canvas');
  canvas.width = cols * zoom;
  canvas.height = rows * zoom;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const color = sprite[r][c];
      if (color === '') continue;
      ctx.fillStyle = color;
      ctx.fillRect(c * zoom, r * zoom, zoom, zoom);
    }
  }

  cache.set(sprite, canvas);
  return canvas;
}

/**
 * Project-original public draw wrapper using upstream pixel-array cache.
 * sprite: immutable rectangular CSS-color string[][]; '' is transparent.
 * x/y: destination top-left pixels. scale: positive integer, default 1.
 * Uses no network, loaded asset, palette, office prop or task data.
 */
export function drawSprite(ctx, sprite, x, y, scale = 1) {
  if (!Array.isArray(sprite) || !Array.isArray(sprite[0]) || sprite[0].length === 0 ||
      !Number.isInteger(scale) || scale < 1 ||
      !Number.isFinite(x) || !Number.isFinite(y)) {
    throw new TypeError('drawSprite requires a nonempty sprite, finite position and positive integer scale');
  }
  const cached = getCachedSprite(sprite, scale);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(cached, Math.round(x), Math.round(y));
}

