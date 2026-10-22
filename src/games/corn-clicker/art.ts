/**
 * Pixel-art rendering. Sprites in sprites.ts are character grids; each is drawn once to a small
 * canvas, turned into a PNG data URL and shown scaled up with `image-rendering: pixelated`.
 */
import {COB,SKINS,PRODUCERS,GOLDEN,PEST,SCARECROW,PLANT,VARIETIES,KERNEL,SEED,BUTTER,MOUSE,SPARKLE,type Sprite} from './sprites';

export type ProducerId='farmhand'|'patch'|'field'|'tractor'|'combine'|'greenhouse'|'irrigation'|'factory'|'lab'|'hydroponic'|'robot'|'weather'|'megafarm'|'orbital'|'lunar'|'cloner'|'time'|'dimension'|'singularity'|'corniverse';
export type SkinId='classic'|'butter'|'ruby'|'bluemoon'|'prism'|'frost'|'midnight'|'golden';
export type VarietyId='sweet'|'popcorn'|'bluemoon'|'prism'|'candy'|'ghost'|'ember'|'starcob';

const urls=new Map<string,string>();
function canvas(w:number,h:number):[HTMLCanvasElement,CanvasRenderingContext2D]|undefined {
  if(typeof document==='undefined')return undefined;
  const c=document.createElement('canvas');c.width=w;c.height=h;
  const ctx=c.getContext('2d');return ctx?[c,ctx]:undefined;
}
/** PNG data URL for a sprite with optional palette overrides (cached by key). */
export function spriteUrl(sprite:Sprite,key:string,overrides:Record<string,string>={}):string {
  const cached=urls.get(key);if(cached!==undefined)return cached;
  const made=canvas(sprite.w,sprite.h);
  if(!made)return '';
  const [c,ctx]=made,pal={...sprite.pal,...overrides};
  sprite.px.forEach((row,y)=>{for(let x=0;x<row.length;x++){const colour=pal[row[x]];if(row[x]!=='.'&&colour){ctx.fillStyle=colour;ctx.fillRect(x,y,1,1);}}});
  const url=c.toDataURL('image/png');urls.set(key,url);return url;
}
const img=(url:string,w:number,h:number,cls='')=>`<img class="px${cls?' '+cls:''}" src="${url}" width="${w}" height="${h}" alt="" draggable="false">`;
const sprite=(s:Sprite,key:string,overrides?:Record<string,string>,cls?:string)=>img(spriteUrl(s,key,overrides),s.w,s.h,cls);

export const cobArt=(skin:SkinId)=>sprite(COB,'cob-'+skin,SKINS[skin],'cc-cob-img');
export const producerArt=(id:ProducerId)=>sprite(PRODUCERS[id],'p-'+id);
export const goldenArt=()=>sprite(GOLDEN,'golden');
export const pestArt=()=>sprite(PEST,'pest');
export const scarecrowArt=(hat:'straw'|'top'|'wizard')=>sprite(SCARECROW[hat],'crow-'+hat);
export const plantArt=(variety:VarietyId,stage:0|1|2|3)=>stage===3?sprite(PLANT[3],'plant-'+variety,VARIETIES[variety]):sprite(PLANT[stage],'plant-'+stage);
export const kernelUrl=()=>spriteUrl(KERNEL,'kernel');
export const kernelArt=()=>sprite(KERNEL,'kernel');
export const seedArt=()=>sprite(SEED,'seed');
export const butterArt=()=>sprite(BUTTER,'butter');
export const mouseArt=()=>sprite(MOUSE,'mouse');
export const sparkleArt=()=>sprite(SPARKLE,'sparkle');

// ───────────── Farm backdrop: drawn procedurally at 192×120 ─────────────
type Stage=0|1|2|3;
const SCENES:Record<Stage,{sky:string[];far:string;near:string;ground:string[]}>={
  0:{sky:['#5fb8f0','#7cc8f4','#9ad7f6','#b9e4f7'],far:'#7cc25a',near:'#5aa83f',ground:['#7dbb4a','#6aa83c']},
  1:{sky:['#3b2a5c','#6b3a6e','#b4566a','#e98a5e'],far:'#3a2c40',near:'#5d6b2f',ground:['#76803a','#646d31']},
  2:{sky:['#0b1430','#13214a','#1b2f5e','#24406f'],far:'#14243f',near:'#1d4a4a',ground:['#2a5c52','#234e46']},
  3:{sky:['#12062a','#2a0c4a','#4b1466','#6d1f7a'],far:'#2c1050',near:'#3d1a63',ground:['#55307d','#47286b']},
};
function lcg(seed:number){let s=seed>>>0;return ()=>((s=Math.imul(s,1664525)+1013904223>>>0)/4294967296);}
export function sceneUrl(stage:Stage):string {
  const key='scene-'+stage,cached=urls.get(key);if(cached!==undefined)return cached;
  const W=192,H=120,made=canvas(W,H);if(!made)return '';
  const [c,ctx]=made,t=SCENES[stage],rand=lcg(stage*977+5);
  const px=(x:number,y:number,col:string,w=1,h=1)=>{ctx.fillStyle=col;ctx.fillRect(x,y,w,h);};
  // Sky in bands, with a checker dither where bands meet.
  const band=Math.ceil(72/t.sky.length);
  t.sky.forEach((col,i)=>{px(0,i*band,col,W,band);if(i>0)for(let x=0;x<W;x+=2)px(x+(i%2),i*band,t.sky[i-1]);});
  if(stage>=2)for(let i=0;i<60;i++)px(Math.floor(rand()*W),Math.floor(rand()*60),rand()<.2?'#ffe9a8':'#ffffff');
  const disc=(cx:number,cy:number,r:number,col:string,shade?:string)=>{for(let y=-r;y<=r;y++)for(let x=-r;x<=r;x++)if(x*x+y*y<=r*r)px(cx+x,cy+y,shade&&x+y>r/2?shade:col);};
  if(stage===0){disc(160,18,9,'#ffe45c','#ffc93c');for(const [cx,cy] of [[30,16],[92,26]] as const){disc(cx,cy,5,'#ffffff');disc(cx+6,cy+1,4,'#ffffff');disc(cx-6,cy+2,3,'#ffffff');px(cx-9,cy+3,'#ffffff',19,3);}}
  if(stage===1){disc(150,58,14,'#ffb25e','#f2924a');}
  if(stage===2){disc(158,20,8,'#f4f1d8','#d6d2b4');px(155,17,'#c9c49f',2,2);px(160,23,'#c9c49f',2,1);}
  if(stage===3){disc(150,28,11,'#ff9a52','#d9663a');for(let x=-20;x<=20;x++)px(150+x,28+Math.round(x*0.15),'#ffd27a');disc(30,18,4,'#5ee6d6','#38b5a8');}
  // Far skyline or hills, then near hills.
  for(let x=0;x<W;x++){
    const far=stage===1?(Math.floor(x/14)%3===0?18:Math.floor(x/7)%2?10:6):Math.round(8+5*Math.sin(x/17)+3*Math.sin(x/7));
    px(x,72-far,t.far,1,far);
    const near=Math.round(4+3*Math.sin(x/23+1));
    px(x,72-near,t.near,1,near);
  }
  if(stage===1)for(let i=0;i<24;i++)px(Math.floor(rand()*W),56+Math.floor(rand()*12),'#ffd36b');
  // Ground with furrows.
  for(let y=72;y<H;y++)px(0,y,t.ground[(Math.floor((y-72)/4))%2],W,1);
  for(let y=76;y<H;y+=8)for(let x=(y/8)%2?0:3;x<W;x+=6)px(x,y,t.ground[1],3,1);
  if(stage===0){px(18,50,'#b33a2c',16,22);px(16,48,'#7a2a20',20,3);px(23,62,'#5a1e17',6,10);px(36,44,'#cfd6dc',6,28);}
  const url=c.toDataURL('image/png');urls.set(key,url);return url;
}
export const sceneArt=(stage:Stage)=>img(sceneUrl(stage),192,120,'cc-backdrop-img');
