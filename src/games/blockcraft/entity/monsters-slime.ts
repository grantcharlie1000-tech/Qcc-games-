// Slime (Java 1.20 behaviour): sizes 1, 2 and 4 with a 0.52 × size box and size² health; hops in a direction (toward the player
// within 16 blocks, otherwise one that changes every 2–5 seconds), pausing 10–29 ticks between hops (a third of that for big
// slimes chasing); sizes 2 and 4 hurt a touching player for 2 and 4; on death splits into 2–4 slimes of half size; size 1
// drops 0–2 slime balls; xp equals the size. Natural spawning: swamps between y 50 and 70 at night (brightness ≤ a random
// 0..7, scaled by the moon phase) and slime chunks (a deterministic 1-in-10 hash of the world seed and chunk) below y 40.
import {BIOMES,biomeDef} from '../data/biomes';
import {stack,type ItemStack} from '../data/items';
import {CS} from '../engine/constants';
import type {Entity,EntityKind,Game,ParticleOptions} from '../engine/contracts';
import {hashInts,meleeSource,noise,playerTargetable,randInt,uniformCount} from './monsters-common';
import {createSlimeModel} from './monsters-models';

export const SLIME_SIZES=[1,2,4] as const;
export type SlimeSize=typeof SLIME_SIZES[number];
export const isSlimeSize=(v:unknown):v is SlimeSize=>v===1||v===2||v===4;
/** Box edge per size unit (vanilla 2.04 × 0.255). */
export const SLIME_UNIT=.52;
/** Average horizontal speed while airborne, blocks/second (vanilla speed 0.2 + 0.1 × size over a hop). */
export const slimeHopSpeed=(size:number)=>size>=4?3.4:size>=2?1.8:1.2;
const FOLLOW_SQ=16*16,FOLLOW_DY=4;
/** Biomes where slimes also spawn on the surface (vanilla `allows_surface_slime_spawns`). */
export const SURFACE_SLIME_BIOMES:ReadonlySet<string>=new Set(['swamp']);
/** Vanilla moon brightness per phase (phase 0 = full moon on day 1). */
const MOON=[1,.75,.5,.25,0,.25,.5,.75];
export const moonBrightness=(day:number)=>MOON[(((Math.floor(day)-1)%8)+8)%8];

export interface SlimeData{
  size:SlimeSize;
  /** Ticks on the ground before the next hop. */
  jump:number;
  /** Heading (yaw, radians) of the hops. */
  dir:number;
  /** Ticks before a wandering slime picks a new heading. */
  turn:number;
  /** Airborne since the last hop (landing squishes). */
  air:boolean;
  /** Hopping after the player. */
  chase:boolean;
}
const data=(e:Entity)=>e.data as unknown as SlimeData;

/** Deterministic 1-in-10 slime chunk test from the world seed and chunk coordinates. */
export function isSlimeChunk(seed:number,cx:number,cz:number):boolean{
  return hashInts(seed^0x3ad8025f,cx,cz^0x3ad8f3df)%10===0;
}
/** Vanilla natural-spawn rule for a slime at block (x, y, z) (feet cell); draws from `random` like vanilla. */
export function slimeCanSpawn(game:Game,x:number,y:number,z:number,random:()=>number=game.random):boolean{
  if(game.settings.difficulty==='peaceful')return false;
  if(SURFACE_SLIME_BIOMES.has(biomeDef(game.world.biomeAt(x,z)).name)&&y>50&&y<70&&random()<.5&&random()<moonBrightness(game.time.day)
    &&game.world.brightnessAt(x,y,z)<=randInt(random,8))return true;
  return randInt(random,10)===0&&y<40&&isSlimeChunk(game.terrain.seed,Math.floor(x/CS),Math.floor(z/CS));
}
/** Vanilla random size: 1, 2 or 4 with equal odds. */
export const randomSlimeSize=(random:()=>number):SlimeSize=>SLIME_SIZES[randInt(random,3)];

/** Sets size, box, and health (full when `heal`, else clamped to the new maximum). */
export function applySlimeSize(e:Entity,size:SlimeSize,heal:boolean){
  data(e).size=size;
  e.width=e.height=SLIME_UNIT*size;
  e.maxHealth=size*size;
  e.health=heal||!(e.health>0)?e.maxHealth:Math.min(e.health,e.maxHealth);
}

/** On death: 2–4 slimes of half the size around the body (vanilla offsets). Returns the new slimes. */
export function splitSlime(game:Game,e:Entity):Entity[]{
  const size=data(e).size,out:Entity[]=[];
  if(!isSlimeSize(size)||size<=1)return out;
  const r=game.random,child=size/2 as SlimeSize,n=2+randInt(r,3),f=size/4;
  for(let i=0;i<n;i++){
    const s=game.entities.spawn('slime',e.x+((i%2)-.5)*f,e.y+.5,e.z+((i>>1)-.5)*f,{data:{size:child},reason:'event',yaw:r()*Math.PI*2});
    if(s)out.push(s);
  }
  return out;
}

/** Does the player's box, grown by 1 sideways and 0.5 up and down (vanilla touch range), overlap the slime? */
function touchesPlayer(e:Entity,game:Game):boolean{
  const p=game.player.state,reach=e.width/2+game.player.width/2+1;
  return Math.abs(p.x-e.x)<reach&&Math.abs(p.z-e.z)<reach&&p.y-.5<e.y+e.height&&p.y+game.player.height+.5>e.y;
}
const LANDING=new Map<number,ParticleOptions>(SLIME_SIZES.map(s=>[s,Object.freeze({count:Math.min(32,s*8),spread:.26*s})]));

export function tickSlime(e:Entity,game:Game){
  const d=data(e),r=game.random,ai=game.entities.ai,p=game.player.state,size=d.size;
  const dx=p.x-e.x,dy=p.y-e.y,dz=p.z-e.z,distSq=dx*dx+dy*dy+dz*dz,eyeY=p.y+game.player.eyeHeight();
  const targetable=playerTargetable(game);
  if(d.chase){if(!targetable||distSq>FOLLOW_SQ)d.chase=false;}
  else if(targetable&&distSq<=FOLLOW_SQ&&Math.abs(dy)<=FOLLOW_DY&&r()<.1&&ai.canSee(e,p.x,eyeY,p.z))d.chase=true;
  if(d.chase){d.dir=Math.atan2(-dx,-dz);ai.lookAt(e,p.x,eyeY,p.z);}
  else if(--d.turn<=0){d.turn=40+randInt(r,60);d.dir=randInt(r,360)*Math.PI/180;}
  if((e.inWater||e.inLava)&&r()<.8)e.jump=true;
  e.yaw=e.headYaw=d.dir;
  const hop=slimeHopSpeed(size),fx=-Math.sin(d.dir)*hop,fz=-Math.cos(d.dir)*hop;
  if(e.onGround){
    if(d.air){
      d.air=false;
      game.render.spawnParticles('slime',e.x,e.y,e.z,LANDING.get(size));
      game.sounds.play('mob:slime:step',{x:e.x,y:e.y,z:e.z},{volume:Math.min(1,.4*size),pitch:((noise(e.id,e.age,5)-noise(e.id,e.age,6))*.2+1)*(size>1?1:1.4)});
    }
    if(--d.jump<=0){
      d.jump=randInt(r,20)+10;
      if(d.chase&&size>1)d.jump=Math.floor(d.jump/3);
      e.jump=true;e.moveX=fx;e.moveZ=fz;d.air=true;
    }else{e.moveX=0;e.moveZ=0;}
  }else{e.moveX=fx;e.moveZ=fz;d.air=true;}
  // Contact damage (sizes 2 and 4): within 0.6 × size of the player's feet, touching and with a line of sight.
  if(size>1&&targetable&&distSq<.36*size*size&&touchesPlayer(e,game)&&ai.canSee(e,p.x,eyeY,p.z))game.survival.damage(size,meleeSource(e,game));
}

const int=(v:unknown,min:number,max:number)=>typeof v==='number'&&Number.isInteger(v)&&v>=min&&v<=max;

export function createSlimeKind():EntityKind{
  return{
    // The kind box is the largest slime's (vanilla checks spawn space with it); init() sizes each slime.
    kind:'slime',category:'hostile',width:SLIME_UNIT*4,height:SLIME_UNIT*4,maxHealth:16,
    model:createSlimeModel(),
    xp:e=>isSlimeSize(e.data.size)?e.data.size:1,
    despawns:true,
    sounds:{name:'slime',ambient:false,step:false},
    // Vanilla monster entry: weight 100 in groups of 4 everywhere monsters spawn; init() applies the slime rules.
    spawn:{light:'dark',group:[4,4],weight:100,biomes:BIOMES.filter(b=>b.name!=='mushroom_fields').map(b=>[b.name,100] as const)},
    init(e,game,reason){
      const d=e.data,r=game.random,natural=reason==='natural'||reason==='chunk';
      const size:SlimeSize=!natural&&isSlimeSize(d.size)?d.size:randomSlimeSize(r);
      // Natural spawns that break the slime rules are dropped at once.
      if(natural&&!slimeCanSpawn(game,Math.floor(e.x),Math.floor(e.y),Math.floor(e.z),r)){e.removed=true;return;}
      applySlimeSize(e,size,reason!=='restore');
      if(!int(d.jump,0,30))d.jump=randInt(r,20)+10;
      if(typeof d.dir!=='number'||!Number.isFinite(d.dir))d.dir=e.yaw;
      if(!int(d.turn,0,100))d.turn=0;
      d.air=false;d.chase=false;
    },
    tick:tickSlime,
    drops(e,game){
      const out:ItemStack[]=[];
      if(data(e).size===1){const n=uniformCount(game.random,0,2);if(n>0)out.push(stack('slime_ball',n));}
      return out;
    },
    restoreData(raw){
      if(!isSlimeSize(raw.size))return null;
      const out:Record<string,unknown>={size:raw.size};
      if(int(raw.jump,0,30))out.jump=raw.jump;
      if(typeof raw.dir==='number'&&Number.isFinite(raw.dir))out.dir=raw.dir;
      return out;
    }
  };
}
