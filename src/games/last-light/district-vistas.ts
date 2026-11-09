import {WORLDS,type Level} from './levels';
import sheetUrl from './assets/district-vistas.png';
type C=CanvasRenderingContext2D;
const PANEL=512,HEIGHT=256;
const rows=new Map([[1,0],[3,1],[4,2]]);
const paintings=new Map<number,HTMLCanvasElement>();
let loaded=false;
/** Generated environment artwork, sampled into three native 512×256 panels.
 * Each panel is cached once; play only blits images, with no image processing. */
export const prepareDistrictVistas:Promise<void>=typeof Image==='undefined'?Promise.resolve():new Promise(resolve=>{
 const image=new Image();image.decoding='async';
 image.onload=()=>{
  for(const [world,row] of rows){
   const canvas=document.createElement('canvas');canvas.width=PANEL;canvas.height=HEIGHT;const c=canvas.getContext('2d')!;c.imageSmoothingEnabled=false;
   c.drawImage(image,0,row*HEIGHT,PANEL,HEIGHT,0,0,PANEL,HEIGHT);
   // Atmospheric tint keeps the detailed landmarks behind the collision art.
   c.fillStyle=WORLDS[world].sky+'60';c.fillRect(0,0,PANEL,HEIGHT);
   // Fade the sky and side edges into the game's weather, never a visible card.
   c.globalCompositeOperation='destination-in';
   const vertical=c.createLinearGradient(0,0,0,HEIGHT);vertical.addColorStop(0,'#00000000');vertical.addColorStop(.15,'#000000ff');vertical.addColorStop(.89,'#000000ff');vertical.addColorStop(1,'#00000000');c.fillStyle=vertical;c.fillRect(0,0,PANEL,HEIGHT);
   const horizontal=c.createLinearGradient(0,0,PANEL,0);horizontal.addColorStop(0,'#00000000');horizontal.addColorStop(.055,'#000000ff');horizontal.addColorStop(.945,'#000000ff');horizontal.addColorStop(1,'#00000000');c.fillStyle=horizontal;c.fillRect(0,0,PANEL,HEIGHT);
   c.globalCompositeOperation='source-over';paintings.set(world,canvas);
  }loaded=true;resolve();
 };
 image.onerror=()=>resolve();image.src=sheetUrl;
});
/** The distant painted district moves slowly; structural scenery in world.ts
 * and architecture.ts supplies the closer parallax planes. Mirrored repeats
 * preserve the edge silhouette on routes wider than a single panorama. */
export function drawDistrictVistas(c:C,l:Level,w:number,h:number,cx:number,cy:number){
 if(!loaded||l.setting==='cavern')return false;
 const art=paintings.get(l.world);if(!art)return false;
 const width=Math.max(768,w*1.2),height=width/2;
 const startY=Math.max(-170,Math.min(Math.max(0,l.height-h),l.spawn.y-h*.57));
 const origin=l.world===1?width*.16:l.world===3?width*.08:0;
 const shift=Math.floor(cx*.16+origin),first=Math.floor(shift/width),y=Math.round(h*.96-height-(cy-startY)*.1);
 c.save();c.imageSmoothingEnabled=false;c.globalAlpha=.87;
 for(let i=first;i*width-shift<w;i++){
  const x=Math.round(i*width-shift);c.save();c.translate(x+(i%2?width:0),y);if(i%2)c.scale(-1,1);c.drawImage(art,0,0,width,height);c.restore();
 }
 c.restore();return true;
}
