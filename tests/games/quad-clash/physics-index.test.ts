import {test,expect} from 'vitest';
import {compile,overlaps,floorAt,rayWorld,boxesNear,type World,type RayHit} from '../../../src/games/quad-clash/physics';
import {getMap,MAP_IDS} from '../../../src/games/quad-clash/map';
import {BODY} from '../../../src/games/quad-clash/config';
const EPS=1e-6;
function linearOverlaps(w: World, x: number, y: number, z: number, r: number = BODY.radius, h: number = BODY.height): boolean {
  if (y < -EPS) return true;
  // Campus roofs are taller than the visible fence. Keep the arena edge solid at any jump height.
  if (w.map.boundPlayers && (x-r < -w.map.hx-EPS || x+r > w.map.hx+EPS || z-r < -w.map.hz-EPS || z+r > w.map.hz+EPS)) return true;
  const b = w.b, x0 = x - r, x1 = x + r, z0 = z - r, z1 = z + r, y1 = y + h;
  for (let i = 0; i < w.n * 6; i += 6) {
    if (x1 > b[i] + EPS && x0 < b[i + 3] - EPS && y1 > b[i + 1] + EPS && y < b[i + 4] - EPS && z1 > b[i + 2] + EPS && z0 < b[i + 5] - EPS) return true;
  }
  return false;
}


function linearFloorAt(w: World, x: number, z: number, maxY: number, r: number = BODY.radius): number {
  const b = w.b, x0 = x - r, x1 = x + r, z0 = z - r, z1 = z + r;
  let top = 0;
  for (let i = 0; i < w.n * 6; i += 6) {
    const t = b[i + 4];
    if (t <= maxY + EPS && t > top && x1 > b[i] + EPS && x0 < b[i + 3] - EPS && z1 > b[i + 2] + EPS && z0 < b[i + 5] - EPS) top = t;
  }
  return top;
}


function linearRayWorld(w: World, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number, out?: RayHit): RayHit | null {
  let best = maxT, nx = 0, ny = 0, nz = 0, hit = false;
  if (dy < 0) { const t = -oy / dy; if (t >= 0 && t < best) { best = t; nx = 0; ny = 1; nz = 0; hit = true; } }
  const b = w.b, ix = 1 / (dx || 1e-12), iy = 1 / (dy || 1e-12), iz = 1 / (dz || 1e-12);
  for (let i = 0; i < w.n * 6; i += 6) {
    let t0 = (b[i] - ox) * ix, t1 = (b[i + 3] - ox) * ix;
    let tmin = Math.min(t0, t1), tmax = Math.max(t0, t1), axis = 0;
    t0 = (b[i + 1] - oy) * iy; t1 = (b[i + 4] - oy) * iy;
    let a = Math.min(t0, t1), c = Math.max(t0, t1);
    if (a > tmin) { tmin = a; axis = 1; }
    if (c < tmax) tmax = c;
    t0 = (b[i + 2] - oz) * iz; t1 = (b[i + 5] - oz) * iz;
    a = Math.min(t0, t1); c = Math.max(t0, t1);
    if (a > tmin) { tmin = a; axis = 2; }
    if (c < tmax) tmax = c;
    if (tmax < Math.max(tmin, 0) || tmin >= best) continue;
    if (tmin < 0) continue; // origin inside a box: ignore it (cannot happen for valid positions)
    best = tmin; hit = true;
    nx = axis === 0 ? -Math.sign(dx) : 0; ny = axis === 1 ? -Math.sign(dy) : 0; nz = axis === 2 ? -Math.sign(dz) : 0;
  }
  if (!hit) return null;
  const r = out ?? { t: 0, nx: 0, ny: 0, nz: 0 };
  r.t = best; r.nx = nx; r.ny = ny; r.nz = nz;
  return r;
}


test.each(MAP_IDS)('indexed physics matches the original linear queries on %s',id=>{
 const w=compile(getMap(id));let seed=21;const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let k=0;k<1400;k++) {
  const x=(rnd()*2-1)*(w.map.hx+12),z=(rnd()*2-1)*(w.map.hz+12),y=rnd()*9-0.5,r=[0,.1,.58,1.2][k%4];
  expect(overlaps(w,x,y,z,r)).toBe(linearOverlaps(w,x,y,z,r));
  expect(floorAt(w,x,z,y,r)).toBe(linearFloorAt(w,x,z,y,r));
  let dx=rnd()*2-1,dy=rnd()*2-1,dz=rnd()*2-1;
  if(k%6===0){dx=0;dz=0;dy=-1;}else if(k%6===1){dy=0;dz=0;dx=1;}
  const len=Math.hypot(dx,dy,dz),range=rnd()*200;
  expect(rayWorld(w,x,y,z,dx/len,dy/len,dz/len,range)).toEqual(linearRayWorld(w,x,y,z,dx/len,dy/len,dz/len,range));
 }
 for(const b of w.map.boxes) {
  // Cell boundaries and exact surface ties must preserve collision normals too.
  for(const x of [b.x0,b.x1,0,8,-8])expect(rayWorld(w,x,b.y1,b.z0,0,-1,0,20)).toEqual(linearRayWorld(w,x,b.y1,b.z0,0,-1,0,20));
 }
});
test('small footprint queries inspect a subset of campus colliders without duplicates',()=>{
 const w=compile(getMap('campus')),list=boxesNear(w,12,23,14,25);
 expect(list.length).toBeLessThan(w.n/3);expect(new Set(list).size).toBe(list.length);
});
