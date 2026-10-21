// Test harness for the interaction area: a fake game (helpers/fake-game.ts) with contract-faithful recording
// stand-ins for the inventory, entities, survival, renderer and UI, plus helpers to aim and drive input.
import {createFakeGame,type FakeGame} from './helpers/fake-game';
import {mulberry32} from '../../../src/games/blockcraft/world/noise';
import {itemDef,maxStack,sameItem,stack,MOB_KINDS,type ItemStack} from '../../../src/games/blockcraft/data/items';
import {rayBox} from '../../../src/games/blockcraft/engine/physics';
import {OUTLINE_BOX} from '../../../src/games/blockcraft/data/blocks';
import {createInteraction} from '../../../src/games/blockcraft/interact/interaction';
import type {DamageSource,Entity,EntityCategory,EntityKind,EntityService,FoodStats,InputAction,InteractionService,InventoryService,
  ParticleKind,ParticleOptions,RenderService,SpawnReason,SurvivalService,UIService,ScreenId,Vec3} from '../../../src/games/blockcraft/engine/contracts';

export const seeded=(seed:number)=>mulberry32(seed);

export interface TestInventory extends InventoryService{slots:(ItemStack|null)[];offhand:ItemStack|null;selected:number;
  consumed:number;damaged:number}
export function createTestInventory(game:FakeGame):TestInventory{
  const slots:(ItemStack|null)[]=new Array(36).fill(null),armor:(ItemStack|null)[]=[null,null,null,null];
  const creative=()=>game.settings.mode==='creative';
  const inv:TestInventory={slots,armor,offhand:null,selected:0,consumed:0,damaged:0,
    held:()=>slots[inv.selected],select(i){inv.selected=((i%9)+9)%9;},
    add(s){
      let left=s.count;const limit=maxStack(s.id);
      for(let i=0;i<36&&left>0;i++){const t=slots[i];if(t&&sameItem(t,s)&&t.count<limit){const n=Math.min(left,limit-t.count);t.count+=n;left-=n;}}
      for(let i=0;i<36&&left>0;i++)if(!slots[i]){const n=Math.min(left,limit);slots[i]={...s,count:n};left-=n;}
      return left;
    },
    consumeHeld(n=1){
      if(creative())return;const h=slots[inv.selected];if(!h)return;inv.consumed+=n;
      const rest=itemDef(h.id)?.remainder;h.count-=n;
      if(h.count<=0)slots[inv.selected]=rest?stack(rest):null;else if(rest)inv.add(stack(rest));
    },
    damageHeld(n=1){
      if(creative())return;const h=slots[inv.selected],max=h&&itemDef(h.id)?.durability;if(!h||!max)return;inv.damaged+=n;
      h.damage=(h.damage??0)+n;if(h.damage>=max){slots[inv.selected]=null;game.sounds.play('tool_break');}
    },
    damageArmor(){},armorIn:()=>null,setArmor:()=>true,
    setOffhand(s){inv.offhand=s;},swapHands(){const h=slots[inv.selected];slots[inv.selected]=inv.offhand;inv.offhand=h;},
    count:id=>slots.reduce((n,s)=>n+(s?.id===id?s.count:0),0)+(inv.offhand?.id===id?inv.offhand.count:0),
    remove(id,count){let left=count;for(let i=0;i<36&&left>0;i++){const s=slots[i];if(s?.id===id){const k=Math.min(left,s.count);s.count-=k;left-=k;if(!s.count)slots[i]=null;}}return count-left;},
    setSlot(i,s){slots[i]=s;},dropHeld(){},dropAll(){},clear(){slots.fill(null);inv.offhand=null;},onChange:()=>()=>{}
  };
  return inv;
}

export interface Drop{stack:ItemStack;x:number;y:number;z:number;velocity?:Vec3;pickupDelay?:number}
export interface TestEntities extends EntityService{list:Entity[];drops:Drop[];xp:number[];hits:{entity:Entity;amount:number;source:DamageSource}[];
  spawned:{entity:Entity;reason:SpawnReason}[];add(kind:string,x:number,y:number,z:number,extra?:Partial<Entity>):Entity}
const CATEGORY:Record<string,EntityCategory>={cow:'passive',pig:'passive',sheep:'passive',chicken:'passive',rabbit:'passive',wolf:'passive',squid:'water',
  zombie:'hostile',husk:'hostile',drowned:'hostile',skeleton:'hostile',stray:'hostile',creeper:'hostile',spider:'hostile',enderman:'hostile',slime:'hostile',
  arrow:'projectile',snowball:'projectile',egg:'projectile',ender_pearl:'projectile',primed_tnt:'misc',falling_block:'misc',item:'item',xp_orb:'xp'};
export function createTestEntities(game:FakeGame):TestEntities{
  const kinds=new Map<string,EntityKind>(),list:Entity[]=[];let next=1;
  for(const [kind,category] of Object.entries(CATEGORY))kinds.set(kind,{kind,category,width:category==='projectile'?.25:.9,height:category==='projectile'?.25:1.4,maxHealth:10});
  const pickable=(e:Entity)=>{const k=kinds.get(e.kind);return k?.pickable??(e.category==='passive'||e.category==='hostile'||e.category==='water');};
  function make(kind:string,x:number,y:number,z:number,o:{data?:Record<string,unknown>;baby?:boolean;yaw?:number}={}):Entity{
    const k=kinds.get(kind)!;
    return{id:next++,kind,category:k.category,x,y,z,vx:0,vy:0,vz:0,yaw:o.yaw??0,pitch:0,headYaw:o.yaw??0,moveX:0,moveZ:0,jump:false,width:k.width,height:k.height,
      onGround:true,inWater:false,inLava:false,collidedH:false,collidedV:false,health:k.maxHealth,maxHealth:k.maxHealth,age:0,hurtTime:0,deathTime:0,removed:false,fire:0,
      baby:!!o.baby,data:o.data??{}};
  }
  const s:TestEntities={list,drops:[],xp:[],hits:[],spawned:[],
    ai:game.entities.ai,register(k){kinds.set(k.kind,k);},kinds:()=>[...kinds.values()],kind:n=>kinds.get(n),
    spawn(kind,x,y,z,o={}){if(!kinds.has(kind))return null;const e=make(kind,x,y,z,o);list.push(e);s.spawned.push({entity:e,reason:o.reason??'event'});
      kinds.get(kind)!.init?.(e,game,o.reason??'event');return e;},
    add(kind,x,y,z,extra={}){const e=Object.assign(make(kind,x,y,z),extra);list.push(e);return e;},
    remove(e){e.removed=true;},byId:id=>list.find(e=>e.id===id),all:()=>list,
    near(x,y,z,r,filter,out=[]){out.length=0;for(const e of list)if(!e.removed&&Math.hypot(e.x-x,e.y+e.height/2-y,e.z-z)<=r+e.width&&(!filter||filter(e)))out.push(e);return out;},
    raycast(o,d,max,ignore){
      let best:{entity:Entity;distance:number}|null=null;
      for(const e of list){if(e.removed||e===ignore||e.deathTime>0||!pickable(e))continue;const hw=e.width/2,t=rayBox(o.x,o.y,o.z,d.x,d.y,d.z,e.x-hw,e.y,e.z-hw,e.x+hw,e.y+e.height,e.z+hw);
        if(t>=0&&t<=max&&(!best||t<best.distance))best={entity:e,distance:t};}
      return best;
    },
    damage(e,amount,source){if(e.removed||e.hurtTime>0||e.deathTime>0)return false;s.hits.push({entity:e,amount,source});e.health-=amount;e.hurtTime=10;
      if(e.health<=0)e.deathTime=1;return true;},
    dropItem(st,x,y,z,velocity,pickupDelay){s.drops.push({stack:{...st},x,y,z,velocity,pickupDelay});},
    dropXp(points){s.xp.push(points);},count:c=>list.filter(e=>!e.removed&&e.category===c).length
  };
  return s;
}

export interface TestSurvival extends SurvivalService{exhaustion:number;eaten:FoodStats[];cleared:number;hungry:boolean}
function createTestSurvival(game:FakeGame):TestSurvival{
  const base=game.survival;
  const s:TestSurvival=Object.assign(Object.create(null),base,{exhaustion:0,eaten:[] as FoodStats[],cleared:0,hungry:true,
    addExhaustion(n:number){if(game.settings.mode!=='creative')s.exhaustion+=n;},
    eat(f:FoodStats){s.eaten.push(f);},canEat:(f:FoodStats)=>s.hungry||!!f.always,clearEffects(){s.cleared++;}}) as TestSurvival;
  return s;
}

export interface Box{minX:number;minY:number;minZ:number;maxX:number;maxY:number;maxZ:number}
export interface RenderLog{selection:Box|null;breaking:{pos:Vec3|null;stage:number};particles:{kind:ParticleKind;x:number;y:number;z:number;options?:ParticleOptions}[];
  swings:number;fov:number[]}
function createTestRender(game:FakeGame,log:RenderLog):RenderService{
  return Object.assign(Object.create(null),game.render,{
    setSelection(b:Box|null){log.selection=b?{...b}:null;},setBreaking(pos:Vec3|null,stage:number){log.breaking={pos:pos?{x:pos.x,y:pos.y,z:pos.z}:null,stage};},
    spawnParticles(kind:ParticleKind,x:number,y:number,z:number,options?:ParticleOptions){log.particles.push({kind,x,y,z,options});},
    swing(){log.swings++;},setFovScale(f:number){log.fov.push(f);}}) as RenderService;
}

export interface Harness{
  game:FakeGame;inv:TestInventory;ents:TestEntities;surv:TestSurvival;log:RenderLog;opened:{id:ScreenId;at?:Vec3}[];
  interaction:InteractionService;
  /** Puts `id` in the selected hotbar slot (count defaults to 1, or maxStack when `full`). */
  hold(id:string|null,count?:number):void;
  /** Feet position and look at a world point. */
  stand(x:number,y:number,z:number):void;
  lookAt(x:number,y:number,z:number):void;
  /** Look at the centre of a face of block (x,y,z): face as a normal. */
  aimFace(x:number,y:number,z:number,nx:number,ny:number,nz:number,fraction?:{u?:number;v?:number}):void;
  /** One engine step: interaction.frame then one tick. */
  step(n?:number):void;
  press(action:InputAction):void;
  down(action:InputAction,held?:boolean):void;
  /** Click (press edge + held for one step, then released). */
  click(action:InputAction):void;
  sounds():string[];
}
export function createHarness(options:{mode?:'survival'|'creative';ground?:number;block?:number;seed?:number}={}):Harness{
  const game=createFakeGame({mode:options.mode,random:seeded(options.seed??1)});
  // The engine's random() is a method that needs its `this`: catch callers that pass it around unbound.
  const rng=seeded(options.seed??1);
  game.random=function(this:unknown){if(this!==game)throw new Error('game.random called unbound');return rng();};
  game.flat(options.ground??60,options.block,1);
  const inv=createTestInventory(game);game.inventory=inv;
  const ents=createTestEntities(game);game.entities=ents;
  const surv=createTestSurvival(game);game.survival=surv;
  const log:RenderLog={selection:null,breaking:{pos:null,stage:-1},particles:[],swings:0,fov:[]};
  game.render=createTestRender(game,log);
  const opened:{id:ScreenId;at?:Vec3}[]=[];
  game.ui=Object.assign(Object.create(null),game.ui,{open(id:ScreenId,at?:Vec3){opened.push({id,at:at?{x:at.x,y:at.y,z:at.z}:undefined});}}) as UIService;
  const p=game.player.state;p.x=.5;p.y=options.ground??60;p.z=.5;p.onGround=true;
  const interaction=createInteraction(game);game.interaction=interaction;interaction.init?.();
  const h:Harness={game,inv,ents,surv,log,opened,interaction,
    hold(id,count=1){inv.slots[inv.selected]=id?stack(id,count):null;},
    stand(x,y,z){p.x=x;p.y=y;p.z=z;},
    lookAt(x,y,z){const e=game.player.eye(),dx=x-e.x,dy=y-e.y,dz=z-e.z;p.yaw=Math.atan2(-dx,-dz);p.pitch=Math.atan2(dy,Math.hypot(dx,dz));},
    aimFace(x,y,z,nx,ny,nz,f={}){
      // Aims at a point on the face of the block's outline box: u/v are fractions across the face (default centre).
      const id=game.world.get(x,y,z),o=id>0&&OUTLINE_BOX[id].length?OUTLINE_BOX[id]:[0,0,0,1,1,1],u=f.u??.5,v=f.v??.5;
      const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
      const px=nx?(nx>0?o[3]:o[0]):lerp(o[0],o[3],u),py=ny?(ny>0?o[4]:o[1]):lerp(o[1],o[4],v),pz=nz?(nz>0?o[5]:o[2]):lerp(o[2],o[5],ny?v:u);
      h.lookAt(x+px-nx*1e-3,y+py-ny*1e-3,z+pz-nz*1e-3);
    },
    step(n=1){for(let i=0;i<n;i++){interaction.frame?.(1/20);game.runTicks(1,[interaction]);}},
    press(a){game.queued.add(a);},
    down(a,held=true){if(held)game.held.add(a);else game.held.delete(a);},
    click(a){game.queued.add(a);game.held.add(a);h.step();game.held.delete(a);},
    sounds:()=>game.sounds.played.map(s=>s.name)
  };
  return h;
}
export {MOB_KINDS};
