// Shared toolkit for the block tile painters (art/tiles-*.ts). Every tile is original 16×16 pixel
// art painted in code: a Painter returns the colour of one pixel (x right, y down, both 0..15).
// Textures use small discrete palettes ("ramps") picked by tileable noise, which gives the crisp,
// lightly shaded look of classic block games without copying any existing texture.
export const T=16;
export type RGBA=[number,number,number,number?];
/** Paints one pixel of a tile: x,y in 0..15 (y down), n and m are two independent hash values in [0,1). */
export type Painter=(x:number,y:number,n:number,m:number)=>RGBA;
export const CLEAR:RGBA=[0,0,0,0];

const clamp=(v:number)=>v<0?0:v>255?255:Math.round(v);
/** 0xRRGGBB to a colour. */
export const rgb=(hex:number,a=255):RGBA=>[(hex>>16)&255,(hex>>8)&255,hex&255,a];
export const grey=(v:number,a=255):RGBA=>[clamp(v),clamp(v),clamp(v),a];
/** Multiplies the colour channels by k (alpha unchanged). */
export const shade=(c:RGBA,k:number):RGBA=>[clamp(c[0]*k),clamp(c[1]*k),clamp(c[2]*k),c[3]??255];
export const mix=(a:RGBA,b:RGBA,t:number):RGBA=>[clamp(a[0]+(b[0]-a[0])*t),clamp(a[1]+(b[1]-a[1])*t),clamp(a[2]+(b[2]-a[2])*t),clamp((a[3]??255)+((b[3]??255)-(a[3]??255))*t)];
export const withAlpha=(c:RGBA,a:number):RGBA=>[c[0],c[1],c[2],a];
/** Luma-preserving greyscale (for biome-tinted tiles). */
export const toGrey=(c:RGBA):RGBA=>grey(.299*c[0]+.587*c[1]+.114*c[2],c[3]??255);
/** A palette of shades from dark to light. */
export const ramp=(...hexes:number[]):RGBA[]=>hexes.map(h=>rgb(h));
/** Picks a shade from a ramp with t in [0,1]. */
export const pick=(r:readonly RGBA[],t:number):RGBA=>r[Math.max(0,Math.min(r.length-1,Math.floor(t*r.length)))];
export const wrap=(v:number)=>((v%T)+T)%T;

/** Integer hash of a pixel and salt to [0,1). Coordinates wrap at 16 so every pattern tiles. */
export function hash(x:number,y:number,salt:number):number{
  let h=Math.imul(wrap(x)+1,0x27d4eb2d)^Math.imul(wrap(y)+1,0x165667b1)^Math.imul(salt+7,0x1b873593);
  h=Math.imul(h^(h>>>15),0x2c1b3c6d);h=Math.imul(h^(h>>>12),0x297a2d39);h^=h>>>15;
  return(h>>>0)/4294967296;
}
/** Hash of an unbounded lattice point (no wrapping). */
export function hashN(x:number,y:number,salt:number):number{
  let h=Math.imul(x|0,0x27d4eb2d)^Math.imul(y|0,0x165667b1)^Math.imul(salt+7,0x1b873593);
  h=Math.imul(h^(h>>>15),0x2c1b3c6d);h=Math.imul(h^(h>>>12),0x297a2d39);h^=h>>>15;
  return(h>>>0)/4294967296;
}
export function hashName(name:string){let h=2166136261;for(let i=0;i<name.length;i++)h=Math.imul(h^name.charCodeAt(i),16777619);return h>>>0;}
/** Seeded generator for painters that build a shape step by step (cracks, fibres). */
export function rng(seed:number){
  let a=seed>>>0;
  return()=>{a=(a+0x6d2b79f5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};
}

/** Tileable value noise over the 16×16 tile: lattice cells of cw×ch pixels (each must divide 16), smoothly interpolated. */
export function valueNoise(x:number,y:number,cw:number,ch:number,salt:number):number{
  const gx=T/cw,gy=T/ch,fx=x/cw,fy=y/ch,ix=Math.floor(fx),iy=Math.floor(fy),tx=fx-ix,ty=fy-iy;
  const sx=tx*tx*(3-2*tx),sy=ty*ty*(3-2*ty);
  const v=(i:number,j:number)=>hash(((i%gx)+gx)%gx,((j%gy)+gy)%gy,salt);
  const a=v(ix,iy),b=v(ix+1,iy),c=v(ix,iy+1),d=v(ix+1,iy+1);
  return a+(b-a)*sx+(c-a)*sy+(a-b-c+d)*sx*sy;
}
/** Tileable fractal noise in [0,1): octaves of value noise at 8, 4 and 2 pixel cells plus per-pixel grain. */
export function fbm(x:number,y:number,salt:number,stretchX=1,stretchY=1,grain=.15):number{
  const cell=(c:number,s:number)=>Math.min(16,Math.max(1,c*s));
  const v=valueNoise(x,y,cell(8,stretchX),cell(8,stretchY),salt)*.45+valueNoise(x,y,cell(4,stretchX),cell(4,stretchY),salt+1)*.3
    +valueNoise(x,y,cell(2,stretchX),cell(2,stretchY),salt+2)*.25;
  return Math.min(.9999,Math.max(0,v*(1-grain)+hash(x,y,salt+3)*grain));
}

/** A 16×16 raster built once and read by a painter; null pixels are transparent. */
export class Raster{
  readonly px:(RGBA|null)[]=new Array(T*T).fill(null);
  get(x:number,y:number):RGBA|null{return x<0||y<0||x>=T||y>=T?null:this.px[y*T+x];}
  set(x:number,y:number,c:RGBA|null){if(x>=0&&y>=0&&x<T&&y<T)this.px[y*T+x]=c;}
  has(x:number,y:number){return this.get(x,y)!==null;}
  rect(x0:number,y0:number,x1:number,y1:number,c:RGBA|((x:number,y:number)=>RGBA|null)){
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)this.set(x,y,typeof c==='function'?c(x,y):c);
  }
  /** A 1-px line (Bresenham). */
  line(x0:number,y0:number,x1:number,y1:number,c:RGBA|((x:number,y:number,t:number)=>RGBA)){
    const dx=Math.abs(x1-x0),dy=-Math.abs(y1-y0),sx=x0<x1?1:-1,sy=y0<y1?1:-1,steps=Math.max(dx,-dy)||1;
    let err=dx+dy,x=x0,y=y0,i=0;
    for(;;){this.set(x,y,typeof c==='function'?c(x,y,i/steps):c);if(x===x1&&y===y1)break;const e2=2*err;if(e2>=dy){err+=dy;x+=sx;}if(e2<=dx){err+=dx;y+=sy;}i++;}
  }
  /** A filled ellipse centred on (cx,cy) with radii rx, ry. */
  ellipse(cx:number,cy:number,rx:number,ry:number,c:RGBA|((x:number,y:number,d:number)=>RGBA)){
    for(let y=Math.floor(cy-ry);y<=Math.ceil(cy+ry);y++)for(let x=Math.floor(cx-rx);x<=Math.ceil(cx+rx);x++){
      const d=((x-cx)/rx)**2+((y-cy)/ry)**2;if(d<=1)this.set(x,y,typeof c==='function'?c(x,y,d):c);
    }
  }
  /** Darkens shape pixels whose right or lower neighbour is empty (a soft outline that reads at distance). */
  outline(k=.72,dirs:readonly [number,number][]=[[1,0],[0,1]]){
    const edge:number[]=[];
    for(let y=0;y<T;y++)for(let x=0;x<T;x++)if(this.has(x,y)&&dirs.some(([dx,dy])=>!this.has(x+dx,y+dy)))edge.push(y*T+x);
    for(const i of edge)this.px[i]=shade(this.px[i]!,k);
    return this;
  }
  painter():Painter{const px=this.px;return(x,y)=>px[y*T+x]??CLEAR;}
}
/** Builds a raster with a drawing callback and returns its painter (built lazily on first use). */
export function drawn(draw:(r:Raster)=>void):Painter{
  let p:Painter|null=null;
  return(x,y,n,m)=>{if(!p){const r=new Raster();draw(r);p=r.painter();}return p(x,y,n,m);};
}
/** A tile from 16 rows of 16 characters; '.' is transparent, other characters index the palette. */
export function bitmap(rows:readonly string[],palette:Record<string,RGBA|Painter>):Painter{
  if(rows.length!==T||rows.some(r=>r.length!==T))throw new Error(`bitmap needs 16 rows of 16: ${rows.map(r=>r.length).join(',')}`);
  for(const row of rows)for(const ch of row)if(ch!=='.'&&!palette[ch])throw new Error(`bitmap colour '${ch}' missing`);
  return(x,y,n,m)=>{const ch=rows[y][x];if(ch==='.')return CLEAR;const c=palette[ch];return typeof c==='function'?c(x,y,n,m):c;};
}
/** Overlays painter `top` onto `base` wherever `top` is opaque. */
export const over=(base:Painter,top:Painter):Painter=>(x,y,n,m)=>{const c=top(x,y,n,m);return(c[3]??255)>0?c:base(x,y,n,m);};
/** A painter memoised into a 16×16 cache (for painters that are expensive per pixel). */
export function cached(p:Painter,salt:number):Painter{
  let cache:RGBA[]|null=null;
  return(x,y)=>{if(!cache){cache=[];for(let j=0;j<T;j++)for(let i=0;i<T;i++)cache.push(p(i,j,hash(i,j,salt),hash(i,j,salt+1)));}return cache[wrap(y)*T+wrap(x)];};
}
/** Seamless Voronoi cells (cobblestone, gravel, glowstone): returns the nearest cell id and the gap to the second nearest. */
export function voronoi(count:number,salt:number,jitter=1){
  const pts:[number,number][]=[];
  const r=rng(salt);
  // Jittered grid so the cells stay evenly sized.
  const side=Math.ceil(Math.sqrt(count)),step=T/side;
  for(let j=0;j<side;j++)for(let i=0;i<side;i++)if(pts.length<count)pts.push([(i+.5+(r()-.5)*jitter)*step,(j+.5+(r()-.5)*jitter)*step]);
  const id=new Int16Array(T*T),gap=new Float32Array(T*T),dCentre=new Float32Array(T*T),dx=new Float32Array(T*T),dy=new Float32Array(T*T);
  for(let y=0;y<T;y++)for(let x=0;x<T;x++){
    let best=1e9,second=1e9,bi=0,bx=0,by=0;
    pts.forEach(([px,py],i)=>{
      for(const ox of [-T,0,T])for(const oy of [-T,0,T]){
        const ddx=x+.5-(px+ox),ddy=y+.5-(py+oy),d=Math.hypot(ddx,ddy);
        if(d<best){second=best;best=d;bi=i;bx=ddx;by=ddy;}else if(d<second)second=d;
      }
    });
    const i=y*T+x;id[i]=bi;gap[i]=second-best;dCentre[i]=best;dx[i]=bx;dy[i]=by;
  }
  return{count:pts.length,id:(x:number,y:number)=>id[wrap(y)*T+wrap(x)],gap:(x:number,y:number)=>gap[wrap(y)*T+wrap(x)],
    centre:(x:number,y:number)=>dCentre[wrap(y)*T+wrap(x)],dx:(x:number,y:number)=>dx[wrap(y)*T+wrap(x)],dy:(x:number,y:number)=>dy[wrap(y)*T+wrap(x)]};
}
/** Stretches a noise value around 0.5 by k (clamped to [0,1)). */
export const contrast=(v:number,k:number)=>Math.min(.9999,Math.max(0,(v-.5)*k+.5));
/** 5-row pixel capital letters for labels painted on tiles. */
export const GLYPHS:Record<string,string[]>={
  T:['###','.#.','.#.','.#.','.#.'],N:['#..#','##.#','#.##','#..#','#..#']
};
