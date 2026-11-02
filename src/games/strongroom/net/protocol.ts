import {PHASES,type Entity,type InputFrame,type Phase,type Seat,type Simulation,type Objective,type Team} from '../sim';
import {GUN_IDS,GUN_CATALOG,OPERATOR_IDS,validateLoadout} from '../loadouts';
import type {RoundReason} from '../rounds';
export const NET_VERSION=2,ENTITY_STRIDE=31,INPUT_STRIDE=10,SNAPSHOT_HEADER=28;
const int=(v:unknown,min:number,max:number):v is number=>typeof v==='number'&&Number.isInteger(v)&&v>=min&&v<=max;
const REASONS:readonly RoundReason[]=['detonated','defendersEliminated','attackersEliminated','timeout','disabled'];
const OBJECTIVE_STATES:readonly Objective['state'][]=['carried','dropped','planted','disabled'];
export interface Snapshot{
 epoch:number;round:number;tick:number;time:number;phase:Phase;timer:number;scores:[number,number];winner:Team;entities:Entity[];
 attackTeam:Team;pickStage:'side'|'loadout';overtime:boolean;sideVoteTeam:Team|null;outcome:RoundReason|null;actionElapsed:number;objective:Objective;tools?:unknown;
}
/** The first eighteen fields retain the original movement/health/weapon-slot layout. */
export function packEntity(e:Entity,hideSiteVote=false):number[]{return[
 e.seat,Math.round(e.x*100),Math.round(e.y*100),Math.round(e.z*100),Math.round(e.vx*100),Math.round(e.vy*100),Math.round(e.vz*100),Math.round(e.yaw*1000),Math.round(e.pitch*1000),e.hp,e.ammo,e.reserve,
 (e.crouch?1:0)|(e.ground?2:0)|(e.bot?4:0)|(e.team<<3)|(e.away!==null?16:0)|(e.jumpHeld?32:0)|(e.attacking?64:0),e.weapon,Math.round(e.reload*1000),e.kills,e.deaths,e.ack,
 OPERATOR_IDS.indexOf(e.operator),GUN_IDS.indexOf(e.primary),GUN_IDS.indexOf(e.secondary),e.spawnChoice==='yard'?1:0,hideSiteVote?0:e.siteVote==='B'?1:0,e.locked?1:0,e.carries,e.sideVote===null?-1:e.sideVote==='attack'?0:1,
 e.weapon===0?e.ammo:e.mags[0],e.weapon===1?e.ammo:e.mags[1],e.weapon===0?e.reserve:e.reserves[0],e.weapon===1?e.reserve:e.reserves[1],
 Math.round(e.spottedUntil),
];}
export function unpackEntity(p:unknown,seats:readonly Seat[]=[]):Entity|null{
 if(!Array.isArray(p)||p.length!==ENTITY_STRIDE||!p.every(Number.isInteger))return null;
 const [seat,x,y,z,vx,vy,vz,yaw,pitch,hp,ammo,reserve,flags,weapon,reload,kills,deaths,ack,operator,primary,secondary,spawnChoice,siteVote,locked,carries,sideVote,mag0,mag1,reserve0,reserve1,spottedUntil]=p;
 if(!int(seat,0,9)||!int(x,-5200,5200)||!int(y,-200,2000)||!int(z,-4200,4200)||![vx,vy,vz].every(v=>int(v,-3000,3000))||!int(yaw,-3142,3142)||!int(pitch,-1450,1450)||!int(hp,0,255)||!int(ammo,0,100)||!int(reserve,0,1000)||!int(flags,0,127)||!int(weapon,0,1)||!int(reload,0,10000)||!int(kills,0,10000)||!int(deaths,0,10000)||!int(ack,0,1e9)||!int(operator,0,OPERATOR_IDS.length-1)||!int(primary,0,GUN_IDS.length-1)||!int(secondary,0,GUN_IDS.length-1)||!int(spawnChoice,0,1)||!int(siteVote,0,1)||!int(locked,0,1)||!int(carries,0,10000)||!int(sideVote,-1,1)||![mag0,mag1].every(v=>int(v,0,100))||![reserve0,reserve1].every(v=>int(v,0,1000)))return null;
 if(!int(spottedUntil,0,1e9))return null;
 const loadout=validateLoadout(!!(flags&64),{operator:OPERATOR_IDS[operator],primary:GUN_IDS[primary],secondary:GUN_IDS[secondary]});if(!loadout)return null;
 if(mag0>GUN_CATALOG[loadout.primary].mag||mag1>GUN_CATALOG[loadout.secondary].mag||ammo!==(weapon===0?mag0:mag1)||reserve!==(weapon===0?reserve0:reserve1))return null;
 const meta=seats.find(s=>s.seat===seat);return{
  seat,name:meta?.name??'Bot '+seat,peer:meta?.peer,team:flags&8?1:0,bot:!!(flags&4),attacking:!!(flags&64),...loadout,spawnChoice:spawnChoice?'yard':'quay',siteVote:siteVote?'B':'A',locked:!!locked,carries,sideVote:sideVote<0?null:sideVote===0?'attack':'defend',spottedUntil,
  x:x/100,y:y/100,z:z/100,vx:vx/100,vy:vy/100,vz:vz/100,yaw:yaw/1000,pitch:pitch/1000,hp,ammo,reserve,mags:[mag0,mag1],reserves:[reserve0,reserve1],crouch:!!(flags&1),ground:!!(flags&2),weapon,reload:reload/1000,kills,deaths,ack,nextFire:0,away:flags&16?0:null,jumpHeld:!!(flags&32),
 };
}
function validTools(value:unknown):boolean{
 let nodes=0;
 const walk=(v:unknown,depth:number):boolean=>{
  if(++nodes>1024||depth>5)return false;
  if(v===null||typeof v==='boolean')return true;
  if(typeof v==='number')return Number.isFinite(v)&&Math.abs(v)<=1e9;
  if(typeof v==='string')return v.length<=256;
  if(Array.isArray(v))return v.length<=128&&v.every(x=>walk(x,depth+1));
  if(v&&typeof v==='object'){const entries=Object.entries(v);return entries.length<=128&&entries.every(([k,x])=>k.length<=64&&walk(x,depth+1));}
  return false;
 };
 try{return walk(value,0)&&JSON.stringify(value).length<=16384;}catch{return false;}
}
export function packSnapshot(s:Simulation,epoch:number,viewerTeam?:Team):unknown[]{
 const o=s.objective,hidden=viewerTeam===s.attackTeam&&!o.revealed,site=hidden||o.site===null?-1:o.site==='A'?0:1;
 const tools=validTools(s.tools)?s.tools:null;
 return['s',NET_VERSION,epoch,s.round,s.tick,Math.round(s.time),PHASES.indexOf(s.phase),Math.round(s.timer*1000),...s.scores,s.winner,s.entities.length,
  s.attackTeam,s.pickStage==='side'?1:0,s.overtime?1:0,s.sideVoteTeam??-1,s.outcome===null?-1:REASONS.indexOf(s.outcome),Math.round(s.actionElapsed*1000),
  site,o.revealed?1:0,OBJECTIVE_STATES.indexOf(o.state),o.carrier??-1,Math.round(o.position.x*100),Math.round(o.position.y*100),Math.round(o.position.z*100),o.interactionSeat??-1,o.interaction===null?0:o.interaction==='plant'?1:2,Math.round(o.progress*1000),
  ...s.entities.flatMap(e=>packEntity(e,hidden&&!e.attacking)),tools];
}
export function unpackSnapshot(p:unknown,seats:readonly Seat[]=[]):Snapshot|null{
 if(!Array.isArray(p)||p[0]!=='s'||p[1]!==NET_VERSION||p.length<SNAPSHOT_HEADER+1)return null;
 const [,version,epoch,round,tick,time,phase,timer,score0,score1,winner,count,attackTeam,pickStage,overtime,sideVoteTeam,outcome,actionElapsed,site,revealed,state,carrier,x,y,z,interactionSeat,interaction,progress]=p;
 if(!p.slice(1,SNAPSHOT_HEADER).every(Number.isInteger)||!int(epoch,1,Number.MAX_SAFE_INTEGER)||!int(round,1,10000)||!int(tick,0,1e9)||!int(time,0,1e9)||!int(phase,0,PHASES.length-1)||!int(timer,0,1e6)||!int(score0,0,1000)||!int(score1,0,1000)||!int(winner,0,1)||!int(count,1,10)||!int(attackTeam,0,1)||!int(pickStage,0,1)||!int(overtime,0,1)||!int(sideVoteTeam,-1,1)||!int(outcome,-1,REASONS.length-1)||!int(actionElapsed,0,1e6)||!int(site,-1,1)||!int(revealed,0,1)||!int(state,0,3)||!int(carrier,-1,9)||!int(x,-5200,5200)||!int(y,-200,2000)||!int(z,-4200,4200)||!int(interactionSeat,-1,9)||!int(interaction,0,2)||!int(progress,0,6000)||p.length!==SNAPSHOT_HEADER+count*ENTITY_STRIDE+1)return null;
 const entities:Entity[]=[];for(let n=0;n<count;n++){const e=unpackEntity(p.slice(SNAPSHOT_HEADER+n*ENTITY_STRIDE,SNAPSHOT_HEADER+(n+1)*ENTITY_STRIDE),seats);if(!e||entities.some(x=>x.seat===e.seat)||e.attacking!==(e.team===attackTeam))return null;entities.push(e);}
 if(carrier>=0&&!entities.some(e=>e.seat===carrier&&e.attacking)||interactionSeat>=0&&!entities.some(e=>e.seat===interactionSeat))return null;
 const tools=p.at(-1);if(!validTools(tools))return null;
 return{
  epoch,round,tick,time,phase:PHASES[phase],timer:timer/1000,scores:[score0,score1],winner:winner as Team,entities,attackTeam:attackTeam as Team,pickStage:pickStage?'side':'loadout',overtime:!!overtime,sideVoteTeam:sideVoteTeam<0?null:sideVoteTeam as Team,outcome:outcome<0?null:REASONS[outcome],actionElapsed:actionElapsed/1000,
  objective:{site:site<0?null:site===0?'A':'B',revealed:!!revealed,state:OBJECTIVE_STATES[state],carrier:carrier<0?null:carrier,position:{x:x/100,y:y/100,z:z/100},interactionSeat:interactionSeat<0?null:interactionSeat,interaction:interaction===0?null:interaction===1?'plant':'disable',progress:progress/1000},tools,
 };
}
export function packInputs(epoch:number,round:number,frames:readonly InputFrame[]):(number|string)[]{return['i',epoch,round,...frames.slice(-3).flatMap(i=>[i.seq,Math.round(i.at),Math.round(i.view),i.x,i.z,Math.round(Math.atan2(Math.sin(i.yaw),Math.cos(i.yaw))*1000),Math.round(i.pitch*1000),i.buttons,i.weapon,0])];}
export function unpackInputs(p:unknown):{epoch:number;round:number;frames:InputFrame[]}|null{
 if(!Array.isArray(p)||p[0]!=='i'||!int(p[1],1,Number.MAX_SAFE_INTEGER)||!int(p[2],1,10000)||p.length<3+INPUT_STRIDE||p.length>3+3*INPUT_STRIDE||(p.length-3)%INPUT_STRIDE)return null;
 const frames:InputFrame[]=[];for(let n=3;n<p.length;n+=INPUT_STRIDE){const [seq,at,view,x,z,yaw,pitch,buttons,weapon,reserved]=p.slice(n,n+INPUT_STRIDE);if(!int(seq,1,1e9)||!int(at,0,1e9)||!int(view,0,1e9)||!int(x,-127,127)||!int(z,-127,127)||!int(yaw,-3142,3142)||!int(pitch,-1450,1450)||!int(buttons,0,1023)||!int(weapon,0,1)||reserved!==0)return null;frames.push({seq,at,view,x,z,yaw:yaw/1000,pitch:pitch/1000,buttons,weapon});}
 return{epoch:p[1],round:p[2],frames};
}
