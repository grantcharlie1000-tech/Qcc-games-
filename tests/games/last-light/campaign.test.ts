import {describe,it,expect} from 'vitest';
import {LEVELS} from '../../../src/games/last-light/levels';
import {CHAPTERS,memoryFor} from '../../../src/games/last-light/story';
import {step,missionReady,serialize,restore,platformAt,stationAt,overlap} from '../../../src/games/last-light/model';
import {onPlatform,idle,routeGraph,reachable} from './routes';
describe('authored campaign spaces',()=>{
 it('gives all 120 optional memory fragments a distinct narrative payoff',()=>{expect(new Set(LEVELS.flatMap(l=>[0,1,2].map(id=>memoryFor(l.id,id)))).size).toBe(120);});
 it('has forty distinct maps, story beats and chapter outcomes',()=>{expect(new Set(LEVELS.map(l=>JSON.stringify(l.platforms.map(p=>[p.x,p.y,p.w,p.kind])))).size).toBe(40);expect(new Set(CHAPTERS.map(c=>c.after)).size).toBe(40);expect(new Set(LEVELS.map(l=>l.goal)).size).toBe(8);expect(new Set(LEVELS.flatMap(l=>l.sectors?.map(s=>s.name)??[])).size).toBeGreaterThan(100);});
 for(const l of LEVELS)it(`${l.id+1} ${l.name}: both paths, every connection and the exit are reachable`,()=>{
  const graph=routeGraph(l),fromStart=reachable(graph,0);
  for(const p of l.platforms){expect(fromStart.has(p.id),`unreachable authored platform ${p.id}`).toBe(true);expect(reachable(graph,p.id).has(l.mainCount-1),`platform ${p.id} has no onward route to the exit`).toBe(true);}
  const optionalPath=l.platforms.slice(0,l.mainCount-1).some(entry=>{
   const queue=(graph.get(entry.id)??[]).filter(id=>id>=l.mainCount),seen=new Set(queue);
   while(queue.length)for(const id of graph.get(queue.shift()!)??[]){
    if(id<l.mainCount){if(id>entry.id)return true;continue;}
    if(!seen.has(id)){seen.add(id);queue.push(id);}
   }
   return false;
  });
  expect(optionalPath,'a side route must reconnect farther along the journey').toBe(true);
  expect(l.stations.every(s=>!l.platforms[s.platform].branch),'all required tasks belong to the main route').toBe(true);
  const required=[l.mainCount-1,...l.stations.map(s=>l.platforms.findIndex(p=>s.x>=p.x&&s.x<=p.x+p.w&&s.y===p.y))];
  for(const id of required){expect(fromStart.has(id),`unreachable objective platform ${id}; reachable ${[...fromStart]}`).toBe(true);expect(reachable(graph,id).has(l.mainCount-1),`no way from objective ${id} to exit`).toBe(true);}
  for(const p of l.pickups.filter(p=>p.kind==='spark')){const support=l.platforms.findIndex(r=>p.x>=r.x&&p.x<=r.x+r.w&&p.y===r.y-30);expect(fromStart.has(support),`unreachable memory on platform ${support}`).toBe(true);expect(reachable(graph,support).has(l.mainCount-1),`memory ${p.id} has no return to the exit`).toBe(true);}
 },30000);
 for(const l of LEVELS)it(`${l.id+1}: leaves headroom for every mission and memory`,()=>{
  // These spaces cover the goal silhouette and label, station fixture and the
  // memory interaction area. Art can become smaller, but authored ledges must
  // not cut through the things the player is trying to find.
  const goalHeight=l.goal==='relay'&&l.setting==='garden'?164:116;
  const exit={x:l.exit.x+19-80,y:l.exit.y+56-goalHeight,w:160,h:goalHeight};
  for(const clock of [0,1.8,4.2]){
   const solids=l.platforms.map(p=>({id:p.id,...platformAt(p,clock)}));
   for(const upper of solids)for(const lower of solids)if(upper.id!==lower.id&&upper.y<=lower.y&&upper.x<lower.x+lower.w&&lower.x<upper.x+upper.w)expect(lower.y-upper.y-upper.h,`platforms ${upper.id}/${lower.id} squeeze the courier at ${clock}s`).toBeGreaterThanOrEqual(32);
   for(const p of solids)expect(overlap(exit,p),`exit overlaps platform ${p.id} at ${clock}s`).toBe(false);
   for(const station of l.stations){const at=stationAt(station,l,clock),space={x:at.x-32,y:at.y-70,w:64,h:70};for(const p of solids)if(p.id!==station.platform)expect(overlap(space,p),`station ${station.id} overlaps platform ${p.id} at ${clock}s`).toBe(false);}
   for(const pickup of l.pickups){const space={x:pickup.x-9,y:pickup.y-12,w:18,h:24};for(const p of solids)expect(overlap(space,p),`pickup ${pickup.id} overlaps platform ${p.id} at ${clock}s`).toBe(false);}
  }
 });
});
describe('mission interactions',()=>{
 for(const l of LEVELS)it(`${l.id+1}: requires its own mission, then saves and clears`,()=>{
  const s=onPlatform(l.id),e=l.exit;Object.assign(s,{x:e.x,y:e.y+24,grounded:false});
  if(l.stations.length){step(s,idle);expect(s.phase).toBe('playing');}
  for(const station of l.stations){Object.assign(s,{x:station.x-8,y:station.y-24,vx:0,vy:0});step(s,idle);const event=step(s,{...idle,interact:true});expect(event.interact,`station ${station.id}`).toBe(true);expect(s.activated).toContain(station.id);}
  expect(missionReady(s)).toBe(true);expect(restore(serialize(s))?.activated).toEqual(s.activated);
  Object.assign(s,{x:e.x,y:e.y+24,vx:0,vy:0});expect(step(s,idle).clear).toBe(true);expect(s.cinematic).toBeGreaterThan(0);
  const time=s.time;for(let i=0;i<360;i++)step(s,idle);expect(s.time).toBe(time);expect(s.cinematic).toBe(0);
 });
});
