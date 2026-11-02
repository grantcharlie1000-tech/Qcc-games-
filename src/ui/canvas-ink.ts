type RGB=readonly [number,number,number];
type Sample={at:number;width:number;height:number;pixels:Uint8ClampedArray<ArrayBufferLike>;box:DOMRect};
const cache=new WeakMap<HTMLCanvasElement,Sample>();
let scratch:HTMLCanvasElement|undefined;
let ctx:CanvasRenderingContext2D|null|undefined;
/** One tiny readback per live source per 120ms, shared by all visible glyphs. */
export function canvasInk(area:DOMRect,source:HTMLCanvasElement):RGB[]|null{
 scratch??=document.createElement('canvas');
 if(ctx===undefined)ctx=scratch.getContext('2d',{willReadFrequently:true});
 if(!ctx||!source.width||!source.height)return null;
 const box=source.getBoundingClientRect();
 if(area.left>=box.right||area.right<=box.left||area.top>=box.bottom||area.bottom<=box.top)return null;
 let sample=cache.get(source);
 if(!sample||performance.now()-sample.at>=120){
  const scale=128/Math.max(source.width,source.height),width=Math.max(1,Math.round(source.width*scale)),height=Math.max(1,Math.round(source.height*scale));
  try{scratch.width=width;scratch.height=height;ctx.drawImage(source,0,0,width,height);sample={at:performance.now(),width,height,pixels:ctx.getImageData(0,0,width,height).data,box};cache.set(source,sample);}catch{return null;}
 }
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
