import type {Room,RoomEvent} from '../../../multiplayer/room';
import {cleanName} from '../../../multiplayer/protocol';
import {Simulation,move,canMove,type Entity,type Seat,type SimEvent,type SimWorld,type InputFrame,type PickRequest} from '../sim';
import type {MatchOptions} from '../ui/hud';
import {packInputs,unpackInputs,packSnapshot,unpackSnapshot,NET_VERSION,type Snapshot} from './protocol';
import {InputBuffer} from './input-buffer';
import {reconcile,Interpolation} from './prediction';
import {CapsuleHistory} from './history';
import {SessionTransport} from './transport';
export const ONLINE_VERSION=`strongroom-${new URL(import.meta.url).pathname.match(/-([\w-]{8})\.js$/)?.[1]??'dev'}-net${NET_VERSION}`;
export interface Lobby{rev:number;seed:number;settings:MatchOptions;seats:Seat[];tickHz:number;snapshotHz:number;epoch:number;started:boolean}
export interface SessionHooks{
 input():InputFrame;state(state:Simulation,localSeat:number):void;events(events:SimEvent[]):void;lobby(lobby:Lobby):void;paused(on:boolean):void;closed(message:string):void;
 rates():{tickHz:number;snapshotHz:number;maxTeam:number};think():number;tick?(ms:number):void;error?(metres:number):void;
}
const isInt=(v:unknown,min:number,max:number):v is number=>typeof v==='number'&&Number.isInteger(v)&&v>=min&&v<=max;
function readLobby(v:unknown):Lobby|null{
 if(!v||typeof v!=='object')return null;const l=v as Lobby,s=l.settings;
 if(!isInt(l.rev,0,1e9)||!isInt(l.seed,0,0xffffffff)||!s||![3,5].includes(s.teamSize)||!['easy','normal','hard'].includes(s.difficulty)||typeof s.quick!=='boolean'||![30,60].includes(l.tickHz)||![15,20].includes(l.snapshotHz)||!isInt(l.epoch,0,Number.MAX_SAFE_INTEGER)||typeof l.started!=='boolean'||!Array.isArray(l.seats)||l.seats.length!==s.teamSize*2)return null;
 const seats:Seat[]=[];for(const e of l.seats){if(!e||!isInt(e.seat,0,s.teamSize*2-1)||![0,1].includes(e.team)||typeof e.bot!=='boolean'||!cleanName(e.name)||e.name.length>16||e.peer!==undefined&&(typeof e.peer!=='string'||e.peer.length>150)||seats.some(x=>x.seat===e.seat||!!e.peer&&x.peer===e.peer))return null;seats.push({seat:e.seat,name:cleanName(e.name)!,team:e.team,bot:e.bot,peer:e.peer});}
 return{...l,settings:{...s},seats};
}
export class OnlineSession{
 state:Simulation;localSeat=0;lobby:Lobby;readonly transport:SessionTransport;readonly history=new CapsuleHistory();readonly interpolation=new Interpolation();
 readonly errors:number[]=[];private off:()=>void;private timer:ReturnType<typeof setInterval>;private disposed=false;private buffers=new Map<string,InputBuffer>();private assignments=new Map<string,number>();
 private seq=0;private pending:InputFrame[]=[];private redundant:InputFrame[]=[];private last=performance.now();private accumulator=0;private inputAccumulator=0;private snapshotAccumulator=0;private wallAccumulator=0;private lastSnapshot=-1;private eventSeq=0;private lastEvent=0;private away=false;private clock={time:0,arrival:0};private lastRound=0;private correction={x:0,y:0,z:0};private previous:Entity[]=[];private previousLocal:Entity|null=null;private wallRequests=new Map<string,number>();
 constructor(readonly room:Room,world:SimWorld,private hooks:SessionHooks,seed=1,impair=false){
  this.transport=new SessionTransport(room,impair);this.state=new Simulation(world,[],seed);const rates=hooks.rates();
  this.lobby={rev:0,seed:seed>>>0,settings:{teamSize:3,difficulty:'normal',quick:false},seats:[],tickHz:rates.tickHz,snapshotHz:rates.snapshotHz,epoch:0,started:false};
  this.off=room.on(e=>this.onRoom(e));if(room.role==='host'){room.setMaxPlayers(6);this.refreshPlayers();}else this.transport.send(['sync'],true);
  this.timer=setInterval(()=>this.advance(),8);
 }
 get role(){return this.room.role;}
 get started(){return this.lobby.started;}
 updateRates(){if(this.role!=='host')return;const rates=this.hooks.rates();this.lobby.tickHz=rates.tickHz;this.lobby.snapshotHz=rates.snapshotHz;this.broadcastLobby();}
 get renderEntities(){
  if(this.state.paused)return this.state.entities;
  if(this.role==='host'){const alpha=Math.min(1,this.accumulator*this.lobby.tickHz);return this.state.entities.map(e=>{const p=this.previous.find(p=>p.seat===e.seat)??e;return{...e,x:p.x+(e.x-p.x)*alpha,y:p.y+(e.y-p.y)*alpha,z:p.z+(e.z-p.z)*alpha};});}
  const others=this.interpolation.sample(performance.now()),local=this.state.entities.find(e=>e.seat===this.localSeat);const weight=.8;this.correction.x*=weight;this.correction.y*=weight;this.correction.z*=weight;
  return this.state.entities.map(e=>e.seat===this.localSeat&&local?{...local,x:(this.previousLocal?.x??local.x)+(local.x-(this.previousLocal?.x??local.x))*Math.min(1,this.inputAccumulator*30)+this.correction.x,y:(this.previousLocal?.y??local.y)+(local.y-(this.previousLocal?.y??local.y))*Math.min(1,this.inputAccumulator*30)+this.correction.y,z:(this.previousLocal?.z??local.z)+(local.z-(this.previousLocal?.z??local.z))*Math.min(1,this.inputAccumulator*30)+this.correction.z}:others.find(o=>o.seat===e.seat)??e);
 }
 private refreshPlayers(){
  const size=this.lobby.settings.teamSize,players=this.room.players;
  for(const id of this.assignments.keys())if(!players.some(p=>p.id===id))this.assignments.delete(id);
  for(const p of players){if(this.assignments.has(p.id))continue;const order=Array.from({length:size},(_,n)=>[n,n+size]).flat(),seat=order.find(n=>![...this.assignments.values()].includes(n));if(seat!==undefined)this.assignments.set(p.id,seat);}
  const seats:Seat[]=Array.from({length:size*2},(_,seat)=>{const peer=[...this.assignments].find(([,s])=>s===seat)?.[0],player=players.find(p=>p.id===peer);return{seat,team:seat<size?0:1,name:player?.name??`Bot ${seat+1}`,bot:!player,peer:player?.id};});
  this.lobby.seats=seats;this.localSeat=this.assignments.get(this.room.id)??0;this.broadcastLobby();
 }
 private broadcastLobby(to?:string){this.lobby.rev++;this.hooks.lobby(this.lobby);this.transport.send(['lobby',this.lobby],true,to);}
 configure(settings:MatchOptions){if(this.role!=='host'||this.started)return false;const size=Math.min(settings.teamSize,this.hooks.rates().maxTeam) as 3|5;if(this.room.players.length>size*2)return false;if(!this.room.setMaxPlayers(size*2))return false;this.lobby.settings={teamSize:size,difficulty:settings.difficulty,quick:settings.quick};this.assignments.clear();this.refreshPlayers();return true;}
 chooseSeat(seat:number,peer=this.room.id){
  if(this.started||!isInt(seat,0,this.lobby.settings.teamSize*2-1))return false;
  if(this.role==='guest'){this.transport.send(['seat',seat],true);return true;}
  if(!this.room.players.some(p=>p.id===peer)||[...this.assignments].some(([id,n])=>id!==peer&&n===seat))return false;
  this.assignments.set(peer,seat);this.refreshPlayers();return true;
 }
 requestPick(request:PickRequest){
  if(!this.started||this.state.paused)return false;
  if(this.role==='host')return this.state.requestPick(this.localSeat,request);
  const actor=this.state.entities.find(e=>e.seat===this.localSeat);if(this.state.phase!=='pick'||this.state.pickStage!=='loadout'||!actor||actor.bot||actor.locked)return false;
  this.transport.send(['pick',this.lobby.epoch,this.state.round,request],true);return true;
 }
 requestSideVote(side:'attack'|'defend'){
  if(!this.started||this.state.paused)return false;
  if(this.role==='host')return this.state.requestSideVote(this.localSeat,side);
  const actor=this.state.entities.find(e=>e.seat===this.localSeat);if(this.state.phase!=='pick'||this.state.pickStage!=='side'||!actor||actor.bot||actor.team!==this.state.sideVoteTeam||!['attack','defend'].includes(side))return false;
  this.transport.send(['sideVote',this.lobby.epoch,this.state.round,side],true);return true;
 }
 private recipients(to?:string){return this.room.players.filter(p=>p.id!==this.room.id&&(!to||p.id===to));}
 private packetFor(peer:string){const seat=this.assignments.get(peer),team=this.state.entities.find(e=>e.seat===seat)?.team;return packSnapshot(this.state,this.lobby.epoch,team);}
 private sendStart(to?:string){for(const p of this.recipients(to)){this.transport.send(['start',this.lobby,this.packetFor(p.id)],true,p.id);this.sendWalls(p.id);}}
 private sendWalls(to?:string){for(const p of this.recipients(to))this.transport.send(['walls',this.lobby.epoch,this.state.round,this.state.walls.snapshot()],true,p.id);}
 private sendSnapshot(reliable=false){for(const p of this.recipients())this.transport.send(this.packetFor(p.id),reliable,p.id);}
 private sendEvents(events:SimEvent[]){
  const sequence=++this.eventSeq,authority=events.some(e=>['phase','pick','objective','sideVote','wall'].includes(e.type));
  for(const p of this.recipients())this.transport.send(['events',this.lobby.epoch,sequence,this.state.round,this.state.tick,events,authority?this.packetFor(p.id):null],true,p.id);
 }
 start(){
  if(this.role!=='host'||!this.room.players.length)return false;
  this.away=false;this.room.setPaused(false);const rates=this.hooks.rates();this.lobby.tickHz=rates.tickHz;this.lobby.snapshotHz=rates.snapshotHz;this.lobby.epoch=Math.max(Date.now(),this.lobby.epoch+1);this.lobby.started=true;
  this.state=new Simulation(this.state.world,this.lobby.seats.map(s=>({...s})),this.lobby.seed,this.lobby.settings.quick);this.state.difficulty=this.lobby.settings.difficulty;this.state.thinkHz=this.hooks.think();this.state.rewind=(seat,view)=>this.history.sample(seat,view,this.state.time);this.state.start();this.resetRound();
  this.hooks.state(this.state,this.localSeat);this.sendStart();this.broadcastLobby();this.last=performance.now();return true;
 }
 toLobby(){if(this.role!=='host')return false;this.lobby.started=false;this.state.phase='menu';this.broadcastLobby();return true;}
 setAway(on:boolean){if(this.disposed)return;if(this.away===on)return;this.away=on;if(this.role==='guest')this.transport.send(['away',on?1:0],true);else this.room.setPaused(on);if(on){this.pending=[];this.redundant=[];}}
 private resetRound(){this.previous=[];this.previousLocal=null;this.seq=0;this.pending=[];this.redundant=[];this.buffers.clear();this.history.clear();this.interpolation.clear();this.lastRound=this.state.round;this.accumulator=0;this.inputAccumulator=0;this.snapshotAccumulator=0;this.wallAccumulator=0;this.correction={x:0,y:0,z:0};}
 private onRoom(event:RoomEvent){
  if(this.disposed)return;
  if(event.type==='closed'){this.state.paused=true;this.lobby.started=false;this.hooks.closed(event.reason==='kicked'?'Removed from room':'Host left');this.dispose();return;}
  if(event.type==='paused'){this.state.paused=event.paused;this.state.inputs.clear();for(const b of this.buffers.values())b.discard();this.pending=[];this.redundant=[];this.accumulator=0;this.inputAccumulator=0;this.hooks.paused(event.paused);return;}
  if(this.role==='host'&&(event.type==='joined'||event.type==='left')){
   if(event.type==='left'){const seat=this.assignments.get(event.player.id);if(seat!==undefined)this.state.disconnect(seat);this.buffers.delete(event.player.id);}
   this.refreshPlayers();if(event.type==='joined'&&this.started)this.sendStart(event.player.id);return;
  }
  if(event.type!=='message')return;const data=event.data;if(!Array.isArray(data))return;
  if(this.role==='host'){
   if(data[0]==='sync'){this.transport.send(['lobby',this.lobby],true,event.from.id);if(this.started)this.sendStart(event.from.id);return;}
   if(data[0]==='seat'&&data.length===2){this.chooseSeat(data[1],event.from.id);return;}
   const seat=this.assignments.get(event.from.id);if(seat===undefined)return;
   if(data[0]==='away'&&data.length===2&&(data[1]===0||data[1]===1)){const actor=this.state.entities.find(e=>e.seat===seat);if(actor?.peer===event.from.id)this.state.setAway(seat,data[1]===1);return;}
   if(!this.started)return;
   if(data[0]==='wr'&&data.length===3&&data[1]===this.lobby.epoch&&data[2]===this.state.round){const at=this.wallRequests.get(event.from.id)??-Infinity;if(this.state.time-at>=250){this.wallRequests.set(event.from.id,this.state.time);this.sendWalls(event.from.id);}return;}
   if(this.state.paused)return;
   const actor=this.state.entities.find(e=>e.seat===seat);if(actor?.peer!==event.from.id||actor.bot)return;
   if((data[0]==='pick'||data[0]==='sideVote')&&data.length===4&&data[1]===this.lobby.epoch&&data[2]===this.state.round){if(data[0]==='pick')this.state.requestPick(seat,data[3]);else this.state.requestSideVote(seat,data[3]);return;}
   const packet=unpackInputs(data);if(!packet||packet.epoch!==this.lobby.epoch||packet.round!==this.state.round)return;
   let buffer=this.buffers.get(event.from.id);if(!buffer){buffer=new InputBuffer(this.state.time);this.buffers.set(event.from.id,buffer);}
   buffer.push(packet.frames.filter(i=>i.at<=this.state.time+250&&i.at>=this.state.time-1000),this.state.time);return;
  }
  if(!event.from.host)return;
  if(data[0]==='lobby'){
   const lobby=readLobby(data[1]);if(!lobby||lobby.rev<this.lobby.rev)return;this.lobby=lobby;this.localSeat=lobby.seats.find(s=>s.peer===this.room.id)?.seat??this.localSeat;if(!lobby.started)this.state.phase='menu';this.hooks.lobby(lobby);this.hooks.state(this.state,this.localSeat);return;
  }
  if(data[0]==='start'){
   const lobby=readLobby(data[1]);if(!lobby||lobby.epoch<this.lobby.epoch)return;const fresh=lobby.epoch!==this.lobby.epoch;
   this.lobby=lobby;this.localSeat=lobby.seats.find(s=>s.peer===this.room.id)?.seat??this.localSeat;
   if(fresh){this.state=new Simulation(this.state.world,lobby.seats,lobby.seed,lobby.settings.quick);this.lastSnapshot=-1;this.lastEvent=0;this.resetRound();}
   this.receiveSnapshot(data[2],true);this.hooks.lobby(lobby);return;
  }
  if(data[0]==='events'&&data[1]===this.lobby.epoch&&isInt(data[2],1,1e9)&&data[2]>this.lastEvent&&isInt(data[3],1,10000)&&isInt(data[4],0,1e9)&&Array.isArray(data[5])&&data[5].length<=64){
   this.lastEvent=data[2];if(data[3]<this.state.round)return;const older=data[4]<this.lastSnapshot;if(!older&&data[6])this.receiveSnapshot(data[6],true);if(data[3]!==this.state.round)return;
   const events=data[5].filter((e:any)=>e&&['shot','damage','eliminated','phase','pick','objective','sideVote','wall'].includes(e.type)&&isInt(e.seat,0,9)) as SimEvent[];
   this.hooks.events(older?events.filter(e=>['shot','damage','eliminated'].includes(e.type)).map(e=>e.type==='damage'?{...e,hp:undefined}:e):events);return;
  }
  if(data[0]==='walls'&&data.length===4&&data[1]===this.lobby.epoch&&data[2]===this.state.round){if(Array.isArray(data[3])&&data[3][0]==='wf'&&data[3][1]!==this.state.round)return;const result=this.state.walls.applyPacket(data[3]);if(result.resync)this.transport.send(['wr',this.lobby.epoch,this.state.round],true);return;}
  this.receiveSnapshot(data,false);
 }
 private receiveSnapshot(data:unknown,reliable:boolean){
  if(!this.started)return;const snapshot=unpackSnapshot(data,this.lobby.seats);if(!snapshot||snapshot.epoch!==this.lobby.epoch||snapshot.tick<this.lastSnapshot||snapshot.round<this.state.round)return;
  const fresh=snapshot.round!==this.state.round,old=this.state.entities.find(e=>e.seat===this.localSeat),incoming=snapshot.entities.find(e=>e.seat===this.localSeat);if(fresh){this.state.round=snapshot.round;this.state.walls.reset(snapshot.round);this.resetRound();}
  this.lastSnapshot=snapshot.tick;const now=performance.now(),oneWay=this.transport.delay+(Number.isFinite(this.room.rtt())?this.room.rtt()/2:0);this.clock={time:snapshot.time+oneWay,arrival:now};
  this.interpolation.add(snapshot.time,snapshot.entities,now,oneWay);
  if(!incoming||!canMove(incoming,snapshot.phase)){this.pending=[];this.previousLocal=null;this.correction={x:0,y:0,z:0};}
  if(incoming&&old&&!fresh&&incoming.hp>0&&canMove(incoming,snapshot.phase)){
   const result=reconcile(old,incoming,this.pending,this.state.world);this.pending=result.pending;result.entity.yaw=old.yaw;result.entity.pitch=old.pitch;const index=snapshot.entities.indexOf(incoming);snapshot.entities[index]=result.entity;
   this.correction.x+=old.x-result.entity.x;this.correction.y+=old.y-result.entity.y;this.correction.z+=old.z-result.entity.z;if(Math.hypot(this.correction.x,this.correction.z)>1)this.correction={x:0,y:0,z:0};
   this.errors.push(result.error);this.hooks.error?.(result.error);if(this.errors.length>4000)this.errors.shift();
  }else this.pending=[];
  Object.assign(this.state,{round:snapshot.round,tick:snapshot.tick,time:snapshot.time,phase:snapshot.phase,timer:snapshot.timer,scores:snapshot.scores,winner:snapshot.winner,entities:snapshot.entities,attackTeam:snapshot.attackTeam,pickStage:snapshot.pickStage,overtime:snapshot.overtime,sideVoteTeam:snapshot.sideVoteTeam,outcome:snapshot.outcome,actionElapsed:snapshot.actionElapsed,objective:snapshot.objective,tools:snapshot.tools});this.state.paused=this.room.paused;this.hooks.state(this.state,this.localSeat);
 }
 private advance(){
  if(this.disposed)return;const now=performance.now(),dt=Math.min(.25,Math.max(0,(now-this.last)/1000));this.last=now;
  if(!this.started||this.state.paused)return;
  this.inputAccumulator+=dt;while(this.inputAccumulator>=1/30){this.inputAccumulator-=1/30;
   if(this.role==='host'){
    const frame=this.localInput(now);if(!this.away)this.state.applyInput(this.localSeat,frame);
    for(const [id,buffer] of this.buffers){const frame=buffer.take(this.state.time),seat=this.assignments.get(id);if(frame&&seat!==undefined)this.state.applyInput(seat,frame);}
   }else if(!this.away){const frame=this.localInput(now),e=this.state.entities.find(e=>e.seat===this.localSeat);if(e&&e.hp>0&&canMove(e,this.state.phase)){this.pending.push(frame);if(this.pending.length>120)this.pending.shift();this.previousLocal={...e};move(e,frame,1/30,this.state.world);}this.redundant.push(frame);if(this.redundant.length>3)this.redundant.shift();this.transport.send(packInputs(this.lobby.epoch,this.state.round,this.redundant),false);}
  }
  if(this.role==='guest')return;
  this.accumulator=Math.min(.25,this.accumulator+dt);const step=1/this.lobby.tickHz;
  while(this.accumulator>=step){
   const at=performance.now();this.state.thinkHz=this.hooks.think();this.history.record(this.state.time,this.state.entities);this.previous=this.state.entities.map(e=>({...e}));this.state.step(step);this.hooks.tick?.(performance.now()-at);this.accumulator-=step;
   const freshRound=this.state.round!==this.lastRound;
   if(freshRound){this.resetRound();for(const e of this.state.entities){const live=this.lobby.seats.find(s=>s.seat===e.seat);if(live?.peer){const replaced=e.peer!==live.peer,returning=e.bot;e.peer=live.peer;e.name=live.name;if(replaced){e.away=null;e.bot=false;e.locked=false;}else if(e.away===null){e.bot=false;if(returning)e.locked=false;}}}}
   const events=this.state.events.splice(0);if(events.length){this.hooks.events(events);this.sendEvents(events);}
   if(freshRound)this.sendWalls();
   for(const packet of this.state.walls.drainPackets())this.transport.send(['walls',this.lobby.epoch,this.state.round,packet],true);
   this.wallAccumulator+=step;if(this.wallAccumulator>=5){this.wallAccumulator-=5;this.sendWalls();}
   this.snapshotAccumulator+=step;if(this.snapshotAccumulator>=1/this.lobby.snapshotHz){this.snapshotAccumulator-=1/this.lobby.snapshotHz;this.sendSnapshot();}
  }
 }
 private localInput(now:number){const frame=this.hooks.input();return{...frame,seq:++this.seq,at:this.role==='host'?this.state.time:Math.max(0,this.clock.time+now-this.clock.arrival),view:this.role==='host'?this.state.time:Math.max(0,this.clock.time+now-this.clock.arrival-100)};}
 dispose(){if(this.disposed)return;this.disposed=true;clearInterval(this.timer);this.off();this.transport.dispose();this.pending=[];this.buffers.clear();this.history.clear();this.interpolation.clear();}
}
