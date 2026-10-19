import { describe, expect, it } from 'vitest';
import { createTower, advance, drop, movingBlock, intersect, restoreTower, perfectTolerance, speed } from '../../../src/games/tower/model';

describe('tower geometric overlap', () => {
  it('crops only the right overhang', () => {
    expect(intersect({x:15,z:0,w:100,d:100},{x:0,z:0,w:100,d:100},'x')).toEqual({kept:{x:15,z:0,w:85,d:100},cut:{x:100,z:0,w:15,d:100},perfect:false});
  });
  it('crops only the left overhang', () => {
    expect(intersect({x:-20,z:0,w:100,d:100},{x:0,z:0,w:100,d:100},'x')).toEqual({kept:{x:0,z:0,w:80,d:100},cut:{x:-20,z:0,w:20,d:100},perfect:false});
  });
  it('crops the depth axis without changing width', () => {
    expect(intersect({x:0,z:30,w:80,d:100},{x:0,z:0,w:80,d:100},'z').kept).toEqual({x:0,z:30,w:80,d:70});
  });
  it('a touching edge or complete miss is a loss', () => {
    expect(intersect({x:100,z:0,w:100,d:100},{x:0,z:0,w:100,d:100},'x').kept).toBeNull();
    expect(drop(createTower()).phase).toBe('over');
  });
  it('snaps within a fair geometric tolerance, including thin blocks', () => {
    expect(intersect({x:3,z:0,w:100,d:100},{x:0,z:0,w:100,d:100},'x')).toEqual({kept:{x:0,z:0,w:100,d:100},cut:null,perfect:true});
    expect(perfectTolerance(5)).toBeCloseTo(.4);
    expect(intersect({x:.5,z:0,w:5,d:100},{x:0,z:0,w:5,d:100},'x').perfect).toBe(false);
  });
});
describe('tower time and run state', () => {
  it('uses seconds and reflects through multiple edges without frame dependence', () => {
    let a=createTower(),b=createTower();
    for(let n=0;n<90;n++)a=advance(a,1/30);
    for(let n=0;n<180;n++)b=advance(b,1/60);
    expect(movingBlock(a).x).toBeCloseTo(movingBlock(b).x,8);
    expect(a.motion.direction).toBe(b.motion.direction);
    expect(movingBlock(advance(createTower(),40)).x).toBeGreaterThanOrEqual(-200);
  });
  it('awards the same perfect at 30 and 60Hz at the same input time', () => {
    const duration=145/95;
    function at(fps:number){let s=createTower();const count=Math.floor(duration*fps);for(let n=0;n<count;n++)s=advance(s,1/fps);return drop(advance(s,duration-count/fps));}
    const a=at(30),b=at(60);
    expect(a.combo).toBe(1);expect(b.combo).toBe(1);
    expect(a.blocks[1]).toEqual({x:-55,z:-55,w:110,d:110});expect(b.blocks).toEqual(a.blocks);
  });
  it('increases combos then resets after an imperfect placement', () => {
    let s=drop(advance(createTower(),145/95));
    expect(s.score).toBe(2);expect(s.combo).toBe(1);
    s=advance(s,.2);expect(s.motion.axis).toBe('z');
    s=drop(advance(s,145/speed(1)));expect(s.combo).toBe(2);expect(s.score).toBe(5);
    s=advance(s,.2);s=drop(advance(s,125/speed(2)));
    expect(s.combo).toBe(0);expect(s.score).toBe(6);expect(s.blocks.at(-1)!.w).toBeCloseTo(90);
  });
  it('carries settling remainder into the next moving slab and rejects drops while settling', () => {
    const landed=drop(advance(createTower(),145/95));
    expect(drop(landed)).toBe(landed);
    const next=advance(landed,.3);expect(next.phase).toBe('sliding');expect(next.motion.elapsed).toBeCloseTo(.1);
    expect(speed(20)).toBeGreaterThan(speed(0));
  });
  it('round-trips timing, direction, phase, geometry and future movement', () => {
    const s=advance(drop(advance(createTower(),130/95)),.27);
    const restored=restoreTower(JSON.parse(JSON.stringify(s)))!;
    expect(restored).toEqual(s);expect(advance(restored,3.25)).toEqual(advance(s,3.25));
    expect(restoreTower(JSON.parse(JSON.stringify(drop(createTower()))))?.phase).toBe('over');
  });
  it('rejects malformed, unbounded, nonfinite and physically impossible saves', () => {
    for(const bad of [null,{}, {...createTower(),version:99},{...createTower(),score:500},{...createTower(),time:Infinity},{...createTower(),motion:{axis:'y',elapsed:0,direction:1}},{...createTower(),blocks:[{x:0,z:0,w:-1,d:110}]}])expect(restoreTower(bad)).toBeNull();
    const s=drop(advance(createTower(),145/95));s.blocks[1].w=120;expect(restoreTower(s)).toBeNull();
  });
});

describe('tower long-run invariants',()=>{
  it('matches literal reflected positions and rejects actions after loss',()=>{
    expect(movingBlock(advance(createTower(),3)).x).toBeCloseTo(85);
    expect(movingBlock(advance(createTower(),4)).x).toBeCloseTo(0);
    const lost=drop(createTower());expect(drop(lost)).toBe(lost);expect(lost.score).toBe(0);
  });
  it('preserves exact support over fifty alternating perfect floors',()=>{
    let s=createTower();
    for(let h=0;h<50;h++){
      s=drop(advance(s,145/speed(h)));
      expect(s.phase).toBe('settling');expect(s.blocks.at(-1)).toEqual({x:-55,z:-55,w:110,d:110});
      expect(restoreTower(s)).toEqual(s);s=advance(s,.2);
    }
    expect(s.blocks).toHaveLength(51);expect(s.combo).toBe(50);expect(s.score).toBe(290);
  });
  it('retains only supported depth for a negative-axis cut',()=>{
    expect(intersect({x:0,z:-20,w:100,d:100},{x:0,z:0,w:100,d:100},'z')).toEqual({kept:{x:0,z:0,w:100,d:80},cut:{x:0,z:-20,w:100,d:20},perfect:false});
  });
  it('detaches restored geometry from the caller and preserves settling phase',()=>{
    const s=advance(drop(advance(createTower(),145/95)),.1);const restored=restoreTower(s)!;
    expect(restored.phase).toBe('settling');s.blocks[1].w=1;expect(restored.blocks[1].w).toBe(110);
  });
});
