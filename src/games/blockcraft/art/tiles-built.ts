// Crafted and building blocks: workstations, containers, masonry, wool, TNT, lights, metal blocks,
// ladder, bed and door.
import {type Painter,type RGBA,T,CLEAR,rgb,shade,mix,ramp,pick,hash,valueNoise,fbm,contrast,cached,drawn,voronoi,over,GLYPHS,rng,withAlpha} from './tiles-core';
import {planks} from './tiles-wood';
import {mossy} from './tiles-terrain';
import type {WOOL_COLOURS} from '../data/blocks';

const oakPlanks=planks('oak');

// ---- Masonry ------------------------------------------------------------------------------------
const BRICK=ramp(0x7c3326,0x8c3b2c,0x9c4533,0xaa4f3b,0xb75b45);
const MORTAR=ramp(0x8a8077,0x9d9389,0xafa59b);
export const bricks:Painter=cached((x,y)=>{
  const row=y>>2,shift=(row%2)*4,h=hash(x,y,701);
  if(y%4===3||(x+shift)%8===7)return pick(MORTAR,h);
  const brick=hash(Math.floor((x+shift)/8),row,702),inner=y%4;
  const k=Math.floor(brick*2)+1+(inner===0?1:inner===2&&h<.5?-1:0)+(h<.08?-1:0);
  return BRICK[Math.max(0,Math.min(4,k))];
},700);
const STONE_BRICK=ramp(0x5c5c5c,0x686868,0x737373,0x7e7e7e,0x898989,0x959595);
/** Two courses of bevelled stone bricks with dark mortar; the courses are offset by half a brick. */
export const stoneBricks:Painter=cached((x,y)=>{
  const course=y>>3,cy=y&7,cx=(x+(course?8:0))&15,h=hash(x,y,711);
  if(cy===7||cx===15)return rgb(h<.5?0x474747:0x4f4f4f);
  let k=2+(h<.25?-1:h>.85?1:0)+Math.round(valueNoise(x,y,8,8,712)-.4);
  if(cy===0||cx===0)k=4+(h>.7?1:0);else if(cy===6||cx===14)k=1;
  return STONE_BRICK[Math.max(0,Math.min(5,k))];
},710);
const cracked=(base:Painter,salt:number):Painter=>{
  const crack=new Set<number>(),random=rng(salt);
  for(let c=0;c<2;c++){let x=2+Math.floor(random()*12),y=1+Math.floor(random()*5)+c*8;
    for(let i=0;i<5;i++){crack.add(y*T+x);x=Math.max(0,Math.min(15,x+(random()<.5?1:-1)));y=Math.min(15,y+(random()<.6?1:0));}}
  return(x,y,n,m)=>crack.has(y*T+x)?rgb(0x3e3e3e):base(x,y,n,m);
};
export const mossyStoneBricks=mossy(cracked(stoneBricks,721),723,.54);

// ---- Workstations ---------------------------------------------------------------------------------
const FRAME_DARK=rgb(0x3e2a12),IRON_TOOL=ramp(0x5a5a5e,0x8a8a90,0xb8b8be),HANDLE=ramp(0x4a2e12,0x6a4420);
/** Table top: plank surface with a dark rim, a 3×3 working grid and iron corner plates. */
export const craftingTableTop:Painter=cached((x,y,n,m)=>{
  if(x===0||y===0||x===15||y===15)return FRAME_DARK;
  if((x<=2&&y<=2)||(x>=13&&y<=2)||(x<=2&&y>=13)||(x>=13&&y>=13))return(x+y)%3===0?IRON_TOOL[2]:IRON_TOOL[1];
  if((x===5||x===10)&&y>2&&y<13)return shade(oakPlanks(x,y,n,m),.62);
  if((y===5||y===10)&&x>2&&x<13)return shade(oakPlanks(x,y,n,m),.62);
  return shade(oakPlanks(x,y,n,m),1.05);
},730);
const tableSide=(tools:(r:import('./tiles-core').Raster)=>void):Painter=>{
  const toolLayer=drawn(tools);
  return cached((x,y,n,m)=>{
    if(y<=2)return y===0?shade(oakPlanks(x,y,n,m),1.12):oakPlanks(x,y,n,m);
    if(y===3)return FRAME_DARK;
    const t=toolLayer(x,y,n,m);if(t[3])return t;
    if(x<=1||x>=14)return shade(oakPlanks(x,y+4,n,m),.7);
    if(y===15)return shade(oakPlanks(x,y,n,m),.6);
    return shade(oakPlanks(y,x,n,m),.82);
  },741);
};
export const craftingTableSide=tableSide(r=>{
  // A saw hanging on the left and a hammer on the right.
  r.rect(3,5,6,5,HANDLE[1]);r.rect(3,6,3,6,HANDLE[0]);r.rect(6,6,6,6,HANDLE[0]);
  r.rect(4,7,6,12,IRON_TOOL[2]);for(let y=7;y<=12;y++)r.set(3,y,y%2?IRON_TOOL[0]:null);r.rect(6,7,6,12,IRON_TOOL[1]);
  r.rect(10,8,10,14,HANDLE[1]);r.rect(11,8,11,14,HANDLE[0]);r.rect(8,5,12,6,IRON_TOOL[1]);r.rect(8,5,12,5,IRON_TOOL[2]);r.set(12,7,IRON_TOOL[0]);
});
export const craftingTableFront=tableSide(r=>{
  // A carpenter's square on the left and a chisel on the right.
  r.rect(3,5,3,13,rgb(0xd8c08a));r.rect(3,13,8,13,rgb(0xd8c08a));for(let y=6;y<13;y+=2)r.set(4,y,rgb(0x5a4424));for(let x=5;x<9;x+=2)r.set(x,12,rgb(0x5a4424));
  r.rect(11,5,12,9,HANDLE[1]);r.rect(12,5,12,9,HANDLE[0]);r.rect(11,10,12,12,IRON_TOOL[1]);r.rect(11,13,11,13,IRON_TOOL[2]);r.set(12,13,IRON_TOOL[0]);
});
const FURNACE=ramp(0x515151,0x5e5e5e,0x6b6b6b,0x787878,0x868686,0x949494);
/** Furnace masonry: a smooth cap band over two courses of blocks. */
export const furnaceSide:Painter=cached((x,y)=>{
  const h=hash(x,y,751);
  if(y===0)return FURNACE[5];if(y<=2)return pick(FURNACE.slice(3,5),h);if(y===3)return FURNACE[0];
  const course=y<10?0:1,cx=(x+(course?5:0))%16;
  if(y===9||y===15||cx===0)return FURNACE[1];
  return pick(FURNACE.slice(2,5),contrast(fbm(x,y,752,1,1,.5),1.4));
},750);
export const furnaceTop:Painter=cached((x,y)=>{
  const h=hash(x,y,761);
  if(x===0||y===0)return FURNACE[5];if(x===15||y===15)return FURNACE[1];
  if(x===1||y===1||x===14||y===14)return FURNACE[3];
  return pick(FURNACE.slice(1,5),contrast(fbm(x,y,762,1,1,.6),1.3)*.8+h*.2);
},760);
const FIRE_GLOW=ramp(0xd8580e,0xf27e18,0xffa82a,0xffd04a,0xfff09a);
function furnaceFront(lit:boolean):Painter{
  return cached((x,y,n,m)=>{
    // Upper vent slot.
    if(y>=4&&y<=5&&x>=4&&x<=11)return x%2?(lit?rgb(0x8a3a10):rgb(0x1c1c1c)):FURNACE[1];
    // Fire box opening with an arch and a stone lip.
    if(y>=8&&y<=13&&x>=3&&x<=12){
      if(y===8&&(x===3||x===12))return FURNACE[2];
      if(y===8)return FURNACE[0];
      if(!lit)return y===13?rgb(0x262626):hash(x,y,771)<.2?rgb(0x2c2c2c):rgb(0x161616);
      const heat=(y-8)/5+valueNoise(x,y,2,2,772)*.35;
      return heat<.45?rgb(0x3a1606):pick(FIRE_GLOW,Math.min(.999,heat-.35));
    }
    if(y===14&&x>=3&&x<=12)return FURNACE[5];
    return furnaceSide(x,y,n,m);
  },lit?780:790);
}
export const furnaceFrontOff=furnaceFront(false);
export const furnaceFrontOn=furnaceFront(true);

// ---- Containers -------------------------------------------------------------------------------------
const CHEST=ramp(0x5c3a16,0x6c461c,0x7c5224,0x8c5e2c,0x9a6a34);
const CHEST_FRAME=rgb(0x2a1a0a);
const chestWood=(x:number,y:number,salt:number)=>{
  const row=y%5,h=hash(x,y,salt);
  return row===4?CHEST[0]:pick(CHEST.slice(1),contrast(valueNoise(x,y,4,1,salt+1)*.6+h*.4,1.3)+(row===0?.15:0));
};
export const chestTop:Painter=cached((x,y)=>{
  if(x===0||y===0||x===15||y===15)return CHEST_FRAME;
  if(x===1||y===1)return CHEST[4];
  return chestWood(x,y,801);
},800);
export const chestSide:Painter=cached((x,y)=>{
  if(x===0||y===0||x===15||y===15)return CHEST_FRAME;
  if(y===5)return CHEST_FRAME;
  if(y===6)return CHEST[4];
  return chestWood(x,y+2,811);
},810);
const LATCH=ramp(0x3c3c40,0x8c8c92,0xc6c6cc);
export const chestFront:Painter=cached((x,y,n,m)=>{
  if(x>=6&&x<=9&&y>=3&&y<=8){
    if(x===6||x===9||y===3||y===8)return LATCH[0];
    return y===4?LATCH[2]:LATCH[1];
  }
  return chestSide(x,y,n,m);
},820);
const STAVE=ramp(0x543a1c,0x664824,0x74532c,0x825e34,0x8f693c);
const BAND=ramp(0x343436,0x505054,0x6c6c70,0x8c8c90);
/** Barrel side: bulging vertical staves bound by two iron hoops. */
export const barrelSide:Painter=cached((x,y)=>{
  if(y===2||y===12)return x%8===3?BAND[3]:BAND[2];
  if(y===3||y===13)return BAND[0];
  if(x%4===0)return STAVE[0];
  const bulge=Math.cos((y-7.5)/9*Math.PI)*.35;
  return pick(STAVE.slice(1),contrast(hash(x,y,831)*.4+valueNoise(x,y,1,4,832)*.3+bulge,1.2));
},830);
const barrelEnd=(hole:boolean,salt:number):Painter=>cached((x,y)=>{
  const d=Math.max(Math.abs(x-7.5),Math.abs(y-7.5));
  if(d>6.6)return STAVE[0];
  if(d>5.6)return STAVE[3];
  if(hole&&d<2.6)return d>1.6?BAND[1]:rgb(0x1c1208);
  const board=Math.floor((y-2)/3);
  if((y-2)%3===2)return STAVE[1];
  return pick(STAVE.slice(2),contrast(valueNoise(x,y,4,1,salt+board)*.6+hash(x,y,salt)*.4,1.3)*(hole?1:.85));
},salt);
export const barrelTop=barrelEnd(true,841);
export const barrelBottom=barrelEnd(false,851);
export const bookshelf:Painter=(()=>{
  const BOOKS=[0x8a2626,0x2a3a8a,0x2a6a2e,0x7a5226,0x6a2a7a,0x22707a,0xb08a3a,0x3a3a3a].map(h=>rgb(h)),random=rng(861);
  const spines:(RGBA|null)[]=new Array(T*T).fill(null);
  for(const [top,bottom] of [[1,6],[9,14]]){
    let x=1;
    while(x<15){
      const w=random()<.3?2:1,h=bottom-top+1-Math.floor(random()*2.4),c=BOOKS[Math.floor(random()*BOOKS.length)];
      for(let dx=0;dx<w&&x+dx<15;dx++)for(let k=0;k<h;k++){
        const y=bottom-k,band=k===h-2;
        spines[y*T+x+dx]=band?mix(c,rgb(0xe8d8a0),.55):dx===0&&w===2?shade(c,1.2):shade(c,.92+hash(x,y,862)*.12);
      }
      x+=w+(random()<.25?1:0);
    }
  }
  return cached((x,y,n,m)=>{
    if(y===0||y===15||y===7||y===8)return y===8||y===15?shade(oakPlanks(x,y,n,m),.75):oakPlanks(x,y,n,m);
    if(x===0||x===15)return shade(oakPlanks(y,x,n,m),.8);
    return spines[y*T+x]??rgb(0x26180c);
  },860);
})();

// ---- Wool -----------------------------------------------------------------------------------------
export const WOOL_HEX:Record<typeof WOOL_COLOURS[number],number>={
  white:0xe9ecec,orange:0xf07613,magenta:0xbd44b3,light_blue:0x3aafd9,yellow:0xf8c627,lime:0x70b919,pink:0xed8dac,gray:0x3e4447,
  light_gray:0x8e8e86,cyan:0x158991,purple:0x792aac,blue:0x35399d,brown:0x724728,green:0x546d1b,red:0xa12722,black:0x141519
};
/** Knitted wool: a diagonal weave of slightly lighter and darker fibres. */
export function wool(hex:number,salt:number):Painter{
  const base=rgb(hex);
  return cached((x,y)=>{
    const weave=((x+y)&3)===0?1.07:((x-y+16)&3)===2?.92:1,fibre=valueNoise(x,y,2,4,salt)*.08;
    return shade(base,weave*(.96+fibre)+(hash(x,y,salt+1)-.5)*.05);
  },salt);
}

// ---- TNT --------------------------------------------------------------------------------------------
const TNT_RED=ramp(0x8a1a0c,0xa62212,0xbf2c18,0xd43a20,0xe4502e);
const PAPER=ramp(0xc8c2b4,0xd9d3c6,0xe6e2d6);
const label=(()=>{
  const ink=new Set<number>(),word=['T','N','T'];let x0=2;
  for(const ch of word){const g=GLYPHS[ch];g.forEach((row,j)=>{for(let i=0;i<row.length;i++)if(row[i]==='#')ink.add((6+j)*T+x0+i);});x0+=g[0].length+1;}
  return ink;
})();
export const tntSide:Painter=cached((x,y)=>{
  if(y===4||y===11)return rgb(0x5a4a3a);
  if(y>4&&y<11)return label.has(y*T+x)?rgb(0x262220):pick(PAPER,hash(x,y,871));
  const s=x%4;
  return s===0?TNT_RED[0]:s===1?TNT_RED[3+(hash(x,y,872)<.3?1:0)]:s===2?TNT_RED[2]:TNT_RED[1];
},870);
/** TNT ends: a bundle of sixteen stick ends (4×4 px each, dark gaps at the corners) with the fuse in the middle. */
const tntEnd=(fuse:boolean,salt:number):Painter=>cached((x,y)=>{
  if(fuse&&(x===7||x===8)&&(y===7||y===8))return x===7&&y===7?rgb(0x6a6a6a):rgb(0x3c3c3c);
  if(fuse&&((x===8&&y===6)||(x===9&&y===5)))return x===9?rgb(0xd8d4cc):rgb(0x8a8a8a);
  const cx=x&3,cy=y&3,corner=(cx===0||cx===3)&&(cy===0||cy===3);
  if(corner)return rgb(fuse?0x5a160c:0x4a120a);
  if(cx===0||cy===0)return TNT_RED[3];
  if(cx===3||cy===3)return TNT_RED[1];
  if(cx===1&&cy===1)return rgb(0xe8644a);
  return hash(x,y,salt)<.5?rgb(0xc8361e):rgb(0xbc301a);
},salt);
export const tntTop=tntEnd(true,881);
export const tntBottom=tntEnd(false,891);

// ---- Light sources --------------------------------------------------------------------------------
const GLOW=ramp(0xc8873a,0xe0a648,0xf2c660,0xfbdb82,0xfff0b6);
export const glowstone:Painter=(()=>{
  const cells=voronoi(12,901,1);
  return cached((x,y)=>{
    if(cells.gap(x,y)<.8)return hash(x,y,902)<.5?rgb(0x7a4c1e):rgb(0x8e5c24);
    const k=hash(cells.id(x,y),1,903)*.5+(1-Math.min(1,cells.centre(x,y)/3.5))*.5;
    return pick(GLOW,k);
  },900);
})();
const TORCH_WOOD=ramp(0x4e3418,0x6e4c24,0x8a6232);
/** Torch: a 2×10 px stick (columns 7-8, rows 6-15) whose top two rows burn; everything else is clear. */
export const torch:Painter=(x,y)=>{
  if(x<7||x>8||y<6)return CLEAR;
  if(y===6)return x===7?rgb(0xfffbd0):rgb(0xffe88a);
  if(y===7)return x===7?rgb(0xffc43a):rgb(0xf2961e);
  if(y===8)return rgb(0x5a3a1a);
  return x===7?TORCH_WOOD[2]:TORCH_WOOD[1];
};
const LANTERN_IRON=ramp(0x24262e,0x343843,0x464b58,0x5e6474);
const LANTERN_GLOW=ramp(0xf2a234,0xffc75a,0xffe49a,0xfff6d2);
/** Lantern laid out like the lantern model's UVs: cap sides (1-4, rows 0-1), body sides (0-5, rows 2-8),
 *  body top/bottom (0-5, rows 9-14) whose centre (1-4, rows 10-13) is the cap top, and the handle loop (11-13, rows 1-2 and 10-11). */
export const lantern:Painter=(x,y)=>{
  if(y<=1&&x>=1&&x<=4)return y===0?LANTERN_IRON[3]:LANTERN_IRON[2];
  if(y>=2&&y<=8&&x<=5){
    if(y===2)return x===0||x===5?LANTERN_IRON[1]:LANTERN_IRON[3];
    if(y===8)return LANTERN_IRON[0];
    if(x===0||x===5)return LANTERN_IRON[x===0?2:1];
    const d=Math.abs(x-2.5)+Math.abs(y-5)*.6;
    return pick(LANTERN_GLOW,1-d/3);
  }
  if(y>=9&&y<=14&&x<=5){
    if(x===0||y===9)return LANTERN_IRON[2];
    if(x===5||y===14)return LANTERN_IRON[0];
    if(x>=2&&x<=3&&y>=11&&y<=12)return LANTERN_IRON[0];
    return LANTERN_IRON[x===1||y===10?3:1];
  }
  for(const top of [1,10])if(x>=11&&x<=13&&(y===top||(y===top+1&&x!==12)))return y===top?LANTERN_IRON[3]:LANTERN_IRON[1];
  return CLEAR;
};
const FLAME=ramp(0xb83010,0xe05818,0xf88a22,0xffbc3a,0xffe486,0xfff6c8);
/** Fire: flame tongues rising from the base to uneven heights, hottest (lightest) low down. Tiles horizontally. */
export const fire:Painter=cached((x,y)=>{
  const height=6+valueNoise(x,0,4,16,911)*6+valueNoise(x,0,2,16,912)*4,up=15-y;
  if(up>=height)return CLEAR;
  const t=up/height;
  if(t>.35&&valueNoise(x,y,2,4,913)<.24)return CLEAR;
  return pick(FLAME,1-t*(.85+hash(x,y,914)*.3));
},910);

// ---- Metal and mineral blocks -------------------------------------------------------------------------
/** A bevelled plate: light top-left edges, dark bottom-right edges, with a motif inside. */
function plate(p:RGBA[],motif:(x:number,y:number)=>number,salt:number):Painter{
  return cached((x,y)=>{
    if(x===0||y===0)return p[p.length-1];
    if(x===15||y===15)return p[0];
    if(x===1||y===1)return p[p.length-2];
    if(x===14||y===14)return p[1];
    return pick(p.slice(1,-1),Math.max(0,Math.min(.999,motif(x,y)+(hash(x,y,salt)-.5)*.12)));
  },salt);
}
export const ironBlock=plate(ramp(0x9a9a9a,0xb0b0b0,0xc4c4c4,0xd4d4d4,0xe4e4e4,0xf2f2f2),
  (x,y)=>x===7||y===7?.05:x===8||y===8?.95:.55+valueNoise(x,y,16,2,921)*.2,920);
export const goldBlock=plate(ramp(0xb07e0c,0xd29e16,0xeebe28,0xf9d444,0xfde56a,0xfff4a6),
  (x,y)=>{const d=(x+y)%12;return d<2?.95:d<4?.7:.4+valueNoise(x,y,4,4,931)*.2;},930);
export const diamondBlock=plate(ramp(0x1e968e,0x32b8b0,0x52d0c8,0x7adfd8,0xa4ece8,0xd2faf8),
  (x,y)=>{const d=(Math.abs(x-7.5)+Math.abs(y-7.5))%5;return d<1?.95:d<2?.2:.5+(x<y?.15:-.05);},940);
export const emeraldBlock=plate(ramp(0x0a7429,0x118e38,0x1aa848,0x2bbd5b,0x50d27b,0x8ae8a6),
  (x,y)=>{const gx=(x-2)%4,gy=(y-2+((x-2)>>2&1)*2)%4;return gx===0||gy===0?.92:gx===3||gy===3?.1:.5;},950);
export const lapisBlock:Painter=over(plate(ramp(0x122c78,0x193890,0x2044a4,0x2852b6,0x3460c6,0x4876d2),
  (x,y)=>contrast(fbm(x,y,961,1,1,.5),1.5),960),(x,y)=>x>1&&y>1&&x<14&&y<14&&hash(x,y,962)<.04?rgb(0xd8b040):CLEAR);
export const coalBlock=plate(ramp(0x0b0b0b,0x131313,0x1b1b1b,0x242424,0x2f2f2f,0x3e3e3e),
  (x,y)=>contrast(fbm(x,y,971,1,1,.6),1.6),970);
export const redstoneBlock=plate(ramp(0x760804,0x920c06,0xac1208,0xc4190d,0xdc2a18,0xee4a30),
  (x,y)=>(x%4===2&&y%4===2)?.95:(x%4===2||y%4===2)?.6:.3+hash(x,y,981)*.2,980);

// ---- Ladder, bed and door -------------------------------------------------------------------------------
const LADDER=ramp(0x4c3416,0x684822,0x83602e,0x987238);
/** Ladder: two continuous rails (columns 2-3 and 12-13) and a rung every four rows; the rest is clear. */
export const ladder:Painter=(x,y)=>{
  const rail=x===2||x===3||x===12||x===13,rung=x>=2&&x<=13&&(y%4===1||y%4===2);
  if(rail){if(rung&&y%4===1&&(x===3||x===12))return LADDER[0];return x===2||x===12?LADDER[3]:LADDER[1];}
  if(rung)return y%4===1?LADDER[2]:LADDER[1];
  return CLEAR;
};
const BLANKET=ramp(0x7a1414,0x941a1a,0xac2222,0xc02c2c,0xd23a3a);
const SHEET=ramp(0xb4b4b4,0xcbcbcb,0xdedede,0xefefef);
const FRAME=ramp(0x4e3418,0x6a4a24,0x86613a);
const quilt=(x:number,y:number,salt:number)=>pick(BLANKET.slice(1),((x+y)%5===0?.9:.45)+(hash(x,y,salt)-.5)*.3);
/** Head end of the bed seen from above: row 0 is the headboard end, with the pillow, the sheet fold and the blanket. */
export const bedHeadTop:Painter=cached((x,y)=>{
  if(y>=9)return y===9?BLANKET[4]:x===0||x===15?BLANKET[1]:quilt(x,y,991);
  if(x>=2&&x<=13&&y>=1&&y<=6){if(x===2||x===13||y===1||y===6)return SHEET[1];return pick(SHEET.slice(2),hash(x,y,992)*.5+(y<4?.5:0));}
  return y===8?SHEET[0]:SHEET[2];
},990);
/** Foot end from above: blanket all over with a darker hem along the edges and the foot end (row 15). */
export const bedFootTop:Painter=cached((x,y)=>x===0||x===15||y===15?BLANKET[0]:y===14?BLANKET[1]:quilt(x,y,1001),1000);
const bedFrame=(x:number,y:number,legs:boolean)=>{
  if(legs&&(x<=2||x>=13))return y===15?FRAME[0]:FRAME[1];
  return y===13?FRAME[2]:y===15?FRAME[0]:FRAME[1];
};
/** Long sides and ends: the bed is 9 px tall, so rows 7-15 show; the cover and frame span the whole tile. */
export const bedFootSide:Painter=cached((x,y)=>y>=13?bedFrame(x,y,false):y===12?BLANKET[0]:y===7?BLANKET[4]:quilt(x,y,1011),1010);
export const bedHeadSide:Painter=cached((x,y)=>{
  if(y>=13)return bedFrame(x,y,false);
  if(y>=10)return y===12?BLANKET[0]:BLANKET[2];
  return y===7?SHEET[3]:pick(SHEET.slice(1),hash(x,y,1021));
},1020);
export const bedFootEnd:Painter=cached((x,y)=>y>=13?bedFrame(x,y,true):y===12?BLANKET[0]:y===7?BLANKET[4]:quilt(x,y,1031),1030);
export const bedHeadEnd:Painter=cached((x,y)=>{
  if(y>=13)return bedFrame(x,y,true);
  if(y===7)return SHEET[3];
  return y===10?SHEET[0]:pick(SHEET.slice(1),hash(x,y,1041));
},1040);
const DOOR=ramp(0x4e3618,0x6a4a24,0x80592c,0x936834,0xa4763e);
const doorWood=(x:number,y:number,salt:number)=>pick(DOOR.slice(2),valueNoise(x,y,1,4,salt)*.7+hash(x,y,salt+1)*.3);
/** Door top: stiles and rails framing four window panes (clear) split by mullions. */
export const oakDoorTop:Painter=cached((x,y)=>{
  if(x<=1||x>=14)return x===0||x===15?DOOR[0]:DOOR[3];
  if(y<=1)return y===0?DOOR[4]:DOOR[3];
  const paneX=(x>=3&&x<=6)||(x>=9&&x<=12),paneY=(y>=3&&y<=6)||(y>=9&&y<=12);
  if(paneX&&paneY)return CLEAR;
  // A darker reveal under and right of each pane gives the glazing depth.
  if((y===7||y===13)&&paneX||((x===7||x===13)&&paneY))return DOOR[1];
  return doorWood(x,y,1051);
},1050);
/** Door bottom: the window grid continues in a row of short panes, then a mid rail, a raised panel and a handle. */
export const oakDoorBottom:Painter=cached((x,y)=>{
  if(x<=1||x>=14)return x===0||x===15?DOOR[0]:DOOR[3];
  if(y>=14)return y===15?DOOR[0]:DOOR[2];
  const paneX=(x>=3&&x<=6)||(x>=9&&x<=12);
  if(paneX&&y>=0&&y<=2)return CLEAR;
  if(paneX&&y===3)return DOOR[1];
  if(x>=11&&x<=12&&y>=7&&y<=8)return x===11?rgb(0x8a8a8e):rgb(0x4a4a4e);
  if(y>=6&&y<=12&&x>=3&&x<=12){
    if(y===6||x===3)return DOOR[4];if(y===12||x===12)return DOOR[1];
    return doorWood(x,y,1061);
  }
  return y===4||y===5?DOOR[3]:doorWood(x,y,1062);
},1060);

// ---- Glass ------------------------------------------------------------------------------------------
/** Glass: a pale frame with darker corners and two diagonal glints; the centre is clear. */
export const glass:Painter=(x,y)=>{
  const edge=x===0||y===0||x===15||y===15;
  if(edge)return(x===0||x===15)&&(y===0||y===15)?rgb(0x9fb8bc):x===15||y===15?rgb(0xb8d0d4):rgb(0xdcf0f2);
  if(x+y===6&&x>=1&&x<=5||x+y===8&&x>=2&&x<=4||x+y===24&&x>=11&&x<=13)return withAlpha(rgb(0xeefcff),255);
  return CLEAR;
};
