/**
 * Animal Stack, Christmas: festive accessories composed into each species
 * sprite, plus a snowy backdrop and platform. Rendering only.
 *
 * Accessories are extra SVG markup drawn on top of the unchanged species art,
 * in the same sprite coordinates. The physics body, collider pieces, mass and
 * the bounds used for camera framing all come from `species/` and `body.ts`
 * and are not read or changed here; only the sprite's draw box grows so a hat
 * or antlers are not cropped.
 */
import type { Kind } from './model';
import { SPECIES } from './species';
import { speciesBox } from './species/types';
import { XMAS, drawSnowflake, drawLightString, hash } from '../../festive/art';

type Box = {x:number;y:number;width:number;height:number};
/** hat: brim centre, width, tilt (rad), tip falls toward `back` (-1 left, 1 right).
 *  antlers: base centre between the two antlers, size, tilt.
 *  scarf: band centre across the neck, band length, band angle (rad), tail side (-1/1). */
type Accessory =
 {type:'hat';x:number;y:number;w:number;tilt:number;back:-1|1}|
 {type:'antlers';x:number;y:number;size:number;tilt:number}|
 {type:'scarf';x:number;y:number;len:number;angle:number;side:-1|1;color:'red'|'green'};

/** Hand-placed from each species' art (sprite coordinates, y down). */
export const ACCESSORIES:Record<Kind,Accessory>={
 elephant:{type:'hat',x:-31,y:-27,w:19,tilt:-.3,back:1},
 giraffe:{type:'scarf',x:-26,y:-30,len:16,angle:-.12,side:1,color:'red'},
 horse:{type:'antlers',x:29,y:-44,size:16,tilt:.25},
 tapir:{type:'hat',x:-29,y:-24,w:16,tilt:-.35,back:1},
 penguin:{type:'hat',x:-3,y:-33,w:20,tilt:-.12,back:1},
 sloth:{type:'hat',x:-39,y:-25,w:18,tilt:-.2,back:1},
 lion:{type:'hat',x:40,y:-35,w:18,tilt:.25,back:-1},
 panda:{type:'hat',x:-36,y:-25,w:17,tilt:-.15,back:1},
 cow:{type:'scarf',x:31,y:-7,len:19,angle:1.2,side:1,color:'green'},
 ostrich:{type:'scarf',x:20,y:-38,len:12,angle:-.05,side:-1,color:'red'},
 gorilla:{type:'hat',x:31,y:-43,w:22,tilt:.18,back:-1},
 capybara:{type:'antlers',x:-28,y:-21,size:13,tilt:-.15},
 camel:{type:'scarf',x:37,y:-29,len:14,angle:-.1,side:-1,color:'green'},
 moose:{type:'scarf',x:22,y:-13,len:17,angle:.35,side:-1,color:'red'},
 peacock:{type:'scarf',x:24,y:-14,len:11,angle:.1,side:-1,color:'red'},
 wolf:{type:'hat',x:36,y:-28,w:16,tilt:.3,back:-1},
 fox:{type:'scarf',x:19,y:-5,len:14,angle:.3,side:-1,color:'green'},
 koala:{type:'hat',x:-7,y:-24,w:20,tilt:-.05,back:1},
 alpaca:{type:'scarf',x:-19,y:-12,len:18,angle:.05,side:1,color:'red'},
 rhino:{type:'scarf',x:-22,y:-2,len:18,angle:-.3,side:1,color:'green'},
 turtle:{type:'hat',x:-34,y:-10,w:13,tilt:-.3,back:1},
 redPanda:{type:'hat',x:31,y:-26,w:16,tilt:.2,back:-1},
 hippo:{type:'antlers',x:-30,y:-22,size:15,tilt:-.1},
 sheep:{type:'hat',x:-27,y:-29,w:18,tilt:-.2,back:1},
};

const INK='#1d1b22';
const n=(v:number)=>Number(v.toFixed(2));
const deg=(rad:number)=>n(rad*180/Math.PI);

function hat(a:Extract<Accessory,{type:'hat'}>){
 const w=a.w,h=w*.95,b=w*.3,tip=a.back*w*.42,o=n(Math.max(1.4,w*.11));
 return `<g transform="translate(${n(a.x)} ${n(a.y)}) rotate(${deg(a.tilt)})" stroke="${INK}" stroke-width="${o}" stroke-linejoin="round">`+
  `<path d="M${n(-w*.44)} ${n(-b*.3)}C${n(-w*.38)} ${n(-h*.6)} ${n(tip-w*.1)} ${n(-h*.82)} ${n(tip)} ${n(-h)}C${n(tip+w*.1)} ${n(-h*.72)} ${n(w*.32)} ${n(-h*.5)} ${n(w*.44)} ${n(-b*.3)}Z" fill="${XMAS.red}"/>`+
  `<path d="M${n(a.back*w*.08)} ${n(-b*.4)}C${n(a.back*w*.14)} ${n(-h*.5)} ${n(tip*.7)} ${n(-h*.8)} ${n(tip)} ${n(-h)}C${n(tip*.6)} ${n(-h*.68)} ${n(a.back*w*.3)} ${n(-h*.4)} ${n(a.back*w*.42)} ${n(-b*.4)}Z" fill="${XMAS.redDeep}" stroke="none"/>`+
  `<rect x="${n(-w*.53)}" y="${n(-b*.65)}" width="${n(w*1.06)}" height="${n(b)}" rx="${n(b/2)}" fill="${XMAS.fur}"/>`+
  `<circle cx="${n(tip)}" cy="${n(-h)}" r="${n(w*.15)}" fill="${XMAS.fur}"/></g>`;
}
function antlers(a:Extract<Accessory,{type:'antlers'}>){
 const s=a.size/13;
 const one=(dx:number,shade:string)=>{const p=`M${dx} 0C${dx-1} -5 ${dx-3} -9 ${dx-6} -12M${dx-1.6} -5L${dx-6.5} -6.5M${dx-3.6} -9L${dx-2.8} -14.5`;
  return `<path d="${p}" stroke="${INK}" stroke-width="5"/><path d="${p}" stroke="${shade}" stroke-width="2.6"/>`;};
 return `<g transform="translate(${n(a.x)} ${n(a.y)}) rotate(${deg(a.tilt)}) scale(${n(s)})" fill="none" stroke-linecap="round" stroke-linejoin="round">`+
  one(5,'#6b4423')+one(-2,'#9a6334')+
  `<circle cx="1.6" cy="1" r="2.6" fill="${XMAS.red}" stroke="${INK}" stroke-width="1.3"/><path d="M-1.2 1.4 1.6 1 4.4 1.4" stroke="${XMAS.green}" stroke-width="1.6"/></g>`;
}
function scarf(a:Extract<Accessory,{type:'scarf'}>,id:string){
 const main=a.color==='red'?XMAS.red:XMAS.green,stripe=a.color==='red'?XMAS.fur:XMAS.goldLight,half=a.len/2+1.5;
 const ca=Math.cos(a.angle),sa=Math.sin(a.angle),ex=a.x+ca*(half-3)*a.side,ey=a.y+sa*(half-3)*a.side;
 const tail=`<g transform="translate(${n(ex)} ${n(ey)}) rotate(${a.side*-12})"><rect x="-3" y="-1" width="6" height="13" rx="1.5" fill="${main}" stroke="${INK}" stroke-width="1.6"/>`+
  `<path d="M-3 4.5h6M-3 8h6" stroke="${stripe}" stroke-width="1.6"/><path d="M-2 12.5v2.5M0 12.5v2.5M2 12.5v2.5" stroke="${INK}" stroke-width="1.1" stroke-linecap="round"/></g>`;
 const count=Math.max(2,Math.round(a.len/6)),stripes=Array.from({length:count},(_,i)=>`M${n(-half+(i+1)*(2*half)/(count+1))} -3.4v6.8`).join('');
 return `<g aria-hidden="true">${tail}<g transform="translate(${n(a.x)} ${n(a.y)}) rotate(${deg(a.angle)})"><clipPath id="${id}"><rect x="${n(-half)}" y="-3.6" width="${n(half*2)}" height="7.2" rx="3"/></clipPath>`+
  `<rect x="${n(-half)}" y="-3.6" width="${n(half*2)}" height="7.2" rx="3" fill="${main}"/><path d="${stripes}" stroke="${stripe}" stroke-width="1.7" clip-path="url(#${id})"/>`+
  `<rect x="${n(-half)}" y="-3.6" width="${n(half*2)}" height="7.2" rx="3" fill="none" stroke="${INK}" stroke-width="1.8"/></g></g>`;
}

export function accessoryMarkup(kind:Kind){
 const a=ACCESSORIES[kind];
 return a.type==='hat'?hat(a):a.type==='antlers'?antlers(a):scarf(a,`${kind}-xmas-scarf`);
}
function accessoryBounds(kind:Kind):Box{
 const a=ACCESSORIES[kind];
 if(a.type==='scarf'){const r=a.len/2+6;return {x:a.x-r,y:a.y-r,width:r*2,height:r+18};}
 const r=a.type==='hat'?a.w*1.1:a.size*1.3;return {x:a.x-r,y:a.y-r*1.25,width:r*2,height:r*1.5};
}
/** The sprite's draw box, grown to fit the accessory. Never used for physics or camera framing. */
export function festiveBox(kind:Kind):Box{
 const b=speciesBox(SPECIES[kind]),c=accessoryBounds(kind);
 const x=Math.floor(Math.min(b.x,c.x)),y=Math.floor(Math.min(b.y,c.y));
 return {x,y,width:Math.ceil(Math.max(b.x+b.width,c.x+c.width))-x,height:Math.ceil(Math.max(b.y+b.height,c.y+c.height))-y};
}
export function festiveAnimalSvg(kind:Kind){
 const b=festiveBox(kind);
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.x} ${b.y} ${b.width} ${b.height}" width="${b.width*3}" height="${b.height*3}" role="img" aria-label="${SPECIES[kind].name} toy cutout in festive dress"><g>${SPECIES[kind].art}</g>${accessoryMarkup(kind)}</svg>`;
}

/** Winter sky and snowfield. Its vertical stops match the CSS around the scene (christmas.css). */
export const SKY_STOPS:readonly [number,string][]=[[0,'#86bfe3'],[.55,'#c6e2f4'],[.79,'#e8f3fb'],[.79,'#f7fbff'],[1,'#dbe7f2']];
const GROUND=.79;
let backdrop:{canvas:HTMLCanvasElement;key:string}|undefined;
/** Painted once per canvas size; the scene stamps it each frame. */
export function festiveBackdrop(width:number,height:number,ratio:number){
 const key=`${width}x${height}@${ratio}`;
 if(backdrop?.key===key)return backdrop.canvas;
 const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width*ratio));canvas.height=Math.max(1,Math.round(height*ratio));
 const c=canvas.getContext('2d')!;c.setTransform(ratio,0,0,ratio,0,0);
 const sky=c.createLinearGradient(0,0,0,height);for(const [stop,color] of SKY_STOPS)sky.addColorStop(stop,color);c.fillStyle=sky;c.fillRect(0,0,width,height);
 // Soft drifts that rise from, and return to, the flat snow line at both edges; below the line the
 // sky gradient's own snow stops show through, exactly as in the surround, so there is no seam.
 const line=height*GROUND;
 for(const [rise,color,phase] of [[.045,'#e4eef7',.3],[.026,'#f7fbff',1.7]] as const){
  c.beginPath();c.moveTo(0,line+.5);
  for(let i=0;i<=48;i++){const t=i/48;c.lineTo(t*width,line-Math.sin(Math.PI*t)*height*rise*(.75+.25*Math.sin(t*9+phase)));}
  c.lineTo(width,line+.5);c.closePath();c.fillStyle=color;c.fill();
 }
 // Static flakes in the sky only.
 for(let i=0;i<26;i++){const x=hash(i*3+1)*width,y=hash(i*3+2)*line*.92;drawSnowflake(c,x,y,2+hash(i*3+3)*3.5,'#ffffff',.75);}
 backdrop={canvas,key};return canvas;
}

/** Evergreen platform with a snowy top band and a light string beneath; same rectangle as the original. */
let platform:{canvas:HTMLCanvasElement;key:number}|undefined;
const PAD_X=6,PAD_TOP=4,PAD_BOTTOM=26;
export function drawFestivePlatform(c:CanvasRenderingContext2D,floor:number){
 const m=c.getTransform(),scale=Math.round(Math.hypot(m.a,m.b)*100)/100||1;
 if(platform?.key!==scale){
  const width=324+PAD_X*2,height=10+PAD_TOP+PAD_BOTTOM,canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.ceil(width*scale));canvas.height=Math.max(1,Math.ceil(height*scale));
  const g=canvas.getContext('2d')!;g.setTransform(scale,0,0,scale,PAD_X*scale,PAD_TOP*scale);
  drawLightString(g,8,11,316,11,12,4.2,5,0);
  g.fillStyle=XMAS.greenDeep;g.strokeStyle='#161719';g.lineWidth=3;g.beginPath();g.roundRect(0,0,324,10,1);g.fill();g.stroke();
  g.fillStyle=XMAS.snow;g.fillRect(2,1,320,5);g.fillStyle=XMAS.snowShade;g.fillRect(2,5,320,1.2);
  platform={canvas,key:scale};
 }
 c.drawImage(platform.canvas,18-PAD_X,floor-PAD_TOP,platform.canvas.width/scale,platform.canvas.height/scale);
}
