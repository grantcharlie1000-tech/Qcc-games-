// Wood tiles for every tree type: bark, log rings, planks, leaves and saplings.
import {type Painter,type RGBA,rgb,grey,shade,ramp,pick,hash,valueNoise,fbm,contrast,cached,bitmap} from './tiles-core';
import type {WoodType} from '../data/blocks';

interface WoodStyle{
  /** Bark shades, dark to light. */
  bark:RGBA[];
  /** Log end grain: light and dark ring shades. */
  rings:RGBA[];
  /** Plank shades, dark to light. */
  planks:RGBA[];
  /** Leaf shades dark to light (the first is the shadow between leaves), or null for grey biome-tinted leaves. */
  leaves:RGBA[]|null;
  /** Leaf clump size and gap density. */
  leafCell:number;leafGaps:number;
  /** Bark marks: 'grooves' (vertical cracks), 'birch' (dark horizontal lenticels), 'flaky' (patchy). */
  barkStyle:'grooves'|'birch'|'flaky'|'smooth';
}
export const WOODS:Record<WoodType,WoodStyle>={
  oak:{bark:ramp(0x3f2f1b,0x4f3c22,0x5e4829,0x6b5431,0x7a613a),rings:ramp(0x947444,0xa8844e,0xba965c,0xc8a668),
    planks:ramp(0x6f5430,0x8a6a3c,0x9c7a47,0xae8a53,0xbc975c),leaves:null,leafCell:2,leafGaps:.2,barkStyle:'grooves'},
  birch:{bark:ramp(0xb9b5a8,0xcac6b9,0xd8d4c8,0xe4e1d6,0xefede4),rings:ramp(0xb39d68,0xc2ad78,0xd1bd88,0xddca96),
    planks:ramp(0xa8945e,0xbfaa71,0xcbb77d,0xd6c389,0xdfcd94),leaves:ramp(0x3c5523,0x4f6d2e,0x62843a,0x759845,0x88aa52),leafCell:2,leafGaps:.17,barkStyle:'birch'},
  spruce:{bark:ramp(0x2a170a,0x371e0d,0x442711,0x513016,0x5e391b),rings:ramp(0x5f4227,0x6e4f30,0x7c5b38,0x896641),
    planks:ramp(0x4a3520,0x5c4329,0x6a4e31,0x775938,0x836440),leaves:ramp(0x203620,0x2c462c,0x395939,0x466b46,0x547d54),leafCell:1,leafGaps:.22,barkStyle:'grooves'},
  jungle:{bark:ramp(0x3e3016,0x4c3c1b,0x5a4721,0x675227,0x6a6230),rings:ramp(0x9a5a3c,0xad6646,0xbe7452,0xcb815c),
    planks:ramp(0x7c533a,0x996748,0xa87250,0xb47c58,0xbf8660),leaves:null,leafCell:4,leafGaps:.16,barkStyle:'flaky'},
  acacia:{bark:ramp(0x4b4741,0x57534c,0x635e57,0x6e6962,0x7a756d),rings:ramp(0xa4532a,0xb75f31,0xc76b3a,0xd47843),
    planks:ramp(0x8c4523,0xa8532a,0xb95d30,0xc66837,0xd1723e),leaves:null,leafCell:1,leafGaps:.26,barkStyle:'smooth'},
  dark_oak:{bark:ramp(0x1e1a14,0x29231a,0x332b20,0x3d3427,0x473d2e),rings:ramp(0x412d17,0x4d371e,0x5a4126,0x664b2d),
    planks:ramp(0x2c1e0e,0x3b2914,0x47321a,0x523b20,0x5c4326),leaves:null,leafCell:2,leafGaps:.24,barkStyle:'grooves'},
  cherry:{bark:ramp(0x2a171c,0x351d23,0x41252b,0x4c2c33,0x58343b),rings:ramp(0xc08f89,0xcf9e96,0xdcaca3,0xe6b9ae),
    planks:ramp(0xc4908a,0xd8a39b,0xe2afa6,0xe9bab0,0xf0c5bb),leaves:ramp(0x8c3e66,0xc66f9c,0xd884ae,0xe69cc0,0xf3b8d3),leafCell:2,leafGaps:.12,barkStyle:'flaky'}
};
const SALT:Record<WoodType,number>={oak:1000,birch:1100,spruce:1200,jungle:1300,acacia:1400,dark_oak:1500,cherry:1600};

/** Bark seen on the side of a log: vertical texture with cracks or birch marks. Tiles vertically for tall trunks. */
export function bark(wood:WoodType):Painter{
  const s=WOODS[wood],p=s.bark,salt=SALT[wood];
  return cached((x,y)=>{
    const col=hash(x,0,salt),v=contrast(col*.5+valueNoise(x,y,1,4,salt+1)*.3+hash(x,y,salt+2)*.2,1.5);
    if(s.barkStyle==='birch'){
      const run=hash((x+Math.floor(hash(0,y,salt+3)*16))>>2,y,salt+4);
      if(run<.2&&hash(x,y,salt+5)<.85)return hash(x,y,salt+6)<.5?rgb(0x2b2823):rgb(0x413d36);
      if(run>.93)return rgb(0x8f8a7d);
      return pick(p.slice(1),v);
    }
    const crack=hash(x,(y+Math.floor(col*16))>>2,salt+3);
    if(s.barkStyle==='grooves'&&crack<.22)return p[0];
    if(s.barkStyle==='flaky'){
      const patch=valueNoise(x,y,2,4,salt+7);
      if(patch>.7)return p[4];
      if(crack<.16)return p[0];
    }
    if(s.barkStyle==='smooth'&&crack<.12)return p[0];
    return pick(p.slice(1,4),v);
  },salt);
}
/** End grain on the top and bottom of a log: concentric rings inside a bark rim. */
export function logTop(wood:WoodType):Painter{
  const s=WOODS[wood],salt=SALT[wood]+10,rim=bark(wood);
  return cached((x,y,n,m)=>{
    const dx=Math.abs(x-7.5),dy=Math.abs(y-7.5),cheb=Math.max(dx,dy);
    if(cheb>6.6)return rim(x,y,n,m);
    if(cheb>5.6)return shade(s.rings[0],.9);
    const d=cheb*.75+Math.hypot(dx,dy)*.25+valueNoise(x,y,4,4,salt)*.8,ring=Math.floor(d*.9)%2;
    if(d<1.1)return s.rings[0];
    return ring?pick(s.rings.slice(0,2),hash(x,y,salt+1)):pick(s.rings.slice(2),hash(x,y,salt+2));
  },salt);
}
/** Four boards of four pixel rows with dark seams, staggered butt joints and fine grain. */
export function planks(wood:WoodType):Painter{
  const s=WOODS[wood],p=s.planks,salt=SALT[wood]+20;
  return cached((x,y)=>{
    const board=y>>2,row=y&3,joint=Math.floor(hash(board,0,salt)*16);
    if(row===3)return p[0];
    if(x===joint)return p[1];
    const grain=valueNoise(x,y,4,1,salt+board)*.6+hash(x,y,salt+5)*.4,tone=hash(board,1,salt+6)*.25;
    let k=contrast(grain*.75+tone,1.3);
    if(row===0)k=Math.min(.999,k+.2);
    return pick(p.slice(1),k);
  },salt);
}
const LEAF_GREYS=[0x3a,0x62,0x80,0x9c,0xb8,0xd0].map(v=>grey(v));
/** Leaves with dark gaps between clumps (drawn opaque, like fast graphics). Grey when tinted by the biome. */
export function leaves(wood:WoodType):Painter{
  const s=WOODS[wood],p=s.leaves??LEAF_GREYS,salt=SALT[wood]+30,c=s.leafCell;
  return cached((x,y)=>{
    const v=valueNoise(x,y,c*2,c*2,salt)*.55+valueNoise(x,y,c,c,salt+1)*.25+hash(x,y,salt+2)*.2;
    const gap=hash(x,y,salt+3)<s.leafGaps+(v<.4?.25:0);
    if(gap)return p[0];
    // Light falls from the upper left: a leaf whose lower-right neighbour is a gap gets darker.
    const below=hash(x+1,y+1,salt+3)<s.leafGaps;
    const k=contrast(v,1.6)*(p.length-1)+(below?-1:0);
    return p[Math.max(1,Math.min(p.length-1,Math.round(k)))];
  },salt);
}

// ---- Saplings -----------------------------------------------------------------------------------
const leafPalette=(k:number,a:number,b:number,c:number)=>({k:rgb(k),a:rgb(a),b:rgb(b),c:rgb(c)});
const stemPalette=(s:number,t:number,u:number)=>({s:rgb(s),t:rgb(t),u:rgb(u)});
export const SAPLINGS:Record<WoodType,Painter>={
  oak:bitmap([
    '................',
    '................',
    '.......cc.......',
    '.....bccbc......',
    '....abcbbcb.....',
    '...abcbaabcb....',
    '..aabcbbabccb...',
    '..kabbaabcbbak..',
    '...kaabttbaak...',
    '....kkatuakk....',
    '......stu.......',
    '.......tu.......',
    '.......tu.......',
    '.......st.......',
    '......sstu......',
    '......s.ts......'],{...leafPalette(0x1d4a12,0x2f6b1c,0x46892a,0x63a83a),...stemPalette(0x3b2a14,0x5a4122,0x75582f)}),
  birch:bitmap([
    '................',
    '........c.......',
    '.......cbc......',
    '......bcbbc.....',
    '.....abcbcbb....',
    '......abbcba....',
    '....bc.awb.cb...',
    '...abcb.w.bcba..',
    '....aab.w.aba...',
    '.......wm.......',
    '.......ww.......',
    '.......mw.......',
    '.......ww.......',
    '.......wm.......',
    '.......ww.......',
    '......mwwm......'],{...leafPalette(0x3c5a20,0x56782d,0x6f923a,0x8bac4c),w:rgb(0xe2dfd4),m:rgb(0x3a3630)}),
  spruce:bitmap([
    '................',
    '.......b........',
    '.......cb.......',
    '......bca.......',
    '......acbb......',
    '.....abcba......',
    '......atba......',
    '....abcbcbba....',
    '...kabcbbcbak...',
    '.....aatbaa.....',
    '...abcbbcbcba...',
    '..kabbcbtbcbak..',
    '...kkaatbaakk...',
    '.......ts.......',
    '.......ts.......',
    '......stts......'],{...leafPalette(0x15291a,0x223e26,0x325a36,0x467648),...stemPalette(0x24180b,0x3e2a15,0x56391d)}),
  jungle:bitmap([
    '................',
    '................',
    '......bcc.......',
    '....abccccb.....',
    '..abccbbcbcca...',
    '.abcbba.abbcba..',
    'abba..tu...abba.',
    'ka.....tu....ak.',
    '...bcb.tu.bcb...',
    '.abccbbtubbccba.',
    'ab...aatuaa...ba',
    'k.....stu.....k.',
    '.......tu.......',
    '.......tu.......',
    '.......st.......',
    '......sttu......'],{...leafPalette(0x1a4a10,0x2a6a18,0x3f8a22,0x5aa830),...stemPalette(0x3a2c12,0x56441e,0x6e5a2a)}),
  acacia:bitmap([
    '................',
    '................',
    '................',
    '..abcbb...bcba..',
    '.abccbcba.abccb.',
    '.kaabaak..kabak.',
    '....kt.....t....',
    '.....t....t.....',
    '......t..t......',
    '.......tt.......',
    '.......tu.......',
    '.......tu.......',
    '......stu.......',
    '.......tu.......',
    '.......st.......',
    '......sstu......'],{...leafPalette(0x3a4a12,0x56681c,0x728626,0x8ea234),...stemPalette(0x3e3a34,0x5e5850,0x7a746a)}),
  dark_oak:bitmap([
    '................',
    '................',
    '................',
    '......abba......',
    '....abbcbba.....',
    '...abcbbcbba....',
    '..kabcbabcbak...',
    '..kaabbabbaak...',
    '...kaababaak....',
    '....kkattakk....',
    '......sttu......',
    '......sttu......',
    '......sttu......',
    '......sstu......',
    '.....ssttus.....',
    '.....s.st.us....'],{...leafPalette(0x0f2a0a,0x1a4012,0x28581a,0x387024),...stemPalette(0x1c1308,0x30220f,0x443118)}),
  cherry:bitmap([
    '................',
    '................',
    '.......pq.......',
    '.....pqqp.......',
    '....rpqpqp......',
    '...rppq.pqqp....',
    '....rp.t.pqpr...',
    '......t..rpr....',
    '.......t.t......',
    '........tg......',
    '.......gtu......',
    '........tu......',
    '........tu......',
    '........tu......',
    '........st......',
    '.......sstu.....'],{p:rgb(0xe48ab6),q:rgb(0xf6bcd6),r:rgb(0xb4517f),g:rgb(0x5a8a2a),...stemPalette(0x2a161b,0x45262d,0x5e363e)})
};
