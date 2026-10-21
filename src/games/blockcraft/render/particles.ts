// Particles: every ParticleKind simulated at 20 Hz after the vanilla Java particle classes (TerrainParticle,
// BreakingItemParticle, SmokeParticle, HugeExplosion(Seed)Particle, SplashParticle, BubbleParticle, DripParticle,
// CritParticle, HeartParticle, SuspendedTownParticle, FlameParticle, LavaParticle, PortalParticle, ExplodeParticle,
// SweepAttackParticle, NoteParticle, SpellParticle) and drawn as camera-facing quads in ONE instanced draw call.
// Block debris samples the block atlas; everything else samples the particle sheet (render/particles-art.ts), whose
// last two rows hold item sprites copied in on demand (eating crumbs, snowballs, eggs, slime), recycled LRU.
// Units inside: blocks and blocks per tick (vanilla); ParticleOptions.velocity is blocks per second.
import * as THREE from 'three';
import {AIR,ATLAS_COLUMNS,ATLAS_ROWS,BLOCK_BY_NAME,COLLISION_BOXES,FACE_TILE,LIQUID,TILE_INDEX,blockDef} from '../data/blocks';
import {biomeDef} from '../data/biomes';
import {itemDef} from '../data/items';
import {spritePixels} from '../art/items';
import {liquidHeight} from '../engine/physics';
import {mulberry32} from '../world/noise';
import type {BlockId,Game,ParticleKind,ParticleOptions} from '../engine/contracts';
import {LIGHT_GLSL,type RenderUniforms} from './sky';
import {ITEM_SLOTS,ITEM_SLOT_BASE,PARTICLE_SPRITES,SHEET_COLUMNS,SHEET_HEIGHT,SHEET_ROWS,SHEET_WIDTH,paintParticleSheet,type SpriteName} from './particles-art';

/** About 2 000 particles at once; the oldest make room for new ones. */
export const MAX_PARTICLES=2000;
export const PARTICLE_KINDS:readonly ParticleKind[]=['block','item','smoke','large_smoke','explosion','splash','bubble','drip','crit','heart','angry',
  'happy','flame','lava','portal','poof','slime','damage','sweep','note','spell'];
const KIND_SET=new Set<string>(PARTICLE_KINDS);
/** Particles spawned when ParticleOptions.count is omitted. 'explosion' runs the vanilla emitter (48 puffs over 8 ticks). */
const DEFAULT_COUNT:Record<ParticleKind,number>={block:16,item:8,smoke:4,large_smoke:4,explosion:48,splash:8,bubble:4,drip:1,crit:8,heart:1,angry:1,
  happy:5,flame:1,lava:1,portal:4,poof:20,slime:8,damage:4,sweep:1,note:1,spell:8};
const DEFAULT_SPREAD=.25,EXPLOSION_SPREAD=2,EXPLOSION_PER_TICK=6;
const TEX_ATLAS=0,TEX_SHEET=1;
/** Packed light of particles that ignore light (vanilla 15728880). */
const FULL_BRIGHT=0xff;
const GRASS_FAMILIES=new Set(['grass_block','podzol','mycelium']);
let dirtTile=-1;
/** Atlas tile a block breaks into (vanilla model `particle` texture: dirt for grass, the side otherwise). */
export function particleTile(id:BlockId):number{
  if(dirtTile<0)dirtTile=TILE_INDEX.get('dirt')??0;
  return GRASS_FAMILIES.has(blockDef(id).family)?dirtTile:FACE_TILE[id*6];
}

export interface Particle{
  kind:ParticleKind;
  /** Position (box bottom centre, like vanilla), last tick's position and velocity in blocks per tick. */
  x:number;y:number;z:number;prevX:number;prevY:number;prevZ:number;vx:number;vy:number;vz:number;
  age:number;lifetime:number;gravity:number;friction:number;
  /** Rendered quad width in blocks (2 × vanilla quadSize) and the collision box width. */
  size:number;box:number;
  r:number;g:number;b:number;a:number;
  texture:'atlas'|'sheet';u0:number;v0:number;u1:number;v1:number;
  /** Animated sheet sprite: first cell and frames (0 = static UVs above). */
  cell:number;frames:number;
  emissive:boolean;
  /** Packed light (sky<<4|block) of the cell it is in, refreshed every tick. */
  light:number;
  physics:boolean;onGround:boolean;stopped:boolean;speedUpWhenBlocked:boolean;
  /** Drips: 0 hanging, 1 falling, 2 landed. Liquid kind 1 water, 2 lava. */
  state:number;fluid:number;
  /** Portal particles: where they converge. */
  sx:number;sy:number;sz:number;
  serial:number;
}
interface Emitter{x:number;y:number;z:number;spread:number;left:number;perTick:number}
export interface ParticleSystem{
  readonly mesh:THREE.Mesh;readonly sheet:THREE.DataTexture;
  /** Live particles (oldest first). */
  readonly count:number;
  spawn(kind:ParticleKind,x:number,y:number,z:number,options?:ParticleOptions):void;
  /** One 20 Hz simulation step. */
  tick():void;
  /** Fill the instance buffers, interpolating `partial` (0..1) between the last two ticks. */
  update(partial:number):void;
  particles():readonly Particle[];
  reset():void;
  dispose():void;
}

const VERTEX=`precision highp float;
uniform mat4 viewMatrix;uniform mat4 projectionMatrix;uniform vec3 cameraPosition;
uniform float daylight;uniform float flash;uniform float flicker;uniform float nightVision;
in vec2 corner;in vec4 iPos;in vec4 iUV;in vec4 iColor;in vec2 iMisc;
out vec2 vUv;out vec4 vColor;out vec3 vRel;flat out float vTex;
${LIGHT_GLSL}
void main(){
  vec3 right=vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]),up=vec3(viewMatrix[0][1],viewMatrix[1][1],viewMatrix[2][1]);
  vec3 world=iPos.xyz+(right*corner.x+up*corner.y)*iPos.w;
  vUv=vec2(mix(iUV.x,iUV.z,corner.x+.5),mix(iUV.y,iUV.w,corner.y+.5));
  float light=iMisc.x;
  vec3 lit=light>=255.?vec3(1.):bcLightmap(floor(light/16.),mod(light,16.),daylight,flash,flicker,nightVision);
  vColor=vec4(iColor.rgb*lit,iColor.a);vTex=iMisc.y;vRel=world-cameraPosition;
  gl_Position=projectionMatrix*viewMatrix*vec4(world,1.);
}`;
const FRAGMENT=`precision highp float;
uniform sampler2D atlas;uniform sampler2D sheet;uniform vec3 fogColor;uniform float fogNear;uniform float fogFar;uniform float fogShape;
in vec2 vUv;in vec4 vColor;in vec3 vRel;flat in float vTex;
out vec4 colour;
${LIGHT_GLSL}
void main(){
  vec4 t=vTex<.5?texture(atlas,vUv):texture(sheet,vUv);
  vec4 c=t*vColor;if(c.a<.1)discard;
  colour=vec4(mix(c.rgb,fogColor,bcFog(bcFogDistance(vRel,fogShape),fogNear,fogFar)),c.a);
}`;

export function createParticles(game:Game,atlas:THREE.Texture,uniforms:RenderUniforms):ParticleSystem{
  const rand=mulberry32(0x9a271c1e);
  // ---- Sheet texture (rows flipped so v=1 is the top row) and item sprite slots ------------------------------------
  const painted=paintParticleSheet(),pixels=new Uint8Array(painted.length),row=SHEET_WIDTH*4;
  for(let y=0;y<SHEET_HEIGHT;y++)pixels.set(painted.subarray(y*row,(y+1)*row),(SHEET_HEIGHT-1-y)*row);
  const sheet=new THREE.DataTexture(pixels,SHEET_WIDTH,SHEET_HEIGHT,THREE.RGBAFormat);
  sheet.magFilter=sheet.minFilter=THREE.NearestFilter;sheet.generateMipmaps=false;sheet.needsUpdate=true;
  const slotOf=new Map<string,number>(),slotOrder:string[]=[];
  function itemSlot(sprite:string):number{
    let slot=slotOf.get(sprite);
    if(slot!==undefined){slotOrder.splice(slotOrder.indexOf(sprite),1);slotOrder.push(sprite);return slot;}
    if(slotOf.size<ITEM_SLOTS)slot=slotOf.size;
    else{const old=slotOrder.shift()!;slot=slotOf.get(old)!;slotOf.delete(old);}
    slotOf.set(sprite,slot);slotOrder.push(sprite);
    const src=spritePixels(sprite),cell=ITEM_SLOT_BASE+slot,ox=(cell%SHEET_COLUMNS)*16,oy=Math.floor(cell/SHEET_COLUMNS)*16;
    for(let y=0;y<16;y++)pixels.set(src.subarray(y*64,(y+1)*64),((SHEET_HEIGHT-1-(oy+y))*SHEET_WIDTH+ox)*4);
    sheet.needsUpdate=true;
    return slot;
  }

  // ---- Instanced quad -----------------------------------------------------------------------------------------------
  const geometry=new THREE.InstancedBufferGeometry();
  geometry.setAttribute('corner',new THREE.Float32BufferAttribute([-.5,.5,-.5,-.5,.5,.5,.5,-.5],2));
  geometry.setIndex([0,1,2,2,1,3]);
  const attr=(name:string,size:number)=>{
    const a=new THREE.InstancedBufferAttribute(new Float32Array(MAX_PARTICLES*size),size);a.setUsage(THREE.DynamicDrawUsage);geometry.setAttribute(name,a);return a;
  };
  const iPos=attr('iPos',4),iUV=attr('iUV',4),iColor=attr('iColor',4),iMisc=attr('iMisc',2),instanceAttributes=[iPos,iUV,iColor,iMisc];
  geometry.instanceCount=0;
  const material=new THREE.RawShaderMaterial({
    glslVersion:THREE.GLSL3,vertexShader:VERTEX,fragmentShader:FRAGMENT,
    uniforms:{atlas:{value:atlas},sheet:{value:sheet},daylight:uniforms.daylight,flash:uniforms.flash,flicker:uniforms.flicker,nightVision:uniforms.nightVision,
      fogColor:uniforms.fogColor,fogNear:uniforms.fogNear,fogFar:uniforms.fogFar,fogShape:uniforms.fogShape},
    transparent:true,depthWrite:false,side:THREE.DoubleSide
  });
  const mesh=new THREE.Mesh(geometry,material);
  mesh.frustumCulled=false;mesh.matrixAutoUpdate=false;mesh.renderOrder=3;mesh.visible=false;mesh.name='particles';

  // ---- Particle pool --------------------------------------------------------------------------------------------------
  const pool:Particle[]=[],live:Particle[]=[],emitters:Emitter[]=[];
  let serial=0;
  function make():Particle{
    return pool.pop()??{kind:'smoke',x:0,y:0,z:0,prevX:0,prevY:0,prevZ:0,vx:0,vy:0,vz:0,age:0,lifetime:1,gravity:0,friction:.98,size:.2,box:.2,
      r:1,g:1,b:1,a:1,texture:'sheet',u0:0,v0:0,u1:1,v1:1,cell:0,frames:0,emissive:false,light:0,physics:true,onGround:false,stopped:false,
      speedUpWhenBlocked:false,state:0,fluid:0,sx:0,sy:0,sz:0,serial:0};
  }
  /** Vanilla Particle(level, x, y, z): no velocity, 0.2 box, quadSize 0.1..0.2, lifetime 4..40 ticks. */
  function base(kind:ParticleKind,x:number,y:number,z:number):Particle{
    const p=make();
    p.kind=kind;p.x=p.prevX=x;p.y=p.prevY=y;p.z=p.prevZ=z;p.vx=p.vy=p.vz=0;p.age=0;
    p.lifetime=Math.floor(4/(rand()*.9+.1));p.gravity=0;p.friction=.98;p.size=2*.1*(rand()*.5+.5)*2;p.box=.2;
    p.r=p.g=p.b=p.a=1;p.texture='sheet';p.cell=0;p.frames=0;p.emissive=false;p.physics=true;p.onGround=false;p.stopped=false;
    p.speedUpWhenBlocked=false;p.state=0;p.fluid=0;p.sx=x;p.sy=y;p.sz=z;p.serial=serial++;
    p.light=lightAt(x,y,z);
    return p;
  }
  /** Vanilla Particle(level, x, y, z, xd, yd, zd): randomised then normalised to a small burst plus 0.1 upward. */
  function burst(p:Particle,xd:number,yd:number,zd:number){
    let vx=xd+(rand()*2-1)*.4,vy=yd+(rand()*2-1)*.4,vz=zd+(rand()*2-1)*.4;
    const speed=(rand()+rand()+1)*.15,len=Math.hypot(vx,vy,vz)||1;
    vx=vx/len*speed*.4;vy=vy/len*speed*.4+.1;vz=vz/len*speed*.4;
    p.vx=vx;p.vy=vy;p.vz=vz;
  }
  function sprite(p:Particle,name:SpriteName,frame=0){
    const s=PARTICLE_SPRITES[name];p.texture='sheet';p.cell=s.cell;p.frames=s.frames;setCell(p,s.cell+Math.min(frame,s.frames-1));
  }
  function setCell(p:Particle,cell:number){
    const col=cell%SHEET_COLUMNS,r=Math.floor(cell/SHEET_COLUMNS);
    p.u0=col/SHEET_COLUMNS;p.u1=(col+1)/SHEET_COLUMNS;p.v1=1-r/SHEET_ROWS;p.v0=1-(r+1)/SHEET_ROWS;
  }
  /** A random 4×4 pixel piece of a cell (vanilla uo/vo in 0..3 quarter tiles). */
  function piece(p:Particle,texture:'atlas'|'sheet',col:number,r:number,columns:number,rows:number){
    const uo=rand()*3,vo=rand()*3;p.texture=texture;p.cell=0;p.frames=0;
    p.u0=(col+uo/4)/columns;p.u1=(col+(uo+1)/4)/columns;
    p.v1=1-(r+vo/4)/rows;p.v0=1-(r+(vo+1)/4)/rows;
  }
  function tileColour(p:Particle,id:BlockId,x:number,z:number,k:number){
    const d=blockDef(id);let c=0xffffff;
    if(d.tint!=='none'&&d.tintFaces[0]){
      const biome=biomeDef(game.world.biomeAt(Math.floor(x),Math.floor(z)));
      c=d.tint==='grass'?biome.grass:d.tint==='foliage'?biome.foliage:biome.water;
    }
    p.r=k*(c>>16&255)/255;p.g=k*(c>>8&255)/255;p.b=k*(c&255)/255;
  }
  function lightAt(x:number,y:number,z:number){
    const v=game.world.lightAt(Math.floor(x),Math.floor(y),Math.floor(z));return v>=0?v&255:0;
  }
  let ticking=false;const queued:Particle[]=[];
  function add(p:Particle){
    // Particles made while stepping (lava smoke) join after the step, so the live list is not reshuffled mid-loop.
    if(ticking){queued.push(p);return;}
    if(live.length>=MAX_PARTICLES){const old=live.shift()!;pool.push(old);}
    live.push(p);
  }

  // ---- Kinds --------------------------------------------------------------------------------------------------------
  const SLIME_SPRITE='slime_ball';
  function spawnOne(kind:ParticleKind,x:number,y:number,z:number,vx:number,vy:number,vz:number,o:ParticleOptions):Particle|null{
    let p:Particle;
    switch(kind){
      case 'block':{
        const id=o.block!;p=base(kind,x,y,z);burst(p,vx,vy,vz);p.gravity=1;p.size/=2;
        const tile=particleTile(id);piece(p,'atlas',tile%ATLAS_COLUMNS,Math.floor(tile/ATLAS_COLUMNS),ATLAS_COLUMNS,ATLAS_ROWS);tileColour(p,id,x,z,.6);
        break;
      }
      case 'item':case 'slime':{
        const target=kind==='slime'?{kind:'sprite' as const,sprite:SLIME_SPRITE}:itemDef(o.item??'')?.icon;
        if(!target)return null;
        p=base(kind,x,y,z);burst(p,0,0,0);p.vx=p.vx*.1+vx;p.vy=p.vy*.1+vy;p.vz=p.vz*.1+vz;p.gravity=1;p.size/=2;
        if(target.kind==='sprite'){const cell=ITEM_SLOT_BASE+itemSlot(target.sprite);piece(p,'sheet',cell%SHEET_COLUMNS,Math.floor(cell/SHEET_COLUMNS),SHEET_COLUMNS,SHEET_ROWS);}
        else{
          const tile=target.kind==='tile'?TILE_INDEX.get(target.tile)??0:particleTile(BLOCK_BY_NAME.get(target.block)?.id??0);
          piece(p,'atlas',tile%ATLAS_COLUMNS,Math.floor(tile/ATLAS_COLUMNS),ATLAS_COLUMNS,ATLAS_ROWS);
        }
        break;
      }
      case 'smoke':case 'large_smoke':case 'poof':{
        p=base(kind,x,y,z);burst(p,0,0,0);
        if(kind==='poof'){
          // ExplodeParticle: rises slowly, light grey, 0.1..0.7 quad size.
          p.gravity=-.1;p.friction=.9;p.vx=vx+(rand()*2-1)*.05;p.vy=vy+(rand()*2-1)*.05;p.vz=vz+(rand()*2-1)*.05;
          p.r=p.g=p.b=rand()*.3+.7;p.size=2*.1*(rand()*rand()*6+1);p.lifetime=Math.floor(16/(rand()*.8+.2))+2;
        }else{
          // BaseAshSmokeParticle: 0.1 × the random burst plus the given velocity, rising, dark grey.
          const scale=kind==='large_smoke'?2.5:1;
          p.friction=.96;p.gravity=-.1;p.speedUpWhenBlocked=true;p.vx=p.vx*.1+vx;p.vy=p.vy*.1+vy;p.vz=p.vz*.1+vz;
          p.r=p.g=p.b=rand()*.3;p.size*=.75*scale;p.lifetime=Math.max(1,Math.floor(8/(rand()*.8+.2)*scale));
        }
        sprite(p,'generic',7);
        break;
      }
      case 'explosion':{
        // HugeExplosionParticle: a 2..4 block puff, full bright, 6..9 ticks.
        p=base(kind,x,y,z);p.physics=false;p.lifetime=6+Math.floor(rand()*4);p.r=p.g=p.b=rand()*.6+.4;p.size=2*2*(1-rand()*.5);
        p.emissive=true;sprite(p,'explosion');break;
      }
      case 'splash':{
        // WaterDropParticle / SplashParticle: hops up 0.1..0.3 and falls back.
        p=base(kind,x,y,z);burst(p,0,0,0);p.vx*=.3;p.vz*=.3;p.vy=rand()*.2+.1;p.box=.01;p.gravity=.04;p.lifetime=Math.floor(8/(rand()*.8+.2));
        if(vy===0&&(vx!==0||vz!==0)){p.vx=vx;p.vy=.1;p.vz=vz;}else{p.vx+=vx;p.vy+=vy;p.vz+=vz;}
        sprite(p,'splash',Math.floor(rand()*4));break;
      }
      case 'bubble':{
        p=base(kind,x,y,z);p.box=.02;p.size*=rand()*.6+.2;
        p.vx=vx*.2+(rand()*2-1)*.02;p.vy=vy*.2+(rand()*2-1)*.02;p.vz=vz*.2+(rand()*2-1)*.02;p.lifetime=Math.floor(8/(rand()*.8+.2));
        sprite(p,'bubble');break;
      }
      case 'drip':{
        p=base(kind,x,y,z);p.box=.01;p.state=0;p.lifetime=40;p.gravity=.06*.02;
        p.fluid=dripFluid(x,y,z);
        if(p.fluid===2){p.r=1;p.g=.2857143;p.b=.083333336;p.emissive=true;}else{p.r=.2;p.g=.3;p.b=1;}
        if(o.color!==undefined)setColour(p,o.color);
        sprite(p,'drip_hang');break;
      }
      case 'crit':case 'damage':{
        // CritParticle: 0.1 × the burst plus 0.4 × the given velocity, quick friction, grey-white.
        p=base(kind,x,y,z);burst(p,vx,vy+(kind==='damage'?1:0),vz);
        p.vx=p.vx*.1+vx*.4;p.vy=p.vy*.1+(vy+(kind==='damage'?1:0))*.4;p.vz=p.vz*.1+vz*.4;
        p.friction=.7;p.gravity=.5;p.r=p.g=p.b=rand()*.3+.6;p.size*=.75;p.physics=false;
        p.lifetime=kind==='damage'?20:Math.max(1,Math.floor(6/(rand()*.8+.6)));
        sprite(p,kind==='damage'?'damage':'crit');break;
      }
      case 'heart':case 'angry':{
        // HeartParticle: floats up, grows in over the first frames, 16 ticks.
        p=base(kind,x,kind==='angry'?y+.5:y,z);burst(p,0,0,0);p.speedUpWhenBlocked=true;p.friction=.86;
        p.vx=p.vx*.01+vx;p.vy=p.vy*.01+.1+vy;p.vz=p.vz*.01+vz;p.size*=1.5;p.lifetime=16;p.physics=false;
        sprite(p,kind);break;
      }
      case 'happy':{
        p=base(kind,x,y,z);burst(p,vx,vy,vz);p.box=.02;p.size*=rand()*.6+.5;p.vx*=.02;p.vy*=.02;p.vz*=.02;
        p.lifetime=Math.floor(20/(rand()*.8+.2));sprite(p,'happy');break;
      }
      case 'flame':{
        // RisingParticle / FlameParticle: barely moves, glows, shrinks a little with age.
        p=base(kind,x+(rand()-rand())*.05,y+(rand()-rand())*.05,z+(rand()-rand())*.05);burst(p,vx,vy,vz);
        p.friction=.96;p.vx=p.vx*.01+vx;p.vy=p.vy*.01+vy;p.vz=p.vz*.01+vz;p.lifetime=Math.floor(8/(rand()*.8+.2))+4;
        p.physics=false;p.emissive=true;sprite(p,'flame');break;
      }
      case 'lava':{
        p=base(kind,x,y,z);burst(p,0,0,0);p.gravity=.75;p.friction=.999;p.vx=p.vx*.8+vx;p.vz=p.vz*.8+vz;p.vy=rand()*.4+.05+vy;
        p.size*=rand()*2+.2;p.lifetime=Math.floor(16/(rand()*.8+.2));p.emissive=true;sprite(p,'lava');break;
      }
      case 'portal':{
        // PortalParticle: starts at the offset (the velocity) and is drawn in to the spawn point.
        p=base(kind,x,y,z);p.physics=false;
        if(vx===0&&vy===0&&vz===0){vx=(rand()-.5)*2;vy=-rand();vz=(rand()-.5)*2;}
        p.vx=vx;p.vy=vy;p.vz=vz;p.sx=x;p.sy=y;p.sz=z;p.x=p.prevX=x+vx;p.y=p.prevY=y+vy+1;p.z=p.prevZ=z+vz;
        p.size=2*.1*(rand()*.2+.5);const f=rand()*.6+.4;p.r=f*.9;p.g=f*.3;p.b=f;p.lifetime=Math.floor(rand()*10)+40;
        sprite(p,'generic',Math.floor(rand()*8));break;
      }
      case 'sweep':{
        p=base(kind,x,y,z);p.physics=false;p.lifetime=4;p.r=p.g=p.b=rand()*.6+.4;p.size=2;p.emissive=true;sprite(p,'sweep');break;
      }
      case 'note':{
        p=base(kind,x,y,z);burst(p,0,0,0);p.friction=.66;p.speedUpWhenBlocked=true;p.vx*=.01;p.vy=p.vy*.01+.2;p.vz*=.01;
        p.size*=1.5;p.lifetime=6;
        if(o.color===undefined){const n=rand();p.r=Math.max(0,Math.sin(n*Math.PI*2)*.65+.35);p.g=Math.max(0,Math.sin((n+1/3)*Math.PI*2)*.65+.35);
          p.b=Math.max(0,Math.sin((n+2/3)*Math.PI*2)*.65+.35);}
        sprite(p,'note');break;
      }
      case 'spell':{
        p=base(kind,x,y,z);burst(p,.5-rand(),vy,.5-rand());p.friction=.96;p.gravity=-.1;p.speedUpWhenBlocked=true;p.vy*=.2;
        if(vx===0&&vz===0){p.vx*=.1;p.vz*=.1;}else{p.vx+=vx;p.vz+=vz;}
        p.size*=.75;p.lifetime=Math.floor(8/(rand()*.8+.2));p.physics=false;sprite(p,'spell');break;
      }
      default:return null;
    }
    if(o.color!==undefined&&kind!=='drip')setColour(p,o.color);
    if(p.emissive)p.light=FULL_BRIGHT;
    return p;
  }
  function setColour(p:Particle,c:number){p.r=(c>>16&255)/255;p.g=(c>>8&255)/255;p.b=(c&255)/255;}
  /** Liquid a drip hangs from: the cell it is in or the one just above. 1 water (default), 2 lava. */
  const DRIP_PROBES=[0,.2,1];
  function dripFluid(x:number,y:number,z:number){
    for(const dy of DRIP_PROBES){const id=game.world.get(Math.floor(x),Math.floor(y+dy),Math.floor(z));if(id>0&&LIQUID[id])return LIQUID[id];}
    return 1;
  }

  function spawn(kind:ParticleKind,x:number,y:number,z:number,options:ParticleOptions={}){
    if(!KIND_SET.has(kind)||!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(z))return;
    if(kind==='block'&&(options.block===undefined||options.block<=AIR||!blockDef(options.block).tiles.length))return;
    const count=Math.max(0,Math.min(MAX_PARTICLES,Math.floor(Number.isFinite(options.count)?options.count!:DEFAULT_COUNT[kind])));
    const spread=Number.isFinite(options.spread)?Math.max(0,options.spread!):kind==='explosion'?EXPLOSION_SPREAD:DEFAULT_SPREAD;
    const v=options.velocity,vx=finite(v?.x)/20,vy=finite(v?.y)/20,vz=finite(v?.z)/20;
    if(kind==='explosion'&&count>1){
      const e:Emitter={x,y,z,spread,left:count,perTick:Math.min(EXPLOSION_PER_TICK,Math.max(1,Math.ceil(count/8)))};
      emit(e);if(e.left>0)emitters.push(e);
      if(emitters.length>16)emitters.shift();
      return;
    }
    for(let i=0;i<count;i++){
      const p=spawnOne(kind,x+(rand()*2-1)*spread,y+(rand()*2-1)*spread,z+(rand()*2-1)*spread,vx,vy,vz,options);
      if(!p)return;
      add(p);
    }
  }
  const finite=(n:number|undefined)=>n!==undefined&&Number.isFinite(n)?n:0;
  function emit(e:Emitter){
    const n=Math.min(e.perTick,e.left);e.left-=n;
    for(let i=0;i<n;i++){const p=spawnOne('explosion',e.x+(rand()*2-1)*e.spread,e.y+(rand()*2-1)*e.spread,e.z+(rand()*2-1)*e.spread,0,0,0,{});if(p)add(p);}
  }

  // ---- Simulation ---------------------------------------------------------------------------------------------------
  const world=game.world;
  /** Allowed movement along one axis for a box, against block collision boxes (vanilla collideBoundingBox per axis). */
  function clip(axis:0|1|2,d:number,x0:number,y0:number,z0:number,x1:number,y1:number,z1:number):number{
    if(d===0)return 0;
    const E=1e-7;
    let lx=x0,ly=y0,lz=z0,hx=x1,hy=y1,hz=z1;
    if(axis===0){if(d>0)hx+=d;else lx+=d;}else if(axis===1){if(d>0)hy+=d;else ly+=d;}else if(d>0)hz+=d;else lz+=d;
    const ax=Math.floor(lx),bx=Math.floor(hx-1e-9),ay=Math.floor(ly)-1,by=Math.floor(hy-1e-9),az=Math.floor(lz),bz=Math.floor(hz-1e-9);
    const lo=axis===0?x0:axis===1?y0:z0,hi=axis===0?x1:axis===1?y1:z1;
    for(let cy=ay;cy<=by;cy++)for(let cz=az;cz<=bz;cz++)for(let cx=ax;cx<=bx;cx++){
      const id=world.get(cx,cy,cz);if(id<=0)continue;
      const b=COLLISION_BOXES[id];
      for(let k=0;k<b.length;k+=6){
        const nx=cx+b[k],ny=cy+b[k+1],nz=cz+b[k+2],mx=cx+b[k+3],my=cy+b[k+4],mz=cz+b[k+5];
        if(axis!==0&&(x1<=nx+E||x0>=mx-E))continue;
        if(axis!==1&&(y1<=ny+E||y0>=my-E))continue;
        if(axis!==2&&(z1<=nz+E||z0>=mz-E))continue;
        const bl=axis===0?nx:axis===1?ny:nz,bh=axis===0?mx:axis===1?my:mz;
        if(d>0&&hi<=bl+E)d=Math.min(d,bl-hi);
        else if(d<0&&lo>=bh-E)d=Math.max(d,bh-lo);
      }
    }
    return d;
  }
  function move(p:Particle,dx:number,dy:number,dz:number){
    if(p.stopped)return;
    const ox=dx,oy=dy,oz=dz;
    if(p.physics&&(dx||dy||dz)&&dx*dx+dy*dy+dz*dz<10000){
      const h=p.box/2;let x0=p.x-h,x1=p.x+h,y0=p.y,y1=p.y+p.box,z0=p.z-h,z1=p.z+h;
      dy=clip(1,dy,x0,y0,z0,x1,y1,z1);y0+=dy;y1+=dy;
      if(Math.abs(dx)<Math.abs(dz)){dz=clip(2,dz,x0,y0,z0,x1,y1,z1);z0+=dz;z1+=dz;dx=clip(0,dx,x0,y0,z0,x1,y1,z1);}
      else{dx=clip(0,dx,x0,y0,z0,x1,y1,z1);x0+=dx;x1+=dx;dz=clip(2,dz,x0,y0,z0,x1,y1,z1);}
    }
    p.x+=dx;p.y+=dy;p.z+=dz;
    if(Math.abs(oy)>=1e-5&&Math.abs(dy)<1e-5)p.stopped=true;
    p.onGround=oy!==dy&&oy<0;
    if(ox!==dx)p.vx=0;
    if(oz!==dz)p.vz=0;
  }
  /** Is (x,y,z) below the surface of a liquid of `kind` (1 water, 2 lava)? */
  function inLiquid(x:number,y:number,z:number,kind:number){
    const bx=Math.floor(x),by=Math.floor(y),bz=Math.floor(z),id=world.get(bx,by,bz);
    return id>0&&LIQUID[id]===kind&&y<by+(LIQUID[world.get(bx,by+1,bz)]===kind?1:liquidHeight(id));
  }
  function standard(p:Particle){
    p.vy-=.04*p.gravity;
    const y0=p.y;move(p,p.vx,p.vy,p.vz);
    if(p.speedUpWhenBlocked&&p.y===y0){p.vx*=1.1;p.vz*=1.1;}
    p.vx*=p.friction;p.vy*=p.friction;p.vz*=p.friction;
    if(p.onGround){p.vx*=.7;p.vz*=.7;}
  }
  /** Advances one particle; returns false when it is removed. */
  function step(p:Particle):boolean{
    p.prevX=p.x;p.prevY=p.y;p.prevZ=p.z;
    switch(p.kind){
      case 'bubble':
        if(p.lifetime--<=0)return false;
        p.vy+=.002;move(p,p.vx,p.vy,p.vz);p.vx*=.85;p.vy*=.85;p.vz*=.85;
        return inLiquid(p.x,p.y,p.z,1);
      case 'splash':
        if(p.lifetime--<=0)return false;
        p.vy-=p.gravity;move(p,p.vx,p.vy,p.vz);p.vx*=.98;p.vy*=.98;p.vz*=.98;
        if(p.onGround){if(rand()<.5)return false;p.vx*=.7;p.vz*=.7;}
        return !inLiquid(p.x,p.y,p.z,1)&&!solidAt(p.x,p.y,p.z);
      case 'drip':return stepDrip(p);
      case 'happy':
        if(p.lifetime--<=0)return false;
        move(p,p.vx,p.vy,p.vz);p.vx*=.99;p.vy*=.99;p.vz*=.99;return true;
      case 'portal':{
        if(p.age++>=p.lifetime)return false;
        const f=p.age/p.lifetime,f1=-f+f*f*2,f2=1-f1;
        p.x=p.sx+p.vx*f2;p.y=p.sy+p.vy*f2+(1-f);p.z=p.sz+p.vz*f2;
        return true;
      }
      default:{
        if(p.age++>=p.lifetime)return false;
        if(p.kind!=='explosion'&&p.kind!=='sweep')standard(p);
        if(p.kind==='lava'&&rand()>p.age/p.lifetime){
          const s=spawnOne('smoke',p.x,p.y,p.z,0,0,0,{});
          if(s){s.vx=p.vx;s.vy=p.vy;s.vz=p.vz;add(s);}
        }
        return true;
      }
    }
  }
  function solidAt(x:number,y:number,z:number){
    const id=world.get(Math.floor(x),Math.floor(y),Math.floor(z));if(id<=0)return false;
    const b=COLLISION_BOXES[id],fy=y-Math.floor(y),fx=x-Math.floor(x),fz=z-Math.floor(z);
    for(let k=0;k<b.length;k+=6)if(fx>=b[k]&&fx<=b[k+3]&&fy>=b[k+1]&&fy<b[k+4]&&fz>=b[k+2]&&fz<=b[k+5])return true;
    return false;
  }
  /** DripHangParticle → FallAndLandParticle → DripLandParticle. */
  function stepDrip(p:Particle):boolean{
    if(p.lifetime--<=0){
      if(p.state!==0)return false;
      // The hanging drop lets go: it becomes a falling drop at the same place.
      p.state=1;p.gravity=.06;p.lifetime=Math.floor(64/(rand()*.8+.2));sprite(p,'drip_fall');
      if(p.fluid===2){p.r=1;p.g=.2857143;p.b=.083333336;}
      return true;
    }
    if(p.state===0&&p.fluid===2){p.g=16/(40-p.lifetime+16);p.b=4/(40-p.lifetime+8);}
    p.vy-=p.gravity;move(p,p.vx,p.vy,p.vz);
    if(p.state===0){p.vx*=.02;p.vy*=.02;p.vz*=.02;}
    else if(p.state===1&&p.onGround){
      // Splat: a landed drop that stays a moment.
      p.state=2;p.lifetime=Math.floor(16/(rand()*.8+.2));p.vx=p.vy=p.vz=0;sprite(p,'drip_land');return true;
    }
    p.vx*=.98;p.vy*=.98;p.vz*=.98;
    if(p.state===1&&p.fluid&&inLiquid(p.x,p.y,p.z,p.fluid))return false;
    return true;
  }
  function tick(){
    for(let i=0;i<emitters.length;i++){emit(emitters[i]);if(emitters[i].left<=0)emitters.splice(i--,1);}
    const n=live.length;let w=0;
    ticking=true;
    for(let i=0;i<n;i++){
      const p=live[i];
      if(step(p)){
        if(!p.emissive)p.light=lightAt(p.x,p.y+p.box/2,p.z);
        live[w++]=p;
      }else pool.push(p);
    }
    ticking=false;live.length=w;
    for(let i=0;i<queued.length;i++)add(queued[i]);
    queued.length=0;
  }

  // ---- Instances ----------------------------------------------------------------------------------------------------
  function update(partial:number){
    const t=Math.max(0,Math.min(1,Number.isFinite(partial)?partial:0)),n=live.length;
    const pos=iPos.array as Float32Array,uv=iUV.array as Float32Array,col=iColor.array as Float32Array,misc=iMisc.array as Float32Array;
    for(let i=0;i<n;i++){
      const p=live[i],a=i*4;
      // Vanilla centres the quad on the position (the bottom of the collision box).
      pos[a]=p.prevX+(p.x-p.prevX)*t;pos[a+1]=p.prevY+(p.y-p.prevY)*t;pos[a+2]=p.prevZ+(p.z-p.prevZ)*t;
      pos[a+3]=p.size*sizeFactor(p,t);
      if(p.frames>1){
        const life=Math.max(1,p.lifetime),age=p.age;
        // setSpriteFromAge; the generic smoke sprites run from the largest (7) to the smallest.
        let frame=Math.min(p.frames-1,Math.floor(age*p.frames/life));
        if(p.kind==='smoke'||p.kind==='large_smoke'||p.kind==='poof')frame=p.frames-1-frame;
        if(p.kind!=='splash'&&p.kind!=='portal')setCell(p,p.cell+frame);
      }
      uv[a]=p.u0;uv[a+1]=p.v0;uv[a+2]=p.u1;uv[a+3]=p.v1;
      col[a]=p.r;col[a+1]=p.g;col[a+2]=p.b;col[a+3]=p.a;
      misc[i*2]=p.emissive?FULL_BRIGHT:p.light;misc[i*2+1]=p.texture==='atlas'?TEX_ATLAS:TEX_SHEET;
    }
    for(const a of instanceAttributes){a.clearUpdateRanges();a.addUpdateRange(0,n*a.itemSize);a.needsUpdate=true;}
    geometry.instanceCount=n;mesh.visible=n>0;
  }
  function sizeFactor(p:Particle,t:number){
    const f=Math.min(1,(p.age+t)/Math.max(1,p.lifetime));
    switch(p.kind){
      case 'heart':case 'angry':return Math.max(0,Math.min(1,f*32));
      case 'flame':return 1-f*f*.5;
      case 'lava':return 1-f*f;
      case 'portal':{const g=1-f;return 1-g*g;}
      default:return 1;
    }
  }
  function reset(){for(const p of live)pool.push(p);live.length=0;queued.length=0;emitters.length=0;update(0);}
  return{
    mesh,sheet,
    get count(){return live.length;},
    spawn,tick,update,reset,
    particles:()=>live,
    dispose(){reset();geometry.dispose();material.dispose();sheet.dispose();}
  };
}
