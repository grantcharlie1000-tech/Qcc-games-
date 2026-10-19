import { describe, expect, it } from 'vitest';
import { createRun, restoreRun, step, trackAt, section, steer, RADIUS } from '../../../src/games/ball-run/model';

describe('Ball Run deterministic downhill world', () => {
  it('generates continuous, navigable track and bounded jump gaps across seeds', () => {
    for(let seed=1;seed<=12;seed++) for(let i=0;i<600;i++) {
      const a=trackAt(seed,i*2); const b=trackAt(seed,i*2+.01);
      expect(Math.abs(a.center-b.center)).toBeLessThan(.01);
      expect(a.width).toBeGreaterThanOrEqual(4.8);
      const s=section(seed,i);
      expect(s.gap).toBeLessThanOrEqual(3.2);
      expect(s.obstacle===0 || Math.abs(s.obstacle)>.9).toBe(true);
      expect(s.length-s.gap).toBeGreaterThan(20);
    }
  });
  it('a center-following driver can traverse 1200 metres including every gap', () => {
    for(const seed of [1,8,19,123]){const s=createRun(seed);s.phase='running';
      for(let i=0;i<15000&&s.distance<1200&&s.phase==='running';i++){
        const track=trackAt(seed,s.distance);
        const input=Math.max(-1,Math.min(1,(track.center-s.x)*1.2));
        step(s,input,track.gap>0&&track.local>=14&&track.local<14.25&&s.grounded,1/120);
      }
      expect(s.phase).toBe('running');expect(s.distance).toBeGreaterThanOrEqual(1200);
    }
  });
  it('steering integrates independently of display frame rate', () => {
    const a={x:0,vx:0}; const b={x:0,vx:0};
    for(let i=0;i<30;i++) steer(a,1,1/30);
    for(let i=0;i<144;i++) steer(b,1,1/144);
    expect(a.x).toBeCloseTo(b.x,10); expect(a.vx).toBeCloseTo(b.vx,10);
  });
  it('falls off the edge, loses, and stops distance after loss', () => {
    const s=createRun(123); s.phase='running';
    for(let i=0;i<500;i++) step(s,1,false,1/120);
    expect(s.phase).toBe('over'); const distance=s.distance;
    step(s,0,true,1); expect(s.distance).toBe(distance);
  });
  it('jump clears a generated gap while an unjumped ball falls', () => {
    const s=createRun(8); s.phase='running'; s.distance=64;
    const dead={...s};
    for(let i=0;i<300;i++){ step(s,0,i===0,1/120); step(dead,0,false,1/120); }
    expect(s.phase).toBe('running'); expect(dead.phase).toBe('over');
  });
  it('obstacle collision ends the run and jumping clears the block', () => {
    const s=createRun(8); s.phase='running'; s.distance=104; s.x=trackAt(8,108).center+section(8,4).obstacle;
    const jumping={...s};
    for(let i=0;i<60;i++){step(s,0,false,1/120);step(jumping,0,i===0,1/120);}
    expect(s.phase).toBe('over'); expect(jumping.phase).toBe('running');
  });
  it('restores an airborne run and continues with identical physics and seeded hazards', () => {
    const original=createRun(31);original.phase='running';
    for(let i=0;i<25;i++)step(original,.1,i===0,1/120);
    const restored=restoreRun(JSON.parse(JSON.stringify(original)))!;
    expect(restored.grounded).toBe(false);
    for(let i=0;i<300;i++){step(original,.05,false,1/120);step(restored,.05,false,1/120);}
    expect(restored).toEqual(original);
  });
  it('round trips exact state and rejects corrupt or inconsistent snapshots', () => {
    const s=createRun(19); s.phase='running'; for(let i=0;i<80;i++)step(s,.2,false,1/120);
    expect(restoreRun(JSON.parse(JSON.stringify(s)))).toEqual(s);
    for(const data of [null,{}, {...s,distance:NaN},{...s,x:1e10},{...s,seed:0},{...s,phase:'oops'},{...s,height:-100}])expect(restoreRun(data)).toBeNull();
    expect(RADIUS).toBeGreaterThan(0);
  });
});
