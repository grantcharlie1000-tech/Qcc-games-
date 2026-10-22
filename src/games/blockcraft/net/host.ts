// The online host: runs the one real world and answers guests. Block updates are numbered (`seq`) so a joining guest applies
// everything after its snapshot in order; entities, players and time are compact periodic states; personal effects
// (damage, items, experience, teleports) go to the player they concern. The shared world is saved on this device under
// its own key, apart from the single-player save.
import * as store from '../../../core/storage';
import type {Room,RosterEntry} from '../../../multiplayer/room';
import {AIR,blockDef} from '../data/blocks';
import {ITEMS,itemDef,maxStack,type ItemStack} from '../data/items';
import type {BlockEntity,DamageSource,EffectName,Entity,Game,PlayerView,Vec3} from '../engine/contracts';
import {cleanJson} from '../entity/entities';
import {blockXp,canHarvest} from '../interact/loot';
import {AVATAR_KIND,NameTags,SEAT_COLOURS} from './avatar';
import {SHARED_SETTINGS,WORLD_GENERATION_VERSION,isBlockPos,isCoord,packState,parseSelf,parseSlotName,stackOrNull,validFlat,
  type PlayerState,type SelfReport,type SlotName} from './protocol';
import {REFUSAL_TEXT,RateLimit,checkEdits,type EditRefusal} from './validate';
import type {NetHooks} from './net';

export const MP_SAVE_KEY='mp:blockcraft:world';
const SAVE_VERSION=1;
/** Guest records kept in the shared world's save. */
const MAX_RECORDS=24;
/** Entities within this horizontal distance of a guest are sent to it. */
const ENTITY_RANGE=80;
/** Guests silent for this long (paused, tab hidden) are "away": mobs ignore them. */
const AWAY_MS=1500;
const PROJECTILES=new Set(['arrow','snowball','egg','ender_pearl']);
const r1=(v:number)=>Math.round(v*1000)/1000;

interface GuestRecord{player?:unknown;inventory?:unknown;survival?:unknown}
interface MpSave{v:number;world:unknown;guests:Record<string,GuestRecord>}
export function readMpSave():MpSave|null{
  const v=store.read<MpSave|null>(MP_SAVE_KEY,null);
  return v&&typeof v==='object'&&v.v===SAVE_VERSION&&v.world&&typeof v.world==='object'?{...v,guests:v.guests&&typeof v.guests==='object'?v.guests:{}}:null;
}

/** A guest seen by the host's mobs, items and explosions. Effects on it are sent to its device. */
class RemoteView implements PlayerView{
  readonly local=false;readonly width=.6;readonly eyeHeight=1.62;
  x=0;y=0;z=0;yaw=0;pitch=0;inWater=false;sneaking=false;dead=false;health=20;away=false;held:string|null=null;
  empty=36;partial:string[]=[];lastReport=0;
  private pushed={x:0,y:0,z:0};
  constructor(readonly id:string,public name:string,readonly seat:number,private game:Game,private send:(m:unknown)=>void){}
  get height(){return this.sneaking?1.5:1.8;}
  get targetable(){return !this.dead&&!this.away&&performance.now()-this.lastReport<AWAY_MS&&this.game.settings.mode==='survival';}
  report(r:SelfReport,now:number){
    this.x=r.x;this.y=r.y;this.z=r.z;this.yaw=r.yaw;this.pitch=r.pitch;this.sneaking=r.sneaking;this.health=r.health;this.dead=r.dead;
    this.away=r.away;this.held=r.held;this.empty=r.empty;this.partial=r.partial;this.lastReport=now;
    const id=this.game.world.get(Math.floor(r.x),Math.floor(r.y+.4),Math.floor(r.z));this.inWater=id>0&&!!blockDef(id).liquid;
  }
  damage(amount:number,source:DamageSource){
    if(!(amount>=0)||!Number.isFinite(amount)||this.dead)return 0;
    const kb=source.knockback&&[source.knockback.x,source.knockback.z,source.knockback.strength].every(Number.isFinite)?{x:r1(source.knockback.x),z:r1(source.knockback.z),s:r1(source.knockback.strength)}:null;
    this.send({t:'hurt',amount,kind:source.kind,kb,attacker:source.attacker&&!source.attacker.removed?source.attacker.id:null});
    return amount;
  }
  push(vx:number,vy:number,vz:number){if([vx,vy,vz].every(Number.isFinite)){this.pushed.x+=vx;this.pushed.y+=vy;this.pushed.z+=vz;}}
  flushPush(){const p=this.pushed;if(p.x||p.y||p.z){this.send({t:'push',x:r1(p.x),y:r1(p.y),z:r1(p.z)});p.x=p.y=p.z=0;}}
  canTake(s:ItemStack){return this.empty>0||this.partial.includes(s.id);}
  give(s:ItemStack){
    if(!this.canTake(s))return s.count;
    this.send({t:'give',stack:{...s}});
    // Assume it fits: the guest drops back anything that did not (with a pickup delay).
    if(!this.partial.includes(s.id)){this.empty=Math.max(0,this.empty-1);this.partial.push(s.id);}
    return 0;
  }
  addXp(points:number){if(points>0)this.send({t:'xp',points});}
  ignite(seconds:number){this.send({t:'ignite',seconds});}
  addEffect(name:EffectName,seconds:number,level?:number){this.send({t:'effect',name,seconds,level:level??1});}
  teleport(x:number,y:number,z:number){this.x=x;this.y=y;this.z=z;this.send({t:'tp',x,y,z});}
}

interface Guest{
  entry:RosterEntry;view:RemoteView;avatar:Entity|null;ready:boolean;
  known:Map<number,string>;knownData:Map<number,string>;
  edits:RateLimit;actions:RateLimit;breaks:RateLimit;lastResync:number;
  containers:string[];sentContainers:Map<string,string>;
  record:GuestRecord;lastAct:number;
}

export class HostSession{
  private guests=new Map<string,Guest>();
  /** Guest progress by name (a dictionary without a prototype: names are untrusted). */
  private records:Record<string,GuestRecord>=Object.create(null) as Record<string,GuestRecord>;
  private blocks:number[]=[];private seq=0;private ticks=0;
  private locks=new Map<string,string>();
  private hostContainers:string[]=[];
  private off:(()=>void)[]=[];
  private paused=false;
  private tags:NameTags;
  readonly selfView:PlayerView;
  constructor(private game:Game,private room:Room,private hooks:NetHooks,localView:PlayerView){
    const self=room.self!;
    this.tags=new NameTags(game);
    // The local player as the room sees it (its id and name), backed by the local player.
    this.selfView=Object.create(localView,{id:{value:self.id},name:{value:self.name}}) as PlayerView;
    const saved=readMpSave();
    if(saved){for(const [k,v] of Object.entries(saved.guests).slice(0,MAX_RECORDS))if(v&&typeof v==='object')this.records[k]=v;hooks.restore(saved.world);}
    else hooks.freshWorld((crypto.getRandomValues(new Uint32Array(1))[0]>>>0)||1);
    const ev=game.events;
    this.off.push(
      ev.on('blockChanged',({x,y,z,to,cause})=>{if(cause!=='restore')this.blocks.push(x,y,z,to);}),
      ev.on('worldReset',()=>queueMicrotask(()=>{this.blocks.length=0;for(const g of this.guests.values())this.sendWorld(g);})),
      ev.on('settingsChanged',()=>this.broadcast({t:'settings',s:this.shared()})),
      ev.on('timeSkipped',()=>this.broadcast(this.time())),
      ev.on('stateChanged',()=>this.syncPause()),
      ev.on('shellPaused',()=>this.syncPause()),
      ev.on('containerOpened',({positions})=>this.hostOpened(positions))
    );
    this.off.push(room.on(e=>{
      if(e.type==='joined')this.join(e.player);
      else if(e.type==='left')this.leave(e.player.id);
      else if(e.type==='message')this.handle(e.from.id,e.data);
    }));
    this.syncPause();
  }
  get players():PlayerView[]{const out:PlayerView[]=[this.selfView];for(const g of this.guests.values())if(g.ready)out.push(g.view);return out;}
  player(id:string):PlayerView|undefined{return id===this.selfView.id?this.selfView:this.guests.get(id)?.view;}

  // ---- Pause ---------------------------------------------------------------------------------------------------------
  /** The room runs only while the host plays: a paused, hidden or menu-bound host pauses every guest. */
  private syncPause(){
    const running=!this.game.shellPaused&&(this.game.state==='playing'||this.game.state==='screen');
    if(this.paused===!running)return;
    this.paused=!running;this.room.setPaused(this.paused);
    // Pausing (Study Mode, a hidden tab, leaving) is also when the shared world is saved, like the single-player save.
    if(this.paused)this.save();
    if(!this.paused)for(const g of this.guests.values())if(g.ready)this.resync(g);
  }
  private resync(g:Guest){g.known.clear();g.knownData.clear();g.sentContainers.clear();this.send(g,this.time());this.send(g,{t:'settings',s:this.shared()});}

  // ---- Join and leave ------------------------------------------------------------------------------------------------
  private join(entry:RosterEntry){
    const send=(m:unknown)=>this.room.send(m,entry.id);
    const game=()=>this.game;
    // A second connection from the same peer replaces the first (its character is removed).
    const old=this.guests.get(entry.id);if(old?.avatar)this.game.entities.remove(old.avatar);
    const g:Guest={entry,view:new RemoteView(entry.id,entry.name,entry.seat,this.game,send),avatar:null,ready:false,known:new Map(),knownData:new Map(),
      edits:new RateLimit(40,160,performance.now()),actions:new RateLimit(20,80,performance.now()),
      breaks:new RateLimit(game().settings.mode==='creative'?20:8,game().settings.mode==='creative'?40:16,performance.now()),lastResync:0,
      containers:[],sentContainers:new Map(),record:this.records[entry.name]??{},lastAct:0};
    this.guests.set(entry.id,g);
    this.sendWorld(g);
    this.game.ui.toast(`${entry.name} joined the world`);
  }
  private leave(id:string){
    const g=this.guests.get(id);if(!g)return;
    this.guests.delete(id);
    for(const key of g.containers)if(this.locks.get(key)===id)this.locks.delete(key);
    if(g.avatar)this.game.entities.remove(g.avatar);
    this.remember(g.entry.name,{...g.record,player:{...(g.record.player as object??{}),x:g.view.x,y:g.view.y,z:g.view.z}});
    this.save();
    this.game.ui.toast(`${g.entry.name} left the world`);
  }
  /** Everything a guest needs before it enters: seed and generation version, edits, containers, time, weather, rules and
   *  where it stands. Block updates after this carry seq + 1 onwards. */
  private sendWorld(g:Guest){
    const game=this.game,p=game.player.state,spawn=p.spawn,rec=g.record;
    const at=rec.player as {x?:unknown;y?:unknown;z?:unknown}|undefined;
    const you=at&&isCoord(at.x)&&isCoord(at.y)&&isCoord(at.z)?{x:at.x as number,y:at.y as number,z:at.z as number}:{x:spawn.x+(g.entry.seat%2?1:-1),y:spawn.y,z:spawn.z+(g.entry.seat>1?1:-1)};
    const s=this.hooks.serialize() as {seed:number;time:unknown;edits:unknown;systems:Record<string,unknown>};
    g.view.x=you.x;g.view.y=you.y;g.view.z=you.z;g.view.lastReport=performance.now();
    this.send(g,{t:'world',seq:this.seq,seed:s.seed,gen:WORLD_GENERATION_VERSION,settings:this.shared(),time:s.time,
      weather:s.systems.weather??null,be:s.systems.blockEntities??null,edits:s.edits,spawn:{...spawn},you,
      record:rec.inventory||rec.survival||rec.player?{player:rec.player??null,inventory:rec.inventory??null,survival:rec.survival??null}:null});
    g.ready=true;g.known.clear();g.knownData.clear();
    if(!g.avatar||g.avatar.removed){
      g.avatar=game.entities.spawn(AVATAR_KIND,you.x,you.y,you.z,{data:{name:g.entry.name,color:SEAT_COLOURS[g.entry.seat%4],tx:you.x,ty:you.y,tz:you.z},reason:'event'});
    }
    this.send(g,this.time());
  }
  private shared(){const s=this.game.settings,out:Record<string,unknown>={};for(const k of SHARED_SETTINGS)out[k]=s[k];return out;}
  private time(){const t=this.game.time;return{t:'time',tick:t.tick,dayTime:t.dayTime,day:t.day,weather:(this.game.weather as {serialize?():unknown}).serialize?.()??null};}
  private send(g:Guest,m:unknown){this.room.send(m,g.entry.id);}
  private broadcast(m:unknown){for(const g of this.guests.values())if(g.ready)this.send(g,m);}

  // ---- Requests ----------------------------------------------------------------------------------------------------------
  private handle(id:string,data:unknown){
    const g=this.guests.get(id);if(!g||!data||typeof data!=='object')return;
    const m=data as Record<string,unknown>,now=performance.now();
    switch(m.t){
      case 'me':{
        const r=parseSelf(m);if(!r)return;
        g.view.report(r,now);
        for(const need of r.need){g.known.delete(need);g.knownData.delete(need);}
        const a=g.avatar;
        if(a&&!a.removed){a.data.tx=r.x;a.data.ty=r.y;a.data.tz=r.z;a.data.tyaw=r.yaw;a.data.tpitch=r.pitch;a.data.sneaking=r.sneaking;if(r.held)a.data.held=r.held;else delete a.data.held;}
        return;
      }
      case 'act':return this.act(g,m,now);
      case 'swing':{if(g.avatar)g.avatar.data.swing=6;return;}
      case 'hit':return this.hit(g,m,now);
      case 'drop':return this.drop(g,m,now);
      case 'xp':return this.xp(g,m,now);
      case 'spawn':return this.spawn(g,m,now);
      case 'open':return this.open(g,m);
      case 'close':return this.closeContainers(g);
      case 'slot':return this.slot(g,m);
      case 'save':{
        const size=JSON.stringify(m).length;if(size>64_000)return;
        g.record={player:cleanJson(m.player)??null,inventory:cleanJson(m.inventory)??null,survival:cleanJson(m.survival)??null};
        this.remember(g.entry.name,g.record);return;
      }
      case 'resync':{
        // A whole snapshot is expensive: at most one every 5 seconds per guest.
        if(now-g.lastResync<5000)return;
        g.lastResync=now;return this.sendWorld(g);
      }
    }
  }
  private refuse(g:Guest,n:unknown,list:readonly number[],stride:number,reason:EditRefusal){
    const cells:number[]=[];
    for(let i=0;i<list.length;i+=stride){const id=this.game.world.get(list[i],list[i+1],list[i+2]);if(id>=0)cells.push(list[i],list[i+1],list[i+2],id);}
    this.send(g,{t:'deny',n,cells,reason,message:REFUSAL_TEXT[reason]});
  }
  /** A guest's block action: every cell checked, then all applied (cause 'player', so fluids, supports and containers react)
   *  and the loot rolled here for what was mined. */
  private act(g:Guest,m:Record<string,unknown>,now:number){
    const list=m.edits;if(!validFlat(list,5,256)||!list.length)return;
    const held=stackOrNull(m.held);
    if(this.paused)return this.refuse(g,m.n,list,5,'paused');
    if(!g.edits.take(list.length/5,now))return this.refuse(g,m.n,list,5,'rate');
    const game=this.game,w=game.world,mode=game.settings.mode;
    const verdict=checkEdits(list,{world:w,player:g.view,held,mode,players:this.players});
    if(verdict)return this.refuse(g,m.n,list,5,verdict);
    let breaking=0;for(let i=0;i<list.length;i+=5)if(list[i+4]===AIR&&list[i+3]!==AIR&&!blockDef(list[i+3]).liquid)breaking++;
    if(breaking&&!g.breaks.take(breaking,now))return this.refuse(g,m.n,list,5,'rate');
    const mined:{x:number;y:number;z:number;id:number}[]=[];
    for(let i=0;i<list.length;i+=5){
      const x=list[i],y=list[i+1],z=list[i+2],from=list[i+3],to=list[i+4];
      if(!w.set(x,y,z,to,'player'))continue;
      const f=blockDef(from);
      if((to===AIR||blockDef(to).liquid&&f.family==='ice')&&from!==AIR&&!f.liquid)mined.push({x,y,z,id:from});
    }
    if(mode!=='survival')return;
    const r=()=>game.random();
    mined.forEach((b,i)=>{
      const tool=i===0?held:null;
      for(const s of game.interaction.blockDrops(b.id,tool,'player'))
        game.entities.dropItem(s,b.x+.5+(r()-.5)*.5,b.y+.5+(r()-.5)*.5-.125,b.z+.5+(r()-.5)*.5,{x:(r()*.2-.1)*20,y:4,z:(r()*.2-.1)*20});
      const xp=canHarvest(b.id,tool)?blockXp(b.id,r):0;
      if(xp>0)game.entities.dropXp(xp,b.x+.5,b.y+.5,b.z+.5);
    });
    if(g.avatar)g.avatar.data.swing=6;
  }
  private near(g:Guest,x:number,y:number,z:number,max:number){return Math.hypot(x-g.view.x,y-(g.view.y+1),z-g.view.z)<=max;}
  private hit(g:Guest,m:Record<string,unknown>,now:number){
    if(this.paused||g.view.dead||!g.actions.take(1,now))return;
    const e=typeof m.id==='number'?this.game.entities.byId(m.id):undefined;
    const amount=m.amount;
    if(!e||e.kind===AVATAR_KIND||typeof amount!=='number'||!(amount>=0&&amount<=40))return;
    if(Math.hypot(e.x-g.view.x,e.y+e.height/2-(g.view.y+1),e.z-g.view.z)>7)return;
    const kb=m.kb as {x?:unknown;z?:unknown;s?:unknown}|null;
    const knockback=kb&&typeof kb.x==='number'&&typeof kb.z==='number'&&typeof kb.s==='number'&&[kb.x,kb.z,kb.s].every(Number.isFinite)&&kb.s>=0&&kb.s<=16?{x:kb.x,z:kb.z,strength:kb.s}:undefined;
    this.game.entities.damage(e,amount,{kind:'player',byPlayer:true,player:g.view,knockback});
    if(g.avatar)g.avatar.data.swing=6;
  }
  private drop(g:Guest,m:Record<string,unknown>,now:number){
    const s=stackOrNull(m.stack);if(!s||!isCoord(m.x)||!isCoord(m.y)||!isCoord(m.z)||!g.actions.take(.25,now))return;
    if(!this.near(g,m.x,m.y,m.z,8))return;
    const v=m.v as Vec3|null;const vel=v&&[v.x,v.y,v.z].every(n=>typeof n==='number'&&Math.abs(n)<=40)?{x:v.x,y:v.y,z:v.z}:undefined;
    const delay=Number.isInteger(m.delay)&&(m.delay as number)>=0&&(m.delay as number)<=32767?m.delay as number:40;
    this.game.entities.dropItem({...s,count:Math.min(s.count,maxStack(s.id))},m.x,m.y,m.z,vel,delay);
  }
  private xp(g:Guest,m:Record<string,unknown>,now:number){
    const points=m.points;if(!Number.isInteger(points)||(points as number)<1||(points as number)>2000||!isCoord(m.x)||!isCoord(m.y)||!isCoord(m.z)||!g.actions.take(.5,now))return;
    if(this.near(g,m.x,m.y,m.z,8))this.game.entities.dropXp(points as number,m.x,m.y,m.z);
  }
  /** Projectiles a guest shot or threw, and mobs from spawn eggs. */
  private spawn(g:Guest,m:Record<string,unknown>,now:number){
    if(this.paused||g.view.dead||!g.actions.take(1,now))return;
    const kind=m.kind;if(typeof kind!=='string'||!isCoord(m.x)||!isCoord(m.y)||!isCoord(m.z)||!this.near(g,m.x,m.y,m.z,6))return;
    const projectile=PROJECTILES.has(kind);
    if(!projectile&&!ITEMS.has(`${kind}_spawn_egg`))return;
    const v=[m.vx,m.vy,m.vz];if(!v.every(n=>typeof n==='number'&&Math.abs(n)<=100))return;
    const raw=cleanJson(m.data),data:Record<string,unknown>=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw as Record<string,unknown>:{};
    if(projectile){
      data.owner='player';data.remote=g.entry.id;delete data.ownerId;
      if(kind==='arrow'){const d=data.damage;data.damage=typeof d==='number'&&d>=0&&d<=10?d:2;data.inGround=false;}
    }
    const e=this.game.entities.spawn(kind,m.x,m.y,m.z,{data:projectile?data:{},baby:!projectile&&m.baby===true,reason:projectile?'event':'egg',yaw:typeof m.yaw==='number'?m.yaw:0});
    if(e&&projectile){e.vx=m.vx as number;e.vy=m.vy as number;e.vz=m.vz as number;if(typeof m.pitch==='number')e.pitch=m.pitch;}
  }

  // ---- Containers -------------------------------------------------------------------------------------------------------
  /** One player at a time uses a chest or furnace (the host included), so two people never move the same stack. */
  private open(g:Guest,m:Record<string,unknown>){
    this.closeContainers(g);
    const list=Array.isArray(m.positions)?m.positions.slice(0,2):[];
    const keys:string[]=[];
    for(const p of list){
      if(!Array.isArray(p)||!isBlockPos(p[0],p[1],p[2])||!this.near(g,p[0]+.5,p[1]+.5,p[2]+.5,8))return this.send(g,{t:'busy',message:'That container is out of reach.'});
      const key=`${p[0]},${p[1]},${p[2]}`,owner=this.locks.get(key);
      if(owner&&owner!==g.entry.id||this.hostContainers.includes(key)){
        const name=owner?this.guests.get(owner)?.entry.name??'Someone':this.room.self?.name??'The host';
        return this.send(g,{t:'busy',message:`${name} is using that.`});
      }
      if(!this.game.blockEntities.get(p[0],p[1],p[2]))return this.send(g,{t:'busy',message:'That container is not there any more.'});
      keys.push(key);
    }
    for(const k of keys)this.locks.set(k,g.entry.id);
    g.containers=keys;g.sentContainers.clear();
    this.sendContainers(g);
  }
  private closeContainers(g:Guest){for(const k of g.containers)if(this.locks.get(k)===g.entry.id)this.locks.delete(k);g.containers=[];g.sentContainers.clear();}
  /** The guest using one of these containers, asked before the host's own screen opens. */
  busy(positions:readonly Vec3[]):string|null{
    const by=positions.map(p=>this.locks.get(`${p.x},${p.y},${p.z}`)).find(Boolean);
    return by?this.guests.get(by)?.entry.name??'A guest':null;
  }
  private hostOpened(positions:Vec3[]){this.hostContainers=positions.map(p=>`${p.x},${p.y},${p.z}`);}
  private entityAt(key:string):BlockEntity|undefined{const [x,y,z]=key.split(',').map(Number);return this.game.blockEntities.get(x,y,z);}
  private sendContainers(g:Guest,force=false){
    for(const key of g.containers){
      const e=this.entityAt(key);if(!e)continue;
      const json=JSON.stringify(e);
      if(!force&&g.sentContainers.get(key)===json)continue;
      g.sentContainers.set(key,json);
      this.send(g,{t:'be',pos:key.split(',').map(Number),entity:JSON.parse(json)});
    }
  }
  /** A slot change from the guest's open screen, applied as a count delta so the furnace's own progress is not lost. */
  private slot(g:Guest,m:Record<string,unknown>){
    const pos=m.pos;if(!Array.isArray(pos)||!isBlockPos(pos[0],pos[1],pos[2]))return;
    const key=`${pos[0]},${pos[1]},${pos[2]}`;
    if(!g.containers.includes(key)||this.paused){this.sendContainers(g,true);return;}
    const e=this.entityAt(key),slot=parseSlotName(m.slot);if(!e||slot===null){this.sendContainers(g,true);return;}
    if(slot==='xp'){
      if(e.kind==='furnace'&&typeof m.before==='number'&&typeof m.after==='number'&&m.after<=m.before)e.xp=Math.max(0,e.xp-(m.before-m.after));
      this.sendContainers(g,true);return;
    }
    const before=stackOrNull(m.before),after=stackOrNull(m.after);
    const get=():ItemStack|null=>e.kind==='chest'?typeof slot==='number'?e.items[slot]??null:null:typeof slot==='string'?e[slot as 'input'|'fuel'|'output']:null;
    const set=(s:ItemStack|null)=>{if(e.kind==='chest'&&typeof slot==='number')e.items[slot]=s;else if(e.kind==='furnace'&&typeof slot==='string')e[slot as 'input'|'fuel'|'output']=s;};
    if((e.kind==='chest')!==(typeof slot==='number')){this.sendContainers(g,true);return;}
    const next=applyDelta(get(),before,after);
    if(next!==undefined)set(next);
    this.sendContainers(g,true);
  }

  // ---- Streams ------------------------------------------------------------------------------------------------------------
  tick(){
    this.ticks++;
    if(this.blocks.length){
      this.seq++;const c=this.blocks.splice(0);
      this.broadcast({t:'blocks',seq:this.seq,c});
    }
    for(const g of this.guests.values()){if(g.ready)g.view.flushPush();}
    if(this.ticks%2===0){this.sendPlayers();for(const g of this.guests.values())if(g.ready)this.sendEntities(g,this.ticks%10===0);}
    if(this.ticks%10===0)this.broadcast(this.time());
    if(this.ticks%5===0)for(const g of this.guests.values())if(g.ready)this.sendContainers(g);
    if(this.ticks%200===0)this.save();
    if(this.hostContainers.length&&this.game.ui.screen!=='chest'&&this.game.ui.screen!=='furnace')this.hostContainers=[];
    this.hooks.setExtraCentres([...this.guests.values()].filter(g=>g.ready).map(g=>({x:g.view.x,z:g.view.z})));
  }
  /** Guests' name tags and health over their characters. */
  frame(){
    const list=[];
    for(const g of this.guests.values())if(g.avatar&&!g.avatar.removed)list.push({entity:g.avatar,name:g.entry.name,health:g.view.health,away:!g.view.targetable&&!g.view.dead&&this.game.settings.mode==='survival',dead:g.view.dead});
    this.tags.frame(list);
  }
  private sendPlayers(){
    const game=this.game,p=game.player.state,self=this.room.self!;
    const list:PlayerState[]=[{id:self.id,name:self.name,seat:0,x:r1(p.x),y:r1(p.y),z:r1(p.z),yaw:r1(p.yaw),pitch:r1(p.pitch),health:game.survival.health,
      dead:game.survival.dead,sneaking:p.sneaking,away:this.paused,held:game.inventory.held()?.id??null}];
    for(const g of this.guests.values()){
      if(!g.ready)continue;const v=g.view;
      list.push({id:g.entry.id,name:g.entry.name,seat:g.entry.seat,x:r1(v.x),y:r1(v.y),z:r1(v.z),yaw:r1(v.yaw),pitch:r1(v.pitch),health:v.health,dead:v.dead,
        sneaking:v.sneaking,away:!v.targetable&&!v.dead&&game.settings.mode==='survival',held:v.held});
    }
    this.broadcast({t:'players',p:list});
  }
  /** New entities near the guest in full, then only states that changed, data when it changed, and those gone. */
  private sendEntities(g:Guest,checkData:boolean){
    const s:unknown[]=[],u:unknown[]=[],d:unknown[]=[],seen=new Set<number>();
    const gx=g.view.x,gz=g.view.z,r2=ENTITY_RANGE*ENTITY_RANGE;
    for(const e of this.game.entities.all()){
      if(e.removed||e.kind===AVATAR_KIND||(e.x-gx)**2+(e.z-gz)**2>r2)continue;
      seen.add(e.id);
      const packed=packState(e.id,e),key=packed.join(',');
      const old=g.known.get(e.id);
      if(old===undefined){
        const data=JSON.stringify(cleanJson(e.data)??{});
        s.push([packed,e.kind,JSON.parse(data)]);g.known.set(e.id,key);g.knownData.set(e.id,data);
      }else{
        if(old!==key){u.push(packed);g.known.set(e.id,key);}
        if(checkData){const data=JSON.stringify(cleanJson(e.data)??{});if(data!==g.knownData.get(e.id)){d.push([e.id,JSON.parse(data)]);g.knownData.set(e.id,data);}}
      }
    }
    const gone:number[]=[];
    for(const id of g.known.keys())if(!seen.has(id)){gone.push(id);g.known.delete(id);g.knownData.delete(id);}
    if(s.length||u.length||d.length||gone.length)this.send(g,{t:'ents',s,u,d,g:gone});
  }

  // ---- Persistence ----------------------------------------------------------------------------------------------------------
  /** Keeps a guest's progress (at most MAX_RECORDS names, the oldest forgotten first). */
  private remember(name:string,record:GuestRecord){
    delete this.records[name];this.records[name]=record;
    const names=Object.keys(this.records);
    for(let i=0;i<names.length-MAX_RECORDS;i++)delete this.records[names[i]];
  }
  /** The shared world, saved on this (the host's) device apart from the single-player world. */
  save(){
    try{store.write(MP_SAVE_KEY,{v:SAVE_VERSION,world:this.hooks.serialize(),guests:this.records});}catch{/* storage full: keep playing */}
  }
  dispose(){
    for(const g of this.guests.values()){if(g.avatar)this.game.entities.remove(g.avatar);this.remember(g.entry.name,{...g.record,player:{...(g.record.player as object??{}),x:g.view.x,y:g.view.y,z:g.view.z}});}
    this.save();
    for(const off of this.off.splice(0))off();
    this.guests.clear();this.locks.clear();this.tags.dispose();
    this.hooks.setExtraCentres([]);
  }
}

/** Applies a guest's before → after change of one slot to the host's current stack. Returns the new stack, or undefined
 *  to refuse (the guest then gets the host's contents back). */
export function applyDelta(current:ItemStack|null,before:ItemStack|null,after:ItemStack|null):ItemStack|null|undefined{
  const same=(a:ItemStack|null,b:ItemStack|null)=>a===b||!!a&&!!b&&a.id===b.id&&a.count===b.count&&(a.damage??0)===(b.damage??0);
  if(same(current,before))return after;
  const max=(s:ItemStack)=>itemDef(s.id)?.maxStack??64;
  // The same item, a different count (the furnace smelted or burned meanwhile): apply the difference.
  if(current&&before&&current.id===before.id&&(!after||after.id===before.id)){
    const n=current.count+((after?.count??0)-before.count);
    if(n<0||n>max(current))return undefined;
    return n===0?null:{...current,count:n};
  }
  if(!current&&!before)return after;
  if(current&&!before&&after&&after.id===current.id){const n=current.count+after.count;return n<=max(current)?{...current,count:n}:undefined;}
  return undefined;
}
