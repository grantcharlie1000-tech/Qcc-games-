import { describe, expect, it } from 'vitest';
import { createRun, restoreRun, step, trackAt, section, steer, speedAt, RADIUS } from '../../../src/games/ball-run/model';

function drive(seed:number, until:number) {
  const s=createRun(seed);s.phase='running';let airborne=0,landings=0;
  for(let i=0;i<20000&&s.distance<until&&s.phase==='running';i++){
    const was=s.grounded;
    step(s,Math.max(-1,Math.min(1,(trackAt(seed,s.distance+1).center-s.x)*1.2)),1/120);
    if(!s.grounded)airborne++;if(!was&&s.grounded)landings++;
  }
  return {s,airborne,landings};
}
describe('Ball Run continuous steering and gravity course', () => {
  it('crosses every generated ramp gap without a jump action over 1200 metres', () => {
    for(const seed of [1,8,19,123]){
      const {s,airborne,landings}=drive(seed,1200);
      expect(s.phase).toBe('running');expect(s.distance).toBeGreaterThanOrEqual(1200);
      expect(airborne).toBeGreaterThan(100);expect(landings).toBeGreaterThanOrEqual(12);
    }
  });
  it('joins chunks continuously and leaves a clear center corridor through narrow obstacle sections',()=>{
    for(let seed=1;seed<=12;seed++)for(let index=1;index<100;index++){
      const a=trackAt(seed,index*24-.0001),b=trackAt(seed,index*24);
      expect(Math.abs(a.elevation-b.elevation)).toBeLessThan(.001);
      expect(Math.abs(a.center-b.center)).toBeLessThan(.001);
      expect(a.ground&&b.ground).toBe(true);
      const s=section(seed,index);expect(s.gap).toBeLessThanOrEqual(3);
      if(s.obstacle)expect(Math.abs(s.obstacle)-.45).toBeGreaterThan(RADIUS);
    }
  });
  it('rises up the launch ramp, flies across the gap, then lands by gravity',()=>{
    const s=createRun(8);s.phase='running';s.distance=60;s.height=trackAt(8,60).elevation+RADIUS;s.x=trackAt(8,60).center;
    let lifted=false,across=false,landed=false;
    for(let i=0;i<240;i++){
      step(s,0,1/120);
      if(s.distance>65&&!s.grounded)lifted=true;
      if(s.distance>68)across=true;
      if(across&&s.grounded)landed=true;
    }
    expect(lifted).toBe(true);expect(across).toBe(true);expect(landed).toBe(true);expect(s.phase).toBe('running');
  });
  it('cyan acceleration sections increase forward speed then return to normal progression',()=>{
    expect(speedAt(31)).toBeGreaterThan(speedAt(25)*1.2);
    expect(speedAt(38)).toBeLessThan(speedAt(31));
    const s=createRun(3);s.phase='running';s.distance=27;s.height=trackAt(3,27).elevation+RADIUS;
    for(let i=0;i<120;i++)step(s,0,1/120);
    expect(s.distance-27).toBeGreaterThan(13.5);expect(s.phase).toBe('running');
  });
  it('steering integrates independently of display frame rate', () => {
    const a={x:0,vx:0},b={x:0,vx:0};
    for(let i=0;i<30;i++)steer(a,1,1/30);for(let i=0;i<144;i++)steer(b,1,1/144);
    expect(a.x).toBeCloseTo(b.x,10);expect(a.vx).toBeCloseTo(b.vx,10);
  });
  it('edge departure falls and loss freezes the distance', () => {
    const s=createRun(123);s.phase='running';for(let i=0;i<500;i++)step(s,1,1/120);
    expect(s.phase).toBe('over');const d=s.distance;step(s,0,1/120);expect(s.distance).toBe(d);
  });
  it('sphere collision with a magenta block ends the run while the center route stays clear',()=>{
    const s=createRun(8);s.phase='running';s.distance=82;s.height=trackAt(8,82).elevation+RADIUS;
    s.x=trackAt(8,84).center+section(8,3).obstacle;
    for(let i=0;i<50;i++)step(s,0,1/120);
    expect(s.phase).toBe('over');expect(s.reason).toContain('block');
    expect(drive(8,100).s.phase).toBe('running');
  });
  it('restores an airborne run with identical future motion and rejects inconsistent snapshots',()=>{
    const s=createRun(31);s.phase='running';for(let i=0;i<1000&&s.distance<65.5&&s.phase==='running';i++)step(s,0,1/120);
    expect(s.grounded).toBe(false);const restored=restoreRun(JSON.parse(JSON.stringify(s)))!;expect(restored).not.toBeNull();
    for(let i=0;i<300;i++){step(s,.05,1/120);step(restored,.05,1/120);}expect(restored).toEqual(s);
    for(const data of [null,{}, {...s,distance:NaN},{...s,x:1e10},{...s,seed:0},{...s,phase:'oops'},{...s,height:-1e10}])expect(restoreRun(data)).toBeNull();
  });
  it('migrates legacy saves to the new terrain while preserving distance, score, and seed',()=>{
    const legacy={version:1,seed:8,run:2,phase:'running',distance:58,x:0,vx:0,height:.38,vy:0,grounded:true,elapsed:4.5,best:143,reason:''};
    const s=restoreRun(legacy)!;expect(s.version).toBe(2);expect(s.distance).toBe(58);expect(s.best).toBe(143);expect(s.seed).toBe(8);
    expect(s.height).toBeCloseTo(trackAt(8,58).elevation+RADIUS);expect(restoreRun({...legacy,height:-100})).toBeNull();
  });
});
