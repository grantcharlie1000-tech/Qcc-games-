import {LEVELS,type Level,type Station} from './levels';
import type {Run} from './model';
import {DESTINATIONS} from './story';

export interface MissionTarget {
 id:number|null;label:string;x:number;y:number;platform:number|null;
}
export interface MissionGuidance {
 phase:'exit'|'complete';action:string;target:MissionTarget;
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
 const dashHint=next&&next.w<=125?'Long gap: hold Space, then press X. Release direction to brake onto the small landing.':'Long gap ahead: hold Space, then press X in the air. Land to refill your dash.';
 if(next?.kind==='grate'||current.kind==='grate')return 'Jump up through open treads and gratings from below. Press ↓ to drop through one.';
 if(level.hazards.some(h=>h.kind==='crusher'&&(h.platform===index||h.platform===index+1)))return 'Press ahead. Amber lamps warn before it falls; cross while its head is raised.';
 if(next?.kind==='crumble')return gap>130||nextGap>130?'Cracked landing ahead. Hold Space and press X for the long gap; jump again before it breaks.':'Cracked landing ahead. Keep moving and jump before it breaks.';
 if(gap>130)return dashHint;
 if(level.enemies?.some(e=>e.platform===index||e.platform===index+1)&&!Object.keys(run.defeated).length)return 'Patrol ahead. Stomp from above or dash through it; side contact hurts.';

 if(next?.kind==='ice')return 'Ice ahead. Brake before the next edge; momentum carries you.';
 if(next?.kind==='moving')return 'Moving landing ahead. Wait for it to approach, then jump.';
 // The beam over the very next gap matters more than a long gap after it.
 // Only a beam that starts out over the gap ahead counts; one overhead or
 // already passed would ask for a hop too short for the next landing.
 const ahead=next?next.x>=current.x+current.w?[current.x+current.w,next.x]:next.x+next.w<=current.x?[next.x+next.w,current.x]:null:null;
 if(ahead&&level.platforms.some(p=>p.h<=10&&p.x<ahead[1]&&p.x+p.w>ahead[0]&&!(p.x<current.x+current.w&&p.x+p.w>current.x)&&current.y-(p.y+p.h)>=77&&current.y-(p.y+p.h)<=103))return 'Low eave ahead. Tap Space to slip under it. A full jump hits the beam.';
 if(nextGap>130)return dashHint;
 // A roof tooth is part of the deck being crossed, so warn before the run-up.
 if(level.hazards.some(h=>h.kind==='spikes'&&h.platform===current.id&&h.x>run.x+8))return 'Spikes ahead. Jump over them and land on clear ground.';
 const hazard=next&&level.hazards.find(h=>h.x+h.w>next.x&&h.x<next.x+next.w&&h.y+h.h<=next.y+4&&(h.disabledBy===undefined||!run.activated.includes(h.disabledBy)));
 if(hazard?.kind==='steam'||hazard?.kind==='laser'){
  const paired=next&&level.hazards.filter(h=>h.x+h.w>next.x&&h.x<next.x+next.w&&['steam','laser'].includes(h.kind)&&(h.disabledBy===undefined||!run.activated.includes(h.disabledBy))).length>1;
  return paired?'Read both barrier pulses from safe ground. Cross when the whole opening is clear.':'A barrier pulses ahead. Wait on safe ground; cross when it fades.';
 }
 if(hazard?.kind==='spikes')return 'Spikes ahead. Jump over them and land on clear ground.';
 if(hazard?.kind==='saw')return 'A moving saw guards the next ledge. Watch its pass before jumping.';
 if(next&&next.w<=125&&gap<=125){
  if(current.kind==='spring')return 'Spring launch ahead. Steer and brake toward the small landing.';
  return next.y<current.y-24?'Hold Space for the higher ledge. Release direction to brake onto the small landing.':'Tap Space for the short hop. Release direction to brake; save X for long gaps.';
 }
 if(next&&current.kind!=='moving'&&current.y-next.y>=48&&gap<=90&&next.w>125)return level.setting==='roofs'?'Hold Space for the chimney step.':'Hold Space for the high step.';
 if(level.goal==='escape')return 'Keep ahead of the black. Reach the shelter; nothing on the way has to be switched.';
 const surface=current?.kind;
 if(surface==='ice')return 'Ice carries your speed. Brake before the next edge.';
 if(surface==='crumble')return 'Cracked ground falls away. Jump before it breaks.';
 if(surface==='moving')return 'Ride the platform, then jump when the next landing is close.';
 if(surface==='spring')return 'The spring gives you height. Steer toward the next landing.';
 if(surface==='belt')return 'The belt pushes you. Adjust your run before jumping.';
 if(level.id===0&&index<5)return 'Run, then hold Space at the edge. A miss drops you into a yard, not the street.';
 if(!run.dashReady&&!run.grounded)return 'Land on a ledge to refill your air dash.';
 return 'Read the ledges ahead. Side paths hold optional memories.';
}

/** Platforming has one objective. Story encounters and useful machinery are
 * optional; their state never redirects the compass or locks the exit. */
export function missionGuidance(run:Run,level:Level=LEVELS[run.stage]):MissionGuidance {
 const completed=level.stations.filter(s=>run.activated.includes(s.id)).length,total=level.stations.length;
 const index=routeIndex(run,level),sectors=level.sectors?.length?level.sectors:[{name:level.name,platform:0}];
 const sectorIndex=sectors.reduce((current,s,i)=>s.platform<=index?i:current,0);
 const sector={name:sectors[sectorIndex].name,index:sectorIndex,total:sectors.length};
 const destination=DESTINATIONS[level.id];
 const target:MissionTarget={id:null,label:`Exit · ${destination}`,x:level.exit.x+level.exit.w/2,y:level.exit.y+level.exit.h/2,platform:level.mainCount-1};
 const routeProgress=run.phase==='playing'?index/Math.max(1,level.mainCount-1):1;
 if(run.phase!=='playing')return {phase:'complete',action:'Level complete',target,completed,total,sector,routeProgress,hint:'Continue to the next level when you are ready.'};
 return {phase:'exit',action:'Reach the exit',target,completed,total,sector,routeProgress,hint:movementHint(run,level,index)};
}

/** The bearing is a compass, not a suggested jump. Ten world pixels represent
 * a metre; the map supplies the walkable route around walls and switchbacks. */
export function targetBearing(run:Pick<Run,'x'|'y'>,target:Pick<MissionTarget,'x'|'y'>):{arrow:string;distance:number;label:string} {
 const dx=target.x-run.x-8,dy=target.y-run.y-12,distance=Math.max(1,Math.round(Math.hypot(dx,dy)/10));
 const directions=[['→','right'],['↘','below right'],['↓','below'],['↙','below left'],['←','left'],['↖','above left'],['↑','above'],['↗','above right']] as const;
 const [arrow,label]=directions[(Math.round(Math.atan2(dy,dx)/(Math.PI/4))+8)%8];
 return {arrow,distance,label:`${label}, ${distance} metres away`};
}
