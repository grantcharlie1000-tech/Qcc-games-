// Passive mobs: cow (with the mooshroom variant), pig, sheep, chicken and rabbit, faithful to Java 1.20/1.21 behaviour.
// registerPassiveMobs(game) registers one EntityKind per mob with game.entities; each kind combines
//  - a box model and its painted texture (entity/passive-art.ts, built by entity/passive-model.ts),
//  - the shared animal AI (entity/passive-ai.ts: panic, breed, tempt, follow parent, stroll, look, swim, cliff guard),
//  - its own interactions (milking, mushroom stew, shearing, dyeing, spawn eggs, feeding), grazing, egg laying, hopping and
//    garden raids, loot tables (cooked when burning, nothing from babies), experience, sounds and spawn settings.
// Sounds of the mobs themselves (`mob:<name>:ambient|hurt|death|step`) are played by the entity service from `kind.sounds`;
// action sounds (shear, milk) go through game.sounds here.
import {AIR,B,WOOL_COLOURS,blockDef,blockId,stateFor} from '../data/blocks';
import {BIOME_BY_NAME,biomeDef} from '../data/biomes';
import {stack} from '../data/items';
import {brainOf,dangerAhead,feedAnimal,hurtAnimal,initAnimal,mobSpeed,restoreAnimalData,spawnEggOnAnimal,tickAnimal,ageUp,
  type AnimalConfig,type AnimalSpeeds,type Brain,type CustomBehaviour} from './passive-ai';
import {RABBIT_VARIANTS,chickenModel,cowModel,pigModel,rabbitModel,sheepModel,type RabbitVariant} from './passive-art';
import type {Entity,EntityKind,EntityModel,Game,ItemId,ItemStack,SpawnReason} from '../engine/contracts';

export {RABBIT_VARIANTS,type RabbitVariant};
export type PassiveKind='cow'|'pig'|'sheep'|'chicken'|'rabbit';
export type WoolColour=typeof WOOL_COLOURS[number];

// ---- Speeds -------------------------------------------------------------------------------------------
/** Rabbits move in hops: horizontal launch speed of a hop for a vanilla speed modifier (at least the vanilla 0.1 blocks/tick nudge). */
const hopSpeed=(modifier:number)=>Math.max(2,Math.round(2.8*modifier*100)/100);
/** Blocks/second per behaviour: vanilla movement attribute × goal speed modifier (stroll 1, breed 1, tempt, follow parent, panic). */
export const PASSIVE_SPEEDS:Readonly<Record<PassiveKind,AnimalSpeeds>>={
  cow:{walk:mobSpeed(.2,1),panic:mobSpeed(.2,2),tempt:mobSpeed(.2,1.25),breed:mobSpeed(.2,1),follow:mobSpeed(.2,1.25)},
  pig:{walk:mobSpeed(.25,1),panic:mobSpeed(.25,1.25),tempt:mobSpeed(.25,1.2),breed:mobSpeed(.25,1),follow:mobSpeed(.25,1.1)},
  sheep:{walk:mobSpeed(.23,1),panic:mobSpeed(.23,1.25),tempt:mobSpeed(.23,1.1),breed:mobSpeed(.23,1),follow:mobSpeed(.23,1.1)},
  chicken:{walk:mobSpeed(.25,1),panic:mobSpeed(.25,1.4),tempt:mobSpeed(.25,1),breed:mobSpeed(.25,1),follow:mobSpeed(.25,1.1)},
  // Stroll 0.6, panic and avoid 2.2, tempt 1.0, breed 0.8 (rabbits have no follow-parent goal).
  rabbit:{walk:hopSpeed(.6),panic:hopSpeed(2.2),tempt:hopSpeed(1),breed:hopSpeed(.8),follow:hopSpeed(1)}
};
/** Rabbit garden raids walk at modifier 0.7. */
const RABBIT_RAID_SPEED=hopSpeed(.7);

// ---- Shared helpers -------------------------------------------------------------------------------------
const between=(game:Game,min:number,max:number)=>min+Math.floor(game.random()*(max-min+1));
const isInt=(v:unknown,min:number,max:number):v is number=>typeof v==='number'&&Number.isInteger(v)&&v>=min&&v<=max;
const naturalSpawn=(reason:SpawnReason)=>reason==='natural'||reason==='chunk'||reason==='spawner';
const biomeNameAt=(game:Game,e:Entity)=>biomeDef(game.world.biomeAt(Math.floor(e.x),Math.floor(e.z))).name;
function addLoot(out:ItemStack[],id:ItemId,count:number){if(count>0)out.push(stack(id,count));}
/** Meat is smelted when the animal died burning (vanilla furnace_smelt when on fire). */
const meat=(e:Entity,raw:ItemId)=>e.fire>0?`cooked_${raw}`:raw;
/** Gives an item to the player, dropping what does not fit at their feet. */
function give(game:Game,s:ItemStack){
  const left=game.inventory.add(s);
  if(left>0){const p=game.player.state;game.entities.dropItem(stack(s.id,left),p.x,p.y+.5,p.z);}
}
/** Vanilla ItemUtils.createFilledResult: one of the held containers becomes `result` (the stack in hand when it was the last one).
 *  Creative players keep the container and get the result only if they have none yet. */
export function fillHeld(game:Game,result:ItemId):void{
  const inv=game.inventory,held=inv.held();
  if(!held)return;
  if(game.settings.mode==='creative'){if(inv.count(result)===0)give(game,stack(result));return;}
  if(held.count<=1){inv.setSlot(inv.selected,stack(result));return;}
  inv.consumeHeld(1);give(game,stack(result));
}
/** Item entity thrown out of a mob (vanilla spawnAtLocation plus the shearing scatter), velocity in blocks/second. */
function popOut(game:Game,e:Entity,id:ItemId,dy:number){
  const r=()=>game.random();
  game.entities.dropItem(stack(id),e.x,e.y+dy,e.z,{x:(r()-r())*2,y:4+r(),z:(r()-r())*2});
}

interface KindSpec{
  cfg:AnimalConfig;maxHealth:number;model:EntityModel;
  spawn:NonNullable<EntityKind['spawn']>;sounds:NonNullable<EntityKind['sounds']>;noFallDamage?:boolean;
  init?(e:Entity,game:Game,reason:SpawnReason):void;
  tick?(e:Entity,game:Game):void;
  /** Kind-specific right click, before feeding; return true when handled. */
  interact?(e:Entity,game:Game,held:ItemStack):boolean;
  /** Loot of an adult (babies drop nothing). */
  loot(e:Entity,game:Game,byPlayer:boolean):ItemStack[];
  /** Copies the kind's valid fields of untrusted saved data into out. */
  restore?(data:Record<string,unknown>,out:Record<string,unknown>):void;
}
/** One passive EntityKind from the shared animal parts and a kind's own behaviour. */
function animalKind(game:Game,s:KindSpec):EntityKind{
  const cfg=s.cfg;
  return{
    kind:cfg.kind,category:'passive',width:cfg.width,height:cfg.height,maxHealth:s.maxHealth,model:s.model,
    init(e,g,reason){initAnimal(e,g,reason,cfg);s.init?.(e,g,reason);},
    tick(e,g){
      if(e.deathTime>0||e.removed)return;
      tickAnimal(e,g,cfg);s.tick?.(e,g);
    },
    interact(e,g,held){
      if(e.deathTime>0||e.removed||!held)return false;
      if(spawnEggOnAnimal(e,g,cfg,held))return true;
      if(s.interact?.(e,g,held))return true;
      return feedAnimal(e,g,cfg,held);
    },
    drops:(e,g,byPlayer)=>e.baby?[]:s.loot(e,g,byPlayer),
    // Vanilla Animal experience: 1-3 for adults killed by a player, none for babies.
    xp:e=>e.baby?0:1+Math.floor(game.random()*3),
    hurt(e,_g,source){hurtAnimal(e,source);},
    restoreData(data){
      const out:Record<string,unknown>={};
      restoreAnimalData(data,out);s.restore?.(data,out);
      return out;
    },
    sounds:s.sounds,spawn:s.spawn,noFallDamage:s.noFallDamage
  };
}
/** Vanilla animal packs of four on grass; the biome `animals` lists give the weights. */
const pack=():NonNullable<EntityKind['spawn']>=>({light:'grass',group:[4,4]});

// ---- Cow and mooshroom -------------------------------------------------------------------------------------
const COW_VARIANTS=['cow','mooshroom'] as const;
const variantOf=(e:Entity)=>e.data.variant==='mooshroom'?'mooshroom':'cow';
const RED_MUSHROOM='red_mushroom';
function shearMooshroom(e:Entity,game:Game){
  game.sounds.play('shear',e);
  game.render.spawnParticles('explosion',e.x,e.y+e.height/2,e.z,{count:1,spread:.1});
  e.data.variant='cow';
  for(let i=0;i<5;i++)game.entities.dropItem(stack(RED_MUSHROOM),e.x,e.y+e.height,e.z);
  game.inventory.damageHeld(1);
}
function cowKind(game:Game):EntityKind{
  const cfg:AnimalConfig={kind:'cow',width:.9,height:1.4,speeds:PASSIVE_SPEEDS.cow,isFood:id=>id==='wheat',followParent:true,lookRange:6,
    // Cows and mooshrooms are different species in vanilla: each breeds only with its own kind.
    sameGroup:(a,b)=>variantOf(a)===variantOf(b),
    offspring:a=>({variant:variantOf(a)})};
  return animalKind(game,{cfg,maxHealth:10,model:cowModel(),spawn:pack(),sounds:{name:'cow',ambient:true,step:true},
    init(e,g,reason){
      if(e.data.variant!=='cow'&&e.data.variant!=='mooshroom')
        e.data.variant=naturalSpawn(reason)&&biomeNameAt(g,e)==='mushroom_fields'?'mooshroom':'cow';
    },
    interact(e,g,held){
      if(e.baby)return false;
      if(held.id==='bucket'){g.sounds.play('milk',e);fillHeld(g,'milk_bucket');return true;}
      if(variantOf(e)!=='mooshroom')return false;
      if(held.id==='bowl'){g.sounds.play('milk',e);fillHeld(g,'mushroom_stew');return true;}
      if(held.id==='shears'){shearMooshroom(e,g);return true;}
      return false;
    },
    loot(e,g){const out:ItemStack[]=[];addLoot(out,'leather',between(g,0,2));addLoot(out,meat(e,'beef'),between(g,1,3));return out;},
    restore(data,out){if((COW_VARIANTS as readonly unknown[]).includes(data.variant))out.variant=data.variant;}});
}

// ---- Pig ------------------------------------------------------------------------------------------------
function pigKind(game:Game):EntityKind{
  const cfg:AnimalConfig={kind:'pig',width:.9,height:.9,speeds:PASSIVE_SPEEDS.pig,isFood:id=>id==='carrot'||id==='potato',followParent:true,lookRange:6};
  return animalKind(game,{cfg,maxHealth:10,model:pigModel(),spawn:pack(),sounds:{name:'pig',ambient:true,step:true},
    loot(e,g){const out:ItemStack[]=[];addLoot(out,meat(e,'porkchop'),between(g,1,3));return out;}});
}

// ---- Sheep ----------------------------------------------------------------------------------------------
const isWool=(v:unknown):v is WoolColour=>(WOOL_COLOURS as readonly unknown[]).includes(v);
/** Vanilla natural sheep colours: 5% black, 5% gray, 5% light gray, 3% brown, 1 in 500 of the rest pink, else white. */
export function randomWoolColour(random:()=>number):WoolColour{
  const i=Math.floor(random()*100);
  if(i<5)return 'black';
  if(i<10)return 'gray';
  if(i<15)return 'light_gray';
  if(i<18)return 'brown';
  return Math.floor(random()*500)===0?'pink':'white';
}
/** Two-dye crafting recipes used to colour lambs (vanilla Sheep.getOffspringColor). */
const DYE_MIX=new Map<string,WoolColour>([['black+white','gray'],['gray+white','light_gray'],['red+yellow','orange'],['red+white','pink'],
  ['green+white','lime'],['blue+white','light_blue'],['blue+green','cyan'],['blue+red','purple'],['pink+purple','magenta']]);
/** A lamb's wool: the mix of its parents' dyes when a recipe exists, else either parent's colour. */
export function mixWoolColours(a:WoolColour,b:WoolColour,random:()=>number):WoolColour{
  return DYE_MIX.get(a<b?`${a}+${b}`:`${b}+${a}`)??(random()<.5?a:b);
}
/** Dye diffuse colours (vanilla DyeColor texture colours). Sheep wool is tinted with 0.75 of them, white with a light grey. */
export const DYE_COLOURS:Readonly<Record<WoolColour,number>>={white:0xf9fffe,orange:0xf9801d,magenta:0xc74ebd,light_blue:0x3ab3da,yellow:0xfed83d,
  lime:0x80c71f,pink:0xf38baa,gray:0x474f52,light_gray:0x9d9d97,cyan:0x169c9c,purple:0x8932b8,blue:0x3c44aa,brown:0x835432,green:0x5e7c16,
  red:0xb02e26,black:0x1d1d21};
export function woolTint(colour:WoolColour):number{
  if(colour==='white')return 0xe6e6e6;
  const c=DYE_COLOURS[colour],ch=(s:number)=>Math.round((c>>s&255)*.75);
  return ch(16)<<16|ch(8)<<8|ch(0);
}
const WOOL_TINT=new Map(WOOL_COLOURS.map(c=>[c,woolTint(c)]));
const sheepColour=(e:Entity):WoolColour=>isWool(e.data.color)?e.data.color:'white';
const DYES=new Map<ItemId,WoolColour>(WOOL_COLOURS.map(c=>[`${c}_dye`,c]));
function shearSheep(e:Entity,game:Game){
  e.data.sheared=true;
  game.sounds.play('shear',e);
  const wool=`${sheepColour(e)}_wool`;
  for(let i=between(game,1,3);i>0;i--)popOut(game,e,wool,1);
  game.inventory.damageHeld(1);
}
/** Feet cell of a mob (tolerant of a feet position a hair below a block top). */
const feetY=(e:Entity)=>Math.floor(e.y+.05);
function grassUnder(e:Entity,game:Game):'plant'|'block'|null{
  const x=Math.floor(e.x),y=feetY(e),z=Math.floor(e.z),w=game.world;
  if(w.get(x,y,z)===B.shortGrass)return 'plant';
  if(w.get(x,y-1,z)===B.grass)return 'block';
  return null;
}
/** Vanilla EatBlockGoal: 1 in 1000 ticks (1 in 50 for lambs) on grass, a 40-tick graze, eating at tick 4 of it. */
const graze:CustomBehaviour={
  can(e,game,b){
    if(b.eat>0)return true;
    if(game.random()>=(e.baby?1/50:1/1000)||!grassUnder(e,game))return false;
    b.eat=40;game.entities.ai.stop(e);
    return true;
  },
  run(e,game,b){
    b.eat=Math.max(0,b.eat-1);
    if(b.eat!==4)return;
    const where=grassUnder(e,game);if(!where)return;
    const x=Math.floor(e.x),y=feetY(e),z=Math.floor(e.z),w=game.world;
    if(where==='plant'){
      game.render.spawnParticles('block',x+.5,y+.3,z+.5,{block:B.shortGrass,count:12});
      w.set(x,y,z,AIR,'entity');
    }else{
      game.render.spawnParticles('block',x+.5,y,z+.5,{block:B.grass,count:12});
      w.set(x,y-1,z,B.dirt,'entity');
    }
    // Sheep.ate(): the wool grows back; lambs grow up a minute sooner.
    e.data.sheared=false;
    if(e.baby)ageUp(e,60,sheepCfg);
  },
  stop(_e,_game,b){b.eat=0;}
};
const sheepCfg:AnimalConfig={kind:'sheep',width:.9,height:1.3,speeds:PASSIVE_SPEEDS.sheep,isFood:id=>id==='wheat',followParent:true,lookRange:6,
  custom:graze,offspring:(a,b,game)=>({color:mixWoolColours(sheepColour(a),sheepColour(b),()=>game.random())})};
function sheepKind(game:Game):EntityKind{
  return animalKind(game,{cfg:sheepCfg,maxHealth:8,model:sheepModel(e=>WOOL_TINT.get(sheepColour(e))!),spawn:pack(),
    sounds:{name:'sheep',ambient:true,step:true},
    init(e,g){
      if(!isWool(e.data.color))e.data.color=randomWoolColour(()=>g.random());
      if(typeof e.data.sheared!=='boolean')e.data.sheared=false;
    },
    interact(e,g,held){
      if(held.id==='shears'){
        if(e.data.sheared===true||e.baby)return false;
        shearSheep(e,g);return true;
      }
      const dye=DYES.get(held.id);
      if(dye){
        if(e.data.sheared===true||sheepColour(e)===dye)return false;
        e.data.color=dye;g.inventory.consumeHeld(1);return true;
      }
      return false;
    },
    loot(e,g){
      const out:ItemStack[]=[];
      if(e.data.sheared!==true)addLoot(out,`${sheepColour(e)}_wool`,1);
      addLoot(out,meat(e,'mutton'),between(g,1,2));
      return out;
    },
    restore(data,out){
      if(isWool(data.color))out.color=data.color;
      if(typeof data.sheared==='boolean')out.sheared=data.sheared;
    }});
}

// ---- Chicken --------------------------------------------------------------------------------------------
/** Ticks to the next egg: vanilla 6000 + random(6000) (5-10 minutes). */
const EGG_MIN=6000,EGG_SPREAD=6000;
const nextEgg=(game:Game)=>EGG_MIN+Math.floor(game.random()*EGG_SPREAD);
const TAU=Math.PI*2,FLAP_WRAP=TAU*1000;
/** Vanilla Chicken.aiStep: wing flap state, slow fall (vertical speed × 0.6 per tick while falling), egg laying. */
function chickenTick(e:Entity,game:Game){
  const b=brainOf(e);
  b.oFlap=b.flap;b.oFlapSpeed=b.flapSpeed;
  b.flapSpeed=Math.max(0,Math.min(1,b.flapSpeed+(e.onGround?-1:4)*.3));
  if(!e.onGround&&b.flapping<1)b.flapping=1;
  b.flapping*=.9;
  if(!e.onGround&&e.vy<0)e.vy*=.6;
  b.flap+=b.flapping*2;
  if(b.flap>FLAP_WRAP){b.flap-=FLAP_WRAP;b.oFlap-=FLAP_WRAP;}
  if(e.baby)return;
  let t=isInt(e.data.eggTime,1,EGG_MIN+EGG_SPREAD)?e.data.eggTime:nextEgg(game);
  if(--t<=0){
    game.sounds.play('pop',e,{pitch:(game.random()-game.random())*.2+1});
    game.entities.dropItem(stack('egg'),e.x,e.y,e.z);
    t=nextEgg(game);
  }
  e.data.eggTime=t;
}
function chickenKind(game:Game):EntityKind{
  const cfg:AnimalConfig={kind:'chicken',width:.4,height:.7,speeds:PASSIVE_SPEEDS.chicken,isFood:id=>id==='wheat_seeds',followParent:true,lookRange:6};
  return animalKind(game,{cfg,maxHealth:4,model:chickenModel(),spawn:pack(),sounds:{name:'chicken',ambient:true,step:true},noFallDamage:true,
    init(e,g){if(!isInt(e.data.eggTime,1,EGG_MIN+EGG_SPREAD))e.data.eggTime=nextEgg(g);},
    tick:chickenTick,
    loot(e,g){const out:ItemStack[]=[];addLoot(out,'feather',between(g,0,2));addLoot(out,meat(e,'chicken'),1);return out;},
    restore(data,out){if(isInt(data.eggTime,1,EGG_MIN+EGG_SPREAD))out.eggTime=data.eggTime;}});
}

// ---- Rabbit ---------------------------------------------------------------------------------------------
/** Vanilla Rabbit.getRandomRabbitVariant: snowy biomes 80% white / 20% black and white, deserts gold, elsewhere 50% brown,
 *  40% salt and pepper, 10% black. */
export function rabbitVariantFor(biome:string,random:()=>number):RabbitVariant{
  const i=Math.floor(random()*100);
  if(BIOME_BY_NAME.get(biome)?.snowy)return i<80?'white':'white_splotched';
  if(biome==='desert')return 'gold';
  return i<50?'brown':i<90?'salt':'black';
}
const isRabbitVariant=(v:unknown):v is RabbitVariant=>(RABBIT_VARIANTS as readonly unknown[]).includes(v);
const RABBIT_FOOD=new Set<ItemId>(['carrot','golden_carrot','dandelion']);
const MAX_CARROT_TICKS=1000;
const carrotTicks=(e:Entity)=>isInt(e.data.carrotTicks,0,MAX_CARROT_TICKS)?e.data.carrotTicks:0;

// Avoidance (vanilla RabbitAvoidEntityGoal): survival players within 8 blocks it can see, wolves within 10, monsters within 4.
const AVOID_RECHECK=5,PLAYER_AVOID=8,PLAYER_KEEP=12,WOLF_AVOID=10,MONSTER_AVOID=4;
const isMonster=(o:Entity)=>o.category==='hostile'&&!o.removed&&o.deathTime===0;
const isWolf=(o:Entity)=>o.kind==='wolf'&&!o.removed&&o.deathTime===0;
const NEAR:Entity[]=[];
function nearestOf(e:Entity,list:readonly Entity[]):Entity|null{
  let best:Entity|null=null,bd=Infinity;
  for(const o of list){const d=(o.x-e.x)**2+(o.z-e.z)**2;if(d<bd){bd=d;best=o;}}
  return best;
}
function rabbitAvoid(e:Entity,game:Game,b:Brain):boolean{
  const p=game.player.state,canFleePlayer=game.settings.mode!=='creative'&&!game.survival.dead;
  if(b.avoidCheck>0)b.avoidCheck--;
  else{
    b.avoidCheck=AVOID_RECHECK-1;
    const range=b.threat===-1?PLAYER_KEEP:PLAYER_AVOID,d2=(p.x-e.x)**2+(p.y-e.y)**2+(p.z-e.z)**2;
    if(canFleePlayer&&d2<range*range&&(b.threat===-1||game.entities.ai.canSee(e,p.x,p.y+game.player.eyeHeight(),p.z)))b.threat=-1;
    else{
      const threat=nearestOf(e,game.entities.near(e.x,e.y,e.z,MONSTER_AVOID,isMonster,NEAR))??nearestOf(e,game.entities.near(e.x,e.y,e.z,WOLF_AVOID,isWolf,NEAR));
      b.threat=threat?.id??0;NEAR.length=0;
    }
  }
  if(b.threat===-1){
    if(!canFleePlayer){b.threat=0;return false;}
    b.fleeX=p.x;b.fleeZ=p.z;return true;
  }
  if(b.threat>0){
    const t=game.entities.byId(b.threat);
    if(!t||t.removed||t.deathTime>0){b.threat=0;return false;}
    b.fleeX=t.x;b.fleeZ=t.z;return true;
  }
  return false;
}

const FARMLAND=new Set([blockId('farmland'),blockId('farmland_wet')]);
/** A fully grown carrot crop on farmland at (x,y,z). */
function matureCarrot(game:Game,x:number,y:number,z:number):boolean{
  const d=blockDef(game.world.get(x,y,z));
  return d.family==='carrots'&&d.age===d.maxAge&&FARMLAND.has(game.world.get(x,y-1,z));
}
const SEARCH_LEVELS=[0,1,-1];
/** Vanilla MoveToBlockGoal search (range 16, the feet level then one above and below), nearest rings first. */
function findCarrot(e:Entity,game:Game,b:Brain):boolean{
  const fx=Math.floor(e.x),fy=feetY(e),fz=Math.floor(e.z);
  for(const dy of SEARCH_LEVELS)for(let r=0;r<16;r++)for(let dz=-r;dz<=r;dz++){
    const edge=dz===-r||dz===r,step=edge?1:2*r;
    for(let dx=-r;dx<=r;dx+=Math.max(1,step)){
      const x=fx+dx,y=fy+dy,z=fz+dz;
      if(matureCarrot(game,x,y,z)){b.hasCrop=true;b.cropX=x;b.cropY=y;b.cropZ=z;b.raidTicks=0;return true;}
    }
  }
  return false;
}
/** Vanilla RaidGardenGoal: a rabbit that wants food walks to a ripe carrot and nibbles it down one growth stage. */
const raidGarden:CustomBehaviour={
  can(e,game,b){
    if(b.hasCrop){
      if(++b.raidTicks<=1200&&matureCarrot(game,b.cropX,b.cropY,b.cropZ))return true;
      b.hasCrop=false;b.raid=10;return false;
    }
    if(b.raid>0){b.raid--;return false;}
    b.raid=200+Math.floor(game.random()*200);
    return carrotTicks(e)===0&&findCarrot(e,game,b);
  },
  run(e,game,b){
    const ai=game.entities.ai,cx=b.cropX+.5,cy=b.cropY,cz=b.cropZ+.5;
    ai.lookAt(e,cx,cy+.5,cz);
    if((e.x-cx)**2+(e.y-(cy+.5))**2+(e.z-cz)**2>=1){ai.navigate(e,cx,cy,cz,RABBIT_RAID_SPEED);return;}
    ai.stop(e);
    const id=game.world.get(b.cropX,cy,b.cropZ),age=blockDef(id).age??0;
    game.render.spawnParticles('block',cx,cy+.3,cz,{block:id,count:10});
    const next=age>0?stateFor('carrots',{age:age-1}):undefined;
    game.world.set(b.cropX,cy,b.cropZ,next?next.id:AIR,'entity');
    e.data.carrotTicks=40;
    b.hasCrop=false;b.raid=10;
  },
  stop(_e,_game,b){b.hasCrop=false;}
};
const DELAY_FAST=1,DELAY_WALK=10;
/** Vanilla rabbit movement: it only moves while airborne. On the ground it waits out its landing delay (10 ticks, 1 when
 *  running at panic speed), then hops: 0.3 blocks/tick up (0.5 to climb) with the steering speed as launch velocity, kept
 *  until it lands. A hop that would end over a drop, lava, fire or a cactus is not taken. */
const HOP_UP=6,HOP_CLIMB=10,GRAVITY=32;
function rabbitMove(e:Entity,game:Game,b:Brain){
  if(e.inWater||e.inLava){b.hop=0;b.wasOnGround=false;return;}
  if(b.jumpDelay>0)b.jumpDelay--;
  if(e.onGround){
    if(!b.wasOnGround){b.hop=0;b.jumpDelay=b.mode==='panic'||b.mode==='avoid'?DELAY_FAST:DELAY_WALK;}
    let speed=Math.hypot(e.moveX,e.moveZ);
    const up=e.collidedH?HOP_CLIMB:HOP_UP;
    // The whole hop must land somewhere safe, not just the next step: airtime 2·up/g at the launch speed, plus a margin.
    if(speed>0&&b.jumpDelay===0&&dangerAhead(game.world,e.x,e.y,e.z,e.moveX,e.moveZ,e.width/2,speed*2*up/GRAVITY+.3)){
      game.entities.ai.stop(e);b.hasTarget=false;speed=0;
    }
    if(speed>0&&b.jumpDelay===0){
      e.vy=up;e.vx=b.hopX=e.moveX;e.vz=b.hopZ=e.moveZ;e.jump=false;b.hop=1;
    }else{e.moveX=0;e.moveZ=0;b.hop=0;}
  }else if(b.hop>0){
    // A hop is ballistic: no steering in the air, so a new goal cannot swerve it into what the launch check avoided.
    b.hop++;e.moveX=b.hopX;e.moveZ=b.hopZ;
  }
  b.wasOnGround=e.onGround;
}
function rabbitKind(game:Game):EntityKind{
  const cfg:AnimalConfig={kind:'rabbit',width:.4,height:.5,speeds:PASSIVE_SPEEDS.rabbit,isFood:id=>RABBIT_FOOD.has(id),followParent:false,lookRange:10,
    avoid:rabbitAvoid,custom:raidGarden,move:rabbitMove,
    // 95% one parent's coat, else a coat for the biome.
    offspring(a,b,g){
      if(g.random()<.05)return{variant:rabbitVariantFor(biomeNameAt(g,a),()=>g.random())};
      const parent=(g.random()<.5?a:b).data.variant;
      return{variant:isRabbitVariant(parent)?parent:'brown'};
    }};
  return animalKind(game,{cfg,maxHealth:3,model:rabbitModel(),spawn:{light:'grass',group:[2,3]},sounds:{name:'rabbit',ambient:true},
    init(e,g){
      if(!isRabbitVariant(e.data.variant))e.data.variant=rabbitVariantFor(biomeNameAt(g,e),()=>g.random());
      if(!isInt(e.data.carrotTicks,0,MAX_CARROT_TICKS))e.data.carrotTicks=0;
    },
    tick(e,g){const t=carrotTicks(e);if(t>0)e.data.carrotTicks=Math.max(0,t-Math.floor(g.random()*3));},
    loot(e,g,byPlayer){
      const out:ItemStack[]=[];
      addLoot(out,'rabbit_hide',between(g,0,1));addLoot(out,meat(e,'rabbit'),between(g,0,1));
      if(byPlayer&&g.random()<.1)addLoot(out,'rabbit_foot',1);
      return out;
    },
    restore(data,out){
      if(isRabbitVariant(data.variant))out.variant=data.variant;
      if(isInt(data.carrotTicks,0,MAX_CARROT_TICKS))out.carrotTicks=data.carrotTicks;
    }});
}

/** Registers the passive mob kinds (called by engine/game.ts before init). */
export function registerPassiveMobs(game:Game):void{
  for(const kind of [cowKind(game),pigKind(game),sheepKind(game),chickenKind(game),rabbitKind(game)])game.entities.register(kind);
}
