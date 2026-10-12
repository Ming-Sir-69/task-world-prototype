import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Original project tests; no upstream test code, packages or network required.
const source = await readFile(new URL('./index.js', import.meta.url), 'utf8');
const api = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const { findPath, createWalker, tickWalker, sortByDepth, drawSprite,
  startAnimationLoop, Direction, UPSTREAM_COMMIT } = api;
let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log(`PASS ${name}`); };
const grid = [[true, false, true], [true, false, true], [true, true, true]];

check('pinned official commit', () => assert.equal(UPSTREAM_COMMIT, 'd1e007a9fdf3003c252d2973abe1999ae59aec33'));
check('BFS barrier and deterministic shortest route', () => assert.deepEqual(
  findPath(grid, { col: 0, row: 0 }, { col: 2, row: 0 }),
  [{col:0,row:1},{col:0,row:2},{col:1,row:2},{col:2,row:2},{col:2,row:1},{col:2,row:0}]));
check('point x/y aliases', () => assert.deepEqual(findPath([[true,true]], {x:0,y:0}, {x:1,y:0}), [{col:1,row:0}]));
check('same point returns empty path', () => assert.deepEqual(findPath(grid, {x:0,y:0}, {x:0,y:0}), []));
check('unreachable endpoint', () => assert.deepEqual(findPath([[true,false,true]], {x:0,y:0}, {x:2,y:0}), []));
check('blocked endpoint', () => assert.deepEqual(findPath(grid, {x:0,y:0}, {x:1,y:0}), []));
check('invalid start endpoint', () => assert.deepEqual(findPath(grid, {x:-1,y:0}, {x:0,y:0}), []));
check('invalid target endpoint', () => assert.deepEqual(findPath(grid, {x:0,y:0}, {x:99,y:0}), []));
check('noninteger endpoint', () => assert.deepEqual(findPath(grid, {x:0.5,y:0}, {x:0,y:0}), []));
check('empty and ragged grids are safe', () => {
  assert.deepEqual(findPath([], {x:0,y:0}, {x:1,y:0}), []);
  assert.deepEqual(findPath([[true],[],[true]], {x:0,y:0}, {x:0,y:2}), []);
});
check('numeric tiles are not guessed as walkable', () => assert.deepEqual(findPath([[0,0]], {x:0,y:0}, {x:1,y:0}), []));
check('grid and points remain immutable', () => {
  const copy=JSON.stringify(grid), start=Object.freeze({x:0,y:0}), target=Object.freeze({x:2,y:0});
  findPath(grid, start, target); assert.equal(JSON.stringify(grid),copy);
});
check('walker tile-to-pixel center', () => {
  const w=createWalker(2,3); assert.equal(w.x,40); assert.equal(w.y,56); assert.equal(w.dir,Direction.DOWN);
});
check('walker rejects invalid factory values', () => {
  assert.throws(()=>createWalker(0,0,{tileSize:0}),TypeError);
  assert.throws(()=>createWalker(0,0,{speed:-1}),TypeError);
  assert.throws(()=>createWalker(0.1,0),TypeError);
});
check('linear interpolation and right-facing', () => {
  const w=createWalker(0,0); w.path=[{col:1,row:0}]; tickWalker(w,0.1);
  assert.ok(Math.abs(w.x-12.8)<1e-9); assert.equal(w.y,8); assert.equal(w.dir,Direction.RIGHT); assert.equal(w.moving,true);
});
check('dt clamp and invalid dt', () => {
  const a=createWalker(0,0), b=createWalker(0,0); a.path=[{col:1,row:0}]; b.path=[{col:1,row:0}];
  tickWalker(a,20); tickWalker(b,0.1); assert.equal(a.x,b.x);
  tickWalker(a,NaN); assert.equal(a.x,b.x); tickWalker(a,-1); assert.equal(a.x,b.x);
});
check('walk frame advancement', () => {
  const w=createWalker(0,0); w.path=[{col:1,row:0}]; tickWalker(w,0.1); tickWalker(w,0.1); assert.equal(w.frame,1);
});
check('walker completes path with exact center and idle pose', () => {
  const w=createWalker(0,0); w.path=[{col:1,row:0},{col:1,row:1}];
  for(let i=0;i<10;i++) tickWalker(w,0.1);
  assert.equal(w.x,24); assert.equal(w.y,24); assert.equal(w.tileCol,1); assert.equal(w.tileRow,1);
  assert.equal(w.path.length,0); assert.equal(w.moving,false); assert.equal(w.frame,0); assert.equal(w.dir,Direction.DOWN);
});
check('carry distance across multiple tiles without dropping time', () => {
  const w=createWalker(0,0,{tileSize:10,speed:250}); w.path=[{col:1,row:0},{col:2,row:0},{col:3,row:0}];
  tickWalker(w,0.1); assert.equal(w.x,30); assert.equal(w.tileCol,2); assert.equal(w.moveProgress,0.5);
});
check('speed zero remains stationary', () => {
  const w=createWalker(0,0,{speed:0}); w.path=[{col:1,row:0}]; tickWalker(w,0.1); assert.equal(w.x,8); assert.equal(w.moving,false);
});
check('reject noncardinal path', () => {
  const w=createWalker(0,0); w.path=[{col:1,row:1}]; assert.throws(()=>tickWalker(w,0.1),RangeError);
});
check('depth sort is stable and nonmutating', () => {
  const entities=[{id:'a',y:10},{id:'b',zY:2},{id:'c',depth:2},{id:'d',y:5}];
  assert.deepEqual(sortByDepth(entities).map(x=>x.id),['b','c','d','a']);
  assert.deepEqual(entities.map(x=>x.id),['a','b','c','d']);
});

const canvases=[];
globalThis.document={createElement(tag){
  assert.equal(tag,'canvas'); const fills=[];
  const ctx={imageSmoothingEnabled:true, fillRect(...args){fills.push({color:this.fillStyle,args});}};
  const canvas={width:0,height:0,getContext(kind){assert.equal(kind,'2d');return ctx;},fills};
  canvases.push(canvas); return canvas;
}};
const calls=[], ctx={imageSmoothingEnabled:true,drawImage(...args){calls.push(args);}};
const sprite=[['#ff0000',''],['','#00ff00']];
check('sprite rasterization skips transparent pixels', () => {
  drawSprite(ctx,sprite,1.3,2.6,2); assert.equal(canvases.length,1);
  assert.equal(canvases[0].width,4); assert.equal(canvases[0].height,4);
  assert.deepEqual(canvases[0].fills,[{color:'#ff0000',args:[0,0,2,2]},{color:'#00ff00',args:[2,2,2,2]}]);
  assert.equal(ctx.imageSmoothingEnabled,false); assert.deepEqual(calls[0].slice(1),[1,3]);
});
check('same sprite object and scale share cache', () => {
  drawSprite(ctx,sprite,5,6,2); assert.equal(canvases.length,1); assert.equal(calls[0][0],calls[1][0]);
});
check('different integer scales get distinct rasters', () => {
  drawSprite(ctx,sprite,0,0,3); assert.equal(canvases.length,2); assert.equal(canvases[1].width,6);
});
check('draw input guards', () => {
  assert.throws(()=>drawSprite(ctx,[],0,0),TypeError); assert.throws(()=>drawSprite(ctx,sprite,0,0,0.5),TypeError);
});

let nextId=0; const pending=new Map();
globalThis.requestAnimationFrame=fn=>{pending.set(++nextId,fn);return nextId;};
globalThis.cancelAnimationFrame=id=>pending.delete(id);
function frameAt(time){const [id,fn]=pending.entries().next().value;pending.delete(id);fn(time);}
check('animation loop order, dt seconds, first timestamp zero, clamp and stop', () => {
  const events=[]; const stop=startAnimationLoop(dt=>events.push(['update',dt]),dt=>events.push(['render',dt]));
  frameAt(0); frameAt(16); frameAt(5016);
  assert.deepEqual(events,[['update',0],['render',0],['update',0.016],['render',0.016],['update',0.1],['render',0.1]]);
  assert.equal(pending.size,1); stop();stop();assert.equal(pending.size,0);
});
check('stop during update prevents render and reschedule', () => {
  let renders=0; const stop=startAnimationLoop(()=>stop(),()=>renders++); frameAt(100);
  assert.equal(renders,0); assert.equal(pending.size,0);
});
check('stop during render prevents reschedule', () => {
  const stop=startAnimationLoop(()=>{},()=>stop()); frameAt(100); assert.equal(pending.size,0);
});
console.log(`\n${checks} checks passed. Browser canvas/visual integration requires separate real-browser QA.`);
