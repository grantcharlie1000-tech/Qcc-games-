/** Shared pixel toolkit for the Old Quarter. Repeating art comes only from
 * small cached tiles whose opposite edges are the same pixels, filled through
 * cached patterns; nothing here allocates while a frame is being drawn. */
export type C=CanvasRenderingContext2D;
const tiles=new Map<string,HTMLCanvasElement>();
const patterns=new WeakMap<C,Map<string,CanvasPattern>>();
export const noise=(a:number,b:number)=>Math.abs(Math.sin(a*127.1+b*311.7)*43758.5453)%1;
export const hash=(a:number,b:number,c=0)=>{let h=Math.imul(a|0,374761393)^Math.imul(b|0,668265263)^Math.imul(c|0,1274126177);h=Math.imul(h^(h>>>13),1103515245);return ((h^(h>>>16))>>>0)/4294967296;};
export function canvas(w:number,h:number){const out=document.createElement('canvas');out.width=w;out.height=h;const c=out.getContext('2d',{willReadFrequently:true})!;c.imageSmoothingEnabled=false;return {out,c};}
export type TileRect=(color:string,x:number,y:number,rw:number,rh:number)=>void;
/** A tile painter whose rectangles wrap, so the left/right and top/bottom
 * edges always continue each other exactly. */
export function seamless(key:string,w:number,h:number,paint:(rect:TileRect)=>void){
 const made=tiles.get(key);if(made)return made;
 const {out,c}=canvas(w,h);
 const rect:TileRect=(color,x,y,rw,rh)=>{c.fillStyle=color;for(let dx=-w;dx<=w;dx+=w)for(let dy=-h;dy<=h;dy+=h)c.fillRect(x+dx,y+dy,rw,rh);};
 paint(rect);tiles.set(key,out);return out;
}
export function sprite(key:string,w:number,h:number,paint:(c:C)=>void){const made=tiles.get(key);if(made)return made;const {out,c}=canvas(w,h);paint(c);tiles.set(key,out);return out;}
export function fill(c:C,key:string,source:()=>HTMLCanvasElement){let byKey=patterns.get(c);if(!byKey){byKey=new Map();patterns.set(c,byKey);}let p=byKey.get(key);if(!p){p=c.createPattern(source(),'repeat')!;byKey.set(key,p);}return p;}
export const box=(c:C,color:string,x:number,y:number,w:number,h:number)=>{c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));};
/** Fills a world rectangle with a seamless tile. */
export function wall(c:C,key:string,source:()=>HTMLCanvasElement,x:number,y:number,w:number,h:number){if(w<=0||h<=0)return;c.fillStyle=fill(c,key,source);c.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));}
export interface Courses {mortar:string;stones:readonly string[];lip:string;chip:string}
/** Coursed masonry: rows offset by half a block. Every block is drawn with
 * wrapping and shaded only from its own cell, so the tile repeats exactly. */
export function masonry(key:string,w:number,h:number,block:number,row:number,k:Courses){
 return seamless(key,w,h,rect=>{
  rect(k.mortar,0,0,w,h);
  for(let r=0;r<h/row;r++)for(let col=0;col<w/block;col++){
   const x=col*block+(r%2)*block/2,y=r*row,v=hash(col,r,w+h);
   rect(k.stones[Math.floor(v*k.stones.length)],x+1,y+1,block-2,row-2);
   rect(k.lip,x+1,y+1,block-3,1);
   if(v>.72)rect(k.chip,x+3+Math.floor(v*7),y+row-4,3,1);
  }
 });
}
/** A one-pixel-stepped line, for ropes, braces and stair strings. */
export function stroke(c:C,color:string,x0:number,y0:number,x1:number,y1:number,thick=1){
 const steps=Math.max(Math.abs(x1-x0),Math.abs(y1-y0));c.fillStyle=color;
 for(let i=0;i<=steps;i++){const t=steps?i/steps:0;c.fillRect(Math.round(x0+(x1-x0)*t),Math.round(y0+(y1-y0)*t),thick,thick);}
}
export function visible(x:number,y:number,w:number,h:number,cx:number,cy:number,vw:number,vh:number){return x+w>cx-24&&x<cx+vw+24&&y+h>cy-24&&y<cy+vh+24;}
