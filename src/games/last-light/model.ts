import {LEVELS,LEVEL_COUNT,type Rect,type Platform,type Hazard} from './levels';
export const STEP=1/120,PLAYER_W=16,PLAYER_H=24;
export interface Input {move:number;jump:boolean;dash:boolean}
export type Phase='playing'|'cleared'|'complete';
export interface Run {
 version:1;stage:number;cleared:number;phase:Phase;x:number;y:number;vx:number;vy:number;facing:number;grounded:boolean;ground:number;wall:number;
 coyote:number;buffer:number;dashLeft:number;dashReady:boolean;previousJump:boolean;previousDash:boolean;
 time:number;stageTime:number;deaths:number;sparks:number;collected:number[];key:boolean;checkpoint:boolean;clock:number;respawn:number;
 crumbles:Record<number,number>;best:number;
}
export interface Events {jump?:boolean;dash?:boolean;land?:boolean;pickup?:boolean;checkpoint?:boolean;death?:boolean;clear?:boolean}
export const overlap=(a:Rect,b:Rect)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
export function createRun():Run {const p=LEVELS[0].spawn;return {version:1,stage:0,cleared:0,phase:'playing',...p,vx:0,vy:0,facing:1,grounded:false,ground:-1,wall:0,coyote:0,buffer:0,dashLeft:0,dashReady:true,previousJump:false,previousDash:false,time:0,stageTime:0,deaths:0,sparks:0,collected:[],key:false,checkpoint:false,clock:0,respawn:0,crumbles:{},best:0};}
export function platformAt(p:Platform,t:number):Rect {return {x:p.x+(p.kind==='moving'?Math.sin(t*(p.speed??1)+p.id)*p.travel!:0),y:p.y,w:p.w,h:p.h};}
export function hazardAt(h:Hazard,t:number):Rect {return {...h,x:h.x+(h.kind==='saw'?Math.sin(t*2*Math.PI/(h.period??3)+(h.offset??0))*(h.travel??0):0)};}
export const laserActive=(h:Hazard,t:number)=>h.kind!=='laser'||(t+(h.offset??0))%(h.period??3)<(h.period??3)*.55;
export function rankScore(cleared:number,sparks:number,milliseconds:number,deaths:number){
 if(cleared<=0)return 0;
 return Math.min(LEVEL_COUNT,cleared)*1_000_000+clamp(600_000+sparks*2000-Math.floor(milliseconds/1000)*10-deaths*1000,1,999_999);
}
export const scoreFor=(s:Run)=>rankScore(s.cleared,s.sparks,s.time,s.deaths);
export function respawn(s:Run,penalty=true){
 if(penalty)s.deaths++;
 const level=LEVELS[s.stage],p=s.checkpoint?{x:level.checkpoint.x,y:level.checkpoint.y-PLAYER_H}:level.spawn;
 Object.assign(s,p,{vx:0,vy:0,grounded:false,ground:-1,wall:0,coyote:0,buffer:0,dashLeft:0,dashReady:true,respawn:penalty?.35:0,crumbles:{}});
}
export function nextStage(s:Run):boolean {
 if(s.phase!=='cleared'||s.stage>=LEVEL_COUNT-1)return false;
 s.stage++;s.phase='playing';s.stageTime=0;s.clock=0;s.key=false;s.checkpoint=false;s.collected=[];respawn(s,false);return true;
}
/** Fixed-step simulation. Input edge detection lives here so replays and touch share the same physics. */
export function step(s:Run,input:Input,dt=STEP):Events {
 const events:Events={};if(s.phase!=='playing')return events;
 const level=LEVELS[s.stage],oldClock=s.clock;s.clock+=dt;s.time+=dt*1000;s.stageTime+=dt*1000;
 const jumpPressed=input.jump&&!s.previousJump,dashPressed=input.dash&&!s.previousDash;
 s.previousJump=input.jump;s.previousDash=input.dash;
 if(s.respawn>0){s.respawn=Math.max(0,s.respawn-dt);return events;}
 for(const id of Object.keys(s.crumbles)){const n=Number(id);s.crumbles[n]=Math.max(-3,s.crumbles[n]-dt);if(s.crumbles[n]<=-2.5)delete s.crumbles[n];}
 s.buffer=jumpPressed?.12:Math.max(0,s.buffer-dt);s.coyote=s.grounded?.1:Math.max(0,s.coyote-dt);
 const oldGround=level.platforms.find(p=>p.id===s.ground);
 if(s.grounded&&oldGround?.kind==='moving')s.x+=platformAt(oldGround,s.clock).x-platformAt(oldGround,oldClock).x;
 const move=clamp(input.move,-1,1);if(move)s.facing=Math.sign(move);
 if(s.buffer>0&&(s.coyote>0||s.wall!==0)){
  s.vy=-420;if(!s.grounded&&s.coyote<=0&&s.wall){s.vx=-s.wall*270;s.facing=-s.wall;}
  s.grounded=false;s.ground=-1;s.coyote=0;s.buffer=0;events.jump=true;
 }
 if(dashPressed&&s.dashReady){s.dashReady=false;s.dashLeft=.15;s.vx=s.facing*560;s.vy=0;events.dash=true;}
 if(s.dashLeft>0)s.dashLeft=Math.max(0,s.dashLeft-dt);
 else {
  const ice=s.grounded&&oldGround?.kind==='ice',target=move*220,acceleration=ice?260:s.grounded?1800:1000;
  s.vx+=clamp(target-s.vx,-acceleration*dt,acceleration*dt);
  if(!input.jump&&s.vy< -160)s.vy+=1700*dt;
  s.vy=Math.min(s.vy+1120*dt,650);
  if(s.wall&&s.vy>90&&move===s.wall)s.vy=90;
 }
 const bodies=level.platforms.filter(p=>s.crumbles[p.id]===undefined||s.crumbles[p.id]>0).map(p=>({p,r:platformAt(p,s.clock)}));
 if(level.gate&&!s.key)bodies.push({p:{...level.gate,id:-2,kind:'stone'},r:level.gate});
 const previousX=s.x,previousY=s.y;
 s.x+=s.vx*dt+(s.grounded&&oldGround?.kind==='belt'?(oldGround.direction??1)*85*dt:0);s.x=clamp(s.x,0,level.width-PLAYER_W);s.wall=0;
 for(const {r} of bodies)if(overlap({x:s.x,y:s.y,w:PLAYER_W,h:PLAYER_H},r)){
  if(previousX+PLAYER_W<=r.x+.1){s.x=r.x-PLAYER_W;s.wall=1;}
  else if(previousX>=r.x+r.w-.1){s.x=r.x+r.w;s.wall=-1;}
  else continue;
  s.vx=0;s.dashLeft=0;
 }
 s.y+=s.vy*dt;const wasGrounded=s.grounded;s.grounded=false;s.ground=-1;
 for(const {p,r} of bodies)if(overlap({x:s.x,y:s.y,w:PLAYER_W,h:PLAYER_H},r)){
  if(s.vy>=0&&previousY+PLAYER_H<=r.y+.5){
   s.y=r.y-PLAYER_H;s.vy=0;s.grounded=true;s.ground=p.id;s.dashReady=true;s.dashLeft=0;
   if(!wasGrounded)events.land=true;
   if(p.kind==='crumble'&&s.crumbles[p.id]===undefined)s.crumbles[p.id]=.65;
   if(p.kind==='spring'){s.vy=-620;s.grounded=false;s.ground=-1;events.jump=true;}
  }else if(s.vy<0&&previousY>=r.y+r.h-.5){s.y=r.y+r.h;s.vy=0;s.dashLeft=0;}
 }
 const player={x:s.x+2,y:s.y+2,w:PLAYER_W-4,h:PLAYER_H-2};
 if(s.y>level.height+32||level.hazards.some(h=>laserActive(h,s.clock)&&overlap(player,hazardAt(h,s.clock)))){
  respawn(s);events.death=true;return events;
 }
 for(const p of level.pickups)if(!s.collected.includes(p.id)&&overlap(player,{x:p.x-9,y:p.y-12,w:18,h:24})){
  s.collected.push(p.id);if(p.kind==='spark')s.sparks++;else if(p.kind==='key')s.key=true;else s.dashReady=true;events.pickup=true;
 }
 const cp=level.checkpoint;
 if(!s.checkpoint&&s.grounded&&s.ground===cp.platform&&s.x+PLAYER_W>=cp.x){s.checkpoint=true;events.checkpoint=true;}
 if((!level.gate||s.key)&&overlap(player,level.exit)){
  s.cleared=s.stage+1;s.phase=s.cleared===LEVEL_COUNT?'complete':'cleared';s.best=Math.max(s.best,scoreFor(s));events.clear=true;
 }
 return events;
}
export interface Save {version:1;stage:number;cleared:number;phase:Phase;time:number;stageTime:number;deaths:number;sparks:number;collected:number[];key:boolean;checkpoint:boolean;best:number}
export function serialize(s:Run):Save {const {version,stage,cleared,phase,time,stageTime,deaths,sparks,collected,key,checkpoint,best}=s;return {version,stage,cleared,phase,time:Math.floor(time),stageTime:Math.floor(stageTime),deaths,sparks,collected:[...collected],key,checkpoint,best};}
export function restore(value:unknown):Run|null {
 if(!value||typeof value!=='object')return null;const v=value as Save;
 if(v.version!==1||!Number.isInteger(v.stage)||v.stage<0||v.stage>=LEVEL_COUNT||!['playing','cleared','complete'].includes(v.phase))return null;
 const finished=v.phase!=='playing';
 if(v.cleared!==v.stage+(finished?1:0)||(v.phase==='complete')!==(v.cleared===LEVEL_COUNT))return null;
 if(![v.time,v.stageTime,v.deaths,v.sparks,v.best].every(n=>Number.isSafeInteger(n)&&n>=0)||v.time>31_536_000_000||v.stageTime>v.time||v.deaths>1e7||v.sparks>(v.stage+1)*3||v.best>40_999_999)return null;
 const level=LEVELS[v.stage];
 if(typeof v.key!=='boolean'||typeof v.checkpoint!=='boolean'||!Array.isArray(v.collected)||v.collected.length>level.pickups.length||new Set(v.collected).size!==v.collected.length||!v.collected.every(id=>level.pickups.some(p=>p.id===id)))return null;
 if(v.key!==level.pickups.some(p=>p.kind==='key'&&v.collected.includes(p.id)))return null;
 const currentSparks=level.pickups.filter(p=>p.kind==='spark'&&v.collected.includes(p.id)).length;
 if(v.sparks<currentSparks||v.sparks>v.stage*3+currentSparks||v.best>(v.cleared?v.cleared*1_000_000+999_999:0))return null;
 const s=createRun();
 // Copy only validated save fields; never import physics or prototype properties.
 Object.assign(s,{stage:v.stage,cleared:v.cleared,phase:v.phase,time:v.time,stageTime:v.stageTime,deaths:v.deaths,sparks:v.sparks,collected:[...v.collected],key:v.key,checkpoint:v.checkpoint,best:v.best});
 respawn(s,false);return s;
}
export function formatTime(ms:number){const sec=Math.floor(ms/1000);return `${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`;}
