import { describe, it, expect } from 'vitest';
import { FruitEngine, STEP, type Snapshot } from '../../../src/games/fruit-merge/engine';
const fruit = (id:number,tier:number,x:number,y:number, extra = {}) => ({id,tier,x,y,vx:0,vy:0,angle:0,av:0,age:3000,danger:0,sleeping:false,...extra});
const state = (fruits:ReturnType<typeof fruit>[], extra = {}):Snapshot => ({version:1,seed:1234,bag:[0,1,2,3],current:0,next:0,score:0,time:3000,lastDrop:-1000,lastMerge:-10000,combo:0,aim:180,nextId:20,lost:false,fruits,...extra});
const advance = (e:FruitEngine, frames:number) => {for(let n=0;n<frames;n++) e.step();};
describe('Suika Game rules and real physics',()=>{
 it('drops within the walls and refuses repeated drops during cooldown',()=>{
  const e=new FruitEngine(42);expect(e.drop(-100)).toBe(true);expect(e.drop(180)).toBe(false);
  expect(e.snapshot().fruits[0].x).toBeGreaterThanOrEqual(34);e.dispose();
 });
 it('uses a balanced reproducible queue and caps spawned tiers',()=>{
  const a=new FruitEngine(42),b=new FruitEngine(42);const seen:number[]=[];
  for(let n=0;n<16;n++){seen.push(a.current);expect(a.current).toBe(b.current);a.drop(50+n*12);b.drop(50+n*12);advance(a,30);advance(b,30);}
  expect(new Set(seen).size).toBe(4);expect(Math.max(...seen)).toBe(3);expect(seen.filter(v=>v===0).length).toBe(4);a.dispose();b.dispose();
 });
 it('merges one pair only when three equal fruits collide together',()=>{
  const e=new FruitEngine();e.restore(state([fruit(1,0,145,460),fruit(2,0,170,460),fruit(3,0,195,460)]));e.step();
  expect(e.fruits.size).toBe(2);expect(e.score).toBe(3);expect([...e.fruits.values()].filter(f=>f.tier===1)).toHaveLength(1);e.dispose();
 });
 it('ignores unequal fruits and the final watermelon tier',()=>{
  const e=new FruitEngine();e.restore(state([fruit(1,0,70,440),fruit(2,1,95,440),fruit(3,10,175,390),fruit(4,10,280,390)]));e.step();expect(e.score).toBe(0);expect(e.fruits.size).toBe(4);e.dispose();
 });
 it('deduplicates repeated collision reports and increases successive combo scores',()=>{
  const e=new FruitEngine();e.restore(state([fruit(1,0,100,460),fruit(2,0,122,460),fruit(3,0,230,460),fruit(4,0,252,460)]));e.step();
  expect(e.score).toBe(9);expect(e.combo).toBe(2);advance(e,20);expect(e.score).toBe(9);e.dispose();
 });
 it('supports an actual chain when a new fruit meets the next tier',()=>{
  const e=new FruitEngine();e.restore(state([fruit(1,0,163,465),fruit(2,0,186,465),fruit(3,1,175,428)]));advance(e,100);
  expect(e.score).toBe(15);expect([...e.fruits.values()].map(f=>f.tier)).toEqual([2]);e.dispose();
 });
 it('does not lose during spawn or while an old fruit falls through the line',()=>{
  const e=new FruitEngine();e.drop(180);advance(e,110);expect(e.lost).toBe(false);
  e.restore(state([fruit(1,0,180,65,{vy:6})]));advance(e,60);expect(e.lost).toBe(false);expect(e.snapshot().fruits[0].y).toBeGreaterThan(110);e.dispose();
 });
 it('loses only after a settled body stays above the line for the grace period',()=>{
  const e=new FruitEngine();e.restore(state([fruit(1,0,180,94,{sleeping:true})]));advance(e,110);expect(e.lost).toBe(false);advance(e,12);expect(e.lost).toBe(true);expect(e.drop(180)).toBe(false);e.dispose();
 });
 it('clears accumulated danger when a fruit returns below the line',()=>{
  const e=new FruitEngine();e.restore(state([fruit(1,0,180,200,{sleeping:true,danger:1950})]));e.step();expect(e.snapshot().fruits[0].danger).toBe(0);expect(e.lost).toBe(false);e.dispose();
 });
 it('restores score, queue, combo timing, body velocity and rejects corrupt data atomically',()=>{
  const e=new FruitEngine();e.restore(state([fruit(1,2,180,300,{vx:1.2,vy:2})],{score:48,combo:3,lastMerge:2900}));
  const saved=e.snapshot(),b=new FruitEngine();expect(b.restore(saved)).toBe(true);expect(b.snapshot()).toEqual(saved);
  for(const bad of [null,{}, {...saved,score:-1},{...saved,fruits:[{...saved.fruits[0],x:NaN}]},{...saved,fruits:[saved.fruits[0],saved.fruits[0]]},{...saved,bag:[10]}]){expect(b.restore(bad)).toBe(false);expect(b.snapshot()).toEqual(saved);}e.dispose();b.dispose();
 });
 it('settles numerically on the floor without escaping walls',()=>{
  const e=new FruitEngine();e.restore(state([fruit(1,4,180,160,{vx:2})]));advance(e,600);const f=e.snapshot().fruits[0];
  expect(f.y).toBeGreaterThan(440);expect(f.y).toBeLessThan(455);expect(f.x).toBeGreaterThan(50);expect(f.x).toBeLessThan(310);expect(Math.abs(f.vy)).toBeLessThan(.1);e.dispose();
 });
 it('retains a hard object budget without consuming the queue on refused spawn',()=>{
  const e=new FruitEngine();e.restore(state(Array.from({length:90},(_,i)=>fruit(i+1,0,40+(i%10)*29,150+Math.floor(i/10)*32)),{nextId:100}));const before=e.snapshot();expect(e.drop(180)).toBe(false);expect(e.snapshot().current).toBe(before.current);expect(e.fruits.size).toBe(90);e.dispose();
 });
 it('refuses a blocked spawn without consuming either preview or seeded queue',()=>{
  const e=new FruitEngine();e.restore(state([fruit(1,3,180,70,{sleeping:true})]));const before=e.snapshot();expect(e.drop(180)).toBe(false);expect(e.snapshot()).toEqual(before);e.dispose();
 });
 it('protects newly created bodies before starting the settled danger timer',()=>{
  const e=new FruitEngine();e.restore(state([fruit(1,0,180,94,{sleeping:true,age:0})]));advance(e,175);expect(e.lost).toBe(false);advance(e,20);expect(e.lost).toBe(true);e.dispose();
 });
 it('continues a moving saved simulation with the same queue and scoring',()=>{
  const a=new FruitEngine(742);a.drop(100);advance(a,25);const b=new FruitEngine();b.restore(a.snapshot());
  for(let n=0;n<4;n++){advance(a,30);advance(b,30);expect(a.drop(80+n*50)).toBe(b.drop(80+n*50));}
  advance(a,200);advance(b,200);expect(a.score).toBe(b.score);expect(a.current).toBe(b.current);expect(a.next).toBe(b.next);
  const af=a.snapshot().fruits,bf=b.snapshot().fruits;expect(af.length).toBe(bf.length);for(let i=0;i<af.length;i++){expect(af[i].tier).toBe(bf[i].tier);expect(af[i].x).toBeCloseTo(bf[i].x,2);expect(af[i].y).toBeCloseTo(bf[i].y,2);}a.dispose();b.dispose();
 });
 it('restart resets a lost run and dispose releases all Matter bodies',()=>{
  const e=new FruitEngine();e.restore(state([],{lost:true,score:100}));e.restart();expect(e.score).toBe(0);expect(e.lost).toBe(false);expect(e.drop(180)).toBe(true);e.dispose();expect(e.fruits.size).toBe(0);e.step();expect(STEP).toBeCloseTo(16.666667);
 });
});
