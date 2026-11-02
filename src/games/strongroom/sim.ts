/** The host owns actors, rounds, loadouts and objectives. No rendering or transport dependencies. */
import {PHASES,attackTeamForRound,matchComplete,matchTiming,resolveVote,roundResult,type Team,type Phase,type RoundReason} from './rounds';
import {GUN_CATALOG,OPERATOR_IDS,allowedLoadout,bodyFor,damageAt,defaultLoadout,gunFor,validateLoadout,type BulletSource,type GunId,type LoadoutSelection,type OperatorId} from './loadouts';
import {CUSTOMS_HOUSE,type SiteId,type SpawnChoice} from './maps/customs-house';
import {WallStore,type PanelDefinition} from './walls';
export {PHASES,gunFor};
export type {Team,Phase,SiteId,SpawnChoice,GunId,OperatorId};
export const BUTTON={FIRE:1,RELOAD:2,JUMP:4,CROUCH:8,WALK:16,ADS:32,INTERACT:64,CHARGE:128,MELEE:256,IMPACT:512} as const;
export interface InputFrame{seq:number;at:number;view:number;x:number;z:number;yaw:number;pitch:number;buttons:number;weapon:number}
export const neutralInput=(seq=0):InputFrame=>({seq,at:0,view:0,x:0,z:0,yaw:0,pitch:0,buttons:0,weapon:0});
export interface Seat{seat:number;name:string;team:Team;bot:boolean;peer?:string}
export interface Entity extends Seat,LoadoutSelection{
 x:number;y:number;z:number;vx:number;vy:number;vz:number;yaw:number;pitch:number;hp:number;ammo:number;reserve:number;mags:[number,number];reserves:[number,number];weapon:number;reload:number;nextFire:number;crouch:boolean;ground:boolean;kills:number;deaths:number;ack:number;away:number|null;jumpHeld:boolean;
 attacking:boolean;spawnChoice:SpawnChoice;siteVote:SiteId;locked:boolean;carries:number;sideVote:'attack'|'defend'|null;spottedUntil:number;
}
export interface Point{x:number;y:number;z:number}
export interface Strongroom{name:SiteId;center:readonly [number,number,number];box:readonly [number,number,number,number,number,number]}
export interface SimWorld{
 spawns:[number,number,number][];
 spawn?(team:Team,index:number,site?:SiteId,attacking?:boolean,spawnChoice?:SpawnChoice):Point&{yaw?:number};
 collide(e:Entity,dx:number,dy:number,dz:number):Point&{ground:boolean};
 blocked(from:Point,to:Point):boolean;
 path?(from:Point,to:Point):Point[];
 contact?(from:Point,to:Point):{point:Point;normal:Point}|null;
 strongrooms?:readonly Strongroom[];panels?:readonly PanelDefinition[];
 bounds?:{x0:number;x1:number;z0:number;z1:number};
 buildingFootprint?:{x0:number;x1:number;z0:number;z1:number};
 /** Resolve one ray against hard geometry and soft cells, applying wall damage exactly once. */
 shot?(origin:Point,direction:Point,distance:number,source:BulletSource,damage:number):{blocked:boolean;scale:number};
}
export interface PickRequest{operator?:OperatorId;primary?:GunId;secondary?:GunId;spawnChoice?:SpawnChoice;siteVote?:SiteId;locked?:boolean}
export interface Objective{
 site:SiteId|null;revealed:boolean;state:'carried'|'dropped'|'planted'|'disabled';carrier:number|null;position:Point;
 interactionSeat:number|null;interaction:'plant'|'disable'|null;progress:number;
}
const emptyObjective=():Objective=>({site:null,revealed:false,state:'dropped',carrier:null,position:{x:0,y:0,z:0},interactionSeat:null,interaction:null,progress:0});
/** Compatibility for consumers that still need primary/secondary defaults. Actual equipped guns use gunFor. */
export const GUNS=[GUN_CATALOG.m4a1,GUN_CATALOG.usp] as const;
export const canMove=(e:Pick<Entity,'attacking'>,phase:Phase)=>phase==='action'||phase==='planted'||phase==='prep'&&!e.attacking;
export function move(e:Entity,i:InputFrame,dt:number,world:SimWorld){
 e.yaw=Math.atan2(Math.sin(i.yaw),Math.cos(i.yaw));e.pitch=Math.max(-1.45,Math.min(1.45,i.pitch));e.crouch=!!(i.buttons&BUTTON.CROUCH);
 if(e.hp<=0)return;
 const length=Math.max(127,Math.hypot(i.x,i.z)),speed=(e.crouch?1.6:i.buttons&BUTTON.WALK?2:4.2)*bodyFor(e.operator).speed*gunFor(e).moveSpeedMult;
 const mult=i.buttons&BUTTON.ADS?.7:1,x=i.x/length*speed*mult,z=i.z/length*speed*mult;
 e.vx=Math.cos(i.yaw)*x-Math.sin(i.yaw)*z;e.vz=-Math.sin(i.yaw)*x-Math.cos(i.yaw)*z;
 if(i.buttons&BUTTON.JUMP){if(e.ground&&!e.jumpHeld){e.vy=4.6;e.ground=false;}e.jumpHeld=true;}else e.jumpHeld=false;
 const dy=e.vy*dt-10*dt*dt;e.vy=Math.max(-30,e.vy-20*dt);
 const targetY=e.y+dy,result=world.collide(e,e.vx*dt,dy,e.vz*dt),bounds=world.bounds??{x0:-52,x1:52,z0:-42,z1:42};
 e.x=Math.max(bounds.x0,Math.min(bounds.x1,result.x));e.y=Math.max(-2,Math.min(20,result.y));e.z=Math.max(bounds.z0,Math.min(bounds.z1,result.z));
 e.ground=result.ground;if(e.ground||result.y<targetY-.001)e.vy=0;
}
/** Ray / vertical capsule, including hemispherical ends; distance in metres. */
export function capsuleHit(o:Point,d:Point,e:Point,height=1.83,radius=.35):number|null{
 let nearest=Infinity;
 const sphere=(cy:number)=>{const x=o.x-e.x,y=o.y-cy,z=o.z-e.z,b=x*d.x+y*d.y+z*d.z,c=x*x+y*y+z*z-radius*radius,h=b*b-c;if(h>=0){const t=-b-Math.sqrt(h);if(t>=0)nearest=Math.min(nearest,t);}};
 sphere(e.y+radius);sphere(e.y+height-radius);
 const x=o.x-e.x,z=o.z-e.z,a=d.x*d.x+d.z*d.z,b=x*d.x+z*d.z,c=x*x+z*z-radius*radius,h=b*b-a*c;
 if(a>1e-9&&h>=0){const t=(-b-Math.sqrt(h))/a,y=o.y+t*d.y;if(t>=0&&y>=e.y+radius&&y<=e.y+height-radius)nearest=Math.min(nearest,t);}
 return Number.isFinite(nearest)?nearest:null;
}
export interface SimEvent{type:'shot'|'damage'|'eliminated'|'phase'|'pick'|'objective'|'sideVote'|'wall';seat:number;target?:number;hp?:number;head?:boolean;phase?:Phase;round?:number;winner?:Team;reason?:RoundReason;action?:'drop'|'pickup'|'plant'|'disable'|'reveal'}
type Brain={next:number;path:Point[];goal:Point;routeAt:number;input:InputFrame};
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
export class Simulation{
 entities:Entity[]=[];phase:Phase='menu';round=0;scores:[number,number]=[0,0];timer=0;time=0;tick=0;winner:Team=0;paused=false;
 attackTeam:Team=1;pickStage:'side'|'loadout'='loadout';overtime=false;sideVoteTeam:Team|null=null;objective=emptyObjective();outcome:RoundReason|null=null;actionElapsed=0;tools:unknown=null;
 readonly inputs=new Map<number,InputFrame>();readonly events:SimEvent[]=[];readonly walls:WallStore;
 /** Host-only hooks; neither hook is evaluated by guest prediction. */
 rewind:((seat:number,view:number)=>Point&{height?:number}|null)|null=null;
 toolStep:((e:Entity,input:InputFrame,dt:number)=>void)|null=null;
 private inputAt=new Map<number,number>();private brain=new Map<number,Brain>();private triggers=new Set<number>();private bursts=new Map<number,{count:number;at:number}>();private nextSpot=new Map<number,number>();
 private nextReveal=0;private interactionOrigin:Point|null=null;private pickupSeat:number|null=null;private pickupTime=0;private overtimeAttackTeam:Team|undefined;
 thinkHz=5;difficulty:'easy'|'normal'|'hard'='normal';private rng:number;
 constructor(public world:SimWorld,seats:Seat[],seed=1,public quick=false){this.rng=seed>>>0||1;this.walls=new WallStore(world.panels??[]);this.setSeats(seats);}
 get timing(){return matchTiming(this.quick,Math.max(3,this.entities.filter(e=>e.team===0).length,this.entities.filter(e=>e.team===1).length));}
 get strongrooms(){return this.world.strongrooms??CUSTOMS_HOUSE.strongrooms;}
 get site(){return this.strongrooms.find(s=>s.name===this.objective.site);}
 setSeats(seats:Seat[]){this.entities=seats.map(s=>({...s,...defaultLoadout(s.team===1),attacking:s.team===1,spawnChoice:'quay',siteVote:'A',locked:false,carries:0,sideVote:null,spottedUntil:0,x:0,y:0,z:0,vx:0,vy:0,vz:0,yaw:0,pitch:0,hp:112,ammo:30,reserve:150,mags:[30,12] as [number,number],reserves:[150,72] as [number,number],weapon:0,reload:0,nextFire:0,crouch:false,ground:true,kills:0,deaths:0,ack:0,away:null,jumpHeld:false}));}
 random(){this.rng^=this.rng<<13;this.rng^=this.rng>>>17;this.rng^=this.rng<<5;return(this.rng>>>0)/4294967296;}
 start(){this.scores=[0,0];this.round=0;this.time=0;this.tick=0;this.overtimeAttackTeam=undefined;this.events.length=0;for(const e of this.entities){e.kills=0;e.deaths=0;e.carries=0;}this.nextRound();}
 nextRound(){
  this.round++;this.outcome=null;this.objective=emptyObjective();this.actionElapsed=0;this.nextReveal=0;this.interactionOrigin=null;this.pickupSeat=null;this.pickupTime=0;
  this.inputs.clear();this.inputAt.clear();this.brain.clear();this.triggers.clear();this.bursts.clear();this.nextSpot.clear();this.walls.reset(this.round);
  this.overtime=this.round>this.timing.swapAfter*2;this.sideVoteTeam=this.overtime?(1-this.winner) as Team:null;
  this.pickStage=this.overtime&&this.overtimeAttackTeam===undefined?'side':'loadout';this.attackTeam=attackTeamForRound(this.round,this.quick,this.overtimeAttackTeam);
  this.phase='pick';this.timer=this.pickStage==='side'?this.timing.sideVote:this.timing.pick;
  this.resetPicks();this.events.push({type:'phase',seat:0,phase:'pick',round:this.round});
 }
 private resetPicks(){
  for(const e of this.entities){
   e.attacking=e.team===this.attackTeam;e.sideVote=null;e.locked=e.bot;
   const valid=validateLoadout(e.attacking,e);if(!valid)Object.assign(e,defaultLoadout(e.attacking));
   if(e.bot){const roster:OperatorId[]=e.attacking?['cinder','wren','cadet']:['hush','latch','cadet'];e.operator=roster[e.seat%roster.length];const choices=allowedLoadout(e.attacking,e.operator);e.primary=choices.primaries[0];e.secondary=choices.secondaries[0];e.spawnChoice=e.seat%2?'yard':'quay';e.siteVote=this.random()<.5?'A':'B';}
   this.equip(e);e.vx=e.vy=e.vz=0;e.ack=0;e.spottedUntil=0;
  }
 }
 private equip(e:Entity){const a=GUN_CATALOG[e.primary],b=GUN_CATALOG[e.secondary];e.weapon=0;e.ammo=a.mag;e.reserve=a.reserve;e.mags=[a.mag,b.mag];e.reserves=[a.reserve,b.reserve];e.hp=bodyFor(e.operator).hp;e.reload=0;e.nextFire=0;}
 requestPick(seat:number,request:PickRequest){
  const e=this.entities.find(e=>e.seat===seat);
  if(this.phase!=='pick'||this.pickStage!=='loadout'||!e||e.bot||e.locked||e.away!==null||!request||typeof request!=='object'||Array.isArray(request))return false;
  const keys=Object.keys(request);if(!keys.length||keys.some(k=>!['operator','primary','secondary','spawnChoice','siteVote','locked'].includes(k)))return false;
  if(request.locked!==undefined&&typeof request.locked!=='boolean'||request.spawnChoice!==undefined&&(!e.attacking||!['quay','yard'].includes(request.spawnChoice))||request.siteVote!==undefined&&(e.attacking||!['A','B'].includes(request.siteVote)))return false;
  const operator=request.operator??e.operator;if(!OPERATOR_IDS.includes(operator))return false;
  const choices=allowedLoadout(e.attacking,operator);if(!choices.primaries.length)return false;
  const primary=request.primary??(choices.primaries.includes(e.primary)?e.primary:choices.primaries[0]),secondary=request.secondary??(choices.secondaries.includes(e.secondary)?e.secondary:choices.secondaries[0]);
  const loadout=validateLoadout(e.attacking,{operator,primary,secondary});if(!loadout)return false;
  Object.assign(e,loadout);this.equip(e);if(request.spawnChoice!==undefined)e.spawnChoice=request.spawnChoice;if(request.siteVote!==undefined)e.siteVote=request.siteVote;if(request.locked!==undefined)e.locked=request.locked;
  this.events.push({type:'pick',seat});if(this.entities.filter(e=>!e.bot).every(e=>e.locked))this.beginPrep();return true;
 }
 requestSideVote(seat:number,side:'attack'|'defend'){
  const e=this.entities.find(e=>e.seat===seat);if(this.phase!=='pick'||this.pickStage!=='side'||!e||e.bot||e.away!==null||e.team!==this.sideVoteTeam||!['attack','defend'].includes(side))return false;
  e.sideVote=side;this.events.push({type:'sideVote',seat});return true;
 }
 private finishSideVote(){
  const humans=this.entities.filter(e=>e.team===this.sideVoteTeam&&!e.bot),votes=humans.flatMap(e=>e.sideVote?[e.sideVote]:[]);
  const side=humans.length?resolveVote(votes,['attack','defend'],()=>this.random()):'defend';
  this.overtimeAttackTeam=side==='attack'?this.sideVoteTeam!:(1-this.sideVoteTeam!) as Team;this.attackTeam=this.overtimeAttackTeam;this.pickStage='loadout';this.timer=this.timing.pick;this.resetPicks();
  this.events.push({type:'phase',seat:0,phase:'pick',round:this.round});
 }
 private beginPrep(){
  const votes=this.entities.filter(e=>!e.attacking).map(e=>e.siteVote),site=resolveVote<SiteId>(votes,['A','B'],()=>this.random());this.objective.site=site;
  this.phase='prep';this.timer=this.timing.prep;this.inputs.clear();this.inputAt.clear();const used=[0,0],attackUsed={quay:0,yard:0};
  for(const e of this.entities){
   e.locked=true;const index=e.attacking?attackUsed[e.spawnChoice]++:used[e.team]++,side=(e.attacking?1:0) as Team;
   const p=this.world.spawn?.(side,index,site,e.attacking,e.spawnChoice)??(()=>{const a=this.world.spawns[side]??[0,0,0];return{x:a[0]+index*1.2,y:a[1],z:a[2],yaw:side===0?Math.PI:0};})();
   const primary=GUN_CATALOG[e.primary],secondary=GUN_CATALOG[e.secondary];
   Object.assign(e,p,{vx:0,vy:0,vz:0,hp:bodyFor(e.operator).hp,ammo:primary.mag,reserve:primary.reserve,mags:[primary.mag,secondary.mag],reserves:[primary.reserve,secondary.reserve],weapon:0,reload:0,nextFire:0,ack:0,crouch:false,ground:true,jumpHeld:false});
  }
  const attackers=this.entities.filter(e=>e.attacking),humans=attackers.filter(e=>!e.bot),pool=humans.length?humans:attackers,carrier=[...pool].sort((a,b)=>a.carries-b.carries||a.seat-b.seat)[0];
  if(carrier){carrier.carries++;this.objective.carrier=carrier.seat;this.objective.state='carried';this.objective.position={x:carrier.x,y:carrier.y,z:carrier.z};}
  this.events.push({type:'phase',seat:0,phase:'prep',round:this.round});
 }
 applyInput(seat:number,input:InputFrame){
  const e=this.entities.find(e=>e.seat===seat);if(!e||e.bot||e.away!==null||input.seq<=e.ack||!Number.isInteger(input.seq)||!Number.isFinite(input.yaw)||!Number.isFinite(input.pitch)||!Number.isInteger(input.x)||!Number.isInteger(input.z)||Math.abs(input.x)>127||Math.abs(input.z)>127||!Number.isInteger(input.buttons)||input.buttons<0||input.buttons>1023||!Number.isInteger(input.weapon)||input.weapon<0||input.weapon>1)return false;
  this.inputs.set(seat,input);this.inputAt.set(seat,this.time);return true;
 }
 setAway(seat:number,on:boolean){const e=this.entities.find(e=>e.seat===seat);if(!e)return;e.away=on?this.time:null;if(!on){if(e.bot)e.ack=0;e.bot=false;}this.inputs.delete(seat);}
 disconnect(seat:number){const e=this.entities.find(e=>e.seat===seat);if(e){e.bot=true;e.locked=true;delete e.peer;this.inputs.delete(seat);}}
 step(dt:number){
  if(this.paused||this.phase==='menu'||this.phase==='gameEnd'||!Number.isFinite(dt)||dt<=0)return;
  this.time+=dt*1000;this.tick++;this.timer=Math.max(0,this.timer-dt);if(this.timer<1e-7)this.timer=0;
  if(this.phase==='pick'){
   if(this.timer===0){if(this.pickStage==='side')this.finishSideVote();else this.beginPrep();}
   else if(this.pickStage==='loadout'&&this.entities.filter(e=>!e.bot).every(e=>e.locked))this.beginPrep();return;
  }
  if(this.phase==='roundEnd'){
   if(!this.timer){if(matchComplete(this.scores,this.quick)){this.phase='gameEnd';this.events.push({type:'phase',seat:0,phase:'gameEnd',round:this.round,winner:this.winner});}else this.nextRound();}return;
  }
  const active=this.phase==='action'||this.phase==='planted',frames=new Map<number,InputFrame>();
  for(const e of this.entities){
   if(e.away!==null&&this.time-e.away>=60000)e.bot=true;if(e.hp<=0)continue;
   let input=e.bot?this.botInput(e):this.inputs.get(e.seat);if(!e.bot&&(e.away!==null||this.time-(this.inputAt.get(e.seat)??-Infinity)>200))input=undefined;
   const i=input??{...neutralInput(e.ack),yaw:e.yaw,pitch:e.pitch,weapon:e.weapon,buttons:e.crouch?BUTTON.CROUCH:0};frames.set(e.seat,i);
   this.toolStep?.(e,i,dt);if(canMove(e,this.phase))move(e,i,dt,this.world);if(input)e.ack=Math.max(e.ack,input.seq);if(!active)continue;
   if(i.weapon!==e.weapon){e.mags[e.weapon]=e.ammo;e.reserves[e.weapon]=e.reserve;e.weapon=i.weapon;e.ammo=e.mags[e.weapon];e.reserve=e.reserves[e.weapon];e.reload=0;this.bursts.delete(e.seat);}
   const gun=gunFor(e);
   if(e.reload>0){e.reload=Math.max(0,e.reload-dt);if(e.reload<1e-7)e.reload=0;if(e.reload===0){const n=Math.min(gun.shellReload?1:gun.mag-e.ammo,e.reserve);e.ammo+=n;e.reserve-=n;if(gun.shellReload&&e.ammo<gun.mag&&e.reserve>0)e.reload=gun.reload;}}
   if(i.buttons&BUTTON.RELOAD&&e.reload===0&&e.ammo<gun.mag&&e.reserve>0)e.reload=gun.reload;
   const held=!!(i.buttons&BUTTON.FIRE);if(held&&(!gun.semi||!this.triggers.has(e.seat)))this.fire(e,i.view,i.buttons);
   if(held)this.triggers.add(e.seat);else this.triggers.delete(e.seat);
   e.mags[e.weapon]=e.ammo;e.reserves[e.weapon]=e.reserve;
  }
  if(this.phase==='prep'){if(this.timer===0){this.phase='action';this.timer=this.timing.action;this.inputs.clear();this.inputAt.clear();this.brain.clear();this.events.push({type:'phase',seat:0,phase:'action',round:this.round});}return;}
  this.actionElapsed+=dt;this.updateSpotted();this.updateObjective(dt,frames);
  const alive={attackers:0,defenders:0};for(const e of this.entities)if(e.hp>0)e.attacking?alive.attackers++:alive.defenders++;
  const result=roundResult({phase:this.phase,timer:this.timer,...alive,disabled:this.objective.state==='disabled'});if(result)this.endRound(result.attacking?this.attackTeam:(1-this.attackTeam) as Team,result.reason);
 }
 private cancelInteraction(){this.objective.interactionSeat=null;this.objective.interaction=null;this.objective.progress=0;this.interactionOrigin=null;}
 private updateSpotted(){
  const b=this.world.buildingFootprint;if(!b)return;
  for(const e of this.entities){
   const dx=Math.max(b.x0-e.x,0,e.x-b.x1),dz=Math.max(b.z0-e.z,0,e.z-b.z1);
   if(e.attacking||e.hp<=0||Math.hypot(dx,dz)<=3){e.spottedUntil=0;this.nextSpot.delete(e.seat);continue;}
   if(this.time>=(this.nextSpot.get(e.seat)??0)){e.spottedUntil=Math.round(this.time+500);this.nextSpot.set(e.seat,this.time+2000);}
  }
 }
 private updateObjective(dt:number,frames:Map<number,InputFrame>){
  const o=this.objective;
  if(!o.revealed&&this.phase==='action'&&(this.actionElapsed>=20-1e-7||this.time>=this.nextReveal)){
   this.nextReveal=this.time+250;const center=this.site?.center;
   if(this.actionElapsed>=20-1e-7||center&&this.entities.some(e=>e.attacking&&e.hp>0&&distance(e,{x:center[0],y:center[1],z:center[2]})<=25&&!this.world.blocked({x:e.x,y:e.y+1.62,z:e.z},{x:center[0],y:center[1],z:center[2]}))){o.revealed=true;this.events.push({type:'objective',seat:0,action:'reveal'});}
  }
  if(o.state==='carried'){
   const carrier=this.entities.find(e=>e.seat===o.carrier);if(carrier)o.position={x:carrier.x,y:carrier.y,z:carrier.z};if(!carrier||carrier.hp<=0){o.state='dropped';o.carrier=null;this.cancelInteraction();this.events.push({type:'objective',seat:carrier?.seat??0,action:'drop'});}
  }
  if(o.state==='dropped'&&this.phase==='action'){
   const candidate=this.entities.filter(e=>e.attacking&&e.hp>0&&distance(e,o.position)<=.8).sort((a,b)=>distance(a,o.position)-distance(b,o.position)||a.seat-b.seat)[0];
   if(candidate){if(this.pickupSeat!==candidate.seat){this.pickupSeat=candidate.seat;this.pickupTime=0;}this.pickupTime+=dt;if(this.pickupTime>=.3-1e-7){o.carrier=candidate.seat;o.state='carried';this.pickupSeat=null;this.pickupTime=0;this.events.push({type:'objective',seat:candidate.seat,action:'pickup'});}}
   else{this.pickupSeat=null;this.pickupTime=0;}
  }
  const box=this.site?.box;
  const eligible=this.entities.filter(e=>e.hp>0&&!!((frames.get(e.seat)?.buttons??0)&BUTTON.INTERACT)&&(this.phase==='action'?e.attacking&&o.carrier===e.seat&&!!box&&e.x>=box[0]&&e.x<=box[3]&&e.y>=box[1]-.1&&e.y<=box[4]&&e.z>=box[2]&&e.z<=box[5]:this.phase==='planted'&&!e.attacking&&distance(e,o.position)<=1.5&&!this.world.blocked({x:e.x,y:e.y+1.08,z:e.z},{...o.position,y:o.position.y+.25})));
  const actor=eligible.find(e=>e.seat===o.interactionSeat)??eligible[0];
  if(!actor){this.cancelInteraction();return;}
  if(o.interactionSeat!==actor.seat){this.cancelInteraction();o.interactionSeat=actor.seat;o.interaction=this.phase==='action'?'plant':'disable';this.interactionOrigin={x:actor.x,y:actor.y,z:actor.z};}
  if(this.interactionOrigin&&distance(actor,this.interactionOrigin)>.5){this.cancelInteraction();return;}
  o.progress+=dt;const duration=o.interaction==='plant'?this.timing.plant:this.timing.disable;
  if(o.progress<duration-1e-7)return;
  if(o.interaction==='plant'){
   o.state='planted';o.carrier=null;o.position={x:actor.x,y:actor.y+.25,z:actor.z};o.revealed=true;this.phase='planted';this.timer=this.timing.fuse;
   this.events.push({type:'objective',seat:actor.seat,action:'plant'},{type:'phase',seat:actor.seat,phase:'planted',round:this.round});
  }else{o.state='disabled';this.events.push({type:'objective',seat:actor.seat,action:'disable'});}
  this.cancelInteraction();
 }
 endRound(winner:Team,reason:RoundReason='defendersEliminated'){
  if(this.phase!=='action'&&this.phase!=='planted')return;this.winner=winner;this.outcome=reason;this.scores[winner]++;this.phase='roundEnd';this.timer=this.timing.roundEnd;this.cancelInteraction();for(const e of this.entities)e.vx=e.vy=e.vz=0;
  this.events.push({type:'phase',seat:0,phase:'roundEnd',round:this.round,winner,reason});
 }
 fire(e:Entity,view:number,buttons=0){
  if((this.phase!=='action'&&this.phase!=='planted')||e.hp<=0||e.reload>0||e.ammo<=0||this.time<e.nextFire)return false;
  const gun=gunFor(e),previous=this.bursts.get(e.seat),burst=previous&&this.time-previous.at<400?previous.count:0;this.bursts.set(e.seat,{count:burst+1,at:this.time});
  e.nextFire=this.time+60000/gun.rpm;e.ammo--;e.mags[e.weapon]=e.ammo;this.events.push({type:'shot',seat:e.seat});
  const ads=!!(buttons&BUTTON.ADS),stationary=Math.hypot(e.vx,e.vz)<.1,spread=ads&&stationary&&burst===0?0:gun.spreadBase*(ads?.35:1),pattern=gun.spray[Math.min(burst,gun.spray.length-1)];
  const yaw=e.yaw+(this.random()-.5)*spread*2+(burst?pattern.yaw*burst:0),pitch=e.pitch+(this.random()-.5)*spread*2+(burst?pattern.pitch*Math.min(burst,10):0);
  const eye={x:e.x,y:e.y+(e.crouch?1.08:1.62),z:e.z},c=Math.cos(pitch),dir={x:-Math.sin(yaw)*c,y:Math.sin(pitch),z:-Math.cos(yaw)*c};
  let best=80,target:Entity|undefined,head=false;
  for(const other of this.entities){if(other===e||other.hp<=0||other.team===e.team)continue;const p=this.rewind?.(other.seat,view)??other,h=('height' in p?p.height:undefined)??(other.crouch?1.25:1.83),t=capsuleHit(eye,dir,p,h);if(t!==null&&t<best){best=t;target=other;head=eye.y+dir.y*t>p.y+h-.32;}}
  const end={x:eye.x+dir.x*best,y:eye.y+dir.y*best,z:eye.z+dir.z*best},trace=this.world.shot?.(eye,dir,best,gun.source,gun.damage)??{blocked:this.world.blocked(eye,end),scale:1};
  if(target&&!trace.blocked){const amount=Math.max(0,Math.round(damageAt(gun,best,head)*Math.max(0,Math.min(1,trace.scale))));target.hp=Math.max(0,target.hp-amount);this.events.push({type:'damage',seat:e.seat,target:target.seat,hp:target.hp,head});if(!target.hp){e.kills++;target.deaths++;this.events.push({type:'eliminated',seat:e.seat,target:target.seat,head});}}
  return true;
 }
 private botInput(e:Entity):InputFrame{
  let b=this.brain.get(e.seat);
  if(!b||this.time>=b.next){
   const i={...neutralInput(this.tick),yaw:e.yaw,pitch:0,weapon:e.weapon};const old=b;
   b={next:this.time+1000/this.thinkHz,path:old?.path??[],goal:old?.goal??{x:Infinity,y:0,z:Infinity},routeAt:old?.routeAt??0,input:i};
   const site=this.site,center=site?{x:site.center[0],y:0,z:site.center[2]}:{x:0,y:0,z:0},carrier=this.entities.find(a=>a.seat===this.objective.carrier),eye={x:e.x,y:e.y+1.62,z:e.z};
   let goal:Point=center,interact=false;
   if(e.attacking){
    if(this.objective.state==='dropped')goal=this.objective.position;
    else if(this.objective.carrier===e.seat){goal=this.objective.revealed?center:{x:0,y:0,z:-.5};const box=site?.box;interact=this.phase==='action'&&!!box&&e.x>box[0]+.2&&e.x<box[3]-.2&&e.z>box[2]+.2&&e.z<box[5]-.2;}
    else if(this.objective.state==='planted')goal={x:this.objective.position.x+Math.cos(e.seat)*2,y:0,z:this.objective.position.z+Math.sin(e.seat)*2};
    else goal=carrier??center;
   }else if(this.phase==='planted'){goal=this.objective.position;interact=distance(e,goal)<=1.3&&!this.world.blocked(eye,{...goal,y:goal.y+.25});}
   const targets=this.entities.filter(t=>t.team!==e.team&&t.hp>0&&distance(e,t)<42&&!this.world.blocked(eye,{x:t.x,y:t.y+1.3,z:t.z})).sort((a,b)=>distance(e,a)-distance(e,b)),target=targets[0];
   if(interact){i.buttons=BUTTON.INTERACT;i.pitch=0;}
   else if(target&&(this.phase==='action'||this.phase==='planted')){
    const d=Math.max(.001,Math.hypot(target.x-e.x,target.z-e.z)),error=this.difficulty==='easy'?.09:this.difficulty==='hard'?.008:.03;
    i.yaw=Math.atan2(-(target.x-e.x),-(target.z-e.z))+(this.random()-.5)*error;i.pitch=Math.atan2(target.y+1.3-eye.y,d)+(this.random()-.5)*error;i.buttons=BUTTON.FIRE|BUTTON.ADS;
    if(e.attacking&&this.objective.carrier===e.seat)this.steerBot(e,b,goal,i,true);
   }else if(Math.hypot(goal.x-e.x,goal.z-e.z)>.7){
    this.steerBot(e,b,goal,i,false);
   }
   if(e.ammo===0)i.buttons=BUTTON.RELOAD;this.brain.set(e.seat,b);
  }
  b.input.view=this.time;b.input.seq=this.tick;
  return gunFor(e).semi&&this.tick%2?{...b.input,buttons:b.input.buttons&~BUTTON.FIRE}:b.input;
 }
 private steerBot(e:Entity,b:Brain,goal:Point,i:InputFrame,keepAim:boolean){
  if(Math.hypot(goal.x-e.x,goal.z-e.z)<=.7)return;
  if(distance(goal,b.goal)>.5||!b.path.length||this.time-b.routeAt>5000){b.path=this.world.path?.(e,goal)??[{x:goal.x,y:0,z:goal.z}];b.goal={x:goal.x,y:goal.y,z:goal.z};b.routeAt=this.time;}
  while(b.path.length&&Math.hypot(b.path[0].x-e.x,b.path[0].z-e.z)<.45)b.path.shift();
  const p=b.path[0]??goal,dx=p.x-e.x,dz=p.z-e.z,d=Math.hypot(dx,dz),axis=Math.min(127,Math.round(d/(4.2*bodyFor(e.operator).speed*gunFor(e).moveSpeedMult/this.thinkHz)*127));
  if(keepAim){i.x=Math.round((Math.cos(i.yaw)*dx-Math.sin(i.yaw)*dz)/Math.max(.001,d)*axis);i.z=Math.round((-Math.sin(i.yaw)*dx-Math.cos(i.yaw)*dz)/Math.max(.001,d)*axis);}
  else{i.yaw=Math.atan2(-dx,-dz);i.z=axis;}
 }
}
