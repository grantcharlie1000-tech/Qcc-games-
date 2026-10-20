// Plants: grass, ferns, flowers, mushrooms, sugar cane, lily pads, cactus, pumpkin, melon, moss and crops.
import {type Painter,type RGBA,T,CLEAR,rgb,grey,shade,ramp,pick,hash,valueNoise,fbm,contrast,cached,bitmap,drawn,rng} from './tiles-core';

// ---- Biome-tinted plants (painted grey) ---------------------------------------------------------
/** Short grass: a tuft of tapering blades, dark at the roots and lighter toward the tips. */
export const shortGrass:Painter=drawn(r=>{
  const random=rng(507),greys=[0x70,0x84,0x98,0xac,0xc0,0xd4];
  const blades:[number,number,number][]=[];
  for(let i=0;i<22;i++)blades.push([Math.floor(random()*16),i<8?8+Math.floor(random()*6):4+Math.floor(random()*7),Math.round((random()-.5)*4)]);
  blades.sort((a,b)=>b[1]-a[1]);
  for(const [x0,h,lean] of blades){
    const x1=Math.max(1,Math.min(14,x0+lean));
    r.line(x0,15,x1,15-h,(x,y,t)=>grey(greys[Math.min(5,Math.floor(t*4.6+random()*1.4))]));
  }
  r.set(0,0,null);r.set(15,0,null);
});
export const fern:Painter=bitmap([
  '................',
  '................',
  '.......c........',
  '..c...bcb...c...',
  '.bcb..cbc..bcb..',
  '..bcb.bcb.bcb...',
  'c..abcbcbcba..c.',
  'bc..abcbcba..cb.',
  '.bcb.abcba.bcb..',
  '..abcbabacbcba..',
  '...aabcbcbbaa...',
  'c....abcba....c.',
  'bcb..aabaa..bcb.',
  '.abcbaabaabcba..',
  '...aaaabaaaa....',
  '.....aabbaa.....'],{a:grey(0x74),b:grey(0x9c),c:grey(0xc2)});
/** Sugar cane: three jointed stalks with leaves; tiles vertically for tall canes. */
export const sugarCane:Painter=drawn(r=>{
  const stalks=[[2,0],[7,3],[12,1]] as const;
  for(const [x0,off] of stalks){
    for(let y=0;y<T;y++){
      const joint=(y+off)%6===0;
      r.set(x0,y,grey(joint?0x90:0xd0));r.set(x0+1,y,grey(joint?0x7a:0xae));
      if(joint&&x0+2<T)r.set(x0+2,y,grey(0x86));
    }
    const leafY=(9-off+16)%16;
    r.line(x0+1,leafY,x0+3,leafY-2,grey(0x9a));r.set(x0+3,leafY-3,grey(0xb4));
  }
});
export const lilyPad:Painter=drawn(r=>{
  r.ellipse(7.5,7.5,7.2,7.2,(x,y)=>grey(0x96+Math.round(hash(x,y,511)*3)*10));
  // The notch, cut from the centre to the lower right.
  for(let i=0;i<9;i++){r.set(8+i,8+Math.round(i*.55),null);r.set(8+i,9+Math.round(i*.55),null);}
  for(let i=1;i<7;i++){r.set(7-i,7-Math.round(i*.4),grey(0xc4));r.set(7,7-i,grey(0xc0));r.set(7-i,8+Math.round(i*.3),grey(0xb8));}
  r.outline(.7,[[1,0],[0,1],[-1,0],[0,-1]]);
});

// ---- Pre-coloured small plants ---------------------------------------------------------------------
const STEM={g:rgb(0x3b8a24),l:rgb(0x5aa83a)};
export const deadBush:Painter=bitmap([
  '................',
  '..t..........t..',
  '...t...t....t...',
  '.t..t..t...t..t.',
  '..t.t...t.t..t..',
  '...tt...t.t.t...',
  't...t..tt.tt...t',
  '.t...t.t..t...t.',
  '..t..tt...t..t..',
  '...tt.t..tt.t...',
  '.....tt.tt.t....',
  '......tttt......',
  '.......st.......',
  '.......st.......',
  '.......st.......',
  '......s.ts......'],{t:rgb(0x8a6234),s:rgb(0x5e4120)});
export const dandelion:Painter=bitmap([
  '................',
  '................',
  '................',
  '................',
  '......yYy.......',
  '.....yYoYy......',
  '.....YoOoY......',
  '.....yYoYy......',
  '......yYy.......',
  '.......g........',
  '.......g..lg....',
  '..gl...g.lg.....',
  '...lg..gglg.....',
  '....lggg........',
  '.......gg.......',
  '.......g........'],{y:rgb(0xe8c41a),Y:rgb(0xffe23a),o:rgb(0xf5a812),O:rgb(0xffd400),...STEM});
export const poppy:Painter=bitmap([
  '................',
  '................',
  '................',
  '................',
  '......rRr.......',
  '.....rRRRr......',
  '....rRRkRRr.....',
  '.....rRRRr......',
  '......rrr.......',
  '.......g........',
  '.......g...lg...',
  '..lg...g..lg....',
  '...llg.g.lg.....',
  '.....lgggl......',
  '.......g........',
  '.......g........'],{r:rgb(0xa8120e),R:rgb(0xe02a1c),k:rgb(0x2a1a10),...STEM});
export const blueOrchid:Painter=bitmap([
  '................',
  '................',
  '................',
  '.....bB...bB....',
  '....bBwB.bBwB...',
  '.....bB.g.bB....',
  '..bB...g..g.....',
  '.bBwB..g.g......',
  '..bBg..gg..bB...',
  '....g..g..bBwB..',
  '.....g.g.g.bB...',
  '......ggg.g.....',
  '.......gg.......',
  '....lg.g........',
  '.....lgg.gl.....',
  '.......g........'],{b:rgb(0x1c8ad0),B:rgb(0x4cc0f4),w:rgb(0xd8f2ff),...STEM});
export const allium:Painter=bitmap([
  '................',
  '................',
  '......pPp.......',
  '.....pPqPp......',
  '....pPqPqPp.....',
  '....PqPpPqP.....',
  '....pPqPqPp.....',
  '.....pPpPp......',
  '......dpd.......',
  '.......g........',
  '.......g........',
  '.......g........',
  '.......g.lg.....',
  '..lgg..g.g......',
  '....lggggl......',
  '.......g........'],{p:rgb(0x8a3ab4),P:rgb(0xb05ad8),q:rgb(0xd898f0),d:rgb(0x5e2a7a),...STEM});
export const cornflower:Painter=bitmap([
  '................',
  '................',
  '................',
  '......b..b......',
  '....b.bBBb.b....',
  '.....bBkkBb.....',
  '....bBBkkBBb....',
  '.....bBBBBb.....',
  '....b..bb..b....',
  '.......gg.......',
  '.......g........',
  '...lg..g..gl....',
  '....lg.g.gl.....',
  '.....lggg.......',
  '.......g........',
  '.......g........'],{b:rgb(0x2a48c0),B:rgb(0x4a72ec),k:rgb(0x1a1a5a),...STEM});
export const oxeyeDaisy:Painter=bitmap([
  '................',
  '................',
  '................',
  '......wWw.......',
  '....w.wWw.w.....',
  '.....wWWWw......',
  '...wWWyYyWWw....',
  '....wWYyYWw.....',
  '...wWWyYyWWw....',
  '.....wWgWw......',
  '....w.wgw.w.....',
  '.......g........',
  '..lg...g...gl...',
  '...lgg.g.ggl....',
  '.....lggg.......',
  '.......g........'],{w:rgb(0xcfd6d8),W:rgb(0xf4f8f8),y:rgb(0xe0b020),Y:rgb(0xffd23a),...STEM});
const MUSHROOM_STEM={w:rgb(0xcdbf9f),W:rgb(0xe6dcc2),s:rgb(0xa89a7a)};
export const brownMushroom:Painter=bitmap([
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '......cccc......',
  '....cCCCCCCc....',
  '...cCCDCCDCCc...',
  '...bbbbbbbbbb...',
  '......wWWw......',
  '......wWWw......',
  '......wWWw......',
  '......wWWw......',
  '......sWWs......'],{c:rgb(0x7a5638),C:rgb(0x9a7050),D:rgb(0xb88c68),b:rgb(0x5a3e26),...MUSHROOM_STEM});
export const redMushroom:Painter=bitmap([
  '................',
  '................',
  '................',
  '................',
  '................',
  '......rrrr......',
  '....rRRoRRr.....',
  '...rRoRRRRor....',
  '...RRRRoRRRR....',
  '..rRoRRRRRoRRr..',
  '..kkkkkkkkkkkk..',
  '......wWWw......',
  '......wWWw......',
  '......wWWw......',
  '......wWWw......',
  '......sWWs......'],{r:rgb(0xa8140e),R:rgb(0xd82a1e),o:rgb(0xf2ece6),k:rgb(0x6a0c08),...MUSHROOM_STEM});

// ---- Cactus, pumpkin, melon and moss ----------------------------------------------------------------
const CACTUS=ramp(0x0d4b14,0x125e19,0x17711e,0x1e8726,0x289b30,0x34ad3c);
export const cactusSide:Painter=cached((x,y)=>{
  const col=x%4,h=hash(x,y,521);
  if(x===0||x===15)return CACTUS[0];
  if(col===2&&(y+x)%4===1)return h<.5?rgb(0xd6dea6):rgb(0x1e2a12);
  return col===0?CACTUS[1]:col===2?pick(CACTUS.slice(4),h):pick(CACTUS.slice(2,4),h);
},520);
export const cactusTop:Painter=cached((x,y)=>{
  const d=Math.max(Math.abs(x-7.5),Math.abs(y-7.5)),h=hash(x,y,531);
  if(d>6.6)return CACTUS[1];
  if(d>5.6)return CACTUS[4];
  if(d<1.6)return (x+y)%2?CACTUS[3]:rgb(0xb8c87a);
  return pick(Math.floor(d)%2?CACTUS.slice(2,4):CACTUS.slice(3,5),h);
},530);
export const cactusBottom:Painter=cached((x,y)=>{
  const d=Math.max(Math.abs(x-7.5),Math.abs(y-7.5));
  return d>6.6?CACTUS[0]:pick(CACTUS.slice(1,4),hash(x,y,541)*.6+(d>4?0:.4));
},540);
const PUMPKIN=ramp(0x8f480a,0xb05a0e,0xc66c12,0xd88018,0xe69424,0xf0aa38);
export const pumpkinSide:Painter=cached((x,y)=>{
  const s=x%4,edge=y===0||y===15?-1:y===1||y===14?-.5:0,h=hash(x,y,551);
  const k=(s===0?0:s===1?2:s===2?4:3)+edge+(h<.15?-1:h>.9?1:0);
  return PUMPKIN[Math.max(0,Math.min(5,Math.round(k)))];
},550);
export const pumpkinTop:Painter=cached((x,y)=>{
  const dx=x-7.5,dy=y-7.5,d=Math.hypot(dx,dy),a=(Math.atan2(dy,dx)/(Math.PI*2)+1)%1;
  if(Math.abs(dx)<1&&Math.abs(dy)<1)return(x+y)%2?rgb(0x5c4a1c):rgb(0x74602a);
  if(d<2.2)return rgb(0x8a6a26);
  const seg=(a*10)%1,groove=seg<.12||seg>.94;
  return groove?PUMPKIN[0]:pick(PUMPKIN.slice(2),contrast(1-d/11+hash(x,y,561)*.3,1.2));
},560);
const MELON=ramp(0x2c5a10,0x386d14,0x45801a,0x529420,0x5ea626);
const STRIPE=ramp(0x93b136,0xaac646);
export const melonSide:Painter=cached((x,y)=>{
  const wave=Math.round(valueNoise(x,y,16,4,571)*2.5),s=(x+wave+16)%5;
  if(s===0)return pick(STRIPE,hash(x,y,572));
  return pick(s===1||s===4?MELON.slice(0,3):MELON.slice(2),hash(x,y,573));
},570);
export const melonTop:Painter=cached((x,y)=>{
  const dx=x-7.5,dy=y-7.5,d=Math.hypot(dx,dy),a=(Math.atan2(dy,dx)/(Math.PI*2)+1)%1;
  if(d<1.3)return rgb(0x7a8a2c);
  if(d<2.3)return MELON[1];
  const s=(a*12+d*.15)%1;
  return s<.2?pick(STRIPE,hash(x,y,581)):pick(MELON.slice(1),hash(x,y,582));
},580);
const MOSS=ramp(0x3a581b,0x46681f,0x537925,0x608a2c,0x6f9c35,0x82ad41);
export const mossBlock:Painter=cached((x,y)=>{
  const v=(a:number,b:number)=>fbm(a,b,591,1,1,.25);
  const e=v(x-1,y-1)-v(x+1,y+1),k=contrast(v(x,y),1.6)+e*2.5;
  return hash(x,y,592)<.04?rgb(0x2e4614):pick(MOSS,Math.max(0,Math.min(.999,k)));
},590);

// ---- Crops ----------------------------------------------------------------------------------------
const CROP_GREEN=ramp(0x1c6410,0x2a821a,0x3f9e26,0x5cba36);
const WHEAT_GOLD=ramp(0x7e5e16,0xa88424,0xcaa83e,0xe0c45c);
const WHEAT_TURNING=ramp(0x4a7a1a,0x6a9a26,0x8eb034,0xb0c044);
/** Pixel height of the tallest stalk for a crop stage: strictly increasing, the last stage nearly fills the tile. */
const cropHeight=(stage:number,last:number,min:number)=>min+Math.round(stage*(16-min)/last);
/** Wheat: stalks with leaf blades that ripen into golden ears. */
export function wheat(stage:number):Painter{
  return drawn(r=>{
    const random=rng(600+stage),top=cropHeight(stage,7,3),p=stage===7?WHEAT_GOLD:stage>=5?WHEAT_TURNING:CROP_GREEN;
    const xs=[1,3,5,8,10,12,14];
    xs.forEach((x0,i)=>{
      const h=i===3?top:Math.max(2,top-1-Math.floor(random()*3));
      for(let k=0;k<h;k++){const y=15-k;r.set(x0,y,p[k>h-3?3:1+(k&1)]);}
      if(h>4){const ly=15-Math.floor(h*.45),dir=i%2?1:-1;r.set(x0+dir,ly,p[2]);r.set(x0+2*dir,ly-1,p[3]);}
      if(stage>=6){
        // Ears: a wider, pixelated head at the top of the stalk.
        for(let k=Math.max(0,h-4);k<h;k++){const y=15-k;r.set(x0+((k&1)?1:-1),y,p[k===h-1?3:2]);}
      }
    });
  });
}
const CARROT_LEAF=ramp(0x175410,0x247018,0x358a22,0x4ea630);
const POTATO_LEAF=ramp(0x22661a,0x307e22,0x42962c,0x5cae3a);
/** Carrots and potatoes: leafy tufts; the final stage shows the root crop at the soil line. */
function rootCrop(stage:number,leaf:RGBA[],root:RGBA[]|null,salt:number):Painter{
  return drawn(r=>{
    const random=rng(salt+stage),top=cropHeight(stage,3,4);
    for(const [x0,big] of [[3,false],[7,true],[12,false]] as const){
      const h=big?top:Math.max(3,top-1-Math.floor(random()*2));
      for(let k=0;k<h;k++){
        const y=15-k,w=k>h*.35?(k>h*.75?1:2):1;
        for(let dx=-w;dx<=w;dx++)if(dx===0||hash(x0+dx,y,salt)<.7)r.set(x0+dx,y,leaf[Math.min(3,(dx===0?2:1)+(k>h-2?1:0))]);
      }
      if(root){r.set(x0,15,root[1]);r.set(x0+1,15,root[0]);r.set(x0,14,root[2]);r.set(x0-1,15,root[1]);}
    }
  });
}
export const carrots=(stage:number)=>rootCrop(stage,CARROT_LEAF,stage===3?ramp(0xc85a10,0xe8781a,0xf89a34):null,620);
export const potatoes=(stage:number)=>rootCrop(stage,POTATO_LEAF,stage===3?ramp(0x9a7430,0xc8a050,0xdcbc6e):null,640);
