import {LEVELS,type Level} from '../../../src/games/last-light/levels';
import {createRun,step,platformAt,PLAYER_H,PLAYER_W,type Run,type Input} from '../../../src/games/last-light/model';
export const idle:Input={move:0,jump:false,dash:false};
export function onPlatform(stage=0,id=0,clock=0):Run {const s=createRun(),p=LEVELS[stage].platforms[id],r=platformAt(p,clock);Object.assign(s,{stage,cleared:stage,x:r.x+30,y:r.y-PLAYER_H,grounded:true,ground:p.id,clock,threat:-99999});return s;}
export interface Jump {start:Run;inputs:Input[]}
/** Searches real 120Hz jump trajectories in both directions, including ceilings,
 * other ledges, surface friction, moving platforms, wind and live hazards. */
export function jumpBetween(l:Level,from:number,to:number):Jump|null {
 const a=l.platforms[from],b=l.platforms[to];
 if(b.y<a.y-190||b.y>a.y+210||Math.max(a.x-b.x-b.w,b.x-a.x-a.w)>210)return null;
 const dir=b.x+b.w/2>=a.x+a.w/2?1:-1;
 for(const clock of [0,1.8])for(const portion of [0,.25,.5,.75,1])for(const hold of [65,8,0])for(const dashAt of [-1,24,40]){
  const s=onPlatform(l.id,from,clock),r=platformAt(a,clock);s.x=r.x-PLAYER_W+2+(r.w+PLAYER_W-4)*portion;s.vx=dir*220;s.facing=dir;
  const start=structuredClone(s),inputs:Input[]=[];
  for(let frame=0;frame<180;frame++){
   const target=platformAt(b,s.clock),dx=target.x+target.w/2-(s.x+8),move=Math.abs(dx)<10?0:Math.sign(dx);
   const input={move,jump:frame<hold,dash:frame===dashAt};inputs.push(input);const ev=step(s,input);
   if(ev.death)break;
   if((s.grounded&&s.ground===b.id)||(b.kind==='spring'&&s.vy< -600&&Math.abs(s.y+PLAYER_H-target.y)<12))return {start,inputs};
   if(s.phase!=='playing')break;
  }
 }
 return null;
}
export function routeGraph(l:Level):Map<number,number[]> {
 const graph=new Map<number,number[]>();
 for(let from=0;from<l.platforms.length;from++){
  const targets:number[]=[];for(let to=0;to<l.platforms.length;to++)if(from!==to&&jumpBetween(l,from,to))targets.push(to);graph.set(from,targets);
 }
 return graph;
}
export function reachable(graph:Map<number,number[]>,start:number){const found=new Set([start]),queue=[start];while(queue.length){const p=queue.shift()!;for(const n of graph.get(p)??[])if(!found.has(n)){found.add(n);queue.push(n);}}return found;}
