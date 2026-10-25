// An online guest: shows the host's world and plays its own character in it. Its own movement, inventory, crafting, hunger
// and environment damage run here; everything shared is the host's. The guest's own block edits appear at once and are sent
// as one request per action; the host's answer (accept, or the blocks to put back) and everyone else's changes arrive as
// numbered updates applied in order after the join snapshot.
import {cleanJson} from '../entity/entities';
import type {Room} from '../../../multiplayer/room';
import {maxStack,type ItemStack} from '../data/items';
import {DAY_TICKS} from '../engine/constants';
import type {BlockEntity,DamageKind,EffectName,Entity,EntityForward,Game,MirrorState} from '../engine/contracts';
import {AVATAR_KIND,NameTags,SEAT_COLOURS,stepAvatar} from './avatar';
import {AVATAR_ID_BASE,DAMAGE_KINDS,MAX_COORD,SHARED_SETTINGS,WORLD_GENERATION_VERSION,isBlockPos,parsePlayerState,stackOrNull,unpackState,validFlat,
  type PlayerState,type SlotName} from './protocol';
import type {NetHooks} from './net';

export interface GuestWorld{seed:number;edits:unknown;be:unknown;weather:unknown;settings:Record<string,unknown>;
  time:{tick:number;dayTime:number;day:number}|null;spawn:{x:number;y:number;z:number};you:{x:number;y:number;z:number};
  record:{player:unknown;inventory:unknown;survival:unknown}|null}

interface Target{x:number;y:number;z:number;yaw:number;head:number;pitch:number;steps:number}
const SEND_MS=50;
const vec=(v:unknown)=>{const o=v as Record<string,unknown>|null;return o&&[o.x,o.y,o.z].every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=MAX_COORD)?{x:o.x as number,y:o.y as number,z:o.z as number}:null;};
const wrap=(a:number)=>Math.atan2(Math.sin(a),Math.cos(a));

export class GuestSession{
  ready=false;
  private seq=-1;private act=0;
  private pending:number[]=[];private pendingHeld:ItemStack|null=null;
  private targets=new Map<number,Target>();
  private need=new Set<number>();
  private avatars=new Map<string,{entity:Entity;state:PlayerState}>();
  private tags:NameTags;
  private lastSent=0;private lastSave=0;
  private containers:{key:string;pos:number[];synced:Map<SlotName,string>;opened:Map<SlotName,string>}[]=[];
  private off:(()=>void)[]=[];
  private hostPaused=false;
  constructor(private game:Game,private room:Room,private hooks:NetHooks){
    this.tags=new NameTags(game);
    const forward:EntityForward={
      spawned:e=>this.send({t:'spawn',kind:e.kind,x:e.x,y:e.y,z:e.z,vx:e.vx,vy:e.vy,vz:e.vz,yaw:e.yaw,pitch:e.pitch,baby:e.baby,data:e.data}),
      dropItem:(stack,x,y,z,velocity,delay)=>this.send({t:'drop',stack,x,y,z,v:velocity??null,delay}),
      dropXp:(points,x,y,z)=>this.send({t:'xp',points:Math.floor(points),x,y,z}),
      damage:(e,amount,source)=>{
        if(e.id<=0||e.kind===AVATAR_KIND||e.id>=AVATAR_ID_BASE)return false;
        const kb=source.knockback;
        this.send({t:'hit',id:e.id,amount,kb:kb?{x:kb.x,z:kb.z,s:kb.strength}:null});
        return true;
      }
    };
    game.entities.mirror?.start(forward);
    const ev=game.events;
    this.off.push(
      ev.on('blockChanged',({x,y,z,from,to,cause})=>{
        if(!this.ready||cause==='remote'||cause==='restore')return;
        // One request per action: every cell changed in this call stack (both halves of a door) goes together.
        if(!this.pending.length){const h=game.inventory.held();this.pendingHeld=h?{...h}:null;queueMicrotask(()=>this.flushEdits());}
        this.pending.push(x,y,z,from,to);
      }),
      ev.on('containerOpened',({positions})=>{
        this.containers=positions.map(p=>{
          const local=this.game.blockEntities.get(p.x,p.y,p.z);
          return {key:`${p.x},${p.y},${p.z}`,pos:[p.x,p.y,p.z],synced:new Map(),opened:new Map(local?slots(local):[])};
        });
        this.send({t:'open',positions:positions.map(p=>[p.x,p.y,p.z])});
      })
    );
    this.off.push(room.on(e=>{
      if(e.type==='message')this.handle(e.data);
      else if(e.type==='paused')this.pause(e.paused);
    }));
    if(room.paused)this.pause(true);
  }
  private send(m:unknown){this.room.send(m);}
  private pause(paused:boolean){this.hostPaused=paused;this.hooks.hold(paused);}

  // ---- Host messages ------------------------------------------------------------------------------------------------------
  private handle(data:unknown){
    if(!data||typeof data!=='object')return;
    const m=data as Record<string,unknown>,game=this.game;
    switch(m.t){
      case 'world':return this.world(m);
      case 'blocks':{
        if(!this.ready||!Number.isInteger(m.seq)||!validFlat(m.c,4,1_000_000))return;
        const seq=m.seq as number;
        if(seq<=this.seq)return;// already in the snapshot
        if(seq!==this.seq+1){this.ready=false;this.send({t:'resync'});return;}// a gap: start over from a snapshot
        this.seq=seq;
        const c=m.c as number[];
        for(let i=0;i<c.length;i+=4)(game.world as unknown as {applyRemote(x:number,y:number,z:number,id:number):boolean}).applyRemote(c[i],c[i+1],c[i+2],c[i+3]);
        this.hooks.wake();return;
      }
      case 'deny':{
        if(validFlat(m.cells,4,512)){const c=m.cells as number[];for(let i=0;i<c.length;i+=4)(game.world as unknown as {applyRemote(x:number,y:number,z:number,id:number):boolean}).applyRemote(c[i],c[i+1],c[i+2],c[i+3]);}
        if(typeof m.message==='string')game.ui.toast(m.message.slice(0,120));
        this.hooks.wake();return;
      }
      case 'ents':return this.entities(m);
      case 'players':return this.players(m);
      case 'time':{
        const t=game.time as {tick:number;dayTime:number;day:number};
        if(Number.isInteger(m.tick)&&Number.isInteger(m.dayTime)&&Number.isInteger(m.day)&&(m.dayTime as number)>=0&&(m.dayTime as number)<DAY_TICKS){t.tick=m.tick as number;t.dayTime=m.dayTime as number;t.day=m.day as number;}
        if(m.weather)game.weather.restore?.(m.weather);
        return;
      }
      case 'settings':return this.settings(m.s);
      case 'hurt':{
        const kind=DAMAGE_KINDS.includes(m.kind as DamageKind)?m.kind as DamageKind:'mob';
        if(typeof m.amount!=='number'||!(m.amount>=0&&m.amount<=1000))return;
        const kb=m.kb as {x?:unknown;z?:unknown;s?:unknown}|null;
        const knockback=kb&&typeof kb.x==='number'&&typeof kb.z==='number'&&typeof kb.s==='number'?{x:kb.x,z:kb.z,strength:Math.min(20,kb.s)}:undefined;
        const attacker=typeof m.attacker==='number'?game.entities.byId(m.attacker)??null:null;
        game.survival.damage(m.amount,{kind,attacker,knockback});return;
      }
      case 'push':if([m.x,m.y,m.z].every(n=>typeof n==='number'&&Math.abs(n)<=100))game.player.push(m.x as number,m.y as number,m.z as number);return;
      case 'give':{
        const s=stackOrNull(m.stack);if(!s)return;
        const left=game.inventory.add({...s});
        if(left<s.count)game.events.emit('itemPickedUp',{stack:{...s,count:s.count-left}});
        if(left<s.count)game.sounds.play('pop',game.player.eye(),{volume:.2,pitch:1.6});
        if(left>0){const p=game.player.state;this.send({t:'drop',stack:{...s,count:left},x:p.x,y:p.y+1.2,z:p.z,v:null,delay:40});}
        return;
      }
      case 'xp':if(Number.isInteger(m.points)&&(m.points as number)>0&&(m.points as number)<=32767)game.survival.addXp(m.points as number);return;
      case 'ignite':if(typeof m.seconds==='number'&&m.seconds>0&&m.seconds<=60)game.survival.ignite(m.seconds);return;
      case 'effect':if(typeof m.name==='string'&&typeof m.seconds==='number'&&m.seconds>0&&m.seconds<=600)game.survival.addEffect(m.name as EffectName,m.seconds,typeof m.level==='number'?Math.max(1,Math.min(5,m.level)):1);return;
      case 'tp':{const v=vec(m);if(v)game.player.teleport(v.x,v.y,v.z);return;}
      case 'be':return this.container(m);
      case 'busy':{this.containers=[];game.ui.close();if(typeof m.message==='string')game.ui.toast(m.message.slice(0,80));return;}
    }
  }
  private settings(s:unknown){
    if(!s||typeof s!=='object')return;
    const patch:Record<string,unknown>={};for(const k of SHARED_SETTINGS)if(k in (s as object))patch[k]=(s as Record<string,unknown>)[k];
    this.game.updateSettings(patch);
  }
  private world(m:Record<string,unknown>){
    if(m.gen!==WORLD_GENERATION_VERSION||!Number.isInteger(m.seed)||!Number.isInteger(m.seq))return;
    const spawn=vec(m.spawn),you=vec(m.you);if(!spawn||!you)return;
    const t=m.time as {tick?:unknown;dayTime?:unknown;day?:unknown}|null;
    const time=t&&Number.isInteger(t.tick)&&Number.isInteger(t.dayTime)&&Number.isInteger(t.day)?{tick:t.tick as number,dayTime:t.dayTime as number,day:t.day as number}:null;
    const rec=m.record as GuestWorld['record'];
    this.targets.clear();this.need.clear();this.avatars.clear();this.containers=[];this.pending.length=0;
    this.ready=false;
    this.hooks.loadGuestWorld({seed:m.seed as number,edits:m.edits,be:m.be,weather:m.weather,settings:(m.settings??{}) as Record<string,unknown>,time,spawn,you,
      record:rec&&typeof rec==='object'?rec:null});
    this.seq=m.seq as number;this.ready=true;
    this.game.ui.toast('Joined the shared world');
  }
  private entities(m:Record<string,unknown>){
    const mirror=this.game.entities.mirror;if(!mirror||!this.ready)return;
    if(Array.isArray(m.s))for(const rec of m.s.slice(0,2000)){
      if(!Array.isArray(rec)||rec.length!==3||typeof rec[1]!=='string')continue;
      const st=unpackState(rec[0]);if(!st||st.id>=AVATAR_ID_BASE)continue;
      const clean=cleanJson(rec[2]),data=clean&&typeof clean==='object'&&!Array.isArray(clean)?clean as Record<string,unknown>:{};
      let e:Entity|null=null;
      try{e=mirror.upsert(st.id,rec[1],st.state,data);}catch{e=null;}
      if(e){this.need.delete(st.id);this.target(st.id,st.state,true);}
    }
    if(Array.isArray(m.u))for(const p of m.u.slice(0,4000)){
      const st=unpackState(p);if(!st||st.id>=AVATAR_ID_BASE)continue;
      const e=this.game.entities.byId(st.id);
      if(!e){this.need.add(st.id);continue;}
      mirror.upsert(st.id,e.kind,st.state,null);this.target(st.id,st.state,false);
    }
    if(Array.isArray(m.d))for(const rec of m.d.slice(0,2000)){
      if(!Array.isArray(rec)||typeof rec[0]!=='number'||!rec[1]||typeof rec[1]!=='object')continue;
      const e=this.game.entities.byId(rec[0]),clean=cleanJson(rec[1]);if(e&&clean&&typeof clean==='object'&&!Array.isArray(clean))e.data=clean as Record<string,unknown>;
    }
    if(Array.isArray(m.g))for(const id of m.g)if(typeof id==='number'&&id<AVATAR_ID_BASE){mirror.remove(id);this.targets.delete(id);}
    this.hooks.wake();
  }
  /** Host states arrive every 2 ticks: copies cover the distance over those 2 ticks. */
  private target(id:number,s:MirrorState,snap:boolean){
    const t=this.targets.get(id);
    if(snap||!t){this.targets.set(id,{x:s.x,y:s.y,z:s.z,yaw:s.yaw,head:s.headYaw,pitch:s.pitch,steps:snap?0:2});return;}
    t.x=s.x;t.y=s.y;t.z=s.z;t.yaw=s.yaw;t.head=s.headYaw;t.pitch=s.pitch;t.steps=2;
  }
  private players(m:Record<string,unknown>){
    const mirror=this.game.entities.mirror;if(!mirror||!this.ready||!Array.isArray(m.p))return;
    const seen=new Set<string>();
    for(const raw of m.p.slice(0,8)){
      const p=parsePlayerState(raw);if(!p||p.id===this.room.id)continue;
      seen.add(p.id);
      const id=AVATAR_ID_BASE+p.seat;
      let a=this.avatars.get(p.id);
      if(!a||a.entity.removed){
        const e=mirror.upsert(id,AVATAR_KIND,{x:p.x,y:p.y,z:p.z,yaw:p.yaw,headYaw:p.yaw,pitch:p.pitch,health:Math.max(1,p.health),hurtTime:0,deathTime:0,fire:0,baby:false,onGround:true},
          {name:p.name,color:SEAT_COLOURS[p.seat%4],tx:p.x,ty:p.y,tz:p.z,tyaw:p.yaw,tpitch:p.pitch});
        if(!e)continue;
        a={entity:e,state:p};this.avatars.set(p.id,a);
      }
      const d=a.entity.data;d.tx=p.x;d.ty=p.y;d.tz=p.z;d.tyaw=p.yaw;d.tpitch=p.pitch;d.sneaking=p.sneaking;
      if(a.state.health>p.health)a.entity.hurtTime=10;
      a.state=p;
    }
    for(const [pid,a] of this.avatars)if(!seen.has(pid)){mirror.remove(a.entity.id);this.avatars.delete(pid);}
  }
  private container(m:Record<string,unknown>){
    const pos=m.pos;if(!Array.isArray(pos)||!isBlockPos(pos[0],pos[1],pos[2]))return;
    const c=this.containers.find(c=>c.key===`${pos[0]},${pos[1]},${pos[2]}`);if(!c)return;
    const local=this.game.blockEntities.get(pos[0],pos[1],pos[2]),v=m.entity as Record<string,unknown>|null;
    if(!local||!v||v.kind!==local.kind)return;
    // The join snapshot already filled this chest, so a take can land before the host's first copy arrives.
    const first=!c.synced.size;
    const localBefore=first?new Map(slots(local)):null;
    // In place: the open screen's slots read these very arrays and fields.
    if(local.kind==='chest'&&Array.isArray(v.items))for(let i=0;i<local.items.length;i++)local.items[i]=stackOrNull(v.items[i]);
    if(local.kind==='furnace'){
      local.input=stackOrNull(v.input);local.fuel=stackOrNull(v.fuel);local.output=stackOrNull(v.output);
      for(const k of ['burn','burnTotal','cook','xp'] as const){const n=v[k];if(typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1e6)local[k]=n;}
    }
    const host=new Map(slots(local));
    const next=first&&localBefore?slotsAfterFirstSnapshot(c.opened,localBefore,host):{synced:host,local:host};
    if([...next.local].some(([slot,value])=>next.synced.get(slot)!==value))writeSlots(local,next.local);
    c.synced=next.synced;
  }

  // ---- Per tick and frame ----------------------------------------------------------------------------------------------------
  tick(){
    const mirror=this.game.entities.mirror;if(!mirror)return;
    mirror.tick(e=>{
      if(e.kind===AVATAR_KIND){stepAvatar(e);return;}
      const t=this.targets.get(e.id);if(!t)return;
      if(t.steps<=0){e.x=t.x;e.y=t.y;e.z=t.z;e.yaw=t.yaw;e.headYaw=t.head;e.pitch=t.pitch;return;}
      const k=1/t.steps;
      if(Math.hypot(t.x-e.x,t.y-e.y,t.z-e.z)>8){e.x=t.x;e.y=t.y;e.z=t.z;}
      else{e.x+=(t.x-e.x)*k;e.y+=(t.y-e.y)*k;e.z+=(t.z-e.z)*k;}
      e.yaw+=wrap(t.yaw-e.yaw)*k;e.headYaw+=wrap(t.head-e.headYaw)*k;e.pitch+=(t.pitch-e.pitch)*k;
      t.steps--;
    });
  }
  frame(){
    if(!this.ready)return;
    const game=this.game,now=performance.now();
    if(now-this.lastSent>=SEND_MS){this.lastSent=now;this.report();}
    if(now-this.lastSave>=10_000){this.lastSave=now;this.sendSave();}
    this.syncContainers();
    this.tags.frame([...this.avatars.values()].map(a=>({entity:a.entity,name:a.state.name,health:a.state.health,away:a.state.away,dead:a.state.dead})));
  }
  private flushEdits(){
    if(!this.pending.length)return;
    this.send({t:'act',n:++this.act,held:this.pendingHeld,edits:this.pending.splice(0)});this.pendingHeld=null;
  }
  /** About 20 times a second: where this guest is and what it can carry. */
  private report(){
    const game=this.game,p=game.player.state,inv=game.inventory;
    let empty=0;const partial=new Set<string>();
    for(let i=0;i<36;i++){const s=inv.slots[i];if(!s)empty++;else if(s.count<maxStack(s.id)&&!s.damage)partial.add(s.id);}
    const away=game.shellPaused||this.hostPaused||!(game.state==='playing'||game.state==='screen');
    this.send({t:'me',x:p.x,y:p.y,z:p.z,yaw:p.yaw,pitch:p.pitch,sneaking:p.sneaking,health:game.survival.health,dead:game.survival.dead,away,
      held:inv.held()?.id??null,empty,partial:[...partial],need:[...this.need].slice(0,64)});
    this.need.clear();
  }
  /** Personal progress kept in the host's save, so returning to this world restores it. */
  sendSave(){
    const g=this.game as unknown as {player:{serialize?():unknown};inventory:{serialize?():unknown};survival:{serialize?():unknown}};
    this.send({t:'save',player:g.player.serialize?.()??null,inventory:g.inventory.serialize?.()??null,survival:g.survival.serialize?.()??null});
  }
  /** Slot changes made in an open chest or furnace screen go to the host as before → after. */
  private syncContainers(){
    if(!this.containers.length)return;
    const screen=this.game.ui.screen;
    if(screen!=='chest'&&screen!=='furnace'){this.containers=[];this.send({t:'close'});return;}
    for(const c of this.containers){
      if(!c.synced.size)continue;// waiting for the host's contents
      const e=this.game.blockEntities.get(c.pos[0],c.pos[1],c.pos[2]);if(!e)continue;
      for(const [slot,value] of slots(e)){
        const before=c.synced.get(slot);
        if(before===undefined||before===value)continue;
        c.synced.set(slot,value);
        this.send({t:'slot',pos:c.pos,slot,before:JSON.parse(before),after:JSON.parse(value)});
      }
    }
  }
  dispose(){
    if(this.ready)this.sendSave();
    for(const off of this.off.splice(0))off();
    this.game.entities.mirror?.stop();
    this.tags.dispose();
    this.avatars.clear();this.targets.clear();
  }
}
function slots(e:BlockEntity):[SlotName,string][]{
  if(e.kind==='chest')return e.items.map((s,i)=>[i,JSON.stringify(s??null)]);
  return[['input',JSON.stringify(e.input??null)],['fuel',JSON.stringify(e.fuel??null)],['output',JSON.stringify(e.output??null)],['xp',JSON.stringify(e.xp)]];
}
/**
 * The host's first container copy is authoritative, except for a slot the player already changed after opening.
 * `synced` stays the host value so the next frame sends that edit as before → after. An untouched slot keeps the host copy.
 */
export function slotsAfterFirstSnapshot(
  opened:ReadonlyMap<SlotName,string>,
  localBefore:ReadonlyMap<SlotName,string>,
  host:ReadonlyMap<SlotName,string>,
):{synced:Map<SlotName,string>;local:Map<SlotName,string>}{
  const synced=new Map(host),local=new Map(host);
  for(const [slot,value] of localBefore){
    const atOpen=opened.get(slot);
    if(atOpen!==undefined&&value!==atOpen)local.set(slot,value);
  }
  return {synced,local};
}
function writeSlots(e:BlockEntity,values:ReadonlyMap<SlotName,string>){
  const read=(slot:SlotName)=>stackOrNull(JSON.parse(values.get(slot)??'null'));
  if(e.kind==='chest'){for(const [slot] of values)if(typeof slot==='number')e.items[slot]=read(slot);return;}
  for(const key of ['input','fuel','output'] as const)if(values.has(key))e[key]=read(key);
  const xp=values.get('xp');
  if(xp!==undefined){const n=JSON.parse(xp);if(typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1e6)e.xp=n;}
}
