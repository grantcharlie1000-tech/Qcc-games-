import {WORLDS,type Level} from './levels';
type C=CanvasRenderingContext2D;
const base=import.meta.env.BASE_URL+'game-art/last-light/textures/';
const sources=new Map<string,HTMLImageElement>();
const materials=new Map<string,HTMLCanvasElement>();
const backdrops=new Map<string,HTMLCanvasElement>();
function load(name:string){return new Promise<void>(resolve=>{if(typeof Image==='undefined'){resolve();return;}const img=new Image();img.onload=()=>{sources.set(name,img);resolve();};img.onerror=()=>resolve();img.src=base+name+'.png';});}
/** Assets are original generated references, sampled once onto a limited native
 * pixel grid by scripts/prepare-last-light-art.mjs. All game geometry stays authored. */
export const artReady=Promise.all(['materials','quarter-vista','districts'].map(load));
export type Material='limestone'|'slate'|'brick'|'moss'|'ivy'|'copper'|'patina'|'verdigris';
const names:Material[]=['limestone','slate','brick','moss','ivy','copper','patina','verdigris'];
export function materialTile(name:Material,world:number,background=false):HTMLCanvasElement|null{
 const image=sources.get('materials');if(!image)return null;
 const key=`${name}/${world}/${background}`,cached=materials.get(key);if(cached)return cached;
 const tile=document.createElement('canvas');tile.width=32;tile.height=32;const c=tile.getContext('2d',{willReadFrequently:true})!;c.imageSmoothingEnabled=false;
 const index=names.indexOf(name);c.drawImage(image,index%4*32,Math.floor(index/4)*32,32,32,0,0,32,32);
 if(background){
  // Retain the material's actual relief, but map it into the district's quiet
  // background ramp so decorative masonry cannot look like a landing surface.
  const p=c.getImageData(0,0,32,32),a=WORLDS[world];
  const rgb=(s:string)=>[1,3,5].map(i=>parseInt(s.slice(i,i+2),16));const dark=rgb(a.sky),light=rgb(a.near);
  for(let i=0;i<p.data.length;i+=4){const value=Math.min(1,Math.max(0,(p.data[i]*.2126+p.data[i+1]*.7152+p.data[i+2]*.0722-24)/155));for(let j=0;j<3;j++)p.data[i+j]=Math.round(dark[j]+(light[j]-dark[j])*(.3+value*.7));}c.putImageData(p,0,0);
 }
 materials.set(key,tile);return tile;
}
export function surfaceTexture(c:C,name:Material,world:number,w:number,h:number,alpha=.5){
 const tile=materialTile(name,world);if(!tile)return;c.save();c.globalAlpha*=alpha;c.fillStyle=c.createPattern(tile,'repeat')!;c.fillRect(0,0,w,h);c.restore();
}
function backdrop(name:string,world:number){
 const key=`${name}/${world}`,cached=backdrops.get(key);if(cached)return cached;
 const image=sources.get(name);if(!image)return null;const canvas=document.createElement('canvas');
 const width=name==='districts'?image.width/2:image.width,height=name==='districts'?image.height/2:image.height;canvas.width=width;canvas.height=height;
 const c=canvas.getContext('2d')!;c.imageSmoothingEnabled=false;
 const col=name==='districts'?(world-1)%2:0,row=name==='districts'?Math.floor((world-1)/2):0;
 c.drawImage(image,col*width,row*height,width,height,0,0,width,height);
 // Broad feathering lets independently placed vistas overlap into the existing
 // parallax sky instead of displaying a rectangular concept-art panel.
 c.globalCompositeOperation='destination-in';const fade=c.createLinearGradient(0,0,width,0);fade.addColorStop(0,'#0000');fade.addColorStop(.12,'#000');fade.addColorStop(.88,'#000');fade.addColorStop(1,'#0000');c.fillStyle=fade;c.fillRect(0,0,width,height);
 const vertical=c.createLinearGradient(0,0,0,height);vertical.addColorStop(0,'#0000');vertical.addColorStop(.15,'#000');vertical.addColorStop(.88,'#000');vertical.addColorStop(1,'#0000');c.fillStyle=vertical;c.fillRect(0,0,width,height);backdrops.set(key,canvas);return canvas;
}
export function drawReferenceVistas(c:C,l:Level,w:number,h:number,cx:number,cy:number){
 if(l.setting==='cavern')return false;const art=backdrop(l.world===0?'quarter-vista':'districts',l.world);if(!art)return false;
 const spacing=art.width-40,shift=Math.floor(cx*.16),first=Math.floor(shift/spacing)-1;
 const y=Math.round(h*.72-art.height-cy*.12);
 c.save();c.globalAlpha=.95;for(let i=first;i*spacing-shift<w;i++)c.drawImage(art,i*spacing-shift,y+(i%2)*9);c.restore();return true;
}
