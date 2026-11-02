import {describe,it,expect} from 'vitest';
import {ImpactPool} from '../../../src/games/strongroom/impact-pool';
import {Simulation,type Entity,type Point,type SimWorld} from '../../../src/games/strongroom/sim';
function actor(){const sim=new Simulation({spawns:[[0,0,0],[0,0,4]],blocked:()=>false,collide:(e:Entity)=>({x:e.x,y:e.y,z:e.z,ground:true})},[{seat:0,team:0,name:'You',bot:false}]);return Object.assign(sim.entities[0],{x:0,y:0,z:0,yaw:0,pitch:0,crouch:false});}
function plane(axis:'x'|'z',line:number,normal:Point):NonNullable<SimWorld['contact']>{return(from,to)=>{
 const d=to[axis]-from[axis];if(Math.abs(d)<1e-9)return null;const t=(line-from[axis])/d;if(t<0||t>1)return null;
 return{point:{x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t,z:from.z+(to.z-from.z)*t},normal};
};}
describe('host impact-grenade pool',()=>{
 it('starts at the standing or crouched eye and leaves actor state unchanged',()=>{
  const e=actor(),before=structuredClone(e),pool=new ImpactPool({},()=>{});expect(pool.launch(e)).toBe(true);expect(pool.snapshot()).toEqual([[1,0,0,162,0]]);expect(e).toEqual(before);
  pool.clear();e.crouch=true;expect(pool.launch(e)).toBe(true);expect(pool.snapshot()[0].slice(1)).toEqual([0,0,108,0]);
 });
 it('uses 12m/s forward velocity, 1.5m/s upward velocity and 9.8m/s² gravity',()=>{
  const pool=new ImpactPool({},()=>{});pool.launch(actor());pool.update(.1);expect(pool.snapshot()).toEqual([[1,0,0,172,-120]]);
  pool.update(.2);expect(pool.snapshot()).toEqual([[1,0,0,163,-360]]);
 });
 it('throws along the actor yaw and pitch',()=>{
  const e=actor(),pool=new ImpactPool({},()=>{});e.yaw=-Math.PI/2;pool.launch(e);pool.update(.1);expect(pool.snapshot()[0].slice(2)).toEqual([120,172,0]);
  pool.clear();e.yaw=0;e.pitch=Math.PI/2;pool.launch(e);pool.update(.1);expect(pool.snapshot()[0].slice(2)).toEqual([0,292,0]);
 });
 it.each([['soft','z',-1,{x:0,y:0,z:1}],['hard','x',-1,{x:1,y:0,z:0}]] as const)('impacts the first %s contact and offsets the callback outside its surface',(_kind,axis,line,normal)=>{
  const hits:{owner:number;point:Point}[]=[],e=actor();e.seat=5;if(axis==='x')e.yaw=Math.PI/2;
  const pool=new ImpactPool({contact:plane(axis,line,normal)},(owner,point)=>hits.push({owner,point:{...point}}));pool.launch(e);pool.update(.1);
  expect(hits).toHaveLength(1);expect(hits[0].owner).toBe(5);expect(hits[0].point[axis]).toBeCloseTo(-.96);expect(pool.snapshot()).toEqual([]);
  pool.update(1);pool.update(1);expect(hits).toHaveLength(1);
 });
 it('falls back to the .05m floor plane when no world contact exists',()=>{
  const hits:Point[]=[],e=actor();e.pitch=-.8;const pool=new ImpactPool({},(_,point)=>hits.push({...point}));pool.launch(e);pool.update(.3);
  expect(hits).toHaveLength(1);expect(hits[0].y).toBeCloseTo(.09);expect(pool.snapshot()).toEqual([]);
 });
 it('expires once at the last simulated position after three seconds',()=>{
  const hits:Point[]=[],e=actor();e.y=100;const pool=new ImpactPool({},(_,point)=>hits.push({...point}));pool.launch(e);pool.update(3.2);
  expect(hits).toHaveLength(1);expect(hits[0].y).toBeCloseTo(62.02);expect(hits[0].z).toBeCloseTo(-36);expect(pool.snapshot()).toEqual([]);pool.update(1);expect(hits).toHaveLength(1);
 });
 it('holds at most twenty projectiles and reuses free slots after contacts',()=>{
  const e=actor(),pool=new ImpactPool({contact:plane('z',-1,{x:0,y:0,z:1})},()=>{});
  for(let n=0;n<20;n++)expect(pool.launch(e)).toBe(true);expect(pool.launch(e)).toBe(false);expect(pool.snapshot()).toHaveLength(20);
  pool.update(.1);expect(pool.snapshot()).toEqual([]);expect(pool.launch(e)).toBe(true);
 });
 it('clears or disposes all projectiles without firing impact callbacks',()=>{
  let hits=0;const pool=new ImpactPool({},()=>hits++),e=actor();pool.launch(e);pool.clear();expect(pool.snapshot()).toEqual([]);expect(hits).toBe(0);
  pool.launch(e);pool.dispose();pool.dispose();pool.update(1);expect(pool.launch(e)).toBe(false);expect(pool.snapshot()).toEqual([]);expect(hits).toBe(0);
 });
 it('returns independent bounded integer snapshots and ignores invalid launch/update input',()=>{
  const e=actor(),pool=new ImpactPool({},()=>{});pool.launch(e);const snapshot=pool.snapshot();pool.update(.1);expect(snapshot).toEqual([[1,0,0,162,0]]);
  for(const dt of [NaN,Infinity,-1,0])pool.update(dt);expect(pool.snapshot()).toEqual([[1,0,0,172,-120]]);
  e.x=Infinity;expect(pool.launch(e)).toBe(false);e.x=0;e.seat=10;expect(pool.launch(e)).toBe(false);
  e.seat=0;e.x=327.6;e.yaw=-Math.PI/2;expect(pool.launch(e)).toBe(true);pool.update(.1);
  for(const row of pool.snapshot())for(const n of row)expect(Number.isSafeInteger(n)).toBe(true);expect(pool.snapshot().at(-1)![2]).toBe(32767);
 });
});
