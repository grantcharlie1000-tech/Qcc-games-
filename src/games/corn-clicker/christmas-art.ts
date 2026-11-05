/**
 * Corn Clicker, Christmas: a gift-wrapped golden cob and a snowy farm backdrop.
 * Pixel art on the same grids as the originals (golden cob 20×30, backdrop
 * 192×120), so every hit area, layout box and sprite size is unchanged.
 * Presentation only: nothing here reads or changes game state.
 */
import {COB,GOLDEN,type Sprite} from './sprites';

/** Overlays rows of `patch` onto `rows` at (x,y); '.' in the patch keeps the original pixel. */
function stamp(rows:string[],x:number,y:number,patch:string[]){
 patch.forEach((line,dy)=>{const row=rows[y+dy]!.split('');for(let i=0;i<line.length;i++)if(line[i]!=='.')row[x+i]=line[i]!;rows[y+dy]=row.join('');});
}
const FESTIVE_PAL={r:'#e0283c',R:'#8e1426',S:'#f6faff',s:'#bcd2e6'};
const BOW=['.oo.....oo.','orro...orro','orrrooorrro','orrrRRRrrro','oRRrooorRRo','.oo.oRo.oo.','...oRoRo...','...oo.oo...'];
/** The golden cob with a little snow on top and a red ribbon bow round its middle. */
export const GOLDEN_XMAS:Sprite=(()=>{
 const px=[...GOLDEN.px];
 stamp(px,6,1,['.sSSSs.','sSSSSSs','oSSsSSo','.S..S..']);
 stamp(px,3,17,['rrrrrrrrrrrrrr']);
 stamp(px,4,14,BOW);
 return {w:GOLDEN.w,h:GOLDEN.h,pal:{...GOLDEN.pal,...FESTIVE_PAL},px};
})();

/** The clickable cob, on its own 28×44 grid: snow on its tip and a gift bow where the husk gathers.
 *  Skins still recolour the kernels and husk; the bow and snow keep their own colours. */
export const COB_XMAS:Sprite=(()=>{
 const px=[...COB.px];
 stamp(px,10,0,['sSSSSSSs']);
 stamp(px,9,1,['SSSSSSSSSs']);
 stamp(px,9,2,['SSsSSSSsSS']);
 stamp(px,10,3,['S..S...S']);
 stamp(px,5,39,['rrrrrrrrrrrrrrrrrr']);
 stamp(px,8,36,BOW);
 return {w:COB.w,h:COB.h,pal:{...COB.pal,...FESTIVE_PAL},px};
})();

// ───────────── Snowy farm backdrop, 192×120 like the original ─────────────
type Stage=0|1|2|3;
/** Each stage keeps its time of day; the land is under snow. */
const SCENES:Record<Stage,{sky:string[];far:string;near:string;ground:string[];flake:string}>={
 0:{sky:['#6fa9d6','#86bae0','#a3cbe9','#c3ddf1'],far:'#dfeaf3',near:'#f2f7fb',ground:['#f4f8fc','#e2ebf4'],flake:'#ffffff'},
 1:{sky:['#3b2a5c','#6b3a6e','#b4566a','#e98a5e'],far:'#8e7f9c',near:'#d9cfe0',ground:['#e6dde9','#d2c6d9'],flake:'#ffe9f0'},
 2:{sky:['#0b1430','#13214a','#1b2f5e','#24406f'],far:'#4c6488',near:'#7f97b8',ground:['#93a9c6','#8098b7'],flake:'#dfe9ff'},
 3:{sky:['#12062a','#2a0c4a','#4b1466','#6d1f7a'],far:'#5f4a8c',near:'#8d77b4',ground:['#a08bc4','#8f79b5'],flake:'#f1dcff'},
};
const BULBS=['#ff4a5a','#ffd23c','#4ad06a','#4aa8ff'];
const urls=new Map<string,string>();
function lcg(seed:number){let s=seed>>>0;return ()=>((s=Math.imul(s,1664525)+1013904223>>>0)/4294967296);}
export function festiveSceneUrl(stage:Stage):string {
 const key='xmas-scene-'+stage,cached=urls.get(key);if(cached!==undefined)return cached;
 if(typeof document==='undefined')return '';
 const W=192,H=120,c=document.createElement('canvas');c.width=W;c.height=H;const ctx=c.getContext('2d');if(!ctx)return '';
 const t=SCENES[stage],rand=lcg(stage*977+5);
 const px=(x:number,y:number,col:string,w=1,h=1)=>{ctx.fillStyle=col;ctx.fillRect(x,y,w,h);};
 const band=Math.ceil(72/t.sky.length);
 t.sky.forEach((col,i)=>{px(0,i*band,col,W,band);if(i>0)for(let x=0;x<W;x+=2)px(x+(i%2),i*band,t.sky[i-1]!);});
 if(stage>=2)for(let i=0;i<60;i++)px(Math.floor(rand()*W),Math.floor(rand()*60),rand()<.2?'#ffe9a8':'#ffffff');
 const disc=(cx:number,cy:number,r:number,col:string,shade?:string)=>{for(let y=-r;y<=r;y++)for(let x=-r;x<=r;x++)if(x*x+y*y<=r*r)px(cx+x,cy+y,shade&&x+y>r/2?shade:col);};
 if(stage===0){disc(160,18,8,'#fff4c2','#ffe08a');for(const [cx,cy] of [[30,16],[92,26]] as const){disc(cx,cy,5,'#ffffff');disc(cx+6,cy+1,4,'#ffffff');disc(cx-6,cy+2,3,'#ffffff');px(cx-9,cy+3,'#ffffff',19,3);}}
 if(stage===1)disc(150,58,14,'#ffb25e','#f2924a');
 if(stage===2){disc(158,20,8,'#f4f1d8','#d6d2b4');px(155,17,'#c9c49f',2,2);px(160,23,'#c9c49f',2,1);}
 if(stage===3){disc(150,28,11,'#ff9a52','#d9663a');for(let x=-20;x<=20;x++)px(150+x,28+Math.round(x*0.15),'#ffd27a');disc(30,18,4,'#5ee6d6','#38b5a8');}
 // Snowy hills: the same silhouettes as the original farm.
 for(let x=0;x<W;x++){
  const far=stage===1?(Math.floor(x/14)%3===0?18:Math.floor(x/7)%2?10:6):Math.round(8+5*Math.sin(x/17)+3*Math.sin(x/7));
  px(x,72-far,t.far,1,far);
  const near=Math.round(4+3*Math.sin(x/23+1));
  px(x,72-near,t.near,1,near);
 }
 // Little fir trees on the far ridge, each with a snowy tip.
 const fir=(x:number,base:number,h:number)=>{for(let r=0;r<h;r++){const w=1+Math.floor(r*0.7);px(x-w,base-h+r,stage===0?'#2f7a52':'#24533f',w*2+1,1);}px(x,base-h,'#ffffff');px(x-1,base-h+2,'#ffffff');px(x+1,base-h+3,'#ffffff');px(x,base,'#5a3a22',1,2);};
 for(const [x,h] of [[58,9],[66,12],[74,8],[118,10],[127,13],[136,9],[176,11]] as const){const near=Math.round(4+3*Math.sin(x/23+1));fir(x,72-near,h);}
 if(stage===1)for(let i=0;i<24;i++)px(Math.floor(rand()*W),56+Math.floor(rand()*12),'#ffd36b');
 // Snowfield with soft drift lines.
 for(let y=72;y<H;y++)px(0,y,t.ground[(Math.floor((y-72)/4))%2]!,W,1);
 for(let y=76;y<H;y+=8)for(let x=(y/8)%2?0:3;x<W;x+=6)px(x,y,t.ground[1]!,3,1);
 // Red barn with a snowy roof, a wreath and lights along the eave.
 if(stage===0){
  px(18,50,'#b33a2c',16,22);px(16,48,'#7a2a20',20,3);px(23,62,'#5a1e17',6,10);px(36,44,'#cfd6dc',6,28);
  px(15,46,'#ffffff',22,2);px(15,48,'#e6eef6',2,2);px(35,48,'#e6eef6',2,1);px(36,42,'#ffffff',6,2);
  for(let i=0;i<5;i++)px(18+i*4,51,BULBS[i%BULBS.length]!);
  px(25,54,'#2c8a4c',2,1);px(24,55,'#2c8a4c',1,2);px(27,55,'#2c8a4c',1,2);px(25,57,'#2c8a4c',2,1);px(25,55,'#e0283c',2,2);
 }
 // A still snowfall over the sky (no motion).
 for(let i=0;i<70;i++){const x=Math.floor(rand()*W),y=Math.floor(rand()*70);px(x,y,t.flake);if(i%5===0){px(x-1,y,t.flake);px(x+1,y,t.flake);px(x,y-1,t.flake);px(x,y+1,t.flake);}}
 const url=c.toDataURL('image/png');urls.set(key,url);return url;
}
