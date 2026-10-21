// Terrain and biomes (pure and deterministic: it also runs inside world/worker.ts).
//
// A chunk is built in passes, every one a pure function of the seed and world position, so chunks generated in
// any order, in any worker, meet seamlessly:
//  1. climate (terrain-climate.ts): multi-noise biome and surface height per column (also for a one-column rim);
//  2. base terrain: jagged bedrock at y 0-4, deepslate below y 8 dithered into stone over y 8-16, stone, then the
//     biome surface rules (top, 3-5 filler blocks, sandstone under sand, underwater gravel/clay/sand patches) and
//     water up to sea level;
//  3. underground blobs and ores (terrain-ores.ts), replayed from the 3×3 neighbourhood;
//  4. noise caves (terrain-caves.ts): cheese caverns, spaghetti and noodle tunnels, kept away from water, open to
//     the surface only at rare entrances, lava below y 10, moss patches and mushrooms on cave floors;
//  5. small structures (terrain-structures.ts) inside their own chunk;
//  6. trees (terrain-trees.ts) planned per trunk column (treeAt) from a TREE_REACH margin of neighbouring columns;
//  7. vegetation from the biome lists, pumpkin patches, then snow layers and ice where coldAt() holds.
import {Simplex} from './noise';
import * as noise from './noise';
import {Climate} from './terrain-climate';
import {CaveField,CHEESE_MIN_DEPTH} from './terrain-caves';
import {OrePlacer} from './terrain-ores';
import {planTree,TREE_REACH,treeLeaves,treeLog,treeWood,type TreeSink} from './terrain-trees';
import {desertWell,placeStructure,ruinedPortal,type Structure} from './terrain-structures';
import * as registry from '../data/blocks';
import {BIOMES,biomeId,type BiomeDef} from '../data/biomes';
import * as biomeRegistry from '../data/biomes';
import * as constants from '../engine/constants';
import type {BlockWriter,ChunkData,TerrainService,TreeKind,Vec3} from '../engine/contracts';

// Imported values used in hot loops are bound to module-local constants (plain reads; module bindings can be
// accessors under test transforms).
const {hash3,hashInt,mulberry32}=noise,{coldAt}=biomeRegistry,{CS,CH,LAYER,CHUNK_VOLUME,SEA_LEVEL}=constants;
const {AIR,B,BLOCK_BY_NAME,blockId,LIQUID,OPAQUE,REPLACEABLE,SOLID}=registry;

export type {Structure} from './terrain-structures';
/** A generated tree: kind, trunk base (the first log; the -x/-z corner of a 2×2 trunk) and the seed of its shape. */
export interface TreeInfo{kind:TreeKind;x:number;y:number;z:number;seed:number;wide:boolean}

const id=(name:string)=>blockId(name);
const BEDROCK=B.bedrock,STONE=B.stone,DEEPSLATE=id('deepslate'),DIRT=B.dirt,SAND=B.sand,GRAVEL=B.gravel,CLAY=id('clay');
const SANDSTONE=id('sandstone'),COARSE=id('coarse_dirt'),PODZOL=id('podzol'),GRASS=B.grass,MOSS=id('moss_block');
const SNOW=B.snow,ICE=B.ice,WATER=B.water,LAVA=B.lava,CACTUS=id('cactus'),CANE=id('sugar_cane'),LILY=id('lily_pad');
const PUMPKIN=id('pumpkin'),MELON=id('melon'),BROWN_MUSHROOM=id('brown_mushroom'),RED_MUSHROOM=id('red_mushroom');
/** Cave air below this height is lava. */
export const LAVA_LEVEL=10;
const RIM=CS+2;

const table=(names:string[])=>{const t=new Uint8Array(256);for(const n of names)t[id(n)]=1;return t;};
const SOIL=table(['grass_block','dirt','coarse_dirt','podzol','mycelium']);
const TREE_SOIL=table(['grass_block','dirt','coarse_dirt','podzol']);
const SANDS=table(['sand','red_sand']);
const MOSS_FLOOR=table(['stone','deepslate','tuff','granite','diorite','andesite','dirt']);
const LEAVES=new Uint8Array(256),LOGS=new Uint8Array(256),SAPLINGS=new Uint8Array(256);
for(const d of BLOCK_BY_NAME.values()){
  if(d.family.endsWith('_leaves'))LEAVES[d.id]=1;
  if(d.family.endsWith('_log'))LOGS[d.id]=1;
  if(d.family.endsWith('_sapling'))SAPLINGS[d.id]=1;
}
/** Ground a tree turns to dirt under its trunk (vanilla keeps podzol and dirt). */
const TO_DIRT=table(['grass_block','mycelium','farmland','farmland_wet']);

// ---- Per-biome generation data -----------------------------------------------------------------------
/** Surface rule families. */
const R_DEFAULT=0,R_OCEAN=1,R_DESERT=2,R_BEACH=3,R_BADLANDS=4,R_PEAKS=5,R_HILLS=6,R_SHORE=7,R_SAVANNA=8,R_SWAMP=9;
/** Plant kinds: a supported plant, a cactus column, or a plain block (melon). */
const P_GROUND=0,P_CACTUS=1,P_BLOCK=2;
interface PlantRule{id:number;chance:number;kind:number;
  /** Ground the plant needs: soil, soil or sand, or any opaque block. */
  needs:Uint8Array}
interface BiomeInfo{def:BiomeDef;rule:number;top:number;filler:number;underwater:number;
  treeP:number;trees:readonly (readonly [TreeKind,number])[];treeTotal:number;
  plants:PlantRule[];cane:number;lily:number;pumpkin:number}
const RULES:Record<string,number>={ocean:R_OCEAN,deep_ocean:R_OCEAN,desert:R_DESERT,beach:R_BEACH,badlands:R_BADLANDS,
  snowy_peaks:R_PEAKS,mountains:R_HILLS,stony_shore:R_SHORE,savanna:R_SAVANNA,swamp:R_SWAMP};
const SOIL_OR_SAND=new Uint8Array(256).map((_,i)=>SOIL[i]|SANDS[i]);
const INFO:BiomeInfo[]=BIOMES.map(def=>{
  const plants:PlantRule[]=[];let cane=0,lily=0,pumpkin=0;
  for(const [name,chance] of def.vegetation){
    if(name==='sugar_cane'){cane=chance;continue;}
    if(name==='lily_pad'){lily=chance;continue;}
    if(name==='pumpkin'){pumpkin=chance;continue;}
    const block=BLOCK_BY_NAME.get(name);if(!block)continue;
    if(name==='cactus')plants.push({id:block.id,chance,kind:P_CACTUS,needs:SANDS});
    else if(!block.support)plants.push({id:block.id,chance,kind:P_BLOCK,needs:SOIL});
    else plants.push({id:block.id,chance,kind:P_GROUND,needs:block.support==='opaque_below'?OPAQUE:block.support==='soil_or_sand'?SOIL_OR_SAND:SOIL});
  }
  return{def,rule:RULES[def.name]??R_DEFAULT,top:id(def.top),filler:id(def.filler),underwater:id(def.underwater),
    treeP:def.treeDensity/LAYER,trees:def.trees as readonly (readonly [TreeKind,number])[],treeTotal:def.trees.reduce((a,[,w])=>a+w,0),
    plants,cane,lily,pumpkin};
});
const MAX_TREE_P=Math.max(...INFO.map(i=>i.treeP));
/** Never spawn in water or on bare peaks; prefer grassland (beaches and mushroom islands only as a last resort). */
const NO_SPAWN=new Set(['ocean','deep_ocean','river','frozen_river','stony_shore','snowy_peaks','swamp'].map(biomeId));
const POOR_SPAWN=new Set(['beach','mushroom_fields'].map(biomeId));
const DESERT=biomeId('desert');
const NO_PORTAL=new Set(['ocean','deep_ocean','river','frozen_river','beach','swamp','mushroom_fields'].map(biomeId));
/** Chance per chunk of a desert well (in deserts) and a ruined portal (on dry land). */
export const WELL_CHANCE=1/64,PORTAL_CHANCE=1/300;
const COLUMN_CACHE=1<<15,CACHE_LIMIT=40000;
const columnKey=(x:number,z:number)=>(x+0x100000)*0x200000+(z+0x100000);

/** Collects a planned tree's blocks (reused). */
class PlanBuffer implements TreeSink{
  logs:number[]=[];leaves:number[]=[];maxY=-1;
  reset(){this.logs.length=0;this.leaves.length=0;this.maxY=-1;}
  log(x:number,y:number,z:number){this.logs.push(x,y,z);if(y>this.maxY)this.maxY=y;}
  leaf(x:number,y:number,z:number){this.leaves.push(x,y,z);if(y>this.maxY)this.maxY=y;}
}

export class TerrainGenerator implements TerrainService{
  readonly seed:number;
  private readonly climate:Climate;
  private readonly caves:CaveField;
  private readonly ores:OrePlacer;
  private readonly depthNoise:Simplex;private readonly patchNoise:Simplex;private readonly entranceNoise:Simplex;private readonly mossNoise:Simplex;
  // Direct-mapped column cache of height and biome (pure values, so caching never changes results).
  private readonly cacheX=new Int32Array(COLUMN_CACHE).fill(0x7fffffff);private readonly cacheZ=new Int32Array(COLUMN_CACHE);
  private readonly cacheH=new Int16Array(COLUMN_CACHE);private readonly cacheB=new Uint8Array(COLUMN_CACHE);
  private readonly treeCache=new Map<number,TreeInfo|null>();
  private readonly structureCache=new Map<number,Structure|null>();
  private readonly plan=new PlanBuffer();
  private readonly rim=new Int16Array(RIM*RIM);
  private readonly carveCap=new Int16Array(LAYER);
  private readonly keep=new Uint8Array(LAYER);
  private readonly kinds=new Uint8Array(CH);
  private readonly trees:TreeInfo[]=[];
  private spawn:Vec3|null=null;
  // Surface rule output (see surface()).
  private sTop=0;private sFiller=0;private sDepth=0;private sUnder=0;private sUnderDepth=0;

  constructor(seed:number){
    this.seed=seed>>>0;
    this.climate=new Climate(this.seed);this.caves=new CaveField(this.seed);this.ores=new OrePlacer(this.seed);
    this.depthNoise=new Simplex(this.seed^0x2f1a6c33);this.patchNoise=new Simplex(this.seed^0x7d3b9e21);
    this.entranceNoise=new Simplex(this.seed^0x13c6ef37);this.mossNoise=new Simplex(this.seed^0x4b1d58a9);
  }

  // ---- Columns ------------------------------------------------------------------------------------------
  /** Cache slot of column (x,z), computing its climate on a miss. */
  private slot(x:number,z:number):number{
    const s=((Math.imul(x,0x9e3779b1)^Math.imul(z,0x85ebca6b))>>>17)&(COLUMN_CACHE-1);
    if(this.cacheX[s]!==x||this.cacheZ[s]!==z){
      const c=this.climate.column(x,z);
      this.cacheX[s]=x;this.cacheZ[s]=z;this.cacheH[s]=c.height;this.cacheB[s]=c.biome;
    }
    return s;
  }
  heightAt(x:number,z:number):number{return this.cacheH[this.slot(Math.floor(x),Math.floor(z))];}
  biomeAt(x:number,z:number){return this.cacheB[this.slot(Math.floor(x),Math.floor(z))];}
  private slopeAt(x:number,z:number,h:number){
    return Math.max(Math.abs(this.heightAt(x+1,z)-h),Math.abs(this.heightAt(x-1,z)-h),Math.abs(this.heightAt(x,z+1)-h),Math.abs(this.heightAt(x,z-1)-h));
  }

  /** Surface rules of a column with top block at height h: sets sTop, sFiller (sDepth blocks below the top) and an
   *  optional sUnder layer (sUnderDepth blocks) above the stone. */
  private surface(x:number,z:number,h:number,info:BiomeInfo,slope:number){
    let depth=3+Math.floor((this.depthNoise.noise2(x*.11,z*.11)+1)*1.5);if(depth>5)depth=5;
    const patch=this.patchNoise.noise2(x*.08,z*.08);
    let top=info.top,filler=info.filler,under=0,underDepth=0;
    if(h<SEA_LEVEL){
      let floor=info.underwater;
      if(info.rule===R_OCEAN&&h>=55)floor=SAND;
      if(info.rule===R_SWAMP)floor=patch>.05?CLAY:DIRT;
      else if(info.rule===R_BEACH){/* beaches stay sandy below the waterline */}
      else if(patch>.55)floor=CLAY;
      else if(patch<-.5)floor=floor===GRAVEL?SAND:GRAVEL;
      top=floor;filler=floor===CLAY?CLAY:floor;if(floor===CLAY)depth=2;
      if(floor===SAND){under=SANDSTONE;underDepth=2;}
    }else switch(info.rule){
      case R_DESERT:under=SANDSTONE;underDepth=depth+1;break;
      case R_BEACH:under=SANDSTONE;underDepth=2;break;
      case R_BADLANDS:depth+=2;break;
      case R_PEAKS:if(slope>=3||slope===2&&patch>.1)top=STONE;break;
      case R_HILLS:if(slope>=3){top=STONE;filler=STONE;}else if(h>=100&&patch>.35){top=GRAVEL;filler=GRAVEL;}break;
      case R_SHORE:if(patch<-.4){top=GRAVEL;filler=GRAVEL;}break;
      case R_SAVANNA:if(h>=85&&slope>=3){top=STONE;filler=STONE;}else if(h>=80&&patch>.5)top=COARSE;break;
      default:if(h>=95&&slope>=4){top=STONE;filler=STONE;}
    }
    this.sTop=top;this.sFiller=filler;this.sDepth=depth;this.sUnder=under;this.sUnderDepth=underDepth;
  }

  // ---- Structures -----------------------------------------------------------------------------------------
  /** The structure generated in chunk (cx,cz), if any (pure; it lies entirely inside the chunk). */
  structureIn(cx:number,cz:number):Structure|null{
    const key=columnKey(cx,cz),cached=this.structureCache.get(key);
    if(cached!==undefined)return cached;
    const s=this.findStructure(cx,cz);
    if(this.structureCache.size>=CACHE_LIMIT)this.structureCache.clear();
    this.structureCache.set(key,s);return s;
  }
  private findStructure(cx:number,cz:number):Structure|null{
    const seed=this.seed,roll=hashInt(cx,0x5747,cz,seed)/4294967296,x0=cx*CS,z0=cz*CS;
    const r=(salt:number)=>hash3(cx,salt,cz,seed);
    const range=(minX:number,maxX:number,minZ:number,maxZ:number,ok:(h:number,b:number)=>boolean)=>{
      let lo=CH,hi=0;
      for(let z=minZ;z<=maxZ;z++)for(let x=minX;x<=maxX;x++){
        const h=this.heightAt(x,z);if(!ok(h,this.biomeAt(x,z)))return -1;
        if(h<lo)lo=h;if(h>hi)hi=h;
      }
      return hi-lo;
    };
    if(roll<WELL_CHANCE){
      const x=x0+3+Math.floor(r(1)*10),z=z0+3+Math.floor(r(2)*10),y=this.heightAt(x,z);
      const spread=range(x-2,x+2,z-2,z+2,(h,b)=>b===DESERT&&h>SEA_LEVEL);
      return spread>=0&&spread<=3?desertWell(x,y,z,hashInt(cx,0x3e11,cz,seed)):null;
    }
    if(roll<WELL_CHANCE+PORTAL_CHANCE){
      const alongX=r(3)<.5,x=x0+3+Math.floor(r(4)*(alongX?7:10)),z=z0+3+Math.floor(r(5)*(alongX?10:7));
      const s=ruinedPortal(x,0,z,alongX,hashInt(cx,0x9077,cz,seed));
      const spread=range(s.minX,s.maxX,s.minZ,s.maxZ,(h,b)=>h>SEA_LEVEL+1&&h<CH-12&&!NO_PORTAL.has(b));
      if(spread<0||spread>2)return null;
      s.y=this.heightAt(alongX?x+1:x,alongX?z:z+1);
      return s;
    }
    return null;
  }
  /** True when a structure footprint (grown by one) comes within TREE_REACH of column (x,z). */
  private nearStructure(x:number,z:number){
    const r=TREE_REACH+2;
    for(let cz=Math.floor((z-r)/CS);cz<=Math.floor((z+r)/CS);cz++)for(let cx=Math.floor((x-r)/CS);cx<=Math.floor((x+r)/CS);cx++){
      const s=this.structureIn(cx,cz);
      if(s&&x+r>=s.minX&&x-r<=s.maxX&&z+r>=s.minZ&&z-r<=s.maxZ)return true;
    }
    return false;
  }

  // ---- Trees -----------------------------------------------------------------------------------------------
  /** The tree whose trunk origin is column (x,z), or null. Pure: every chunk that reaches the tree agrees. */
  treeAt(x:number,z:number):TreeInfo|null{
    const roll=hashInt(x,0x7ee5,z,this.seed)/4294967296;
    if(roll>=MAX_TREE_P)return null;
    const key=columnKey(x,z),cached=this.treeCache.get(key);
    if(cached!==undefined)return cached;
    const tree=this.findTree(x,z,roll);
    if(this.treeCache.size>=CACHE_LIMIT)this.treeCache.clear();
    this.treeCache.set(key,tree);return tree;
  }
  private findTree(x:number,z:number,roll:number):TreeInfo|null{
    const seed=this.seed,s=this.slot(x,z),h=this.cacheH[s],info=INFO[this.cacheB[s]];
    if(roll>=info.treeP||h<=SEA_LEVEL||h>=CH-6)return null;
    const slope=this.slopeAt(x,z,h);if(slope>2)return null;
    this.surface(x,z,h,info,slope);if(!TREE_SOIL[this.sTop])return null;
    // One trunk per neighbourhood: the lowest roll wins.
    for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
      if(!dx&&!dz)continue;
      const other=hashInt(x+dx,0x7ee5,z+dz,seed)/4294967296;
      if(other<info.treeP&&other<roll)return null;
    }
    let pick=hash3(x,0x51,z,seed)*info.treeTotal,kind=info.trees[info.trees.length-1][0];
    for(const [k,w] of info.trees){pick-=w;if(pick<0){kind=k;break;}}
    let wide=kind==='dark_oak'||kind==='mega_spruce'||kind==='jungle'&&hash3(x,0x52,z,seed)<.3;
    if(wide){
      const flat=this.heightAt(x+1,z)===h&&this.heightAt(x,z+1)===h&&this.heightAt(x+1,z+1)===h&&this.slopeAt(x+1,z+1,h)<=2;
      if(!flat){if(kind!=='jungle')return null;wide=false;}
    }
    if(this.nearStructure(x,z))return null;
    const y=h+1,treeSeed=hashInt(x,0x5eed,z,seed),plan=this.plan;
    plan.reset();planTree(kind,x,y,z,mulberry32(treeSeed),plan,wide);
    if(plan.maxY>=CH)return null;
    // Logs (trunk, branches, stubs) must all stand above the terrain surface.
    const logs=plan.logs;
    for(let i=0;i<logs.length;i+=3)if(this.heightAt(logs[i],logs[i+2])>=logs[i+1])return null;
    return{kind,x,y,z,seed:treeSeed,wide};
  }

  // ---- Chunk generation ---------------------------------------------------------------------------------
  generate(cx:number,cz:number):ChunkData{
    const blocks=new Uint8Array(CHUNK_VOLUME),biomes=new Uint8Array(LAYER);
    const x0=cx*CS,z0=cz*CS,rim=this.rim,seed=this.seed;
    let maxH=0;
    for(let z=-1;z<=CS;z++)for(let x=-1;x<=CS;x++){
      const s=this.slot(x0+x,z0+z);rim[(x+1)+(z+1)*RIM]=this.cacheH[s];
      if(x>=0&&z>=0&&x<CS&&z<CS){biomes[x+z*CS]=this.cacheB[s];if(this.cacheH[s]>maxH)maxH=this.cacheH[s];}
    }
    const H=(x:number,z:number)=>rim[(x+1)+(z+1)*RIM];
    const structure=this.structureIn(cx,cz);
    const trees=this.trees;trees.length=0;
    for(let z=z0-TREE_REACH;z<z0+CS+TREE_REACH;z++)for(let x=x0-TREE_REACH;x<x0+CS+TREE_REACH;x++){const t=this.treeAt(x,z);if(t)trees.push(t);}
    // Caves keep clear of trunks and structures; plants keep clear of structures.
    const cap=this.carveCap,keep=this.keep;cap.fill(CH);keep.fill(0);
    for(const t of trees){
      const w=t.wide?1:0;
      for(let dz=0;dz<=w;dz++)for(let dx=0;dx<=w;dx++){
        const lx=t.x+dx-x0,lz=t.z+dz-z0;
        if(lx>=0&&lz>=0&&lx<CS&&lz<CS)cap[lx+lz*CS]=Math.min(cap[lx+lz*CS],t.y-5);
      }
    }
    if(structure)for(let z=structure.minZ-1;z<=structure.maxZ+1;z++)for(let x=structure.minX-1;x<=structure.maxX+1;x++){
      const lx=x-x0,lz=z-z0;
      if(lx>=0&&lz>=0&&lx<CS&&lz<CS){keep[lx+lz*CS]=1;cap[lx+lz*CS]=Math.min(cap[lx+lz*CS],H(lx,lz)-6);}
    }

    // Base terrain and surface.
    for(let z=0;z<CS;z++)for(let x=0;x<CS;x++){
      const col=x+z*CS,wx=x0+x,wz=z0+z,h=H(x,z),info=INFO[biomes[col]];
      const slope=Math.max(Math.abs(H(x+1,z)-h),Math.abs(H(x-1,z)-h),Math.abs(H(x,z+1)-h),Math.abs(H(x,z-1)-h));
      this.surface(wx,wz,h,info,slope);
      const fillerFrom=h-this.sDepth,underFrom=fillerFrom-this.sUnderDepth;
      blocks[col]=BEDROCK;
      for(let y=1;y<=h;y++){
        let block:number;
        if(y===h)block=this.sTop;
        else if(y>=fillerFrom)block=this.sFiller;
        else if(y>=underFrom)block=this.sUnder;
        else if(y<=4&&hash3(wx,y,wz,seed^0xbed)<(5-y)/5)block=BEDROCK;
        else if(y<8)block=DEEPSLATE;
        else if(y<16)block=hash3(wx,y,wz,seed^0xd5)<(16-y)/8?DEEPSLATE:STONE;
        else block=STONE;
        blocks[col+y*LAYER]=block;
      }
      for(let y=h+1;y<=SEA_LEVEL;y++)blocks[col+y*LAYER]=WATER;
    }

    this.ores.place(blocks,biomes,cx,cz,maxH);
    this.carve(blocks,cx,cz,maxH);
    if(structure)placeStructure(structure,blocks,cx,cz,(x,z)=>this.heightAt(x,z));
    this.placeTrees(blocks,cx,cz);
    this.decorate(blocks,biomes,cx,cz);
    return{blocks,biomes};
  }

  private carve(blocks:Uint8Array,cx:number,cz:number,maxH:number){
    const x0=cx*CS,z0=cz*CS,rim=this.rim,cap=this.carveCap,kinds=this.kinds,caves=this.caves,seed=this.seed;
    caves.fillChunk(cx,cz,maxH);
    for(let z=0;z<CS;z++)for(let x=0;x<CS;x++){
      const col=x+z*CS,wx=x0+x,wz=z0+z,h=rim[(x+1)+(z+1)*RIM];
      // Keep at least three blocks between any cave and water in this or a neighbouring column.
      let limit=Math.min(cap[col],h);
      for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){const hn=rim[(x+1+dx)+(z+1+dz)*RIM];if(hn<SEA_LEVEL&&hn-3<limit)limit=hn-3;}
      const entrance=h>SEA_LEVEL+1&&this.entranceNoise.noise2(wx/40,wz/40)>.45;
      const top=Math.min(limit,entrance?h:h-6),cheeseTop=Math.min(limit,h-CHEESE_MIN_DEPTH);
      if(top<1)continue;
      caves.prepareColumn(x,z,top);caves.carveColumn(kinds,top,cheeseTop);
      let moss=-1;
      let open=false;
      for(let y=1;y<=top;y++){
        if(!kinds[y]){open=false;continue;}
        const i=col+y*LAYER,b=blocks[i];
        if(b===BEDROCK||LIQUID[b]){open=false;continue;}
        if(y<LAVA_LEVEL){blocks[i]=LAVA;open=true;continue;}
        blocks[i]=AIR;
        if(!open){
          // Floor of a cave: moss patches and the odd mushroom.
          const f=i-LAYER;
          if(y<h-8&&MOSS_FLOOR[blocks[f]]){
            if(moss<0)moss=this.mossNoise.noise2(wx/48,wz/48)>.2?1:0;
            if(moss&&hash3(wx,y,wz,seed^0x305)<.75)blocks[f]=MOSS;
          }
          if(y<h-10&&OPAQUE[blocks[f]]){const m=hash3(wx,y,wz,seed^0x6d);if(m<.012)blocks[i]=m<.008?BROWN_MUSHROOM:RED_MUSHROOM;}
        }
        open=true;
      }
    }
  }

  private placeTrees(blocks:Uint8Array,cx:number,cz:number){
    const x0=cx*CS,z0=cz*CS,plan=this.plan,seed=this.seed;
    const inside=(x:number,z:number)=>x>=x0&&z>=z0&&x<x0+CS&&z<z0+CS;
    for(const t of this.trees){
      plan.reset();planTree(t.kind,t.x,t.y,t.z,mulberry32(t.seed),plan,t.wide);
      const log=treeLog(t.kind),leaf=treeLeaves(t.kind),{logs,leaves}=plan;
      for(let i=0;i<logs.length;i+=3){const x=logs[i],z=logs[i+2];if(inside(x,z))blocks[(x-x0)+(z-z0)*CS+logs[i+1]*LAYER]=log;}
      for(let i=0;i<leaves.length;i+=3){
        const x=leaves[i],z=leaves[i+2];if(!inside(x,z))continue;
        const index=(x-x0)+(z-z0)*CS+leaves[i+1]*LAYER;if(blocks[index]===AIR)blocks[index]=leaf;
      }
      const w=t.wide?1:0;
      for(let dz=0;dz<=w;dz++)for(let dx=0;dx<=w;dx++)if(inside(t.x+dx,t.z+dz))blocks[(t.x+dx-x0)+(t.z+dz-z0)*CS+(t.y-1)*LAYER]=DIRT;
      if(t.kind==='mega_spruce'&&t.wide){
        // Podzol spreads round giant spruces (vanilla alter-ground decorator).
        for(let z=t.z-4;z<=t.z+5;z++)for(let x=t.x-4;x<=t.x+5;x++){
          if(!inside(x,z))continue;
          const d=Math.max(x<t.x?t.x-x:x>t.x+1?x-t.x-1:0,z<t.z?t.z-z:z>t.z+1?z-t.z-1:0);
          if(hash3(x,0x9d,z,seed)>=(d<=2?.85:.45))continue;
          const h=this.rim[(x-x0+1)+(z-z0+1)*RIM];if(Math.abs(h-(t.y-1))>3)continue;
          const index=(x-x0)+(z-z0)*CS+h*LAYER,b=blocks[index];
          if(b===GRASS||b===DIRT||b===COARSE)blocks[index]=PODZOL;
        }
      }
    }
  }

  /** Vegetation, pumpkin patches, snow layers and ice. */
  private decorate(blocks:Uint8Array,biomes:Uint8Array,cx:number,cz:number){
    const x0=cx*CS,z0=cz*CS,rim=this.rim,keep=this.keep,seed=this.seed;
    for(let z=0;z<CS;z++)for(let x=0;x<CS;x++){
      const col=x+z*CS;if(keep[col])continue;
      const wx=x0+x,wz=z0+z,h=rim[(x+1)+(z+1)*RIM],info=INFO[biomes[col]];
      if(h<SEA_LEVEL){
        const surface=col+(SEA_LEVEL+1)*LAYER;
        if(info.lily>0&&blocks[surface-LAYER]===WATER&&blocks[surface]===AIR&&hash3(wx,5,wz,seed)<info.lily)blocks[surface]=LILY;
        continue;
      }
      if(h+1>=CH)continue;
      const ground=blocks[col+h*LAYER],above=col+(h+1)*LAYER;
      if(blocks[above]!==AIR)continue;
      if(info.cane>0&&h===SEA_LEVEL&&x>0&&z>0&&x<CS-1&&z<CS-1&&SOIL_OR_SAND[ground]){
        const g=col+h*LAYER;
        // Water that stays liquid (cold water freezes in the snow pass below).
        const wet=(n:number)=>LIQUID[blocks[g+n]]===1&&!INFO[biomes[col+n]].def.snowy;
        if(wet(1)||wet(-1)||wet(CS)||wet(-CS)){
          if(hash3(wx,6,wz,seed)<info.cane){
            const tall=1+Math.floor(hash3(wx,7,wz,seed)*3);
            for(let k=0;k<tall&&blocks[above+k*LAYER]===AIR;k++)blocks[above+k*LAYER]=CANE;
          }
          continue;
        }
      }
      let roll=hash3(wx,3,wz,seed);
      for(const p of info.plants){
        roll-=p.chance;if(roll>=0)continue;
        if(!p.needs[ground])break;
        if(p.kind===P_CACTUS){
          // Cacti on even columns only (never side by side), clear of every solid neighbour.
          if((wx&1)||(wz&1)||x<1||z<1||x>CS-2||z>CS-2)break;
          const tall=1+Math.floor(hash3(wx,8,wz,seed)*3);
          for(let k=0;k<tall&&h+1+k<CH;k++){
            const i=above+k*LAYER;
            if(blocks[i]!==AIR||SOLID[blocks[i+1]]||SOLID[blocks[i-1]]||SOLID[blocks[i+CS]]||SOLID[blocks[i-CS]])break;
            blocks[i]=CACTUS;
          }
        }else blocks[above]=p.id;
        break;
      }
    }
    // Rare pumpkin patches.
    {
      const px=4+Math.floor(hash3(cx,0x70,cz,seed)*8),pz=4+Math.floor(hash3(cx,0x71,cz,seed)*8),info=INFO[biomes[px+pz*CS]];
      if(info.pumpkin>0&&hash3(cx,0x72,cz,seed)<info.pumpkin*LAYER)for(let k=0;k<8;k++){
        const x=px+Math.floor(hash3(cx,0x80+k,cz,seed)*7)-3,z=pz+Math.floor(hash3(cx,0x90+k,cz,seed)*7)-3,col=x+z*CS;
        if(keep[col])continue;
        const h=rim[(x+1)+(z+1)*RIM];if(h<SEA_LEVEL||h+1>=CH)continue;
        if(blocks[col+h*LAYER]===GRASS&&blocks[col+(h+1)*LAYER]===AIR)blocks[col+(h+1)*LAYER]=PUMPKIN;
      }
    }
    // Snow on exposed tops and ice on still water where it is cold enough.
    for(let col=0;col<LAYER;col++){
      const def=INFO[biomes[col]].def;
      let y=CH-1;while(y>0&&blocks[col+y*LAYER]===AIR)y--;
      const top=blocks[col+y*LAYER];
      if(top===WATER){if(y===SEA_LEVEL&&coldAt(def,y))blocks[col+y*LAYER]=ICE;}
      else if(y+1<CH&&(OPAQUE[top]||LEAVES[top])&&coldAt(def,y+1))blocks[col+(y+1)*LAYER]=SNOW;
    }
  }

  // ---- Spawn ------------------------------------------------------------------------------------------------
  spawnPoint():Vec3{
    if(this.spawn)return{...this.spawn};
    const chunks=new Map<number,ChunkData>();
    const get=(x:number,y:number,z:number)=>{
      if(y<0)return BEDROCK;if(y>=CH)return AIR;
      const cx=Math.floor(x/CS),cz=Math.floor(z/CS),key=columnKey(cx,cz);
      let c=chunks.get(key);
      if(!c){if(chunks.size>=32)chunks.clear();c=this.generate(cx,cz);chunks.set(key,c);}
      return c.blocks[(x-cx*CS)+(z-cz*CS)*CS+y*LAYER];
    };
    for(const fussy of [true,false])for(let r=0;r<=1024;r+=4){
      const n=r===0?1:Math.ceil(Math.PI*2*r/6);
      for(let a=0;a<n;a++){
        const angle=a/n*Math.PI*2,x=Math.round(Math.cos(angle)*r),z=Math.round(Math.sin(angle)*r),h=this.heightAt(x,z),b=this.biomeAt(x,z);
        if(h<=SEA_LEVEL+1||h>=96||NO_SPAWN.has(b)||fussy&&POOR_SPAWN.has(b)||this.slopeAt(x,z,h)>1)continue;
        if(this.spawnClear(get,x,h,z)){this.spawn={x:x+.5,y:h+1,z:z+.5};return{...this.spawn};}
      }
    }
    const h=this.heightAt(0,0);
    return{x:.5,y:Math.min(CH-2,Math.max(SEA_LEVEL,h)+1),z:.5};
  }
  /** Dry solid ground with two free blocks above and no tree within two columns. */
  private spawnClear(get:(x:number,y:number,z:number)=>number,x:number,h:number,z:number){
    const ground=get(x,h,z);
    if(!SOLID[ground]||LEAVES[ground]||LOGS[ground]||ground===ICE||LIQUID[ground])return false;
    for(let dy=1;dy<=2;dy++){const b=get(x,h+dy,z);if(SOLID[b]||LIQUID[b])return false;}
    for(let dz=-2;dz<=2;dz++)for(let dx=-2;dx<=2;dx++)for(let y=h-2;y<CH;y++){
      const b=get(x+dx,y,z+dz);if(LEAVES[b]||LOGS[b])return false;
      if(y>h+3&&b===AIR&&y>this.heightAt(x+dx,z+dz)+34)break;
    }
    return true;
  }

  // ---- Growth -----------------------------------------------------------------------------------------------
  growTree(world:BlockWriter,x:number,y:number,z:number,kind:TreeKind,random:()=>number):boolean{
    let wide=false,ox=x,oz=z,shape=kind;
    if(kind==='dark_oak'||kind==='mega_spruce'||kind==='spruce'||kind==='jungle'){
      // Four saplings in a square grow the giant form.
      const sapling=id(`${treeWood(kind)}_sapling`);
      if(world.get(x,y,z)===sapling)for(const [dx,dz] of [[0,0],[-1,0],[0,-1],[-1,-1]]){
        const ax=x+dx,az=z+dz;
        if(world.get(ax+1,y,az)===sapling&&world.get(ax,y,az+1)===sapling&&world.get(ax+1,y,az+1)===sapling&&world.get(ax,y,az)===sapling){wide=true;ox=ax;oz=az;break;}
      }
      if(kind==='spruce'&&wide)shape='mega_spruce';
    }
    const plan=new PlanBuffer();
    planTree(shape,ox,y,oz,random,plan,wide);
    if(plan.maxY>=CH||y<1)return false;
    const {logs,leaves}=plan,w=wide?1:0;
    let top=y;
    for(let i=0;i<logs.length;i+=3)if(logs[i]>=ox&&logs[i]<=ox+w&&logs[i+2]>=oz&&logs[i+2]<=oz+w&&logs[i+1]>top)top=logs[i+1];
    // Room: the trunk column(s) up to two above the top log, and every log position.
    const free=(b:number)=>b===AIR||LEAVES[b]===1||SAPLINGS[b]===1||REPLACEABLE[b]===1&&!LIQUID[b];
    for(let dz=0;dz<=w;dz++)for(let dx=0;dx<=w;dx++)for(let yy=y;yy<=top+2;yy++){if(yy>=CH||!free(world.get(ox+dx,yy,oz+dz)))return false;}
    for(let i=0;i<logs.length;i+=3)if(!free(world.get(logs[i],logs[i+1],logs[i+2])))return false;
    const log=treeLog(shape),leaf=treeLeaves(shape);
    for(let i=0;i<logs.length;i+=3)world.set(logs[i],logs[i+1],logs[i+2],log,'growth');
    for(let i=0;i<leaves.length;i+=3){
      const b=world.get(leaves[i],leaves[i+1],leaves[i+2]);
      if(b===AIR||REPLACEABLE[b]===1&&!LIQUID[b])world.set(leaves[i],leaves[i+1],leaves[i+2],leaf,'growth');
    }
    for(let dz=0;dz<=w;dz++)for(let dx=0;dx<=w;dx++){
      const g=world.get(ox+dx,y-1,oz+dz);if(g>=0&&TO_DIRT[g])world.set(ox+dx,y-1,oz+dz,DIRT,'growth');
    }
    if(shape==='mega_spruce'&&wide)for(let dz=-4;dz<=5;dz++)for(let dx=-4;dx<=5;dx++){
      const d=Math.max(dx<0?-dx:dx>1?dx-1:0,dz<0?-dz:dz>1?dz-1:0);
      if(random()>=(d<=2?.85:.45))continue;
      for(let yy=y+1;yy>=y-3;yy--){
        const b=world.get(ox+dx,yy,oz+dz);
        if(b===GRASS||b===DIRT||b===COARSE){const a=world.get(ox+dx,yy+1,oz+dz);if(a>=0&&!OPAQUE[a])world.set(ox+dx,yy,oz+dz,PODZOL,'growth');break;}
        if(b!==AIR&&!REPLACEABLE[b])break;
      }
    }
    return true;
  }
}

export function createTerrain(seed:number):TerrainService{return new TerrainGenerator(seed);}
