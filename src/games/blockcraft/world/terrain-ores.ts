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
import {CS,CH,LAYER} from '../engine/constants';
import {hashInt,mulberry32} from './noise';

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
  {ore:'dirt',minY:0,maxY:127,size:33,count:7,dist:'uniform'},
  {ore:'gravel',minY:0,maxY:127,size:33,count:14,dist:'uniform'},
  {ore:'granite',minY:0,maxY:60,size:64,count:2,dist:'uniform'},
  {ore:'granite',minY:64,maxY:127,size:64,count:1/6,dist:'uniform'},
  {ore:'diorite',minY:0,maxY:60,size:64,count:2,dist:'uniform'},
  {ore:'diorite',minY:64,maxY:127,size:64,count:1/6,dist:'uniform'},
  {ore:'andesite',minY:0,maxY:60,size:64,count:2,dist:'uniform'},
  {ore:'andesite',minY:64,maxY:127,size:64,count:1/6,dist:'uniform'},
  {ore:'tuff',minY:0,maxY:16,size:64,count:2,dist:'uniform'},
  // Coal: a broad band peaking mid-height plus the "mountain coal" of high stone.
  {ore:'coal',minY:0,maxY:127,size:17,count:20,dist:'triangle'},
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
interface CompiledRule{rule:OreRule;salt:number;replace:Uint8Array;biomes:Uint8Array|null;maxReach:number}
const COMPILED:CompiledRule[]=ORE_RULES.map((rule,i)=>{
  const replace=new Uint8Array(256),put=(from:number[],to:string)=>{const t=BLOCK_BY_NAME.get(to);if(t)for(const f of from)replace[f]=t.id;};
  if(ORE_NAMES.has(rule.ore)){put(STONES,`${rule.ore}_ore`);put(DEEP,`deepslate_${rule.ore}_ore`);}
  else if(rule.ore==='tuff')put([id('deepslate')],'tuff');
  else if(rule.ore==='dirt'||rule.ore==='gravel')put([...STONES,...DEEP],rule.ore);
  else put([id('stone')],rule.ore);
  let biomes:Uint8Array|null=null;
  if(rule.biomes){biomes=new Uint8Array(256);for(const b of rule.biomes)biomes[biomeId(b)]=1;}
  // Half length size/8, radius at most size/16 + 1/2, plus a block of rounding.
  return{rule,salt:0x9e37+i*0x1f1,replace,biomes,maxReach:rule.size/8+rule.size/16+1.5};
});

function sampleY(rule:OreRule,random:()=>number):number{
  const span=rule.maxY-rule.minY;
  switch(rule.dist){
    case 'uniform':return rule.minY+random()*(span+1);
    case 'triangle':return rule.minY+(random()+random())*.5*(span+1);
    case 'bottom':return rule.minY+(1-Math.sqrt(random()))*(span+1);
  }
}

/** Places every blob and ore vein that reaches chunk (cx,cz) into `blocks` (CHUNK_VOLUME, voxelIndex order).
 *  `biomes` are the chunk's column biomes; `maxY` the highest terrain block in the chunk (rules above it are skipped). */
export class OrePlacer{
  constructor(private readonly seed:number){}
  place(blocks:Uint8Array,biomes:Uint8Array,cx:number,cz:number,maxY:number){
    const x0=cx*CS,z0=cz*CS;
    for(const c of COMPILED){
      const rule=c.rule;
      if(rule.minY>maxY)continue;
      if(c.biomes){let any=false;for(let i=0;i<LAYER;i++)if(c.biomes[biomes[i]]){any=true;break;}if(!any)continue;}
      for(let sz=cz-1;sz<=cz+1;sz++)for(let sx=cx-1;sx<=cx+1;sx++){
        const random=mulberry32(hashInt(sx,c.salt,sz,this.seed));
        const whole=Math.floor(rule.count),attempts=whole+(random()<rule.count-whole?1:0);
        for(let a=0;a<attempts;a++){
          // Always draw the same numbers per attempt so later attempts do not depend on this chunk.
          const ox=sx*CS+random()*CS,oz=sz*CS+random()*CS,oy=sampleY(rule,random);
          const angle=random()*Math.PI,y1=Math.floor(oy)+Math.floor(random()*3)-2+.5,y2=Math.floor(oy)+Math.floor(random()*3)-2+.5;
          const amp=(.5+.5*random())*rule.size/16;
          const reach=c.maxReach;
          if(ox+reach<x0||ox-reach>x0+CS||oz+reach<z0||oz-reach>z0+CS)continue;
          const g=rule.size/8,sx1=Math.floor(ox)+.5+Math.sin(angle)*g,sx2=Math.floor(ox)+.5-Math.sin(angle)*g;
          const sz1=Math.floor(oz)+.5+Math.cos(angle)*g,sz2=Math.floor(oz)+.5-Math.cos(angle)*g;
          this.vein(blocks,biomes,c,x0,z0,sx1,y1,sz1,sx2,y2,sz2,amp);
        }
      }
    }
  }
  private vein(blocks:Uint8Array,biomes:Uint8Array,c:CompiledRule,x0:number,z0:number,
    ax:number,ay:number,az:number,bx:number,by:number,bz:number,amp:number){
    const rmax=amp+.5,dx=bx-ax,dy=by-ay,dz=bz-az,len2=dx*dx+dy*dy+dz*dz||1e-9;
    const minX=Math.max(x0,Math.floor(Math.min(ax,bx)-rmax)),maxX=Math.min(x0+CS-1,Math.floor(Math.max(ax,bx)+rmax));
    const minZ=Math.max(z0,Math.floor(Math.min(az,bz)-rmax)),maxZ=Math.min(z0+CS-1,Math.floor(Math.max(az,bz)+rmax));
    const minY=Math.max(c.rule.minY,1,Math.floor(Math.min(ay,by)-rmax)),maxY=Math.min(c.rule.maxY,CH-1,Math.floor(Math.max(ay,by)+rmax));
    if(minX>maxX||minZ>maxZ||minY>maxY)return;
    const replace=c.replace,allowed=c.biomes;
    for(let z=minZ;z<=maxZ;z++)for(let x=minX;x<=maxX;x++){
      const column=(x-x0)+(z-z0)*CS;
      if(allowed&&!allowed[biomes[column]])continue;
      const px=x+.5-ax,pz=z+.5-az;
      for(let y=minY;y<=maxY;y++){
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
