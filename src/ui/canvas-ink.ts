import {hasGlassFrameSource,onGlassFrame,requestGlassFrame} from './glass-frame-source';
type RGB=readonly [number,number,number];
type Sample={at:number;width:number;height:number;pixels:Uint8ClampedArray<ArrayBufferLike>;box:DOMRect};
const cache=new WeakMap<HTMLCanvasElement,Sample>();
const lostSources=new WeakSet<HTMLCanvasElement>();
let scratch:HTMLCanvasElement|undefined;
let ctx:CanvasRenderingContext2D|null|undefined;
let observed:HTMLCanvasElement|null=null,unobserve:(()=>void)|undefined;
function capture(source:HTMLCanvasElement):void{
 if(document.hidden||lostSources.has(source)||performance.now()-(cache.get(source)?.at??-Infinity)<120)return;
 scratch??=document.createElement('canvas');if(ctx===undefined)ctx=scratch.getContext('2d',{willReadFrequently:true});
 if(!ctx||!source.width||!source.height)return;
 const scale=128/Math.max(source.width,source.height),width=Math.max(1,Math.round(source.width*scale)),height=Math.max(1,Math.round(source.height*scale));
 try{scratch.width=width;scratch.height=height;ctx.drawImage(source,0,0,width,height);cache.set(source,{at:performance.now(),width,height,pixels:ctx.getImageData(0,0,width,height).data,box:source.getBoundingClientRect()});}catch{/* Unknown sources keep the CSS background fallback. */}
}
/** Subscribe only to the current visible game; no discarded WebGL buffer reads. */
export function syncCanvasInkSource(source:HTMLCanvasElement|null):void{
 if(source===observed)return;unobserve?.();unobserve=undefined;observed=source;
 // getContext('2d') is null for a WebGL canvas and never creates a context on a 2D one.
 if(source&&hasGlassFrameSource(source)&&!source.getContext('2d')){
  const current=source,off=onGlassFrame(current,()=>capture(current));
  const lost=()=>{lostSources.add(current);cache.delete(current);};
  const restored=()=>{lostSources.delete(current);try{requestGlassFrame(current);}catch{/* Wait for the game renderer to recover. */}};
  current.addEventListener('webglcontextlost',lost);current.addEventListener('webglcontextrestored',restored);
  unobserve=()=>{off();current.removeEventListener('webglcontextlost',lost);current.removeEventListener('webglcontextrestored',restored);};
  if(!cache.has(source))try{requestGlassFrame(source);}catch{/* A lost/unsupported source retains CSS background ink. */}
 }
}
/** One tiny readback per live source per 120ms, shared by all visible glyphs. */
export function canvasInk(area:DOMRect,source:HTMLCanvasElement):RGB[]|null{
 scratch??=document.createElement('canvas');
 if(ctx===undefined)ctx=scratch.getContext('2d',{willReadFrequently:true});
 if(!ctx||!source.width||!source.height||lostSources.has(source)||source.closest('[hidden]'))return null;
 const style=getComputedStyle(source);if(style.opacity==='0'||style.visibility==='hidden'||style.display==='none')return null;
 const box=source.getBoundingClientRect();
 if(area.left>=box.right||area.right<=box.left||area.top>=box.bottom||area.bottom<=box.top)return null;
 if(!hasGlassFrameSource(source)||source.getContext('2d'))capture(source);
 const sample=cache.get(source);if(!sample)return null;
 const {width,height,pixels}=sample;
 const x0=Math.max(0,Math.floor((area.left-box.left)/box.width*width)),x1=Math.min(width-1,Math.ceil((area.right-box.left)/box.width*width));
 const y0=Math.max(0,Math.floor((area.top-box.top)/box.height*height)),y1=Math.min(height-1,Math.ceil((area.bottom-box.top)/box.height*height));
 const total=[0,0,0];let count=0;
 for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
  const i=(y*width+x)*4;if(pixels[i+3]<240)continue;
  for(let c=0;c<3;c++)total[c]+=pixels[i+c];count++;
 }
 return count?[total.map(n=>Math.round(n/count)) as [number,number,number]]:null;
}
