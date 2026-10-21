// Natural ground tiles: stone family, earth, sand, snow and ice, ores, deepslate, tuff, copper and fluids.
import {type Painter,type RGBA,T,CLEAR,rgb,grey,shade,ramp,pick,hash,valueNoise,fbm,contrast,voronoi,cached,withAlpha,rng} from './tiles-core';

// ---- Stone family -------------------------------------------------------------------------------
const STONE=ramp(0x5f5f5f,0x6b6b6b,0x747474,0x7c7c7c,0x848484,0x8d8d8d,0x989898);
/** Smooth grey stone: soft mottled blotches, faint horizontal strata and sparse darker flecks. */
export const stone:Painter=cached((x,y)=>{
  const v=contrast(valueNoise(x,y,8,4,11)*.36+valueNoise(x,y,4,2,12)*.3+hash(x,y,13)*.34,1.6),f=hash(x&~1,y,14);
  if(f<.045)return STONE[0];
  return pick(STONE.slice(1),v);
},10);
const GRANITE=ramp(0x6c4636,0x7c503e,0x895946,0x946450,0xa16f5a,0xb08272);
export const granite:Painter=cached((x,y)=>{
  const v=contrast(fbm(x,y,21,1,1,.5),1.8),h=hash(x,y,22);
  if(h>.95)return rgb(0xc0a191);if(h<.05)return rgb(0x5c392c);
  return pick(GRANITE,v);
},20);
const DIORITE=ramp(0xaeaeb0,0xbcbcbe,0xc8c8ca,0xd3d3d5,0xdfdfe1,0xebebed);
/** Diorite: pale, softly mottled stone peppered with small clusters of dark grey grains. */
export const diorite:Painter=cached((x,y)=>{
  const v=contrast(fbm(x,y,31,1,1,.5),1.35),grain=valueNoise(x,y,2,2,33),h=hash(x,y,32);
  if(grain>.7&&h<.62)return h<.3?rgb(0x6c6c6e):rgb(0x858587);
  if(h>.965)return rgb(0x949496);
  return pick(DIORITE,v);
},30);
const ANDESITE=ramp(0x6c6c6d,0x777778,0x828283,0x8b8b8c,0x959596,0xa2a2a3);
export const andesite:Painter=cached((x,y)=>{
  const v=contrast(fbm(x,y,41,1,1,.6),1.6),h=hash(x,y,42);
  if(h>.94)return rgb(0xb2b2b3);if(h<.07)return rgb(0x5c5c5d);
  return pick(ANDESITE,v);
},40);

const COBBLE=ramp(0x686868,0x767676,0x848484,0x929292,0xa0a0a0,0xaeaeae,0xbcbcbc);
/** Rounded stones: Voronoi cells outlined by dark mortar; each stone is lit from the upper left (a light rim
 *  there, a shadowed rim on the lower right) so it reads as a domed cobble rather than a flat patch. */
function cobbles(palette:RGBA[],mortar:RGBA[],count:number,salt:number):Painter{
  const cells=voronoi(count,salt,.9);
  return cached((x,y)=>{
    const gap=cells.gap(x,y);
    if(gap<.75)return pick(mortar,hash(x,y,salt+1));
    const id=cells.id(x,y),base=2+Math.floor(hash(id,0,salt+2)*(palette.length-4));
    // dx/dy point from the stone's centre to the pixel: up-left of centre is lit, down-right is in shade.
    const lean=(cells.dx(x,y)+cells.dy(x,y))/Math.max(1,cells.centre(x,y)),rim=gap<1.9;
    let k=base+(rim&&lean<-.4?1:0)+(rim&&lean>.5?-1:0)+(gap<1.25&&lean>.5?-1:0)+(lean<-1&&gap>1.9?1:0);
    k+=hash(x,y,salt+3)<.1?-1:hash(x,y,salt+3)>.94?1:0;
    return palette[Math.max(0,Math.min(palette.length-1,k))];
  },salt);
}
export const cobblestone=cobbles(COBBLE,ramp(0x505050,0x5a5a5a),14,51);
const MOSS=ramp(0x425a22,0x4e6b29,0x5c7c31,0x6b8e3a,0x7aa043,0x8daf4f);
/** Moss creeping over a base texture, thicker where `amount` noise is high. */
export function mossy(base:Painter,salt:number,amount=.56):Painter{
  return cached((x,y,n,m)=>{
    const v=fbm(x,y,salt,1,1,.35)+(y>9?.06:0);
    if(v>amount){const c=pick(MOSS,contrast((v-amount)*3+hash(x,y,salt+1)*.4,1.2));return v<amount+.03?shade(c,.85):c;}
    return base(x,y,n,m);
  },salt);
}
export const mossyCobblestone=mossy(cobblestone,61);
const BEDROCK=ramp(0x191919,0x2b2b2b,0x3e3e3e,0x4f4f4f,0x616161,0x767676,0x8b8b8b);
export const bedrock:Painter=cached((x,y)=>pick(BEDROCK,contrast(fbm(x,y,71,1,1,.55),1.9)),70);
const OBSIDIAN=ramp(0x040207,0x08050d,0x0d0815,0x130c1d,0x1a1127,0x231833);
export const obsidian:Painter=cached((x,y)=>{
  const v=contrast(fbm(x,y,81,1,1,.4),1.7),streak=valueNoise(x+y,y,4,4,82);
  if(streak>.78&&hash(x,y,83)<.6)return hash(x,y,84)<.5?rgb(0x3a2a57):rgb(0x4a3770);
  return pick(OBSIDIAN,v);
},80);

// ---- Earth --------------------------------------------------------------------------------------
const DIRT=ramp(0x65452d,0x765237,0x855f42,0x946a4b,0xa27855);
export const dirt:Painter=cached((x,y)=>{
  const v=contrast(fbm(x,y,91,1,1,.6),1.5),h=hash(x,y,92);
  if(h<.06)return rgb(0x543924);if(h>.955)return rgb(0xb88d66);
  return pick(DIRT,v);
},90);
export const coarseDirt:Painter=cached((x,y,n,m)=>{
  const cells=valueNoise(x,y,2,2,101),h=hash(x,y,102);
  if(cells>.66)return h<.5?rgb(0x857566):cells>.8?rgb(0x9a8a7a):rgb(0x6e5f52);
  return shade(dirt(x,y,n,m),.9);
},100);
/** Depth of the grass, snow, podzol and mycelium bands hanging down block sides, per column. */
const BAND=[3,4,3,3,5,4,3,4,4,3,5,3,4,3,3,4];
const GRASS_GREYS=[0x6a,0x78,0x86,0x93,0xa0,0xae,0xbc];
/** The grey grass colour (tinted by the biome in the mesher). */
const grassGrey=(x:number,y:number,salt:number)=>{
  const v=contrast(fbm(x,y,salt,1,1,.75),1.5),h=hash(x,y,salt+5);
  return h<.08?0x5c:h>.94?0xc8:GRASS_GREYS[Math.floor(v*GRASS_GREYS.length)];
};
export const grassBlockTop:Painter=cached((x,y)=>grey(grassGrey(x,y,111)),110);
/** Plains grass colour, used to pre-colour the grass block side band. */
const PLAINS=rgb(0x91bd59);
const inBand=(x:number,y:number)=>y<BAND[x];
const bandGrey=(x:number,y:number)=>{const g=grassGrey(x,y,121);return y===BAND[x]-1?g*.82:g;};
export const grassBlockSide:Painter=cached((x,y,n,m)=>{
  if(inBand(x,y)){const g=bandGrey(x,y)/255;return[PLAINS[0]*g,PLAINS[1]*g,PLAINS[2]*g].map(Math.round) as RGBA;}
  return y===BAND[x]?shade(dirt(x,y,n,m),.82):dirt(x,y,n,m);
},120);
/** The band alone in grey for the biome-tinted overlay drawn on top of the grass block side. */
export const grassBlockSideOverlay:Painter=(x,y)=>inBand(x,y)?grey(Math.round(bandGrey(x,y))):CLEAR;
const SNOW=ramp(0xe6eef2,0xeef5f8,0xf5fafc,0xfafdfe,0xffffff);
export const snow:Painter=cached((x,y)=>{
  const v=contrast(fbm(x,y,131,1,1,.5),1.3);
  return hash(x,y,132)<.04?rgb(0xd8e4ea):pick(SNOW,v);
},130);
const SNOW_BAND=[3,3,4,3,2,3,4,4,3,3,2,3,4,3,3,4];
export const grassBlockSnow:Painter=cached((x,y,n,m)=>{
  if(y<SNOW_BAND[x])return snow(x,y,n,m);
  if(y===SNOW_BAND[x])return hash(x,y,141)<.5?rgb(0xc9d3d6):shade(dirt(x,y,n,m),.85);
  return dirt(x,y,n,m);
},140);
const PODZOL=ramp(0x3e2710,0x4f3318,0x623f20,0x764e29,0x8a5d32,0x9d6d3d);
export const podzolTop:Painter=cached((x,y)=>{
  // Fallen needles: short diagonal strokes over dark humus.
  const needle=hash((x+y)>>1,(x-y)>>2,151)<.3&&hash(x,y,152)<.8;
  const v=contrast(fbm(x,y,153,1,1,.5),1.4);
  return needle?pick(PODZOL.slice(3),hash(x,y,154)):pick(PODZOL.slice(0,4),v);
},150);
const sideBand=(top:Painter,depth:readonly number[]):Painter=>cached((x,y,n,m)=>{
  if(y<depth[x])return top(x,y,n,m);
  if(y===depth[x])return shade(top(x,y,n,m),.75);
  return dirt(x,y,n,m);
},depth[0]*7+depth[3]);
export const podzolSide=sideBand(podzolTop,[2,3,2,2,3,3,2,2,3,2,2,3,2,3,2,2]);
const MYCELIUM=ramp(0x4e4446,0x5b4f52,0x675a5e,0x736568,0x7e7073);
export const myceliumTop:Painter=cached((x,y)=>{
  const v=contrast(fbm(x,y,161,1,1,.6),1.4),h=hash(x,y,162);
  return h>.93?rgb(0xa49497):h>.86?rgb(0x8f7f84):pick(MYCELIUM,v);
},160);
export const myceliumSide=sideBand(myceliumTop,[3,2,3,4,3,2,3,3,4,3,2,3,3,4,2,3]);

const SAND=ramp(0xd0c292,0xd8cb9d,0xded2a7,0xe4d9b1,0xeae1bc);
const grainy=(palette:RGBA[],dark:RGBA,salt:number):Painter=>cached((x,y)=>{
  const v=contrast(hash(x,y,salt)*.55+valueNoise(x,y,4,4,salt+1)*.45,1.5);
  return hash(x,y,salt+2)<.05?dark:pick(palette,v);
},salt);
export const sand=grainy(SAND,rgb(0xbfae7f),171);
const RED_SAND=ramp(0xa75317,0xb35c1c,0xbf6520,0xca6f24,0xd47b2b);
export const redSand=grainy(RED_SAND,rgb(0x934713),181);
/** Sandstone side: a smooth cap band, wavy strata in the middle and a chipped base band. */
function sandstoneSide(p:RGBA[],line:RGBA,salt:number):Painter{
  return cached((x,y)=>{
    const h=hash(x,y,salt);
    if(y<=1)return pick(p.slice(3),h);
    if(y===2)return p[2];
    if(y===3)return h<.15?p[2]:line;
    if(y>=12){if(y===12)return h<.2?p[1]:line;return y===15?p[1]:pick(p.slice(1,4),h);}
    const wave=Math.round(valueNoise(x,0,8,16,salt+1)*2),layer=(y+wave)%3;
    return layer===0?p[1]:layer===1?p[3]:p[2];
  },salt);
}
const smoothSand=(p:RGBA[],line:RGBA,salt:number,pits:number):Painter=>cached((x,y)=>{
  const h=hash(x,y,salt),v=valueNoise(x,y,8,8,salt+1);
  if(x===0||y===0)return p[3];if(x===15||y===15)return line;
  if(h<pits)return p[1];
  return pick(p.slice(2),v*.7+h*.3);
},salt);
const SANDSTONE=ramp(0xc0b17e,0xd1c190,0xded1a1,0xe4d9ac,0xede2ba,0xf4ebc8);
export const sandstone=sandstoneSide(SANDSTONE,rgb(0xb09f6d),191);
export const sandstoneTop=smoothSand(SANDSTONE.map(c=>shade(c,.97)),rgb(0xccbc8c),192,.03);
export const sandstoneBottom=smoothSand(SANDSTONE.map(c=>shade(c,.95)),rgb(0xb5a473),193,.12);
const RED_SANDSTONE=ramp(0x9b4f17,0xab591b,0xbc6420,0xc66e25,0xd0782a,0xda8431);
export const redSandstone=sandstoneSide(RED_SANDSTONE,rgb(0x894313),201);
export const redSandstoneTop=smoothSand(RED_SANDSTONE.map(c=>shade(c,.9)),rgb(0xa45220),202,.03);
export const redSandstoneBottom=smoothSand(RED_SANDSTONE.map(c=>shade(c,.87)),rgb(0x8a4118),203,.12);

const GRAVEL=[0x7f7d7f,0x979497,0xb0adae,0xc7c5c5,0x6f6c6e,0x9e9891,0xbab2ab].map(h=>rgb(h));
export const gravel:Painter=(()=>{
  const cells=voronoi(25,211,1);
  return cached((x,y)=>{
    if(cells.gap(x,y)<.75)return rgb(0x585556);
    const c=GRAVEL[Math.floor(hash(cells.id(x,y),3,212)*GRAVEL.length)],edge=cells.dx(x,y)+cells.dy(x,y);
    return edge<-1.2?shade(c,1.12):edge>1.4?shade(c,.88):c;
  },210);
})();
const CLAY=ramp(0x8f97a5,0x969eac,0x9da5b3,0xa4acba,0xabb3c1);
export const clay:Painter=cached((x,y)=>{
  const v=contrast(fbm(x,y,221,1,1,.3),1.4);
  return hash(x,y,222)<.04?rgb(0xb8c0cc):pick(CLAY,v);
},220);
// Ice: translucent blue with brighter frost streaks; packed ice is the opaque, denser version. The streaks repeat
// every 16 px along x+2y, with a broken one halfway between, so they run on across the block edges of a frozen lake.
const ICE=ramp(0x729ef6,0x7ca7f9,0x86affb,0x91b8fe,0x9dc1ff);
const frost=(x:number,y:number,salt:number)=>{
  const d=(x+y*2+Math.round(valueNoise(x,y,4,4,salt)*3))%16,h=hash(x,y,salt+1);
  return d===0||(d===1&&h<.5)||(d===8&&valueNoise(x,y,4,4,salt+2)>.4&&h<.85);
};
export const ice:Painter=cached((x,y)=>{
  if(frost(x,y,231))return withAlpha(rgb(0xc8deff),215);
  return withAlpha(pick(ICE,contrast(fbm(x,y,232,1,1,.3),1.4)),165);
},230);
const PACKED_ICE=ramp(0x749cec,0x7ea7f4,0x89b2fa,0x94bdff,0xa0c7ff);
export const packedIce:Painter=cached((x,y)=>{
  if(frost(x,y,241))return rgb(0xb9d9ff);
  return pick(PACKED_ICE,contrast(fbm(x,y,242,1,1,.35),1.5));
},240);

// ---- Ores -----------------------------------------------------------------------------------------
interface OreStyle{dark:number;mid:number;light:number;accent?:number;clusters:number;size:number}
const ORE_STYLES:Record<string,OreStyle>={
  coal:{dark:0x111111,mid:0x262626,light:0x4a4a4a,clusters:6,size:9},
  iron:{dark:0x9a7154,mid:0xc99c7a,light:0xead0b2,clusters:5,size:8},
  copper:{dark:0x8a4426,mid:0xc66b3e,light:0xea935e,accent:0x4ea78a,clusters:5,size:9},
  gold:{dark:0xb88e18,mid:0xf3cf38,light:0xfff29a,clusters:5,size:8},
  redstone:{dark:0x8e0b07,mid:0xd31910,light:0xff5a48,clusters:6,size:7},
  lapis:{dark:0x14318a,mid:0x2254ca,light:0x4c80f2,clusters:6,size:7},
  diamond:{dark:0x1a9890,mid:0x4fdcd3,light:0xc2fffa,clusters:5,size:7},
  emerald:{dark:0x0d7a2e,mid:0x1cbf55,light:0x8ef4ae,clusters:5,size:6}
};
const DIRS=[[1,0],[-1,0],[0,1],[0,-1]] as const;
/** Ore cluster mask: 0 none, 1 dark lower-right rim, 2 body, 3 upper-left highlight, 4 accent. Each cluster grows
 *  from a 2×2 core by adding edge neighbours, preferring cells that touch more of the cluster, so ores read as
 *  chunky nuggets embedded in the stone rather than thin worms. Clusters never touch each other (not even at a
 *  corner), so every nugget stays a separate blob as in the vanilla ores. */
function oreMask(style:OreStyle,salt:number):Uint8Array{
  const mask=new Uint8Array(T*T),owner=new Int8Array(T*T).fill(-1),random=rng(salt),centres:[number,number][]=[];
  const nearOther=(x:number,y:number,id:number)=>{
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=x+dx,ny=y+dy;if(nx>=0&&ny>=0&&nx<T&&ny<T&&owner[ny*T+nx]>=0&&owner[ny*T+nx]!==id)return true;}
    return false;
  };
  for(let tries=0;centres.length<style.clusters&&tries<400;tries++){
    const cx=1+Math.floor(random()*13),cy=1+Math.floor(random()*13);
    if(centres.some(([x,y])=>Math.max(Math.abs(x-cx),Math.abs(y-cy))<(tries<300?5:4)))continue;
    const id=centres.length,core=[[cx,cy],[cx+1,cy],[cx,cy+1],[cx+1,cy+1]];
    if(core.some(([x,y])=>nearOther(x,y,id)))continue;
    centres.push([cx,cy]);
    const blob=core;for(const [x,y] of blob)owner[y*T+x]=id;
    const has=(x:number,y:number)=>blob.some(([bx,by])=>bx===x&&by===y);
    while(blob.length<style.size){
      const candidates:[number,number,number][]=[];let total=0;
      for(const [bx,by] of blob)for(const [dx,dy] of DIRS){
        const nx=bx+dx,ny=by+dy;
        if(nx<0||ny<0||nx>15||ny>15||has(nx,ny)||nearOther(nx,ny,id)||candidates.some(([x,y])=>x===nx&&y===ny))continue;
        const touching=DIRS.filter(([ex,ey])=>has(nx+ex,ny+ey)).length,weight=touching*touching+1;
        candidates.push([nx,ny,weight]);total+=weight;
      }
      if(!candidates.length)break;
      let r=random()*total,chosen=candidates[candidates.length-1];
      for(const c of candidates){r-=c[2];if(r<0){chosen=c;break;}}
      blob.push([chosen[0],chosen[1]]);owner[chosen[1]*T+chosen[0]]=id;
    }
    // Body everywhere, a dark rim where the nugget ends below and to the right, one highlight on its upper-left pixel.
    let lit=blob[0];
    for(const [x,y] of blob){
      mask[y*T+x]=!has(x,y+1)&&!has(x+1,y)?1:style.accent&&hash(x,y,salt+9)<.25?4:2;
      if(x+y<lit[0]+lit[1])lit=[x,y];
    }
    mask[lit[1]*T+lit[0]]=3;
  }
  return mask;
}
export function ore(name:string,base:Painter,salt:number,darken=1):Painter{
  const style=ORE_STYLES[name],mask=oreMask(style,salt),c=[0,style.dark,style.mid,style.light,style.accent??style.mid].map(h=>shade(rgb(h),darken));
  return(x,y,n,m)=>{const k=mask[y*T+x];return k?c[k]:base(x,y,n,m);};
}

// ---- Deepslate and tuff ---------------------------------------------------------------------------
const DEEP=ramp(0x393940,0x414148,0x494950,0x515159,0x5a5a62,0x64646c);
/** Deepslate side: dark slate with a strong vertical grain. */
export const deepslate:Painter=cached((x,y)=>{
  // Each column is cut into vertical streaks of 3-5 px with their own tone; a few streaks are dark grain lines.
  const len=3+Math.floor(hash(x,2,303)*3),seg=Math.floor(((y+Math.floor(hash(x,1,302)*16))%T)/len);
  const v=contrast(hash(x,0,301)*.4+hash(x,seg,304)*.45+hash(x,y,305)*.15,1.6);
  if(hash(x,seg,306)<.13)return DEEP[0];
  if(hash(x,seg,307)>.93)return DEEP[5];
  return pick(DEEP.slice(1,5),v);
},300);
/** Deepslate top: the cut face shows rough concentric layers instead of grain. */
export const deepslateTop:Painter=cached((x,y)=>{
  const d=Math.max(Math.abs(x-7.5),Math.abs(y-7.5))+valueNoise(x,y,4,4,311)*1.6,ring=Math.floor(d)%3;
  const v=hash(x,y,312);
  return ring===0?pick(DEEP.slice(0,3),v):ring===1?pick(DEEP.slice(2,5),v):pick(DEEP.slice(1,4),v);
},310);
export const cobbledDeepslate=cobbles(ramp(0x424245,0x4d4d50,0x59595b,0x646466,0x717172,0x7f7f80,0x8e8e8e),ramp(0x2d2d2f,0x363639),16,321);
const TUFF=ramp(0x4e504a,0x585a53,0x63655d,0x6d7067,0x787b71,0x84877c);
export const tuff:Painter=cached((x,y)=>{
  const v=contrast(fbm(x,y,331,1,1,.55),1.6),h=hash(x,y,332),pore=valueNoise(x,y,2,2,333);
  if(pore>.8&&h<.7)return rgb(0x3d3f39);
  if(h>.95)return rgb(0x9fa293);
  return pick(TUFF,v);
},330);

// ---- Copper ---------------------------------------------------------------------------------------
/** A bevelled copper plate; `patina` paints oxidation patches over the base where the noise is above `threshold`. */
function copper(base:RGBA[],patina:RGBA[]|null,threshold:number,salt:number):Painter{
  return cached((x,y)=>{
    const v=fbm(x,y,salt,1,1,.3),h=hash(x,y,salt+1);
    let p=base,t=contrast(v,1.4);
    if(patina&&fbm(x,y,salt+2,1,1,.25)>threshold){p=patina;t=h;}
    let c=pick(p,t*.6+.2);
    if(x===0||y===0)c=pick(p,.95);else if(x===15||y===15)c=pick(p,.02);
    else if((y===5||y===10)&&x>1&&x<14)c=shade(c,.9);
    else if((y===6||y===11)&&x>1&&x<14)c=shade(c,1.06);
    return c;
  },salt);
}
const COPPER=ramp(0x8c4a2e,0xa65838,0xbb6743,0xcc764f,0xdc8a62,0xe9a07a);
const EXPOSED=ramp(0x8f6250,0xa1705b,0xb07e66,0xbd8b72,0xc89a80,0xd3aa92);
const WEATHERED=ramp(0x4c7b54,0x578960,0x63956a,0x71a175,0x7fab7f,0x90b589);
const OXIDIZED=ramp(0x3b856d,0x44947b,0x4ea388,0x59b195,0x67bea3,0x79caaf);
export const copperBlock=copper(COPPER,null,1,341);
export const exposedCopper=copper(EXPOSED,ramp(0x4f9479,0x5aa186,0x67ad92),.66,351);
export const weatheredCopper=copper(WEATHERED,ramp(0x9a6a4c,0xa8775a,0xb48466),.7,361);
export const oxidizedCopper=copper(OXIDIZED,null,1,371);

// ---- Fluids ---------------------------------------------------------------------------------------
const WATER=[0x9c,0xa6,0xb0,0xba,0xc4];
/** Water is painted grey (the mesher tints it per biome) and semi-transparent. Lakes repeat the tile, so the ripples
 *  repeat every 8 rows and their sideways wave every 8 columns (both divide 16): no seam at the block edges. */
export const waterStill:Painter=cached((x,y)=>{
  const ripple=(y+Math.round(Math.sin((x+valueNoise(x,y,8,8,381)*6)*Math.PI/4)*1.3)+16)%8;
  const v=contrast(fbm(x,y,382,2,1,.3),1.3),g=ripple===0?0xd2:ripple===1?0xc6:WATER[Math.floor(v*WATER.length)];
  return grey(g,ripple===0?205:178);
},380);
export const waterFlow:Painter=cached((x,y)=>{
  // Two streaks per 8 columns (8 divides 16): a full bright one and a broken fainter one, so side-by-side blocks join up.
  const streak=(x+Math.round(valueNoise(x,y,16,4,391)*3)+16)%8,faint=streak===4&&valueNoise(x,y,16,4,393)>.45;
  const v=contrast(fbm(x,y,392,.5,2,.3),1.3),g=streak===0?0xcf:faint?0xc4:WATER[Math.floor(v*WATER.length)];
  return grey(g,streak===0?200:faint?190:176);
},390);
const LAVA=ramp(0xb83a0a,0xcc4a0c,0xdc5c10,0xe87016,0xf28a20,0xfaa430);
/** Bright molten rock with dark cooling veins along a noise contour. */
function lava(salt:number,sx:number,sy:number):Painter{
  return cached((x,y)=>{
    const vein=valueNoise(x,y,Math.min(16,8*sx),Math.min(16,8*sy),salt)*.65+valueNoise(x,y,Math.min(16,4*sx),Math.min(16,4*sy),salt+1)*.35;
    if(Math.abs(vein-.5)<.05)return hash(x,y,salt+2)<.5?rgb(0x8a2606):rgb(0xa03008);
    const v=contrast(fbm(x,y,salt+3,sx,sy,.3),1.5);
    if(v>.9&&hash(x,y,salt+4)<.5)return rgb(0xffc84a);
    return pick(LAVA,v);
  },salt);
}
export const lavaStill=lava(401,1,1);
export const lavaFlow=lava(411,.5,2);

// ---- Farmland ---------------------------------------------------------------------------------------
/** Tilled soil: grainy earth raked into four wavering furrows (a dark trough under a lighter ridge), broken by clods. */
function farmland(p:RGBA[],clod:RGBA,salt:number):Painter{
  return cached((x,y)=>{
    const wobble=Math.round(valueNoise(x,y,4,16,salt)*2-.5),row=((y+wobble)%4+4)%4,h=hash(x,y,salt+1);
    const soil=contrast(fbm(x,y,salt+2,1,1,.7),1.5);
    if(h<.045)return clod;
    if(row===3)return h<.75?pick(p.slice(0,2),soil):p[2];
    if(row===0)return pick(p.slice(2),soil*.7+h*.3);
    return pick(p.slice(1,4),soil);
  },salt);
}
export const farmlandDry=farmland(ramp(0x6a492c,0x7f583c,0x906648,0xa07451,0xb4865e),rgb(0xc49a6c),421);
export const farmlandMoist=farmland(ramp(0x24150a,0x301c0f,0x3b2314,0x472b19,0x553420),rgb(0x5f3d26),431);
