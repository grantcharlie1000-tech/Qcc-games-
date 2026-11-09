import {LEVELS,LEVEL_COUNT,type Rect,type Platform,type Hazard,type Station,type Level,type Checkpoint} from './levels';
import {CHAPTERS,speakerFor,memoryFor} from './story';
import {enemyAt} from './enemies';
import {pressAt} from './press';
import {nearbyAnimal} from './habitats';
import {PET_DURATION,type Petting} from './affection';
import {clearDuration} from './departure';
import {normalizeLastLightScore,LAST_LIGHT_MAX_SCORE} from '../../core/last-light-score';
export const STEP=1/120,PLAYER_W=16,PLAYER_H=24;
export interface Input {move:number;jump:boolean;dash:boolean;interact?:boolean;drop?:boolean}
export type Phase='playing'|'cleared'|'complete';
export interface Run {
 version:2;stage:number;cleared:number;phase:Phase;x:number;y:number;vx:number;vy:number;facing:number;grounded:boolean;ground:number;wall:number;
 coyote:number;buffer:number;dashLeft:number;dashReady:boolean;previousJump:boolean;previousDash:boolean;
 time:number;stageTime:number;deaths:number;stageDeaths:number;sparks:number;collected:number[];key:boolean;checkpoint:boolean;checkpointIndex:number;clock:number;respawn:number;
 crumbles:Record<number,number>;best:number;activated:number[];heard:number[];memories:number[];previousInteract:boolean;cinematic:number;defeated:Record<number,number>;dropLeft:number;pet:Petting|null;threat:number;chasing:boolean;ending:'share'|'home'|null;
}
export interface Events {jump?:boolean;dash?:boolean;land?:boolean;pickup?:boolean;checkpoint?:boolean;death?:boolean;deathPose?:Run;deathCause?:string;clear?:boolean;pet?:boolean;enemy?:boolean;stomp?:boolean;interact?:boolean;message?:string}
export const overlap=(a:Rect,b:Rect)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
export function createRun():Run {const p=LEVELS[0].spawn;return {version:2,stage:0,cleared:0,phase:'playing',...p,vx:0,vy:0,facing:1,grounded:false,ground:-1,wall:0,coyote:0,buffer:0,dashLeft:0,dashReady:true,previousJump:false,previousDash:false,time:0,stageTime:0,deaths:0,stageDeaths:0,sparks:0,collected:[],key:false,checkpoint:false,checkpointIndex:-1,clock:0,respawn:0,crumbles:{},best:0,activated:[],heard:[],memories:[],previousInteract:false,cinematic:0,defeated:{},dropLeft:0,pet:null,threat:-300,chasing:false,ending:null};}
export function platformAt(p:Platform,t:number):Rect {const shift=p.kind==='moving'?Math.sin(t*(p.speed??1)+p.id)*(p.travel??0):0;return {x:p.x+(p.axis!=='y'?shift:0),y:p.y+(p.axis==='y'?shift:0),w:p.w,h:p.h};}
export function stationAt(station:Station,level:Level,t:number){const p=level.platforms[station.platform],r=platformAt(p,t);return {x:station.x+r.x-p.x,y:station.y+r.y-p.y};}
export function hazardAt(h:Hazard,t:number):Rect {if(h.kind==='crusher')return pressAt(h,t);return {...h,x:h.x+(h.kind==='saw'?Math.sin(t*2*Math.PI/(h.period??3)+(h.offset??0))*(h.travel??0):0)};}
const hazardCycle=(h:Hazard,t:number)=>{const period=h.period??3;return ((t+(h.offset??0))%period+period)%period;};
export const laserActive=(h:Hazard,t:number)=>!['laser','steam'].includes(h.kind)||hazardCycle(h,t)<(h.period??3)*(h.duty??.55);
/** Powered machinery has a visible, persistent response to its control wheel. */
const supportGone=(h:Hazard,s:Run)=>h.platform!==undefined&&s.crumbles[h.platform]!==undefined&&s.crumbles[h.platform]<=0;
export const hazardActive=(h:Hazard,s:Run)=>!supportGone(h,s)&&(h.disabledBy===undefined||!s.activated.includes(h.disabledBy))&&laserActive(h,s.clock);
/** Amber emitters announce the end of a safe interval before collision returns. */
export function hazardWarning(h:Hazard,s:Run):boolean {
 if(supportGone(h,s)||!['laser','steam'].includes(h.kind)||(h.disabledBy!==undefined&&s.activated.includes(h.disabledBy))||laserActive(h,s.clock))return false;
 const period=h.period??3,warning=Math.min(.55,period*(1-(h.duty??.55))*.5);
 return period-hazardCycle(h,s.clock)<=warning;
}
/** The dark moves continuously. If a sprint leaves it far away, it accelerates
 * toward the encounter instead of becoming irrelevant for the rest of a stage. */
export function pursuitSpeed(level:Level,s:Run):number {
 const distance=s.x-s.threat,target=620-level.world*60;
 return Math.min(440,(level.pressure??48)+Math.max(0,distance-target)*1.8);
}
export const escapeLead=(s:Run)=>Math.max(0,s.x+PLAYER_W-s.threat);
export const checkpointsFor=(level:Level):readonly Checkpoint[]=>level.checkpoints?.length?level.checkpoints:[level.checkpoint];
export function checkpointIndexFor(s:Run,level=LEVELS[s.stage]):number {
 if(!s.checkpoint)return -1;
 if(s.checkpointIndex>=0&&s.checkpointIndex<checkpointsFor(level).length)return s.checkpointIndex;
 return Math.max(0,checkpointsFor(level).findIndex(p=>p.platform===level.checkpoint.platform));
}
export function checkpointFor(s:Run,level=LEVELS[s.stage]):Checkpoint|undefined {return checkpointsFor(level)[checkpointIndexFor(s,level)];}
export function rankScore(cleared:number,sparks:number,milliseconds:number,deaths:number){
 if(cleared<=0)return 0;
 const stages=clamp(Math.floor(cleared),0,LEVEL_COUNT),memories=clamp(Math.floor(sparks),0,stages*3);
 return stages*1000+memories*100+clamp(stages*250-Math.floor(milliseconds/1000)*2-Math.floor(deaths)*25,0,stages*250);
}
export const scoreFor=(s:Run)=>s.best;
export function respawn(s:Run,penalty=true){
 if(penalty){s.deaths++;s.stageDeaths++;}
 const level=LEVELS[s.stage],cp=checkpointFor(s,level),p=cp?{x:cp.x,y:cp.y-PLAYER_H}:level.spawn;
 Object.assign(s,p,{vx:0,vy:0,grounded:false,ground:-1,wall:0,coyote:0,buffer:0,dashLeft:0,dashReady:true,respawn:penalty?.35:0,crumbles:{},previousJump:false,previousDash:false,previousInteract:false,defeated:{},dropLeft:0,pet:null,threat:p.x-300,chasing:false});
}
export function nextStage(s:Run):boolean {
 if(s.phase!=='cleared'||s.stage>=LEVEL_COUNT-1)return false;
 s.stage++;s.phase='playing';s.stageTime=0;s.stageDeaths=0;s.clock=0;s.key=false;s.checkpoint=false;s.checkpointIndex=-1;s.collected=[];s.activated=[];s.cinematic=0;respawn(s,false);return true;
}
/** Fixed-step simulation. Input edge detection lives here so replays and touch share the same physics. */
export function step(s:Run,input:Input,dt=STEP):Events {
 const events:Events={};if(s.phase!=='playing'){if(s.cinematic>0){s.cinematic=Math.max(0,s.cinematic-dt);s.clock+=dt;}return events;}
 const level=LEVELS[s.stage],oldClock=s.clock;s.clock+=dt;s.time+=dt*1000;s.stageTime+=dt*1000;
 const jumpPressed=input.jump&&!s.previousJump,dashPressed=input.dash&&!s.previousDash;
 const interactPressed=!!input.interact&&!s.previousInteract;s.previousInteract=!!input.interact;
 s.previousJump=input.jump;s.previousDash=input.dash;
 if(s.respawn>0){s.respawn=Math.max(0,s.respawn-dt);return events;}
 for(const id of Object.keys(s.crumbles)){const n=Number(id);s.crumbles[n]=Math.max(-3,s.crumbles[n]-dt);if(s.crumbles[n]<=-2.5)delete s.crumbles[n];}
 s.buffer=jumpPressed?.12:Math.max(0,s.buffer-dt);s.coyote=s.grounded?.1:Math.max(0,s.coyote-dt);
 const oldGround=level.platforms.find(p=>p.id===s.ground);
 if(s.grounded&&oldGround?.kind==='moving'){const before=platformAt(oldGround,oldClock),after=platformAt(oldGround,s.clock);s.x+=after.x-before.x;s.y+=after.y-before.y;}
 s.dropLeft=Math.max(0,s.dropLeft-dt);
 if(input.drop&&s.grounded&&oldGround?.kind==='grate'){s.dropLeft=.2;s.y+=2;s.grounded=false;s.ground=-1;s.coyote=0;s.pet=null;}
 const move=clamp(input.move,-1,1);if(move)s.facing=Math.sign(move);
 if(s.pet&&(move||jumpPressed||dashPressed||!s.grounded||s.clock-s.pet.started>=PET_DURATION))s.pet=null;
 if(s.buffer>0&&(s.coyote>0||s.wall!==0)){
  s.vy=-420;if(!s.grounded&&s.coyote<=0&&s.wall){s.vx=-s.wall*270;s.facing=-s.wall;}
  s.grounded=false;s.ground=-1;s.coyote=0;s.buffer=0;events.jump=true;
 }
 if(dashPressed&&s.dashReady){s.dashReady=false;s.dashLeft=.15;s.vx=s.facing*560;s.vy=0;events.dash=true;}
 if(s.dashLeft>0)s.dashLeft=Math.max(0,s.dashLeft-dt);
 else {
  const ice=s.grounded&&oldGround?.kind==='ice',target=move*220,acceleration=ice?260:s.grounded?1800:1000;
  s.vx+=clamp(target-s.vx,-acceleration*dt,acceleration*dt);
  if(!s.grounded)s.vx+=level.wind*Math.sin(s.clock*.8)*dt;
  if(!input.jump&&s.vy< -160)s.vy+=1700*dt;
  s.vy=Math.min(s.vy+1120*dt,650);
  if(s.wall&&s.vy>90&&move===s.wall)s.vy=90;
 }
 const bodies=level.platforms.filter(p=>s.crumbles[p.id]===undefined||s.crumbles[p.id]>0).map(p=>({p,r:platformAt(p,s.clock)}));
 if(level.gate&&!s.key)bodies.push({p:{...level.gate,id:-2,kind:'stone'},r:level.gate});
 const previousX=s.x,previousY=s.y;
 s.x+=s.vx*dt+(s.grounded&&oldGround?.kind==='belt'?(oldGround.direction??1)*85*dt:0);s.x=clamp(s.x,0,level.width-PLAYER_W);s.wall=0;
 for(const {p,r} of bodies)if(p.kind!=='grate'&&overlap({x:s.x,y:s.y,w:PLAYER_W,h:PLAYER_H},r)){
  if(previousX+PLAYER_W<=r.x+.1){s.x=r.x-PLAYER_W;s.wall=1;}
  else if(previousX>=r.x+r.w-.1){s.x=r.x+r.w;s.wall=-1;}
  else continue;
  s.vx=0;s.dashLeft=0;
 }
 s.y+=s.vy*dt;const wasGrounded=s.grounded;s.grounded=false;s.ground=-1;
 for(const {p,r} of bodies)if(!(p.kind==='grate'&&(s.dropLeft>0||s.vy<0))&&overlap({x:s.x,y:s.y,w:PLAYER_W,h:PLAYER_H},r)){
  if(s.vy>=0&&previousY+PLAYER_H<=r.y+.5){
   s.y=r.y-PLAYER_H;s.vy=0;s.grounded=true;s.ground=p.id;s.dashReady=true;s.dashLeft=0;
   if(!wasGrounded)events.land=true;
   if(p.kind==='crumble'&&s.crumbles[p.id]===undefined)s.crumbles[p.id]=p.crumbleDelay??.85;
   if(p.kind==='spring'){s.vy=-620;s.grounded=false;s.ground=-1;events.jump=true;}
  }else if(s.vy<0&&previousY>=r.y+r.h-.5){s.y=r.y+r.h;s.vy=0;s.dashLeft=0;}
 }
 // Enemy contact is swept at the feet, so a fast descending stomp cannot tunnel.
 let enemyHit=false;
 for(const enemy of level.enemies??[]){
  if(s.defeated[enemy.id]!==undefined)continue;
  const at=enemyAt(enemy,s.clock),body={x:s.x+2,y:s.y+2,w:PLAYER_W-4,h:PLAYER_H-2};
  const stomp=s.vy>0&&previousY+PLAYER_H<=at.y+7&&s.y+PLAYER_H>=at.y&&s.x+PLAYER_W-2>at.x&&s.x+2<at.x+at.w;
  if(stomp||overlap(body,at)&&s.dashLeft>0){
   s.defeated[enemy.id]=s.clock;events.enemy=true;s.pet=null;
   if(stomp){s.y=at.y-PLAYER_H;s.vy=input.jump?-420:-310;s.grounded=false;s.ground=-1;s.dashReady=true;events.stomp=true;}
  }else if(overlap(body,at))enemyHit=true;
 }
 const player={x:s.x+2,y:s.y+2,w:PLAYER_W-4,h:PLAYER_H-2};
 if(level.goal==='escape'){if(s.x>(checkpointFor(s,level)?.x??level.spawn.x)+120)s.chasing=true;if(s.chasing)s.threat+=pursuitSpeed(level,s)*dt;}
 const hit=level.hazards.find(h=>hazardActive(h,s)&&overlap(player,hazardAt(h,s.clock))),fell=s.y>level.height+32,drowned=level.water!==null&&s.y+PLAYER_H>level.water,caught=level.goal==='escape'&&s.x+PLAYER_W<s.threat;
 if(fell||drowned||caught||hit||enemyHit){
  events.deathPose={...s,crumbles:{...s.crumbles}};events.deathCause=hit?.kind??(enemyHit?'enemy':drowned?'water':caught?'dark':'fall');
  respawn(s);events.death=true;return events;
 }

 for(const p of level.pickups)if(!s.collected.includes(p.id)&&overlap(player,{x:p.x-9,y:p.y-12,w:18,h:24})){
  s.collected.push(p.id);if(p.kind==='spark'){s.sparks++;s.memories.push(s.stage*3+p.id);events.message=`Memory ${p.id+1}/3 · ${memoryFor(s.stage,p.id)}`;}else if(p.kind==='key')s.key=true;else s.dashReady=true;events.pickup=true;
 }
 if(s.grounded)for(const [index,cp] of checkpointsFor(level).entries()){
  if(index>checkpointIndexFor(s,level)&&s.ground===cp.platform&&s.x+PLAYER_W>=cp.x){s.checkpoint=true;s.checkpointIndex=index;events.checkpoint=true;}
 }
 if(interactPressed){
  const station=level.stations.find(p=>{const at=stationAt(p,level,s.clock);return !s.activated.includes(p.id)&&Math.abs(s.x+8-at.x)<48&&Math.abs(s.y+PLAYER_H-at.y)<44;});
  const animal=nearbyAnimal(level,s);
  if(station){s.activated.push(station.id);events.interact=true;events.message=station.kind==='survivor'?`${station.label}: I’m with you. Lead the way.`:station.kind==='valve'?`${station.label} open.${level.hazards.some(h=>h.disabledBy===station.id)?' Linked machinery shut down.':''}`:station.kind==='bell'?'Departure bell rung.':`${station.label} lit.`;}
  else if(animal&&!s.pet){s.pet={platform:animal.platform,x:animal.x,y:animal.y,started:s.clock};s.facing=Math.sign(animal.x-s.x-8)||s.facing;events.pet=true;}
  else if(Math.abs(s.x-152)<60&&Math.abs(s.y+PLAYER_H-level.spawn.y-PLAYER_H)<48){if(!s.heard.includes(s.stage))s.heard.push(s.stage);events.interact=true;events.message=`${speakerFor(s.stage)}: “${CHAPTERS[s.stage].line}”`;}
 }
 if(overlap(player,level.exit)){
  s.cleared=s.stage+1;s.phase=s.cleared===LEVEL_COUNT?'complete':'cleared';s.best+=rankScore(1,s.collected.filter(id=>id<3).length,s.stageTime,s.stageDeaths);s.cinematic=clearDuration(level);s.pet=null;events.clear=true;
 }
 return events;
}
/** Optional encounter completion is separate from the platforming exit. */
export const encountersComplete=(s:Run)=>LEVELS[s.stage].stations.every(p=>s.activated.includes(p.id));
export function nearby(s:Run):string {
 const level=LEVELS[s.stage];
 const station=level.stations.find(p=>{const at=stationAt(p,level,s.clock);return !s.activated.includes(p.id)&&Math.abs(s.x+8-at.x)<48&&Math.abs(s.y+PLAYER_H-at.y)<44;});
 if(station)return `E · ${station.kind==='survivor'?'Help':station.kind==='valve'?'Turn':station.kind==='bell'?'Ring':'Light'} ${station.label} · optional`;
 if(s.pet)return '';
 if(nearbyAnimal(level,s))return 'E · Pet cat';
 if(Math.abs(s.x-152)<60&&Math.abs(s.y-level.spawn.y)<48)return `E · Talk to ${speakerFor(s.stage)} · optional`;
 return '';
}
export interface Save {version:1|2;layoutVersion?:2;stage:number;cleared:number;phase:Phase;time:number;stageTime:number;deaths:number;stageDeaths?:number;sparks:number;collected:number[];key:boolean;checkpoint:boolean;checkpointIndex?:number;best:number;activated?:number[];heard?:number[];memories?:number[];ending?:'share'|'home'|null}
export function serialize(s:Run):Save {
 const {version,stage,cleared,phase,time,stageTime,deaths,stageDeaths,sparks,collected,key,checkpoint,best,activated,heard,memories,ending}=s;
 return {version,layoutVersion:2,stage,cleared,phase,time:Math.floor(time),stageTime:Math.floor(stageTime),deaths,stageDeaths,sparks,collected:[...collected],key,checkpoint,checkpointIndex:checkpointIndexFor(s),best,activated:[...activated],heard:[...heard],memories:[...memories],ending};
}
export function restore(value:unknown):Run|null {
 if(!value||typeof value!=='object')return null;const v=value as Save;
 if(![1,2].includes(v.version)||!Number.isInteger(v.stage)||v.stage<0||v.stage>=LEVEL_COUNT||!['playing','cleared','complete'].includes(v.phase))return null;
 const finished=v.phase!=='playing';
 if(v.cleared!==v.stage+(finished?1:0)||(v.phase==='complete')!==(v.cleared===LEVEL_COUNT))return null;
 if(![v.time,v.stageTime,v.deaths,v.sparks,v.best].every(n=>Number.isSafeInteger(n)&&n>=0)||v.time>31_536_000_000||v.stageTime>v.time||v.deaths>1e7||v.sparks>(v.stage+1)*3||v.best>(v.version===1?40_999_999:LAST_LIGHT_MAX_SCORE))return null;
 if(v.stageDeaths!==undefined&&(!Number.isSafeInteger(v.stageDeaths)||v.stageDeaths<0||v.stageDeaths>v.deaths))return null;
 const level=LEVELS[v.stage],legacy=v.version===1,previousLayout=!legacy&&v.layoutVersion===undefined;
 if(v.layoutVersion!==undefined&&v.layoutVersion!==2)return null;
 if(!legacy&&v.checkpointIndex!==undefined&&(!Number.isInteger(v.checkpointIndex)||v.checkpointIndex< -1||v.checkpointIndex>=checkpointsFor(level).length||!v.checkpoint&&v.checkpointIndex!==-1))return null;
 if(typeof v.key!=='boolean'||typeof v.checkpoint!=='boolean'||!Array.isArray(v.collected)||v.collected.length>5||new Set(v.collected).size!==v.collected.length||!v.collected.every(id=>Number.isInteger(id)&&id>=0&&id<5))return null;
 if(!legacy&&(!v.collected.every(id=>level.pickups.some(p=>p.id===id))||v.key))return null;
 const legacySparkIds=level.world===0?[0,1,2]:level.world===1?[0,1,3]:[0,2,4];
 const legacyPickupCount=level.world===0?3:level.world===1?4:5;
 if(legacy&&(!v.collected.every(id=>id<legacyPickupCount)||v.key!==(level.world>=1&&v.collected.includes(level.world>=2?3:2))))return null;
 const currentSparks=v.collected.filter(id=>legacy?legacySparkIds.includes(id):id<3).length;
 const collected=legacy?v.collected.flatMap(id=>legacySparkIds.includes(id)?[legacySparkIds.indexOf(id)]:level.world>=2&&id===1?[3]:[]):[...v.collected];
 if(v.sparks<currentSparks||v.sparks>v.stage*3+currentSparks)return null;
 const ids=(values:unknown,max:number):values is number[]=>Array.isArray(values)&&values.length<=max&&new Set(values).size===values.length&&values.every(id=>Number.isInteger(id)&&id>=0&&id<max);
 const previousStationCount=level.goal==='shelter'?0:['relay','signal','dawn'].includes(level.goal)?3:level.goal==='engine'?2:1;
 if(!legacy&&(!ids(v.activated,previousLayout?previousStationCount:level.stations.length)||!ids(v.heard,LEVEL_COUNT)||!ids(v.memories,LEVEL_COUNT*3)||v.heard!.some(id=>id>v.stage)||v.memories!.some(id=>id>=3*(v.stage+1))||v.memories!.length>v.sparks||![null,'share','home'].includes(v.ending??null)||(v.ending!=null&&v.phase!=='complete')))return null;
 if(v.best>(legacy?(v.cleared?v.cleared*1_000_000+999_999:0):v.cleared*1550))return null;
 const s=createRun();
 Object.assign(s,{stage:v.stage,cleared:v.cleared,phase:v.phase,time:v.time,stageTime:v.stageTime,deaths:v.deaths,stageDeaths:legacy?0:v.stageDeaths??0,sparks:v.sparks,collected,key:false,checkpoint:v.checkpoint,best:normalizeLastLightScore(v.best)+(legacy?(v.sparks-(finished?0:currentSparks))*100:0),activated:legacy?(finished?level.stations.map(p=>p.id):[]):[...v.activated!],heard:legacy?[]:[...v.heard!],memories:legacy?[]:[...v.memories!],ending:legacy?null:v.ending??null});
 if(previousLayout)s.activated=finished?level.stations.map(p=>p.id):s.activated.filter(id=>level.stations.some(station=>station.id===id));
 s.checkpointIndex=v.checkpoint&&!legacy&&v.checkpointIndex!==undefined?v.checkpointIndex:checkpointIndexFor(s,level);
 respawn(s,false);return s;
}
export function formatTime(ms:number){const sec=Math.floor(ms/1000);return `${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`;}
