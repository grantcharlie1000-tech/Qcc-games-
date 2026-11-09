import {describe,expect,it} from 'vitest';
import {LEVELS,type Level,type Platform,type Rect} from '../../../src/games/last-light/levels';
import {completionMotion,goalComposition,stationComposition,stationArtBounds} from '../../../src/games/last-light/composition';
import {terrainArtBounds} from '../../../src/games/last-light/terrain';
import {completionOffset} from '../../../src/games/last-light/effects';
import {createRun} from '../../../src/games/last-light/model';

// Deliberately do not use the compositor's clearance predicate: these compare
// its chosen silhouettes against the terrain's independent, final art bounds.
function intersects(a:Rect,b:Rect){return Math.min(a.x+a.w,b.x+b.w)>Math.max(a.x,b.x)&&Math.min(a.y+a.h,b.y+b.h)>Math.max(a.y,b.y);}
function sweep(p:Platform,r:Rect):Rect {
 const travel=p.kind==='moving'?(p.travel??0):0,dx=p.axis==='y'?0:travel,dy=p.axis==='y'?travel:0;
 return {x:r.x-dx,y:r.y-dy,w:r.w+2*dx,h:r.h+2*dy};
}
function terrainHits(l:Level,r:Rect,support:number){return l.platforms.filter(p=>p.id!==support&&intersects(r,sweep(p,terrainArtBounds(p,l)))).map(p=>p.id);}
function fixture(level=3):Level {
 const base=LEVELS[level];return {...base,exit:{x:364.5,y:406,w:38,h:56},platforms:[
  {id:0,x:260,y:462,w:190,h:28,kind:'stone'},
  {id:1,x:280,y:344,w:180,h:28,kind:'stone'},
 ],stations:[],pickups:[],hazards:[],checkpoint:{x:35,y:400,platform:9},spawn:{x:50,y:376},width:800,height:650,mainCount:1};
}
describe('foreground composition',()=>{
 for(const l of LEVELS)it(`chapter ${l.id+1} reserves real terrain, pickups and mission silhouettes`,()=>{
  const goal=goalComposition(l),targets=[{name:'goal',bounds:goal.bounds,support:goal.support,marker:goal.marker},...l.stations.map(s=>({name:`station ${s.id}`,bounds:stationArtBounds(l,s),support:s.platform,marker:stationComposition(l,s).marker}))];
  expect(goal.x).toBe(l.exit.x+l.exit.w/2);expect(goal.y).toBe(l.exit.y+l.exit.h);
  for(const target of targets){
   expect(terrainHits(l,target.bounds,target.support),`${target.name} intersects terrain`).toEqual([]);
   for(const item of l.pickups)expect(intersects(target.bounds,{x:item.x-14,y:item.y-19,w:28,h:38}),`${target.name} obscures spark ${item.id}`).toBe(false);
   for(const h of l.hazards){const travel=h.kind==='saw'?(h.travel??0):0;expect(intersects(target.bounds,{x:h.x-travel-5,y:h.y-5,w:h.w+travel*2+10,h:h.h+10}),`${target.name} obscures ${h.kind}`).toBe(false);}
   if(target.marker){const p=l.platforms.find(p=>p.id===target.support)!;expect(terrainHits(l,sweep(p,target.marker),target.support),`${target.name} marker enters another ledge`).toEqual([]);}
  }
  for(let a=0;a<targets.length;a++)for(let b=a+1;b<targets.length;b++)expect(intersects(targets[a].bounds,targets[b].bounds),`${targets[a].name} covers ${targets[b].name}`).toBe(false);
  if(goal.art==='lifeTree')expect(l.world===1||l.setting==='garden').toBe(true);
 });
 it('fits the original low Old Quarter exit without changing its anchor',()=>{
  const l=fixture(),before=JSON.stringify(l),plan=goalComposition(l);
  expect(plan.art).toBe('relay');expect(plan.x).toBe(383.5);expect(plan.y).toBe(462);
  expect(terrainHits(l,plan.bounds,0)).toEqual([]);expect(plan.marker).not.toBeNull();
  expect(terrainHits(l,plan.marker!,0)).toEqual([]);expect(JSON.stringify(l)).toBe(before);
 });
 it('keeps a garden canopy only when its entire silhouette has room',()=>{
  const cramped={...fixture(10),world:1,setting:'garden' as const};
  expect(goalComposition(cramped).art).toBe('gardenRelay');
  const open={...cramped,platforms:[cramped.platforms[0]]};
  expect(goalComposition(open).art).toBe('lifeTree');
  const tree=goalComposition(open);expect(tree.bounds.w).toBeGreaterThanOrEqual(148);expect(tree.bounds.y).toBe(tree.y-139);
 });
 it('constrains completion travel to the actual courier and ferry footprints',()=>{
  for(const l of LEVELS){
   const plan=goalComposition(l),actor={x:plan.x-26,y:plan.y-36,w:36,h:38},motion=completionMotion(l,actor);
   expect(motion.x).toBeGreaterThanOrEqual(0);expect(motion.x).toBeLessThanOrEqual(150);expect(motion.y).toBeGreaterThanOrEqual(-82);expect(motion.y).toBeLessThanOrEqual(0);
   if(motion.x||motion.y){
    const sweptActor={x:actor.x,y:actor.y+motion.y,w:actor.w+motion.x,h:actor.h-motion.y};
    expect(terrainHits(l,sweptActor,plan.support),`chapter ${l.id+1} courier travel`).toEqual([]);
    if(motion.x)expect(terrainHits(l,{...plan.bounds,w:plan.bounds.w+motion.x},plan.support),`chapter ${l.id+1} ferry travel`).toEqual([]);
   }
  }
  const tight={...fixture(),goal:'engine' as const};expect(goalComposition(tight).art).toBe('smallEngine');expect(completionMotion(tight,{x:370,y:426,w:36,h:38})).toEqual({x:0,y:0});
 });
 it('presentation motion is repeatable, frozen when reduced, and never changes Run',()=>{
  const s=createRun();s.stage=6;s.phase='cleared';s.cinematic=.8;s.x=LEVELS[6].exit.x;s.y=LEVELS[6].exit.y+32;const before=JSON.stringify(s);
  expect(completionOffset(s,false)).toEqual(completionOffset(s,false));expect(completionOffset(s,true)).toEqual({x:0,y:0});expect(JSON.stringify(s)).toBe(before);
 });
});
