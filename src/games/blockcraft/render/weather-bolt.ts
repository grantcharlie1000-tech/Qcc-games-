// Lightning bolt geometry in the shape of vanilla LightningBoltRenderer: a main channel of 8 segments, 16 blocks each,
// that wanders up to 5 blocks per segment and ends exactly at the strike, two forks of 3 segments that wander up to 15,
// and 4 nested square tubes (half widths 0.1, 0.3, 0.5, 0.7, wider toward the top of the main channel) drawn with
// additive blending so the core glows. Pure: writes triangle positions into a Float32Array.
import {visualRandom} from './weather-drops';

export const BOLT_SEGMENTS=8,BOLT_SEGMENT_HEIGHT=16,BOLT_LAYERS=4;
/** Forks: [first segment index from the top, segment count]. */
const FORKS=[[6,3],[5,3]] as const;
const SEGMENTS=BOLT_SEGMENTS+FORKS.reduce((n,f)=>n+f[1],0);
/** Triangle vertices per bolt (non-indexed, 6 per quad, 4 sides per segment and layer). */
export const BOLT_VERTICES=SEGMENTS*BOLT_LAYERS*4*6;
export const BOLT_COLOR=[.45,.45,.5] as const,BOLT_ALPHA=.3;

const px=new Float32Array(BOLT_SEGMENTS+1),pz=new Float32Array(BOLT_SEGMENTS+1);
const SQUARE=[[-1,-1],[1,-1],[1,1],[-1,1]] as const;
/** Quad corners: bottom a, bottom b, top a, top b; triangles (0,1,2) and (2,1,3). */
const CORNERS=new Float32Array(12),QUAD=[0,1,2,2,1,3] as const;

function tube(out:Float32Array,o:number,bx:number,by:number,bz:number,tx:number,ty:number,tz:number,wb:number,wt:number):number{
  const v=CORNERS;
  for(let s=0;s<4;s++){
    const a=SQUARE[s],b=SQUARE[(s+1)%4];
    v[0]=bx+a[0]*wb;v[1]=by;v[2]=bz+a[1]*wb;v[3]=bx+b[0]*wb;v[4]=by;v[5]=bz+b[1]*wb;
    v[6]=tx+a[0]*wt;v[7]=ty;v[8]=tz+a[1]*wt;v[9]=tx+b[0]*wt;v[10]=ty;v[11]=tz+b[1]*wt;
    for(let q=0;q<6;q++){const k=QUAD[q]*3;out[o++]=v[k];out[o++]=v[k+1];out[o++]=v[k+2];}
  }
  return o;
}

/** Writes one bolt standing on (x,y,z) into `out` starting at float `offset`; returns the next float offset. */
export function writeBolt(out:Float32Array,offset:number,x:number,y:number,z:number,seed:number):number{
  // Main channel, bottom (index 0, the strike) to top (index 8).
  let rng=visualRandom(seed);
  px[0]=0;pz[0]=0;
  for(let i=1;i<=BOLT_SEGMENTS;i++){px[i]=px[i-1]+Math.floor(rng()*11)-5;pz[i]=pz[i-1]+Math.floor(rng()*11)-5;}
  let o=offset;
  for(let layer=0;layer<BOLT_LAYERS;layer++){
    rng=visualRandom(seed^0x2545f491);// every layer shares the fork shapes
    const base=.1+layer*.2;
    for(let i=0;i<BOLT_SEGMENTS;i++)
      o=tube(out,o,x+px[i],y+i*BOLT_SEGMENT_HEIGHT,z+pz[i],x+px[i+1],y+(i+1)*BOLT_SEGMENT_HEIGHT,z+pz[i+1],base*((i-1)*.1+1),base*(i*.1+1));
    for(const [start,count] of FORKS){
      let fx=px[start+1],fz=pz[start+1];
      for(let j=0;j<count;j++){
        const level=start-j,nx=fx+Math.floor(rng()*31)-15,nz=fz+Math.floor(rng()*31)-15;
        o=tube(out,o,x+nx,y+level*BOLT_SEGMENT_HEIGHT,z+nz,x+fx,y+(level+1)*BOLT_SEGMENT_HEIGHT,z+fz,base,base);
        fx=nx;fz=nz;
      }
    }
  }
  return o;
}
