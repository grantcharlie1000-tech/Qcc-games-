import {LEVELS,type Level,type Station} from './levels';
import type {Run} from './model';
import {DESTINATIONS,rescueNameFor} from './story';

export interface MissionTarget {
 id:number|null;label:string;x:number;y:number;platform:number|null;
}
export interface MissionGuidance {
 phase:'station'|'exit'|'complete';action:string;target:MissionTarget;
 completed:number;total:number;hint:string;routeProgress:number;
 sector:{name:string;index:number;total:number};
}

export function stationAction(station:Station):string {
 return station.kind==='survivor'?'Help':station.kind==='valve'?'Turn':station.kind==='bell'?'Ring':'Light';
}

/** The route's ledge order matters on towers and return circuits: horizontal
 * distance alone would claim the player was finished halfway up a tower. */
export function routeIndex(run:Pick<Run,'ground'|'x'|'y'>,level:Level):number {
 if(run.ground>=0&&run.ground<level.mainCount)return run.ground;
 let nearest=0,distance=Infinity;
 for(let i=0;i<level.mainCount;i++){
  const p=level.platforms[i],dx=Math.max(p.x-run.x-16,run.x-p.x-p.w,0),dy=run.y+24-p.y;
  const d=dx*dx+dy*dy;
  if(d<distance){distance=d;nearest=i;}
 }
 return nearest;
}

function movementHint(run:Run,level:Level,index:number):string {
 const current=level.platforms[index],next=index+1<level.mainCount?level.platforms[index+1]:undefined,after=index+2<level.mainCount?level.platforms[index+2]:undefined;
 const gap=next?Math.max(next.x-current.x-current.w,current.x-next.x-next.w,0):0;
 const nextGap=next&&after?Math.max(after.x-next.x-next.w,next.x-after.x-after.w,0):0;
 const dashHint='Long gap ahead: hold Space, then press X in the air. Land to refill your dash.';
 if(gap>130)return dashHint;
 if(next?.kind==='crumble')return nextGap>130?'Cracked landing ahead. Jump again before it breaks; press X in the air for the long gap.':'Cracked landing ahead. Keep moving and jump before it breaks.';
 if(next?.kind==='ice')return 'Ice ahead. Brake before the next edge; momentum carries you.';
 if(next?.kind==='moving')return 'Moving landing ahead. Wait for it to approach, then jump.';
 if(nextGap>130)return dashHint;
 const hazard=next&&level.hazards.find(h=>h.x+h.w>next.x&&h.x<next.x+next.w&&h.y+h.h<=next.y+4&&(h.disabledBy===undefined||!run.activated.includes(h.disabledBy)));
 if(hazard?.kind==='steam'||hazard?.kind==='laser')return 'A barrier pulses ahead. Wait on safe ground; cross when it fades.';
 if(hazard?.kind==='spikes')return 'Spikes ahead. Jump over them and land on clear ground.';
 if(hazard?.kind==='saw')return 'A moving saw guards the next ledge. Watch its pass before jumping.';
 if(level.goal==='escape')return 'Keep ahead of the dark. Reach the shelter; no switches block the way.';
 const surface=current?.kind;
 if(surface==='ice')return 'Ice carries your speed. Brake before the next edge.';
 if(surface==='crumble')return 'Cracked ground falls away. Jump before it breaks.';
 if(surface==='moving')return 'Ride the platform, then jump when the next landing is close.';
 if(surface==='spring')return 'The spring gives you height. Steer toward the next landing.';
 if(surface==='belt')return 'The belt pushes you. Adjust your run before jumping.';
 if(level.id===0&&index<5)return 'Hold Space to jump higher. Land to refill your dash.';
 if(!run.dashReady&&!run.grounded)return 'Land on a ledge to refill your air dash.';
 return 'Follow the pale route on the map. Side paths hold optional memories.';
}

/** One source for the persistent HUD, map checklist and world objective. The
 * first unfinished station is a suggestion; other stations remain usable. */
export function missionGuidance(run:Run,level:Level=LEVELS[run.stage]):MissionGuidance {
 const completed=level.stations.filter(s=>run.activated.includes(s.id)).length,total=level.stations.length;
 const station=run.phase==='playing'?level.stations.find(s=>!run.activated.includes(s.id)):undefined;
 const index=routeIndex(run,level),sectors=level.sectors?.length?level.sectors:[{name:level.name,platform:0}];
 const sectorIndex=sectors.reduce((current,s,i)=>s.platform<=index?i:current,0);
 const sector={name:sectors[sectorIndex].name,index:sectorIndex,total:sectors.length};
 const destination=DESTINATIONS[level.id];
 const target:MissionTarget=station?{id:station.id,label:station.label,x:station.x,y:station.y-24,platform:station.platform}:{id:null,label:destination,x:level.exit.x+level.exit.w/2,y:level.exit.y+level.exit.h/2,platform:level.mainCount-1};
 const routeProgress=run.phase==='playing'?index/Math.max(1,level.mainCount-1):1;
 if(run.phase!=='playing')return {phase:'complete',action:`Reached ${destination}`,target,completed,total,sector,routeProgress,hint:'Chapter complete. Continue when you are ready.'};
 if(station){
  const verb=stationAction(station),order=total>1?` ${station.id+1}/${total}`:'';
  return {phase:'station',action:`${verb}${order} · ${station.label}`,target,completed,total,sector,routeProgress,hint:movementHint(run,level,index)};
 }
 const action=level.goal==='rescue'?`Lead ${rescueNameFor(level.id)} to ${destination}`:level.goal==='ferry'?`Bell rung · Board ${destination}`:total?`${level.goal==='engine'?'Both wheels open':`All ${total} lights lit`} · Reach ${destination}`:`Reach ${destination}`;
 return {phase:'exit',action,target,completed,total,sector,routeProgress,hint:movementHint(run,level,index)};
}

/** The bearing is a compass, not a suggested jump. Ten world pixels represent
 * a metre; the map supplies the walkable route around walls and switchbacks. */
export function targetBearing(run:Pick<Run,'x'|'y'>,target:Pick<MissionTarget,'x'|'y'>):{arrow:string;distance:number;label:string} {
 const dx=target.x-run.x-8,dy=target.y-run.y-12,distance=Math.max(1,Math.round(Math.hypot(dx,dy)/10));
 const directions=[['→','right'],['↘','below right'],['↓','below'],['↙','below left'],['←','left'],['↖','above left'],['↑','above'],['↗','above right']] as const;
 const [arrow,label]=directions[(Math.round(Math.atan2(dy,dx)/(Math.PI/4))+8)%8];
 return {arrow,distance,label:`${label}, ${distance} metres away`};
}
