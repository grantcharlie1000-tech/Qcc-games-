// Noise caves after the 1.18+ overworld: "cheese" caverns (large blobs where a smooth 3D noise is high),
// "spaghetti" tunnels (where two noises are both near zero: the intersection of two zero sheets is a
// winding tube, its radius modulated by a third noise) and thin "noodle" caves (the same idea at a
// higher frequency and much thinner, only inside toggle regions).
//
// Fields are sampled on a coarse 4×8×4 grid and interpolated per voxel, like vanilla's noise cells,
// which keeps a chunk to about 3 000 noise evaluations. Pure: the terrain generator decides where
// carving is allowed (surface, water and lava rules) and calls `kindAt` per voxel.
import {Simplex} from './noise';
import {CS,CH} from '../engine/constants';

export const CAVE_NONE=0,CAVE_CHEESE=1,CAVE_SPAGHETTI=2,CAVE_NOODLE=3;
const CELL_XZ=4,CELL_Y=8,NXZ=CS/CELL_XZ+1,NY=CH/CELL_Y+1;
/** Interpolated fields: cheese, spaghetti A, B and radius, noodle A, B and toggle. */
const FIELDS=7;
/** Cheese caverns need this much rock overhead; tunnels may reach the surface where the terrain allows it. */
export const CHEESE_MIN_DEPTH=10;

/** Cheese threshold by height: caverns are commonest at mid depths, rarer near the bottom and high up. */
function cheeseThreshold(y:number):number{
  return .38+(y>48?(y-48)*.012:0)+(y<16?(16-y)*.01:0);
}
/** Classify interpolated field values at height y. */
export function classify(f:Float64Array,o:number,y:number):number{
  if(f[o]>cheeseThreshold(y))return CAVE_CHEESE;
  const a=f[o+1],b=f[o+2],r=.075+.035*f[o+3];
  if(a*a+b*b<r*r)return CAVE_SPAGHETTI;
  if(f[o+6]>.2){const na=f[o+4],nb=f[o+5],t=.045+.01*f[o+3];if(na<t&&na>-t&&nb<t&&nb>-t)return CAVE_NOODLE;}
  return CAVE_NONE;
}

export class CaveField{
  private readonly cheeseA:Simplex;private readonly cheeseB:Simplex;private readonly spA:Simplex;private readonly spB:Simplex;
  private readonly spR:Simplex;private readonly noA:Simplex;private readonly noB:Simplex;private readonly noT:Simplex;
  /** Node grid of one chunk: NXZ×NXZ×NY nodes × FIELDS. */
  private readonly nodes=new Float64Array(NXZ*NXZ*NY*FIELDS);
  /** Per column (after fillChunk + prepareColumn): the bilinear values at each y node level. */
  private readonly levels=new Float64Array(NY*FIELDS);
  private readonly scratch=new Float64Array(FIELDS*2);
  private readonly point=new Float64Array(FIELDS);
  private levelsTop=0;
  constructor(seed:number){
    const s=seed>>>0;
    this.cheeseA=new Simplex(s^0x2545f491);this.cheeseB=new Simplex(s^0x4f6cdd1d);this.spA=new Simplex(s^0x62e2ac0d);this.spB=new Simplex(s^0x7a2c1b5e);
    this.spR=new Simplex(s^0x1b03738a);this.noA=new Simplex(s^0x3d4d51cb);this.noB=new Simplex(s^0x5d2a3fe1);this.noT=new Simplex(s^0x6c8e9cf5);
  }
  private evalNode(x:number,y:number,z:number,out:Float64Array,o:number){
    out[o]=.67*this.cheeseA.noise3(x/70,y/36,z/70)+.33*this.cheeseB.noise3(x/26,y/16,z/26);
    out[o+1]=this.spA.noise3(x/56,y/34,z/56);
    out[o+2]=this.spB.noise3(x/56,y/34,z/56);
    out[o+3]=this.spR.noise3(x/120,y/60,z/120);
    out[o+4]=this.noA.noise3(x/28,y/20,z/28);
    out[o+5]=this.noB.noise3(x/28,y/20,z/28);
    out[o+6]=this.noT.noise3(x/90,y/45,z/90);
  }
  /** Evaluates the node grid of chunk (cx,cz) for y nodes up to the one covering `maxY`. */
  fillChunk(cx:number,cz:number,maxY:number){
    const top=Math.min(NY-1,Math.floor(maxY/CELL_Y)+1),n=this.nodes;
    for(let k=0;k<=top;k++)for(let j=0;j<NXZ;j++)for(let i=0;i<NXZ;i++)
      this.evalNode(cx*CS+i*CELL_XZ,k*CELL_Y,cz*CS+j*CELL_XZ,n,((k*NXZ+j)*NXZ+i)*FIELDS);
    this.levelsTop=top;
  }
  /** Bilinear values for local column (x,z) at every filled y level. */
  prepareColumn(x:number,z:number){
    const i=x>>2,j=z>>2,fx=(x&3)/CELL_XZ,fz=(z&3)/CELL_XZ,n=this.nodes,l=this.levels;
    const w00=(1-fx)*(1-fz),w10=fx*(1-fz),w01=(1-fx)*fz,w11=fx*fz;
    for(let k=0;k<=this.levelsTop;k++){
      const a=((k*NXZ+j)*NXZ+i)*FIELDS,b=a+FIELDS,c=a+NXZ*FIELDS,d=c+FIELDS,o=k*FIELDS;
      for(let f=0;f<FIELDS;f++)l[o+f]=n[a+f]*w00+n[b+f]*w10+n[c+f]*w01+n[d+f]*w11;
    }
  }
  /** Cave kind at height y of the prepared column (y below the filled top). */
  kindAt(y:number):number{
    const k=y>>3,t=(y&7)/CELL_Y,l=this.levels,o=k*FIELDS,p=this.point;
    for(let f=0;f<FIELDS;f++)p[f]=l[o+f]+(l[o+FIELDS+f]-l[o+f])*t;
    return classify(p,0,y);
  }
  /** Cave kind at a world position, computed exactly as chunk generation interpolates it (tests, debugging). */
  sample(x:number,y:number,z:number):number{
    const cx=Math.floor(x/CS),cz=Math.floor(z/CS),lx=x-cx*CS,lz=z-cz*CS,gi=lx>>2,gj=lz>>2,k=y>>3;
    const fx=(lx&3)/CELL_XZ,fz=(lz&3)/CELL_XZ,t=(y&7)/CELL_Y,s=this.scratch,p=this.point;
    const w00=(1-fx)*(1-fz),w10=fx*(1-fz),w01=(1-fx)*fz,w11=fx*fz;
    const corner=new Float64Array(FIELDS*4);
    for(let level=0;level<2;level++){
      const yy=(k+level)*CELL_Y;
      this.evalNode(cx*CS+gi*CELL_XZ,yy,cz*CS+gj*CELL_XZ,corner,0);
      this.evalNode(cx*CS+(gi+1)*CELL_XZ,yy,cz*CS+gj*CELL_XZ,corner,FIELDS);
      this.evalNode(cx*CS+gi*CELL_XZ,yy,cz*CS+(gj+1)*CELL_XZ,corner,FIELDS*2);
      this.evalNode(cx*CS+(gi+1)*CELL_XZ,yy,cz*CS+(gj+1)*CELL_XZ,corner,FIELDS*3);
      for(let f=0;f<FIELDS;f++)s[level*FIELDS+f]=corner[f]*w00+corner[FIELDS+f]*w10+corner[FIELDS*2+f]*w01+corner[FIELDS*3+f]*w11;
    }
    for(let f=0;f<FIELDS;f++)p[f]=s[f]+(s[FIELDS+f]-s[f])*t;
    return classify(p,0,y);
  }
}
