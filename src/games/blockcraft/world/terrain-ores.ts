// Underground blobs and ores after the vanilla 1.18+ ore features, with the vanilla vein `size` parameter and
// shape: a vein is a capsule along a segment of length size/4 whose radius swells to the middle
// (r = ((sin(pi t) + 1) * h + 1) / 2 with h up to size/16), placed `count` times per chunk at heights drawn from a
// uniform, triangular or bottom-heavy distribution. Height ranges are vanilla's scaled to a 128-high world with the
// deepslate layer below y 8-16. Stone ores in deepslate or tuff become their deepslate variants.
//
// Veins centred in neighbouring chunks spill across borders: every chunk replays the attempts of its 3×3
// neighbourhood from per-(chunk, rule) seeds and writes only its own voxels, so borders always match.
import {blockId,BLOCK_BY_NAME} from '../data/blocks';
import {biomeId} from '../data/biomes';
import * as constants from '../engine/constants';
import {hashInt} from './noise';

// Imported values used in hot loops are bound to module-local constants (plain reads; module bindings can be
// accessors under test transforms).
const {CS,CH,LAYER}=constants;

export type OreDistribution='uniform'|'triangle'|'bottom';
export interface OreRule{
  /** Block family placed: an ore name (coal, iron...) or a blob material (dirt, gravel, granite, tuff...). */
  readonly ore:string;
  /** Inclusive height range: no voxel of the vein is placed outside it. */
  readonly minY:number;readonly maxY:number;
  /** Vanilla vein size (blocks along the vein). */
  readonly size:number;
  /** Attempts per chunk; a fractional part is the chance of one more. */
  readonly count:number;
  readonly dist:OreDistribution;
  /** Only in columns of these biomes (emeralds in mountains). */
  readonly biomes?:readonly string[];
}
const ORE_NAMES=new Set(['coal','iron','copper','gold','redstone','lapis','diamond','emerald']);
/** Placement order matters: later rules replace earlier blobs (ores cut through granite and gravel). */
export const ORE_RULES:readonly OreRule[]=[
  // Dirt and gravel counts give vanilla's density per volume of stone (its ranges span far more open air).
  {ore:'dirt',minY:0,maxY:127,size:33,count:5,dist:'uniform'},
  {ore:'gravel',minY:0,maxY:127,size:33,count:8,dist:'uniform'},
  {ore:'granite',minY:0,maxY:60,size:64,count:2,dist:'uniform'},
  {ore:'granite',minY:64,maxY:127,size:64,count:1/6,dist:'uniform'},
  {ore:'diorite',minY:0,maxY:60,size:64,count:2,dist:'uniform'},
  {ore:'diorite',minY:64,maxY:127,size:64,count:1/6,dist:'uniform'},
  {ore:'andesite',minY:0,maxY:60,size:64,count:2,dist:'uniform'},
  {ore:'andesite',minY:64,maxY:127,size:64,count:1/6,dist:'uniform'},
  {ore:'tuff',minY:0,maxY:16,size:64,count:2,dist:'uniform'},
  // Coal: thin everywhere, a band peaking just under the surface, plus the "mountain coal" of high stone.
  {ore:'coal',minY:0,maxY:127,size:17,count:8,dist:'triangle'},
  {ore:'coal',minY:36,maxY:100,size:17,count:16,dist:'triangle'},
  {ore:'coal',minY:72,maxY:127,size:17,count:20,dist:'uniform'},
  // Iron: two triangular bands peaking at 16 and 56 and small veins everywhere up to 72.
  {ore:'iron',minY:40,maxY:72,size:9,count:10,dist:'triangle'},
  {ore:'iron',minY:0,maxY:32,size:9,count:10,dist:'triangle'},
  {ore:'iron',minY:0,maxY:72,size:4,count:10,dist:'uniform'},
  {ore:'copper',minY:0,maxY:96,size:10,count:16,dist:'triangle'},
  {ore:'gold',minY:0,maxY:32,size:9,count:4,dist:'triangle'},
  {ore:'gold',minY:0,maxY:8,size:9,count:.5,dist:'uniform'},
  {ore:'redstone',minY:0,maxY:16,size:8,count:4,dist:'uniform'},
  {ore:'redstone',minY:0,maxY:10,size:8,count:6,dist:'triangle'},
  {ore:'lapis',minY:0,maxY:32,size:7,count:2,dist:'triangle'},
  {ore:'lapis',minY:0,maxY:32,size:7,count:2,dist:'uniform'},
  {ore:'diamond',minY:0,maxY:16,size:4,count:4,dist:'bottom'},
  {ore:'diamond',minY:0,maxY:16,size:12,count:1/9,dist:'bottom'},
  {ore:'diamond',minY:0,maxY:16,size:8,count:2,dist:'bottom'},
  {ore:'emerald',minY:24,maxY:127,size:3,count:30,dist:'triangle',biomes:['mountains','snowy_peaks']}
];

const id=(name:string)=>blockId(name);
const STONES=['stone','granite','diorite','andesite'].map(id),DEEP=['deepslate','tuff'].map(id);
interface CompiledRule{rule:OreRule;salt:number;replace:Uint8Array;biomes:Uint8Array|null;maxReach:number;
  /** 0 uniform, 1 triangle, 2 bottom-heavy. */
  dist:number}
const COMPILED:CompiledRule[]=ORE_RULES.map((rule,i)=>{
  const replace=new Uint8Array(256),put=(from:number[],to:string)=>{const t=BLOCK_BY_NAME.get(to);if(t)for(const f of from)replace[f]=t.id;};
  if(ORE_NAMES.has(rule.ore)){put(STONES,`${rule.ore}_ore`);put(DEEP,`deepslate_${rule.ore}_ore`);}
  else if(rule.ore==='tuff')put([id('deepslate')],'tuff');
  else if(rule.ore==='dirt'||rule.ore==='gravel')put([...STONES,...DEEP],rule.ore);
  else put([id('stone')],rule.ore);
  let biomes:Uint8Array|null=null;
  if(rule.biomes){biomes=new Uint8Array(256);for(const b of rule.biomes)biomes[biomeId(b)]=1;}
  // Half length size/8, radius at most size/16 + 1/2, plus a block of rounding.
  return{rule,salt:0x9e37+i*0x1f1,replace,biomes,maxReach:rule.size/8+rule.size/16+1.5,dist:rule.dist==='uniform'?0:rule.dist==='triangle'?1:2};
});

/** mulberry32 as an object, so each (chunk, rule) stream needs no closure. Same sequence as noise.mulberry32. */
class Stream{
  private a=0;
  reset(seed:number){this.a=seed>>>0;return this;}
  next(){
    this.a=(this.a+0x6d2b79f5)>>>0;let t=this.a;
    t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);
    return((t^(t>>>14))>>>0)/4294967296;
  }
}
function sampleY(c:CompiledRule,random:Stream):number{
  const span=c.rule.maxY-c.rule.minY+1;
  return c.rule.minY+(c.dist===0?random.next():c.dist===1?(random.next()+random.next())*.5:1-Math.sqrt(random.next()))*span;
}

/** Per vein: segment ends [ax, ay, az, bx, by, bz] and the radius amplitude. */
const VEIN=7,SOURCE_CACHE=512;
/** Veins of one source chunk: rule r's `count[r]` veins (-1 until built) start at vein OFFSET[r] of `data`. */
interface SourceVeins{data:Float64Array;count:Int16Array}
const OFFSET=new Int32Array(COMPILED.length);
let CAPACITY=0;
for(let r=0;r<COMPILED.length;r++){OFFSET[r]=CAPACITY;CAPACITY+=Math.ceil(COMPILED[r].rule.count);}

/** Places every blob and ore vein that reaches chunk (cx,cz) into `blocks` (CHUNK_VOLUME, voxelIndex order).
 *  `biomes` are the chunk's column biomes; `maxY` the highest terrain block in the chunk (rules above it are skipped). */
export class OrePlacer{
  /** Vein lists per source chunk, each rule's built on first use (pure, so caching never changes results). */
  private readonly cache=new Map<number,SourceVeins>();
  private readonly stream=new Stream();
  constructor(private readonly seed:number){}
  /** The veins of chunk (sx,sz), with rule r's filled in. */
  private veins(sx:number,sz:number,r:number):SourceVeins{
    const key=(sx+0x100000)*0x200000+(sz+0x100000);
    let entry=this.cache.get(key);
    if(!entry){
      if(this.cache.size>=SOURCE_CACHE)this.cache.clear();
      entry={data:new Float64Array(CAPACITY*VEIN),count:new Int16Array(COMPILED.length).fill(-1)};this.cache.set(key,entry);
    }
    if(entry.count[r]>=0)return entry;
    const c=COMPILED[r],rule=c.rule,random=this.stream.reset(hashInt(sx,c.salt,sz,this.seed));
    const whole=Math.floor(rule.count),attempts=whole+(random.next()<rule.count-whole?1:0),g=rule.size/8;
    const out=entry.data;
    for(let a=0,o=OFFSET[r]*VEIN;a<attempts;a++,o+=VEIN){
      const ox=Math.floor(sx*CS+random.next()*CS)+.5,oz=Math.floor(sz*CS+random.next()*CS)+.5,oy=Math.floor(sampleY(c,random));
      const angle=random.next()*Math.PI,y1=oy+Math.floor(random.next()*3)-2+.5,y2=oy+Math.floor(random.next()*3)-2+.5;
      const amp=(.5+.5*random.next())*rule.size/16,sin=Math.sin(angle)*g,cos=Math.cos(angle)*g;
      out[o]=ox+sin;out[o+1]=y1;out[o+2]=oz+cos;out[o+3]=ox-sin;out[o+4]=y2;out[o+5]=oz-cos;out[o+6]=amp;
    }
    entry.count[r]=attempts;return entry;
  }
  place(blocks:Uint8Array,biomes:Uint8Array,cx:number,cz:number,maxY:number){
    const x0=cx*CS,z0=cz*CS;
    for(let r=0;r<COMPILED.length;r++){
      const c=COMPILED[r];
      if(c.rule.minY>maxY)continue;
      if(c.biomes){let any=false;for(let i=0;i<LAYER;i++)if(c.biomes[biomes[i]]){any=true;break;}if(!any)continue;}
      const reach=c.maxReach;
      for(let sz=cz-1;sz<=cz+1;sz++)for(let sx=cx-1;sx<=cx+1;sx++){
        const {data:veins,count}=this.veins(sx,sz,r),first=OFFSET[r]*VEIN,last=first+count[r]*VEIN;
        for(let o=first;o<last;o+=VEIN){
          const mx=(veins[o]+veins[o+3])*.5,mz=(veins[o+2]+veins[o+5])*.5;
          if(mx+reach<x0||mx-reach>x0+CS||mz+reach<z0||mz-reach>z0+CS)continue;
          this.vein(blocks,biomes,c,x0,z0,veins,o);
        }
      }
    }
  }
  private vein(blocks:Uint8Array,biomes:Uint8Array,c:CompiledRule,x0:number,z0:number,v:Float64Array,o:number){
    const ax=v[o],ay=v[o+1],az=v[o+2],bx=v[o+3],by=v[o+4],bz=v[o+5],amp=v[o+6];
    const rmax=amp+.5,r2max=rmax*rmax,dx=bx-ax,dy=by-ay,dz=bz-az,len2=dx*dx+dy*dy+dz*dz||1e-9,hl2=dx*dx+dz*dz||1e-9;
    const minX=Math.max(x0,Math.floor(Math.min(ax,bx)-rmax)),maxX=Math.min(x0+CS-1,Math.floor(Math.max(ax,bx)+rmax));
    const minZ=Math.max(z0,Math.floor(Math.min(az,bz)-rmax)),maxZ=Math.min(z0+CS-1,Math.floor(Math.max(az,bz)+rmax));
    const minY=Math.max(c.rule.minY,1),maxY=Math.min(c.rule.maxY,CH-1);
    if(minX>maxX||minZ>maxZ)return;
    const replace=c.replace,allowed=c.biomes;
    for(let z=minZ;z<=maxZ;z++)for(let x=minX;x<=maxX;x++){
      const column=(x-x0)+(z-z0)*CS;
      if(allowed&&!allowed[biomes[column]])continue;
      const px=x+.5-ax,pz=z+.5-az,pb=px*dx+pz*dz;
      // Columns the capsule's horizontal footprint misses are skipped; the rest scan only the heights the
      // segment can reach while horizontally within the maximum radius.
      const disc=pb*pb-hl2*(px*px+pz*pz-r2max);
      if(disc<0)continue;
      const sq=Math.sqrt(disc);
      let t0=(pb-sq)/hl2,t1=(pb+sq)/hl2;
      if(t1<0||t0>1){
        const e=t1<0?0:1,ex=px-e*dx,ez=pz-e*dz;if(ex*ex+ez*ez>=r2max)continue;
        t0=t1=e;
      }else{if(t0<0)t0=0;if(t1>1)t1=1;}
      const ya=ay+dy*t0,yb=ay+dy*t1;
      const y0=Math.max(minY,Math.ceil(Math.min(ya,yb)-rmax-.5)),y1=Math.min(maxY,Math.floor(Math.max(ya,yb)+rmax-.5));
      for(let y=y0;y<=y1;y++){
        const index=column+y*LAYER,to=replace[blocks[index]];
        if(!to)continue;
        const py=y+.5-ay;
        let t=(px*dx+py*dy+pz*dz)/len2;t=t<0?0:t>1?1:t;
        const qx=px-t*dx,qy=py-t*dy,qz=pz-t*dz;
        // sin(pi t) ~ 4t(1-t): the vein is fattest in the middle.
        const r=((4*t*(1-t)+1)*amp+1)*.5;
        if(qx*qx+qy*qy+qz*qz<r*r)blocks[index]=to;
      }
    }
  }
}
