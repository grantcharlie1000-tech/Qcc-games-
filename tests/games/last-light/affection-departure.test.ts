import {describe,it,expect} from 'vitest';
import {LEVELS} from '../../../src/games/last-light/levels';
import {createRun,step,serialize,restore,respawn,nearby} from '../../../src/games/last-light/model';
import {worldDressing,nearbyAnimal} from '../../../src/games/last-light/habitats';
import {PET_DURATION,petPose} from '../../../src/games/last-light/affection';
import {clearDuration,departurePose,departureOffset} from '../../../src/games/last-light/departure';
import {goalComposition} from '../../../src/games/last-light/composition';
const idle={move:0,jump:false,dash:false,interact:false};
function besideCat(){
 const s=createRun(),l=LEVELS[2],cat=worldDressing(l).find(a=>a.kind==='cat')!;
 Object.assign(s,{stage:l.id,cleared:l.id,x:cat.x-36,y:cat.y-24,ground:cat.platform,grounded:true});return {s,l,cat};
}
describe('optional animal affection',()=>{
 it('pets every placed cat from either side without scores, quests or save changes',()=>{
  let count=0;
  for(const l of LEVELS)for(const cat of worldDressing(l).filter(a=>a.kind==='cat'))for(const side of [-1,1]){
   count++;const s=createRun();Object.assign(s,{stage:l.id,cleared:l.id,x:cat.x+side*28-8,y:cat.y-24,ground:cat.platform,grounded:true});
   expect(nearby(s)).toBe('E · Pet cat');expect(step(s,{...idle,interact:true}).pet).toBe(true);expect(s.pet?.platform).toBe(cat.platform);expect(s.facing).toBe(-side);
   expect(s.best).toBe(0);expect(s.activated).toEqual([]);expect(s.heard).toEqual([]);expect(s.memories).toEqual([]);expect(serialize(s)).not.toHaveProperty('pet');expect(restore(serialize(s))?.pet).toBeNull();
  }expect(count).toBeGreaterThanOrEqual(6);
 });
 it('requires a stable reachable animal and does not reach through another floor',()=>{
  const {s,l,cat}=besideCat();expect(nearbyAnimal(l,s)).toBe(cat);
  for(const change of [{ground:0},{grounded:false},{vx:50},{x:cat.x-100},{y:cat.y-70},{respawn:.1}])expect(nearbyAnimal(l,{...s,...change})).toBeUndefined();
 });
 it('uses one press, finishes naturally, and cancels immediately for movement, jump, dash or retry',()=>{
  const {s}=besideCat();step(s,{...idle,interact:true});const started=s.pet!.started;
  for(let i=0;i<60;i++)expect(step(s,{...idle,interact:true}).pet).not.toBe(true);
  expect(s.pet!.started).toBe(started);expect(petPose(s,false)?.contact).toBe(1);
  for(let i=0;i<100;i++)step(s,{...idle,interact:true});expect(s.pet).toBeNull();
  for(const input of [{...idle,move:1},{...idle,jump:true},{...idle,dash:true}]){
   const {s:run}=besideCat();step(run,{...idle,interact:true});const event=step(run,input);expect(run.pet).toBeNull();if(input.jump)expect(event.jump).toBe(true);if(input.dash)expect(event.dash).toBe(true);
  }
  const {s:run}=besideCat();step(run,{...idle,interact:true});respawn(run);expect(run.pet).toBeNull();
 });
 it('separates reach, contact strokes and recovery with a quiet reduced-motion pose',()=>{
  const {s}=besideCat();step(s,{...idle,interact:true});const start=s.clock;
  s.clock=start+.1;expect(petPose(s,false)?.contact).toBe(0);
  s.clock=start+.4;expect(petPose(s,false)?.contact).toBe(1);expect(petPose(s,true)?.stroke).toBe(0);
  s.clock=start+PET_DURATION-.1;expect(petPose(s,false)?.contact).toBe(0);expect(petPose(s,false)!.weight).toBeLessThan(1);
 });
});
describe('physical level departures',()=>{
 it('moors all canal ferries in water beyond a solid, gently descending dock',()=>{
  for(const l of LEVELS.filter(l=>l.goal==='ferry'&&l.setting==='canal')){
   const end=l.platforms[l.mainCount-1],art=goalComposition(l);expect(art.art).toBe('ferry');expect(art.bounds.x).toBeGreaterThan(end.x+end.w);expect(l.water).toBe(art.y+8);
   expect(l.exit.x+l.exit.w).toBeLessThan(end.x+end.w);expect(l.platforms.every(p=>p.y<l.water!)).toBe(true);
   for(let i=l.mainCount-3;i<l.mainCount;i++)expect(l.platforms[i].y-l.platforms[i-1].y).toBe(56);
  }
 });
 it('banks the score once, freezes active time and finishes every short departure',()=>{
  for(const l of LEVELS){const s=createRun();Object.assign(s,{stage:l.id,cleared:l.id,x:l.exit.x,y:l.exit.y+24});expect(step(s,idle).clear).toBe(true);
   const time=s.time,stageTime=s.stageTime,score=s.best;expect(s.cinematic).toBe(clearDuration(l));expect(s.cinematic).toBeLessThan(l.goal==='engine'?2.3:2);
   for(let i=0;i<300;i++)expect(step(s,{move:1,jump:true,dash:true,interact:true}).clear).not.toBe(true);
   expect(s.cinematic).toBe(0);expect(s.time).toBe(time);expect(s.stageTime).toBe(stageTime);expect(s.best).toBe(score);
  }
 });
 it('boards before the ferry moves, then carries the courier with its deck',()=>{
  for(const l of LEVELS.filter(l=>l.goal==='ferry')){
   const s=createRun();Object.assign(s,{stage:l.id,cleared:l.id,x:l.exit.x,y:l.exit.y+24});step(s,idle);const before=JSON.stringify(s),art=goalComposition(l);
   const start=departurePose(l,s,false);expect(start.x).toBe(s.x);expect(start.y).toBe(s.y);expect(JSON.stringify(s)).toBe(before);
   s.cinematic=clearDuration(l)-.22;expect(departureOffset(l,s,false)).toEqual({x:0,y:0});expect(departurePose(l,s,false).y).toBeLessThan(s.y-12);
   s.cinematic=clearDuration(l)-.62;expect(departurePose(l,s,false).x+8).toBeCloseTo(art.x-34);expect(departureOffset(l,s,false).x).toBeCloseTo(0);
   s.cinematic=.1;const offset=departureOffset(l,s,false);expect(offset.x).toBeGreaterThan(60);expect(departurePose(l,s,false).x+8).toBeCloseTo(art.x-34+offset.x);
   expect(departurePose(l,s,true)).toMatchObject({x:s.x,y:s.y});expect(departurePose(l,s,true).opacity).toBeLessThan(1);
  }
 });
 it('walks into shelters and fades through the threshold without moving physics',()=>{
  const l=LEVELS[0],s=createRun();Object.assign(s,{x:l.exit.x,y:l.exit.y+24});step(s,idle);s.cinematic=.1;
  const pose=departurePose(l,s,false);expect(pose.action).toBe('run');expect(pose.opacity).toBe(0);expect(s.x).toBe(l.exit.x);
 });
});
