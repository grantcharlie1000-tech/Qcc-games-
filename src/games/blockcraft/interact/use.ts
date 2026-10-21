// Right-click behaviour (vanilla Java 1.20): block use (screens, doors, beds, TNT), item use on a block (hoe, bone meal,
// flint and steel, spawn eggs, seeds, axe scraping, placement) and item use in the air (buckets, food, milk, bows,
// shields, throwables, lily pads).
import {AIR,B,COLLISION_BOXES,FACING_VECTOR,FULL_CUBE,OPAQUE,blockDef,blockId,familyStates,isLiquid,stateFor,type BlockDef,type BlockId,type WoodType} from '../data/blocks';
import {BIOMES} from '../data/biomes';
import {itemDef,stack,type ItemDef,type ItemStack} from '../data/items';
import {DAY_TICKS} from '../engine/constants';
import {canSurvive} from '../engine/support';
import type {Entity,Game,TreeKind,Vec3} from '../engine/contracts';
import {between,lootDrops} from './loot';
import {applyPlan,obstructed,placeBlock,type Cell} from './placement';
import {fillHand,isSource,lookHit,type Hand,type Hit,type Result} from './use-hands';

/** game.random as a free function (the engine's random() is a method). */
const rng=(game:Game)=>()=>game.random();

// ---- Using items over time (eating, drinking, drawing a bow, raising a shield) --------------------------------------
export type UseKind='eat'|'drink'|'bow'|'shield';
export interface ItemUse{item:string;hand:Hand;kind:UseKind;ticks:number;duration:number}
/** Vanilla use durations in ticks: food 32 (1.6 s), bows and shields until released. */
export const BOW_FULL_TICKS=20,SHIELD_READY_TICKS=5,USE_FOREVER=72000;
/** Bow power from ticks drawn (vanilla BowItem.getPowerForTime). */
export function bowPower(ticks:number):number{const f=ticks/20;return Math.min(1,(f*f+f*2)/3);}
export function useProgress(u:ItemUse,partial=0):number{
  const t=u.ticks+partial;
  return u.kind==='bow'?Math.min(1,t/BOW_FULL_TICKS):u.kind==='shield'?Math.min(1,t/SHIELD_READY_TICKS):Math.min(1,t/u.duration);
}
/** One step of using an item: chewing effects every 4 ticks after the first 7, completion when the time is up.
 *  Returns false when the use ended. */
export function tickItemUse(game:Game,u:ItemUse):boolean{
  const s=u.hand.get();if(!s||s.id!==u.item)return false;
  const remaining=u.duration-u.ticks;
  u.ticks++;
  if(u.kind==='eat'||u.kind==='drink'){
    if(remaining<=u.duration-7&&remaining%4===0)useEffects(game,u,5);
    if(u.ticks>=u.duration){finishEating(game,u);return false;}
  }
  return true;
}
function mouth(game:Game):Vec3{const e=game.player.eye(),l=game.player.look();return{x:e.x+l.x*.5,y:e.y+l.y*.5-.15,z:e.z+l.z*.5};}
function useEffects(game:Game,u:ItemUse,particles:number){
  const at=mouth(game),r=rng(game);
  if(u.kind==='drink'){game.sounds.play('drink',at,{volume:.5,pitch:r()*.1+.9});return;}
  game.sounds.play('eat',at,{volume:.5+.5*(r()<.5?0:1),pitch:(r()-r())*.2+1});
  game.render.spawnParticles('item',at.x,at.y,at.z,{item:u.item,count:particles,spread:.1,velocity:{x:0,y:1,z:0}});
}
function finishEating(game:Game,u:ItemUse){
  useEffects(game,u,16);
  const food=itemDef(u.item)?.food;if(!food)return;
  game.survival.eat(food);
  if(food.clearsEffects)game.survival.clearEffects();
  u.hand.consume(1);
  game.events.emit('itemConsumed',{stack:stack(u.item)});
}
/** Letting go of use: a drawn bow shoots. */
export function releaseItemUse(game:Game,u:ItemUse):void{
  if(u.kind==='bow')shootBow(game,u.hand,u.ticks);
}

// ---- Projectiles --------------------------------------------------------------------------------------------------
/** Spawns a player projectile from the eye (vanilla Projectile.shootFromRotation): direction plus triangular spread,
 *  `speed` blocks/second, plus the player's motion (vertical only while airborne). */
export function launchProjectile(game:Game,kind:string,speed:number,inaccuracy:number,data:Record<string,unknown>):Entity|null{
  const p=game.player.state,eye=game.player.eye(),l=game.player.look(),r=rng(game);
  const spread=()=>(r()-r())*.0172275*inaccuracy;
  const len=Math.hypot(l.x,l.y,l.z)||1;
  const dx=l.x/len+spread(),dy=l.y/len+spread(),dz=l.z/len+spread();
  const e=game.entities.spawn(kind,eye.x,eye.y-.1,eye.z,{data:{owner:'player',...data},reason:'event',yaw:p.yaw});
  if(!e)return null;
  e.vx=dx*speed+p.vx;e.vy=dy*speed+(p.onGround?0:p.vy);e.vz=dz*speed+p.vz;
  e.yaw=p.yaw;e.pitch=p.pitch;
  return e;
}
/** Snowballs, eggs and ender pearls: 1.5 blocks/tick (30 blocks/second). */
export const THROW_SPEED=30;
function throwItem(game:Game,hand:Hand,kind:'snowball'|'egg'|'ender_pearl',cooldowns:Map<string,number>):Result{
  if(!launchProjectile(game,kind,THROW_SPEED,1,{}))return 'pass';
  game.sounds.play('throw',game.player.state,{volume:.5,pitch:.4/(game.random()*.4+.8)});
  if(kind==='ender_pearl')cooldowns.set('ender_pearl',20);
  hand.consume(1);
  return 'success';
}
const hasArrow=(game:Game)=>game.inventory.offhand?.id==='arrow'||game.inventory.count('arrow')>0;
function shootBow(game:Game,hand:Hand,ticks:number){
  const power=bowPower(ticks),creative=game.settings.mode==='creative';
  if(power<.1||!creative&&!hasArrow(game))return;
  // Vanilla: velocity power × 3 blocks/tick, base damage 2, a full draw is critical; creative arrows cannot be picked up.
  const e=launchProjectile(game,'arrow',power*60,1,{damage:2,pickup:!creative,crit:power>=1,inGround:false});
  if(!e)return;
  game.sounds.play('bow',game.player.state,{pitch:1/(game.random()*.4+1.2)+power*.5});
  hand.damage(1);
  if(!creative){
    const off=game.inventory.offhand;
    if(off?.id==='arrow')game.inventory.setOffhand(off.count>1?{...off,count:off.count-1}:null);
    else game.inventory.remove('arrow',1);
  }
}

// ---- Block use ----------------------------------------------------------------------------------------------------
/** Can the player sleep now: dayTime 12542..23459 (night), or during a thunderstorm. */
export const canSleepNow=(game:Game)=>{const t=game.time.dayTime%DAY_TICKS;return t>=12542&&t<=23459||game.weather.state==='thunder';};
export const SLEEP_MESSAGES={day:'You can sleep only at night',monsters:'You may not rest now; there are monsters nearby',
  far:'You may not rest now; the bed is too far away',obstructed:'This bed is obstructed',spawn:'Respawn point set'} as const;
const monsters:Entity[]=[];
/** BedBlock.use + ServerPlayer.startSleepInBed: range and obstruction checks, then the respawn point is set; sleeping needs
 *  night (or thunder) and no monsters within 8 blocks (5 vertically) in survival. Sleeping skips to morning. */
export function useBed(game:Game,x:number,y:number,z:number):void{
  const w=game.world,d=blockDef(w.get(x,y,z));if(!d.bed||!d.facing)return;
  const [fx,fz]=FACING_VECTOR[d.facing];
  let hx=x,hz=z;
  if(d.bed.part==='foot'){hx=x-fx;hz=z-fz;if(blockDef(w.get(hx,y,hz)).family!=='bed')return;}
  const p=game.player.state;
  const reach=(bx:number,bz:number)=>Math.abs(p.x-(bx+.5))<=3&&Math.abs(p.y-y)<=2&&Math.abs(p.z-(bz+.5))<=3;
  if(!reach(hx,hz)&&!reach(hx+fx,hz+fz)){game.ui.toast(SLEEP_MESSAGES.far);return;}
  const free=(bx:number,bz:number)=>{const a=w.get(bx,y+1,bz);return a<0||!OPAQUE[a];};
  if(!free(hx,hz)||!free(hx+fx,hz+fz)){game.ui.toast(SLEEP_MESSAGES.obstructed);return;}
  const old=p.bedSpawn,changed=!old||old.x!==hx||old.y!==y||old.z!==hz;
  p.bedSpawn={x:hx,y,z:hz};
  if(!canSleepNow(game)){game.ui.toast(SLEEP_MESSAGES.day);return;}
  if(game.settings.mode!=='creative'){
    const cx=hx+.5,cz=hz+.5;
    game.entities.near(cx,y,cz,12,e=>e.category==='hostile'&&e.kind!=='slime'&&!e.removed&&e.deathTime===0&&
      Math.abs(e.x-cx)<=8&&Math.abs(e.z-cz)<=8&&e.y<=y+5&&e.y+e.height>=y-5,monsters);
    const found=monsters.length>0;monsters.length=0;
    if(found){game.ui.toast(SLEEP_MESSAGES.monsters);return;}
  }
  if(changed)game.ui.toast(SLEEP_MESSAGES.spawn);
  game.skipTime(0);
  game.events.emit('playerSlept',{});
}
/** Opens or closes both halves of a door. */
export function toggleDoor(game:Game,x:number,y:number,z:number):boolean{
  const w=game.world,d=blockDef(w.get(x,y,z));if(!d.door||!d.facing)return false;
  const lowerY=d.door.half==='lower'?y:y-1,open=!d.door.open;
  for(const [cy,half] of [[lowerY,'lower'],[lowerY+1,'upper']] as const){
    const c=blockDef(w.get(x,cy,z));
    if(c.family===d.family&&c.door?.half===half)w.set(x,cy,z,stateFor(d.family,{half,open,facing:c.facing})!.id,'player');
  }
  game.sounds.play(open?'door_open':'door_close',{x:x+.5,y:lowerY+1,z:z+.5},{pitch:game.random()*.1+.9});
  return true;
}
/** Lights TNT: the block becomes a primed_tnt entity with an 80-tick fuse and a small random hop. */
export function primeTnt(game:Game,x:number,y:number,z:number,byPlayer:boolean):boolean{
  const w=game.world;if(blockDef(w.get(x,y,z)).family!=='tnt')return false;
  const e=game.entities.spawn('primed_tnt',x+.5,y,z+.5,{data:{fuse:80,byPlayer},reason:'event'});
  if(!e)return false;
  if(!w.set(x,y,z,AIR,'player')){game.entities.remove(e);return false;}
  const a=game.random()*Math.PI*2;e.vx=-Math.sin(a)*.4;e.vy=4;e.vz=-Math.cos(a)*.4;
  game.sounds.play('fuse',{x:x+.5,y:y+.5,z:z+.5});
  return true;
}
/** Block.use for the clicked block: screens, doors, beds, TNT lit with flint and steel. */
export function useBlock(game:Game,hand:Hand,hit:Hit):Result{
  const w=game.world,{x,y,z}=hit,d=blockDef(w.get(x,y,z)),at={x,y,z};
  if(d.family==='crafting_table'){game.ui.open('crafting_table',at);return 'success';}
  if(d.family==='furnace'){game.ui.open('furnace',at);return 'success';}
  if(d.family==='chest'){
    // A chest cannot open under an opaque block.
    const above=w.get(x,y+1,z);if(above<=0||!OPAQUE[above])game.ui.open('chest',at);
    return 'success';
  }
  if(d.family==='barrel'){game.ui.open('chest',at);return 'success';}
  if(d.door){toggleDoor(game,x,y,z);return 'success';}
  if(d.bed){useBed(game,x,y,z);return 'success';}
  if(d.family==='tnt'&&hand.get()?.id==='flint_and_steel'){
    if(primeTnt(game,x,y,z,true)){hand.damage(1);return 'success';}
  }
  return 'pass';
}

// ---- Item use on a block ------------------------------------------------------------------------------------------
const TILLABLE:Record<string,string>={grass_block:'farmland',dirt:'farmland',coarse_dirt:'dirt'};
const SCRAPE:Record<string,string>={exposed_copper:'copper_block',weathered_copper:'exposed_copper',oxidized_copper:'weathered_copper'};
/** Item.useOn for the hand's item. */
export function useItemOn(game:Game,hand:Hand,hit:Hit,s:ItemStack):Result{
  const def=itemDef(s.id);if(!def)return 'pass';
  const w=game.world,{x,y,z}=hit,block=blockDef(w.get(x,y,z));
  switch(def.use){
    case 'flint_and_steel':{
      const fx=x+hit.nx,fy=y+hit.ny,fz=z+hit.nz,fire=blockId('fire');
      if(w.get(fx,fy,fz)!==AIR||!canSurvive(w,fire,fx,fy,fz)||!w.set(fx,fy,fz,fire,'player'))return 'fail';
      game.sounds.play('ignite',{x:fx+.5,y:fy+.5,z:fz+.5},{pitch:game.random()*.4+.8});
      hand.damage(1);return 'success';
    }
    case 'hoe':{
      const to=TILLABLE[block.family];
      if(!to||hit.ny===-1||w.get(x,y+1,z)!==AIR||!w.set(x,y,z,blockId(to),'player'))return 'pass';
      game.sounds.play('place:gravel',{x:x+.5,y:y+1,z:z+.5});
      hand.damage(1);return 'success';
    }
    case 'bone_meal':{
      if(!boneMeal(game,x,y,z))return 'pass';
      hand.consume(1);return 'success';
    }
    case 'spawn_egg':return spawnEggOn(game,hand,hit,def);
  }
  if(def.tool?.kind==='axe'&&SCRAPE[block.family]){
    if(!w.set(x,y,z,blockId(SCRAPE[block.family]),'player'))return 'pass';
    game.sounds.play('hit:metal',{x:x+.5,y:y+.5,z:z+.5});
    game.render.spawnParticles('spell',x+.5,y+.5,z+.5,{count:12,spread:.55,color:0xd8f0e8});
    hand.damage(1);return 'success';
  }
  if(def.places&&def.places!=='lily_pad'){
    const r=placeBlock(game,hand,hit,def.places);
    // Carrots and potatoes are eaten when they cannot be planted.
    return r==='fail'&&def.food?'pass':r;
  }
  return 'pass';
}
function spawnEggOn(game:Game,hand:Hand,hit:Hit,def:ItemDef):Result{
  const w=game.world,clicked=w.get(hit.x,hit.y,hit.z),inside=clicked>=0&&COLLISION_BOXES[clicked].length===0;
  const x=inside?hit.x:hit.x+hit.nx,y=inside?hit.y:hit.y+hit.ny,z=inside?hit.z:hit.z+hit.nz;
  const here=w.get(x,y,z),box=here>0?COLLISION_BOXES[here]:[];
  let top=0;for(let i=4;i<box.length;i+=6)top=Math.max(top,box[i]);
  return spawnMob(game,hand,def,x+.5,y+top,z+.5);
}
function spawnMob(game:Game,hand:Hand,def:ItemDef,x:number,y:number,z:number,baby=false):Result{
  if(!def.spawns)return 'pass';
  const e=game.entities.spawn(def.spawns,x,y,z,{reason:'egg',baby,yaw:game.random()*Math.PI*2});
  if(!e)return 'pass';
  hand.consume(1);return 'success';
}
/** Kinds that have babies: a spawn egg used on an adult of its own kind spawns one. */
const HAS_BABIES=new Set(['cow','pig','sheep','chicken','rabbit','wolf','zombie','husk','drowned']);
/** Right click on an entity: its own interaction (shear, milk, breed, tame...), then spawn-egg babies. */
export function useOnEntity(game:Game,hand:Hand,e:Entity):Result{
  const s=hand.get();
  if(!hand.offhand&&game.entities.kind(e.kind)?.interact?.(e,game,s))return 'success';
  const def=s&&itemDef(s.id);
  if(def?.use==='spawn_egg'&&def.spawns===e.kind&&HAS_BABIES.has(e.kind))return spawnMob(game,hand,def,e.x,e.y,e.z,true);
  return 'pass';
}

// ---- Bone meal -----------------------------------------------------------------------------------------------------
/** New crop age after bone meal: +2..5 vanilla ages. Carrots and potatoes have 8 vanilla ages drawn in 4 stages (ages 0-1,
 *  2-3, 4-6 and 7); their 4 states map onto those ages. */
export function bonemealAge(d:BlockDef,add:number):number{
  const age=d.age??0,max=d.maxAge??7;
  if(max===7)return Math.min(7,age+add);
  const v=Math.min(7,(age>=max?7:age*2)+add);
  return v>=7?max:Math.min(max-1,Math.floor(v/2));
}
const MOSSABLE=new Set(['stone','granite','diorite','andesite','deepslate','tuff','dirt','coarse_dirt','grass_block','podzol','mycelium']);
const FLOWERS=new Set(['dandelion','poppy','blue_orchid','allium','cornflower','oxeye_daisy']);
function weighted(list:readonly (readonly [string,number])[],r:()=>number):string|undefined{
  const total=list.reduce((n,[,w])=>n+w,0);let pick=r()*total;
  for(const [name,w] of list){pick-=w;if(pick<0)return name;}
  return list[list.length-1]?.[0];
}
function saplingTree(game:Game,x:number,y:number,z:number,d:BlockDef):boolean{
  const w=game.world,wood=d.family.replace(/_sapling$/,'') as WoodType,r=rng(game);
  // 2×2 saplings grow mega spruce and dark oak (dark oak only grows from 2×2).
  if(wood==='spruce'||wood==='dark_oak'){
    // Vanilla MegaTreeGrower order: x offset 0 then -1, z offset 0 then -1; the tree grows from the north-west sapling.
    for(const [ox,oz] of [[0,0],[0,-1],[-1,0],[-1,-1]]){
      const cells=[[x+ox,z+oz],[x+ox+1,z+oz],[x+ox,z+oz+1],[x+ox+1,z+oz+1]];
      if(!cells.every(([cx,cz])=>blockDef(w.get(cx,y,cz)).family===d.family))continue;
      const base=cells[0],others=cells.filter(([cx,cz])=>cx!==base[0]||cz!==base[1]);
      for(const [cx,cz] of others)w.set(cx,y,cz,AIR,'growth');
      if(game.terrain.growTree(w,base[0],y,base[1],wood==='spruce'?'mega_spruce':'dark_oak',r))return true;
      for(const [cx,cz] of others)w.set(cx,y,cz,d.id,'growth');
      return false;
    }
    if(wood==='dark_oak')return false;
  }
  const kind:TreeKind=wood==='oak'&&r()<.1?'big_oak':wood;
  return game.terrain.growTree(w,x,y,z,kind,r);
}
/** BoneMealItem.useOn: returns true when the bone meal is used up (a valid target, even if a sapling does not grow). */
export function boneMeal(game:Game,x:number,y:number,z:number):boolean{
  const w=game.world,id=w.get(x,y,z);if(id<=0)return false;
  const d=blockDef(id),r=rng(game);
  let used=false;
  if(d.shape==='crop'&&d.age!==undefined&&d.age<(d.maxAge??7)){
    const age=bonemealAge(d,between(r,2,5));
    w.set(x,y,z,stateFor(d.family,{age})!.id,'growth');used=true;
  }else if(d.family.endsWith('_sapling')){
    if(r()<.45)saplingTree(game,x,y,z,d);
    used=true;
  }else if(d.family==='grass_block'&&w.get(x,y+1,z)===AIR){
    growGrass(game,x,y,z);used=true;
  }else if(d.family==='moss_block'&&w.get(x,y+1,z)===AIR){
    growMoss(game,x,y,z);used=true;
  }
  if(used)game.render.spawnParticles('happy',x+.5,y+.5,z+.5,{count:15,spread:.6});
  return used;
}
/** GrassBlock.performBonemeal: 128 random walks over grass from the block above, planting short grass and 1 in 8 flowers. */
function growGrass(game:Game,x:number,y:number,z:number){
  const w=game.world,r=rng(game),grass=B.grass,biome=BIOMES[w.biomeAt(x,z)];
  const flowers=(biome?.vegetation??[]).filter(([n])=>FLOWERS.has(n));
  const pool=flowers.length?flowers:[['dandelion',2],['poppy',1]] as const;
  attempts:for(let i=0;i<128;i++){
    let px=x,py=y+1,pz=z;
    for(let j=0;j<i/16;j++){
      px+=Math.floor(r()*3)-1;py+=Math.trunc((Math.floor(r()*3)-1)*Math.floor(r()*3)/2);pz+=Math.floor(r()*3)-1;
      const below=w.get(px,py-1,pz),here=w.get(px,py,pz);
      if(below!==grass||here<0||FULL_CUBE[here])continue attempts;
    }
    if(w.get(px,py,pz)!==AIR)continue;
    const plant=r()<1/8?weighted(pool,r)??'poppy':'short_grass',pid=blockId(plant);
    if(canSurvive(w,pid,px,py,pz))w.set(px,py,pz,pid,'growth');
  }
}
/** MossBlock.performBonemeal: spreads moss over stone, dirt and grass around it with some short grass on top. */
function growMoss(game:Game,x:number,y:number,z:number){
  const w=game.world,r=rng(game),moss=blockId('moss_block'),grass=blockId('short_grass'),radius=between(r,1,2)+.5;
  for(let dz=-3;dz<=3;dz++)for(let dx=-3;dx<=3;dx++){
    if(dx*dx+dz*dz>radius*radius+(r()<.5?1:0))continue;
    for(let dy=1;dy>=-1;dy--){
      const cx=x+dx,cy=y+dy,cz=z+dz,id=w.get(cx,cy,cz);
      if(id<=0||!MOSSABLE.has(blockDef(id).family)&&id!==moss||w.get(cx,cy+1,cz)!==AIR)continue;
      if(id!==moss)w.set(cx,cy,cz,moss,'growth');
      if(r()<.3)w.set(cx,cy+1,cz,grass,'growth');
      break;
    }
  }
}

// ---- Item use in the air ------------------------------------------------------------------------------------------
/** BucketItem.use: an empty bucket picks up a source block (rays stop only at sources); a full one empties against the
 *  face it points at, washing away plants and torches. */
function useBucket(game:Game,hand:Hand,content:'water'|'lava'|null):Result{
  const w=game.world;
  if(!content){
    const hit=lookHit(game,true);
    if(!hit)return 'pass';
    const d=blockDef(hit.id);
    if(!d.liquid||!isSource(hit.id)||!w.set(hit.x,hit.y,hit.z,AIR,'player'))return 'fail';
    game.sounds.play('bucket_fill',{x:hit.x+.5,y:hit.y+.5,z:hit.z+.5},{pitch:d.liquid.kind==='lava'?.8:1});
    fillHand(game,hand,d.liquid.kind==='lava'?'lava_bucket':'water_bucket');
    return 'success';
  }
  const hit=lookHit(game);
  if(!hit)return 'pass';
  const x=hit.x+hit.nx,y=hit.y+hit.ny,z=hit.z+hit.nz,here=w.get(x,y,z);
  if(here<0)return 'fail';
  const hd=blockDef(here);
  if(here!==AIR&&!hd.replaceable&&hd.solid)return 'fail';
  // Emptying into a source of the same fluid changes nothing but still empties the bucket (vanilla).
  const fluid=content==='water'?B.water:B.lava;
  if(here!==fluid&&!w.set(x,y,z,fluid,'player'))return 'fail';
  if(here!==AIR&&here!==fluid&&!hd.liquid)for(const s of lootDrops(here,null,rng(game)))game.entities.dropItem(s,x+.5,y+.25,z+.5);
  game.sounds.play('bucket_empty',{x:x+.5,y:y+.5,z:z+.5},{pitch:content==='lava'?.8:1});
  hand.consume(1);
  return 'success';
}
/** PlaceOnWaterBlockItem (lily pads): placed on top of the water source the player looks at. */
function placeOnWater(game:Game,hand:Hand,family:string):Result{
  const w=game.world,hit=lookHit(game,true);
  if(!hit||!blockDef(hit.id).liquid||blockDef(hit.id).liquid!.kind!=='water'||!isSource(hit.id))return 'pass';
  const id=familyStates(family)[0]?.id;if(id===undefined)return 'pass';
  const cell:Cell={x:hit.x,y:hit.y+1,z:hit.z,id};
  if(w.get(cell.x,cell.y,cell.z)!==AIR||!canSurvive(w,id,cell.x,cell.y,cell.z)||obstructed(game,[cell]))return 'fail';
  return applyPlan(game,hand,[cell]);
}
/** Item.use with no block (or after the block passed): returns the started item use, if any, through `start`. */
export function useItem(game:Game,hand:Hand,s:ItemStack,start:(u:ItemUse)=>void,cooldowns:Map<string,number>):Result{
  const def=itemDef(s.id);if(!def||(cooldowns.get(s.id)??0)>0)return 'pass';
  const begin=(kind:UseKind,duration:number):Result=>{start({item:s.id,hand,kind,ticks:0,duration});return 'consume';};
  switch(def.use){
    case 'bucket':return useBucket(game,hand,null);
    case 'water_bucket':return useBucket(game,hand,'water');
    case 'lava_bucket':return useBucket(game,hand,'lava');
    case 'bow':return game.settings.mode==='creative'||hasArrow(game)?begin('bow',USE_FOREVER):'fail';
    case 'shield':return begin('shield',USE_FOREVER);
    case 'snowball':case 'egg':case 'ender_pearl':return throwItem(game,hand,def.use,cooldowns);
    case 'spawn_egg':{
      // Spawn eggs aimed at water spawn in it (squid).
      const hit=lookHit(game,true);
      if(!hit||!blockDef(hit.id).liquid)return 'pass';
      return spawnMob(game,hand,def,hit.x+.5,hit.y,hit.z+.5);
    }
  }
  if(def.places==='lily_pad')return placeOnWater(game,hand,def.places);
  if(def.food){
    const ok=game.settings.mode==='creative'||def.food.always||game.survival.canEat(def.food);
    return ok?begin(def.use==='milk_bucket'?'drink':'eat',Math.round(def.food.seconds*20)):'fail';
  }
  return 'pass';
}
export type {Hit,Hand,Result} from './use-hands';
export type {BlockId};
