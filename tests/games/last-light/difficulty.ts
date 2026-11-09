import {type Level} from '../../../src/games/last-light/levels';
import {createRun,step,platformAt,PLAYER_H,PLAYER_W} from '../../../src/games/last-light/model';
import {routeGraph} from './routes';

/** A generous version of the repeated hop that cleared 32/40 old chapters:
 * hold jump, dash near the apex, and never steer in the air. Dense takeoff
 * positions, arbitrary platform phase, full initial running speed and ignored
 * hazards all favour this policy. A missed laser window cannot count as a
 * demand for different movement. These are local probes, not a playability
 * proof: journey.test.ts independently replays complete legal input runs. */
export const POLICY_PHASES=[0,.6,1.2,1.8,2.4,3] as const;
export function repeatedHopGraph(level:Level,phases:readonly number[]=POLICY_PHASES):Map<number,number[]> {
 const graph=new Map<number,number[]>(),hazards=level.hazards,enemies=level.enemies;
 level.hazards=[];level.enemies=[];
 try {
  for(const source of level.platforms){
   const found=new Set<number>();
   for(const clock of phases)for(const direction of [-1,1]){
    const rect=platformAt(source,clock),starts:number[]=[];
    for(let x=rect.x-PLAYER_W+2;x<=rect.x+rect.w-2;x+=8)starts.push(x);
    starts.push(rect.x+rect.w-2);
    for(const x of starts)for(const dashAt of [28,32,36]){
     const run=createRun();
     Object.assign(run,{stage:level.id,cleared:level.id,x,y:rect.y-PLAYER_H,vx:direction*220,vy:0,grounded:true,ground:source.id,facing:direction,clock,threat:-1e6,activated:level.stations.map(station=>station.id)});
     if(source.kind==='spring'){
      Object.assign(run,{y:rect.y-PLAYER_H-.25,vy:100,grounded:false,ground:-1});
      if(step(run,{move:0,jump:false,dash:false}).death)continue;
     }
     for(let frame=0;frame<300;frame++){
      const event=step(run,{move:direction,jump:true,dash:frame===dashAt});
      if(event.death)break;
      if(event.clear){found.add(level.mainCount-1);break;}
      if(run.grounded){
       if(run.ground!==source.id)found.add(run.ground);
       break;
      }
      if(event.jump&&frame>0&&run.vy< -600){
       const landed=level.platforms.find(platform=>{
        if(platform.kind!=='spring'||platform.id===source.id)return false;
        const target=platformAt(platform,run.clock);
        return Math.abs(run.y+PLAYER_H-target.y)<1&&run.x+PLAYER_W>target.x&&run.x<target.x+target.w;
       });
       if(landed){found.add(landed.id);break;}
      }
     }
    }
   }
   graph.set(source.id,[...found]);
  }
 } finally {level.hazards=hazards;level.enemies=enemies;}
 return graph;
}

export interface PolicyRoute {changes:number;path:number[];changedEdges:readonly [number,number][]}

/** Find the fewest policy departures in the tested start-to-exit graph, including
 * optional shelves and return paths. This bounded graph is not an exhaustive
 * search of every possible player technique. It supplies other legal controls;
 * every permissive repeated-hop edge is included even if its hazard timing
 * was not found by the separate reachability search. */
export function minimumHopChanges(level:Level,phases:readonly number[]=POLICY_PHASES):PolicyRoute {
 const repeated=repeatedHopGraph(level,phases),general=routeGraph(level);
 // The independent continuous witness covers this authored route. Granting
 // its edges here also prevents a coarse local reachability miss from being
 // mistaken for difficulty; a missing witness fails its own replay test.
 for(let id=0;id<level.mainCount-1;id++)general.set(id,[...new Set([...(general.get(id)??[]),id+1])]);
 const queue=[{id:0,changes:0,path:[0],changedEdges:[] as [number,number][]}];
 const best=new Map<string,number>();
 while(queue.length){
  queue.sort((a,b)=>a.changes-b.changes||a.path.length-b.path.length);
  const current=queue.shift()!,key=String(current.id);
  if(current.changes>(best.get(key)??Infinity))continue;
  if(current.id===level.mainCount-1)return current;
  const easy=new Set(repeated.get(current.id)??[]);
  for(const next of new Set([...(general.get(current.id)??[]),...easy])){
   const changes=current.changes+(easy.has(next)?0:1),nextKey=String(next);
   if(changes>=(best.get(nextKey)??Infinity))continue;
   best.set(nextKey,changes);
   queue.push({id:next,changes,path:[...current.path,next],changedEdges:easy.has(next)?current.changedEdges:[...current.changedEdges,[current.id,next]]});
  }
 }
 return {changes:Infinity,path:[],changedEdges:[]};
}
