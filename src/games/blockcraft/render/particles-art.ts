// Original pixel art for particles, painted in code into one sheet of 16×16 cells (16 columns ×
// 8 rows, top row first). White sprites are tinted per particle (smoke, spell, note, drips);
// the others are pre-coloured. Rows 6 and 7 are left empty for item sprites copied in at runtime
// (eating crumbs, snowballs, eggs, slime), recycled least-recently-used.
export const SHEET_COLUMNS=16,SHEET_ROWS=8,SHEET_WIDTH=SHEET_COLUMNS*16,SHEET_HEIGHT=SHEET_ROWS*16;
export const ITEM_SLOT_BASE=96,ITEM_SLOTS=32;
/** First cell and frame count of each sprite. */
export const PARTICLE_SPRITES={
  generic:{cell:0,frames:8},splash:{cell:8,frames:4},bubble:{cell:12,frames:1},drip_hang:{cell:13,frames:1},drip_fall:{cell:14,frames:1},
  drip_land:{cell:15,frames:1},explosion:{cell:16,frames:16},sweep:{cell:32,frames:8},spell:{cell:40,frames:8},crit:{cell:48,frames:1},
  damage:{cell:49,frames:1},heart:{cell:50,frames:1},angry:{cell:51,frames:1},happy:{cell:52,frames:1},flame:{cell:53,frames:1},
  lava:{cell:54,frames:1},note:{cell:55,frames:1}
} as const;
export type SpriteName=keyof typeof PARTICLE_SPRITES;

type RGBA=[number,number,number,number];
function hash(x:number,y:number,s:number){let h=Math.imul(x*374761393+y*668265263+s*2147483647,1274126177);h=Math.imul(h^h>>>13,1103515245);return((h^h>>>16)>>>0)/4294967296;}
/** Pixel painter for one cell: (x, y) in 0..15 with y down; return null for transparent. */
type Painter=(x:number,y:number)=>RGBA|null;
const WHITE:RGBA=[255,255,255,255];

const generic=(frame:number):Painter=>{
  const r=1.1+frame*.9;
  return(x,y)=>{const d=Math.hypot(x-7.5,y-7.5);if(d>r)return null;const soft=d>r-1.1;return[255,255,255,soft?150:255];};
};
const splash=(frame:number):Painter=>(x,y)=>{
  // Four drops thrown outward; each frame spreads them further.
  const spread=1+frame*1.4;
  for(const [dx,dy] of [[-1,-1],[1,-1],[-1,.4],[1,.4],[0,-1.4]]){
    const cx=7.5+dx*spread,cy=8+dy*spread;
    if(Math.abs(x-cx)<1&&Math.abs(y-cy)<1.2)return y<cy?[200,226,255,255]:[90,140,230,255];
  }
  return null;
};
const bubble:Painter=(x,y)=>{
  const d=Math.hypot(x-7.5,y-7.5);
  if(d>3.6)return null;
  if(x===6&&y===6)return[255,255,255,255];
  return d>2.6?[170,210,255,255]:[90,140,220,70];
};
const dripHang:Painter=(x,y)=>x>=7&&x<=8&&y>=6&&y<=9?(y===6?[255,255,255,170]:WHITE):null;
const dripFall:Painter=(x,y)=>x>=7&&x<=8&&y>=7&&y<=8?WHITE:null;
const dripLand:Painter=(x,y)=>y===9&&x>=5&&x<=10?WHITE:y===8&&x>=6&&x<=9?[255,255,255,190]:null;
const explosion=(frame:number):Painter=>{
  // A puffy light-grey cloud of overlapping billows, shaded darker toward the lower right, that thins out and breaks up
  // into scattered wisps as the frame advances (never fully gone, so every frame shows something).
  const life=frame/15,r=7.4-frame*.12;
  const billows:[number,number,number][]=[[7.5,7.5,r*.72],[5,5.5,r*.5],[10,5,r*.48],[5.2,10,r*.5],[10.2,10.2,r*.46],[7.5,3.6,r*.4],[3.6,7.6,r*.4],[11.6,7.8,r*.38]];
  return(x,y)=>{
    let inside=0,edge=1;
    for(const [bx,by,br] of billows){const d=Math.hypot(x-bx,y-by)/br;if(d<1){inside++;edge=Math.min(edge,d);}}
    if(!inside)return null;
    const n=hash(x,y,frame%5+1)*.6+hash(x>>1,y>>1,frame%3+9)*.4;
    if(n<life*.72-.04)return null;
    const shade=(x+y-15)/30,v=Math.round(Math.max(120,Math.min(235,214-shade*70-edge*28+n*18)));
    return[v,v,Math.round(v*.97),255];
  };
};
const sweep=(frame:number):Painter=>{
  const centre=-Math.PI*.85+frame*Math.PI*.22;
  return(x,y)=>{
    const dx=x-7.5,dy=y-11,d=Math.hypot(dx,dy);if(d<5.2||d>7.6)return null;
    const a=Math.atan2(dy,dx),diff=Math.abs(((a-centre+Math.PI*3)%(Math.PI*2))-Math.PI);
    if(diff>.75)return null;
    const v=d>6.6?255:205;return[v,v,v,diff>.5?150:255];
  };
};
const spell=(frame:number):Painter=>{
  // The sparkle shrinks frame by frame; odd frames add a diagonal twinkle.
  const arm=[4,3,3,2,2,1,1,0][frame],twinkle=frame%2;
  return(x,y)=>{
    const dx=Math.abs(x-7),dy=Math.abs(y-7);
    if(dx===0&&dy<=arm||dy===0&&dx<=arm)return dx+dy===0?WHITE:[235,235,235,255];
    if(twinkle&&dx===1&&dy===1)return[255,255,255,140];
    return null;
  };
};
const crit:Painter=(x,y)=>{
  const dx=Math.abs(x-7),dy=Math.abs(y-7);
  if(dx===0&&dy<=4||dy===0&&dx<=4)return dx+dy<=1?[255,255,240,255]:[255,246,190,255];
  if(dx===1&&dy===1)return[255,232,150,255];
  return null;
};
const HEART=['.XX.XX.','XXXXXXX','XXXXXXX','.XXXXX.','..XXX..','...X...'];
const heartShape=(light:RGBA,body:RGBA,shade:RGBA):Painter=>(x,y)=>{
  const hx=x-4,hy=y-5;if(hy<0||hy>=HEART.length||hx<0||hx>=7||HEART[hy][hx]!=='X')return null;
  if(hx===1&&hy===1)return light;
  return hy>=3||hx>=5&&hy>=1?shade:body;
};
const angry:Painter=(x,y)=>{
  // A cross-shaped vein mark of four bent strokes, a classic sign of anger.
  const red:RGBA=[214,40,40,255],dark:RGBA=[120,18,22,255];
  const strokes=[[5,4],[6,4],[4,5],[4,6],[9,4],[10,4],[11,5],[11,6],[4,9],[4,10],[5,11],[6,11],[11,9],[11,10],[10,11],[9,11]];
  for(const [sx,sy] of strokes)if(x===sx&&y===sy)return red;
  for(const [sx,sy] of strokes)if(x===sx+1&&y===sy+1&&!(x>=6&&x<=9&&y>=6&&y<=9))return dark;
  return null;
};
const happy:Painter=(x,y)=>{
  const dx=Math.abs(x-7.5),dy=Math.abs(y-7.5);if(dx+dy>4.5)return null;
  if(dx+dy<1.5)return[214,255,200,255];
  return dx+dy>3.5?[40,150,60,255]:[80,210,90,255];
};
const flame:Painter=(x,y)=>{
  const top=4,bottom=12;if(y<top||y>bottom)return null;
  const t=(y-top)/(bottom-top),half=.6+Math.sin(t*Math.PI*.85)*2.6,dx=Math.abs(x-7.5);
  if(dx>half)return null;
  const inner=dx<half*.45&&t>.45;
  return inner?[255,246,170,255]:t<.35?[255,150,40,255]:[255,200,60,255];
};
const lava:Painter=(x,y)=>{
  const d=Math.hypot(x-7.5,y-7.5);if(d>2.6)return null;
  return d<1.2?[255,240,140,255]:[250,120,30,255];
};
const note:Painter=(x,y)=>{
  // Eighth note: a head at the bottom left, a stem and a flag.
  if(x>=5&&x<=7&&y>=10&&y<=11)return WHITE;
  if(x===4&&y===11||x===8&&y===10)return[255,255,255,200];
  if(x===8&&y>=3&&y<=10)return WHITE;
  if(y===3&&x>=8&&x<=10||y===4&&x>=10&&x<=11||y===5&&x===11)return WHITE;
  return null;
};
const PAINTERS:[number,Painter][]=[
  ...Array.from({length:8},(_,f)=>[PARTICLE_SPRITES.generic.cell+f,generic(f)] as [number,Painter]),
  ...Array.from({length:4},(_,f)=>[PARTICLE_SPRITES.splash.cell+f,splash(f)] as [number,Painter]),
  [PARTICLE_SPRITES.bubble.cell,bubble],[PARTICLE_SPRITES.drip_hang.cell,dripHang],[PARTICLE_SPRITES.drip_fall.cell,dripFall],[PARTICLE_SPRITES.drip_land.cell,dripLand],
  ...Array.from({length:16},(_,f)=>[PARTICLE_SPRITES.explosion.cell+f,explosion(f)] as [number,Painter]),
  ...Array.from({length:8},(_,f)=>[PARTICLE_SPRITES.sweep.cell+f,sweep(f)] as [number,Painter]),
  ...Array.from({length:8},(_,f)=>[PARTICLE_SPRITES.spell.cell+f,spell(f)] as [number,Painter]),
  [PARTICLE_SPRITES.crit.cell,crit],
  [PARTICLE_SPRITES.damage.cell,heartShape([200,70,70,255],[120,16,20,255],[80,8,12,255])],
  [PARTICLE_SPRITES.heart.cell,heartShape([255,200,200,255],[230,40,52,255],[170,20,34,255])],
  [PARTICLE_SPRITES.angry.cell,angry],[PARTICLE_SPRITES.happy.cell,happy],[PARTICLE_SPRITES.flame.cell,flame],
  [PARTICLE_SPRITES.lava.cell,lava],[PARTICLE_SPRITES.note.cell,note]
];
/** RGBA pixels of the whole sheet (SHEET_WIDTH × SHEET_HEIGHT, top row first). */
export function paintParticleSheet():Uint8ClampedArray{
  const data=new Uint8ClampedArray(SHEET_WIDTH*SHEET_HEIGHT*4);
  for(const [cell,paint] of PAINTERS){
    const ox=(cell%SHEET_COLUMNS)*16,oy=Math.floor(cell/SHEET_COLUMNS)*16;
    for(let y=0;y<16;y++)for(let x=0;x<16;x++){
      const c=paint(x,y);if(!c)continue;
      const i=((oy+y)*SHEET_WIDTH+ox+x)*4;data[i]=c[0];data[i+1]=c[1];data[i+2]=c[2];data[i+3]=c[3];
    }
  }
  return data;
}
