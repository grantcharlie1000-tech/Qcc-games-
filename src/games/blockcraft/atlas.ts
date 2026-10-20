import {hash3,Simplex} from './noise';
import {T,TILE,ATLAS_COLUMNS,ATLAS_ROWS} from './blocks';

export const ATLAS_WIDTH=TILE*ATLAS_COLUMNS,ATLAS_HEIGHT=TILE*ATLAS_ROWS;
type RGB=[number,number,number];
type Painter=(x:number,y:number,n:number,m:number)=>RGB;
const scale=(c:RGB,k:number):RGB=>[c[0]*k,c[1]*k,c[2]*k];

const DIRT:RGB=[134,96,67],GREEN:RGB=[95,159,53],STONE:RGB=[125,125,125],SNOW:RGB=[238,245,250];
const dirt:Painter=(_x,_y,n,m)=>m<.1?[96,68,46]:m>.93?[164,122,90]:scale(DIRT,.88+n*.24);
const stone:Painter=(x,y,n)=>scale(STONE,(.88+n*.22)*(hash3(x>>1,y>>1,3,77)<.16?.84:1));
function edge(top:Painter,depth:(x:number)=>number):Painter{return(x,y,n,m)=>y<depth(x)?top(x,y,n,m):dirt(x,y,n,m);}
function ore(color:RGB,salt:number):Painter{
  return(x,y,n,m)=>{
    const cluster=hash3((x+1)>>2,(y+2)>>2,salt,91)<.5&&hash3(x,y,salt,92)<.62&&(x+y+salt)%3!==0;
    return cluster?scale(color,.85+m*.3):stone(x,y,n,m);
  };
}
const grassTop:Painter=(_x,_y,n,m)=>m>.9?[124,184,72]:scale(GREEN,.84+n*.3);
const snowTop:Painter=(_x,_y,n)=>scale(SNOW,.95+n*.06);

const PAINTERS:Record<number,Painter>={
  [T.grassTop]:grassTop,
  [T.grassSide]:edge(grassTop,x=>3+(hash3(x,0,1,5)<.55?1:0)+(hash3(x,0,2,5)<.25?1:0)),
  [T.dirt]:dirt,
  [T.stone]:stone,
  [T.cobble]:(x,y,n)=>{
    const row=y>>2,shift=(row%2)*2,mortar=y%4===3||(x+shift)%5===4;
    return mortar?scale([78,78,80],.9+n*.15):scale([146,146,148],.82+hash3((x+shift)/5|0,row,4,8)*.3+n*.08);
  },
  [T.sand]:(_x,_y,n)=>scale([219,207,142],.95+n*.09),
  [T.logSide]:(x,_y,n)=>scale([106,82,48],(x%4===1?.78:1)*(.9+n*.18)),
  [T.logTop]:(x,y,n)=>{
    const d=Math.max(Math.abs(x-7.5),Math.abs(y-7.5));
    return d>6.5?scale([106,82,48],.9+n*.15):scale(Math.floor(d)%2?[184,148,92]:[160,126,74],.94+n*.1);
  },
  [T.leaves]:(_x,_y,n,m)=>m<.28?[22,58,18]:m>.92?[78,142,50]:scale([44,102,32],.8+n*.34),
  [T.planks]:(x,y,n)=>{
    const row=y>>2,seam=x===(row*7+3)%16;
    return y%4===3||seam?scale([118,90,54],.95+n*.1):scale([178,140,86],.92+n*.14);
  },
  [T.coal]:ore([38,38,40],1),
  [T.iron]:ore([214,170,138],2),
  [T.snow]:snowTop,
  [T.snowSide]:edge(snowTop,x=>3+(hash3(x,0,3,5)<.5?1:0)+(hash3(x,0,4,5)<.3?1:0)),
  [T.water]:(x,y,n)=>((x+y*3)%11===0||(x*2+y)%13===0)?[96,146,236]:scale([52,98,214],.92+n*.12),
  [T.brick]:(x,y,n)=>{
    const row=y>>2,mortar=y%4===3||(x+(row%2)*4)%8===7;
    return mortar?scale([192,182,170],.92+n*.1):scale([152,66,50],.86+n*.22);
  },
  [T.bedrock]:(_x,_y,n,m)=>scale([84,84,86],.45+n*.5+(m>.85?.3:0))
};

/** RGBA pixels, top row first: ATLAS_COLUMNS × ATLAS_ROWS tiles of original pixel art. */
export function paintAtlas():Uint8ClampedArray{
  const data=new Uint8ClampedArray(ATLAS_WIDTH*ATLAS_HEIGHT*4);
  for(const [key,paint] of Object.entries(PAINTERS)){
    const tile=Number(key),ox=(tile%ATLAS_COLUMNS)*TILE,oy=Math.floor(tile/ATLAS_COLUMNS)*TILE;
    for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++){
      const c=paint(x,y,hash3(x,y,tile,11),hash3(x,y,tile,29)),i=((oy+y)*ATLAS_WIDTH+ox+x)*4;
      data[i]=c[0];data[i+1]=c[1];data[i+2]=c[2];data[i+3]=255;
    }
  }
  return data;
}

/** Soft-edged blocky cloud mask (alpha only), tiling seamlessly every 64 texels. */
export function paintClouds(size=64):Uint8ClampedArray{
  const noise=new Simplex(4242),data=new Uint8ClampedArray(size*size*4),TAU=Math.PI*2;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    // Sample on a torus so the texture repeats without seams.
    const a=x/size*TAU,b=y/size*TAU,v=noise.noise3(Math.cos(a)*1.6,Math.sin(a)*1.6+Math.cos(b)*1.6,Math.sin(b)*1.6);
    const i=(y*size+x)*4;data[i]=255;data[i+1]=255;data[i+2]=255;data[i+3]=v>.18?225:0;
  }
  return data;
}
