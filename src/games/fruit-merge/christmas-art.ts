/**
 * Christmas ornaments for the eleven merge tiers. Presentation only: every
 * ornament's round body fills exactly the physics circle (radius r) and never
 * spills past it. Hanging loops, caps and holly sit above the circle, the same
 * way the original fruit stems and leaves did. Each tier has its own colour
 * family AND its own motif, so tiers stay distinct without relying on hue.
 */
import {XMAS,BULBS,withAlpha,hash,drawSnowflake,drawSnowCap,drawBulb,drawBauble,roundRect} from '../../festive/art';

type Ctx=CanvasRenderingContext2D;
interface Ornament {name:string;color:string;deep:string;cap:'bell'|'holly'|'cap'|'none'|'crown'}

/** Festive display names and colours, index-aligned with engine TIERS. */
export const ORNAMENTS:readonly Ornament[]=[
 {name:'Jingle Bell',color:'#f3c84a',deep:'#9a6b12',cap:'bell'},
 {name:'Holly Berry',color:'#e0283d',deep:'#7a0f1e',cap:'holly'},
 {name:'Snowflake Bauble',color:'#dfe7f0',deep:'#7f93a8',cap:'cap'},
 {name:'Evergreen Bauble',color:'#2fa35a',deep:'#0f4f2a',cap:'cap'},
 {name:'Candy Bauble',color:'#fbf5ec',deep:'#b9aea2',cap:'cap'},
 {name:'Amber Bauble',color:'#ec7b2c',deep:'#8c3a0e',cap:'cap'},
 {name:'Midnight Bauble',color:'#2e63c8',deep:'#11296b',cap:'cap'},
 {name:'Snow Globe',color:'#d5eefa',deep:'#6aa6c8',cap:'none'},
 {name:'Star Bauble',color:'#7c3fb3',deep:'#341460',cap:'cap'},
 {name:'Christmas Pudding',color:'#7a4126',deep:'#3a1b0d',cap:'none'},
 {name:'Grand Ornament',color:'#c81f36',deep:'#5e0c18',cap:'crown'},
];
export const ornamentName=(tier:number)=>ORNAMENTS[tier]!.name;
export const ornamentColor=(tier:number)=>ORNAMENTS[tier]!.color;

function star(c:Ctx,x:number,y:number,outer:number,inner:number,points=5,rotation=-Math.PI/2){
 c.beginPath();for(let i=0;i<points*2;i++){const a=rotation+i*Math.PI/points,d=i%2?inner:outer;const px=x+Math.cos(a)*d,py=y+Math.sin(a)*d;if(i)c.lineTo(px,py);else c.moveTo(px,py);}c.closePath();
}
function hollyLeaf(c:Ctx,x:number,y:number,len:number,angle:number,fill:string){
 c.save();c.translate(x,y);c.rotate(angle);c.beginPath();c.moveTo(0,0);
 // Three scallops along each edge give the spiky holly outline.
 const w=len*.32;c.quadraticCurveTo(len*.17,-w*1.15,len*.33,-w*.62);c.quadraticCurveTo(len*.5,-w*1.2,len*.66,-w*.6);c.quadraticCurveTo(len*.85,-w*1.05,len,0);
 c.quadraticCurveTo(len*.85,w*1.05,len*.66,w*.6);c.quadraticCurveTo(len*.5,w*1.2,len*.33,w*.62);c.quadraticCurveTo(len*.17,w*1.15,0,0);c.closePath();
 c.fillStyle=fill;c.fill();c.strokeStyle='#14532d';c.lineWidth=1.3;c.stroke();
 c.beginPath();c.moveTo(len*.08,0);c.lineTo(len*.9,0);c.strokeStyle='#8fd3a2';c.lineWidth=1;c.stroke();c.restore();
}
function berry(c:Ctx,x:number,y:number,r:number){
 c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fillStyle=XMAS.red;c.fill();c.strokeStyle=XMAS.redDark;c.lineWidth=1;c.stroke();
 c.beginPath();c.arc(x-r*.35,y-r*.35,r*.3,0,Math.PI*2);c.fillStyle='#ffd9de';c.fill();
}

/** Decorations painted inside the body; the circle is already clipped. Units: radius 40. */
function motif(c:Ctx,tier:number){
 switch(tier){
  case 0:{ // Jingle bell: raised seam, sound slot with round ends.
   c.strokeStyle='#fff2b5';c.lineWidth=3;c.beginPath();c.moveTo(-40,-3);c.quadraticCurveTo(0,6,40,-3);c.stroke();
   c.strokeStyle='#8a5c0c';c.lineWidth=2.5;c.beginPath();c.moveTo(-40,0);c.quadraticCurveTo(0,9,40,0);c.stroke();
   c.fillStyle='#3d2606';c.beginPath();c.moveTo(-17,16);c.lineTo(17,16);c.lineWidth=5;c.strokeStyle='#3d2606';c.lineCap='round';c.stroke();
   for(const sx of [-19,19]){c.beginPath();c.arc(sx,16,6.5,0,Math.PI*2);c.fill();}
   c.beginPath();c.moveTo(0,16);c.lineTo(0,40);c.lineWidth=4;c.stroke();break;}
  case 1:{ // Holly berry: a glossy berry with a dark blossom end.
   c.fillStyle='#5a0b16';star(c,0,-30,9,3.5,5);c.fill();
   c.fillStyle='rgba(255,255,255,.18)';c.beginPath();c.ellipse(12,14,9,15,-.5,0,Math.PI*2);c.fill();break;}
  case 2:{ // Silver with a frosty snowflake.
   c.fillStyle='rgba(120,170,215,.25)';c.beginPath();c.arc(0,4,24,0,Math.PI*2);c.fill();
   drawSnowflake(c,0,4,23,'#5a89b9');c.fillStyle='#ffffff';c.beginPath();c.arc(0,4,3.2,0,Math.PI*2);c.fill();
   for(const [sx,sy] of [[-26,-18],[27,-14],[-22,26],[24,24]] as const)drawSnowflake(c,sx,sy,5,'#ffffff',.9);break;}
  case 3:{ // Green with a gold zigzag band.
   c.fillStyle=XMAS.goldLight;c.fillRect(-40,-13,80,3);c.fillRect(-40,10,80,3);
   c.strokeStyle=XMAS.gold;c.lineWidth=4;c.lineJoin='round';c.beginPath();for(let x=-44,i=0;x<=44;x+=8,i++){if(i)c.lineTo(x,i%2?-6:6);else c.moveTo(x,6);}c.stroke();
   c.fillStyle='#fff6d0';for(let x=-36;x<=36;x+=16){c.beginPath();c.arc(x,-24,1.6,0,Math.PI*2);c.fill();c.beginPath();c.arc(x+8,26,1.6,0,Math.PI*2);c.fill();}break;}
  case 4:{ // Candy-cane stripes.
   c.save();c.rotate(-.6);c.fillStyle=XMAS.red;for(let x=-60;x<60;x+=20)c.fillRect(x,-50,9,100);c.fillStyle='#7fc79a';for(let x=-49;x<60;x+=20)c.fillRect(x,-50,2.5,100);c.restore();break;}
  case 5:{ // Amber with rings of gold glitter dots.
   c.fillStyle=XMAS.goldLight;for(const [ring,count,size] of [[30,14,2.6],[17,9,2.6],[0,1,4]] as const){for(let i=0;i<count;i++){const a=i*Math.PI*2/count+ring*.04;c.beginPath();c.arc(Math.cos(a)*ring,Math.sin(a)*ring,size,0,Math.PI*2);c.fill();}}
   c.strokeStyle='#fff1c0';c.lineWidth=1.4;c.beginPath();c.arc(0,0,23.5,0,Math.PI*2);c.stroke();break;}
  case 6:{ // Midnight blue with silver stars and a crescent.
   c.fillStyle='#eaf2ff';for(const [sx,sy,s] of [[-20,-18,6],[16,-24,4],[24,6,6.5],[-8,20,5],[-28,8,3.5],[6,-4,3.5],[14,28,3.5]] as const){star(c,sx,sy,s,s*.42,5);c.fill();}
   c.fillStyle='#ffe9a3';c.beginPath();c.arc(-2,-30,7,0,Math.PI*2);c.fill();c.fillStyle='#2e63c8';c.beginPath();c.arc(1.5,-32,6,0,Math.PI*2);c.fill();break;}
  case 7:{ // Snow globe: a little fir tree on a snow drift, flakes in the water, red base.
   c.fillStyle='#f6fbff';c.beginPath();c.ellipse(0,26,40,13,0,0,Math.PI*2);c.fill();
   c.fillStyle='#6b4423';c.fillRect(-2.5,12,5,10);
   c.fillStyle=XMAS.greenDeep;for(const [w,y] of [[17,16],[13,4],[9,-8]] as const){c.beginPath();c.moveTo(-w,y);c.lineTo(0,y-17);c.lineTo(w,y);c.closePath();c.fill();}
   c.fillStyle=XMAS.gold;star(c,0,-25,4.5,1.9,5);c.fill();
   c.fillStyle='#ffffff';for(const [sx,sy] of [[-24,-14],[-14,-26],[20,-20],[27,-4],[-28,4],[15,6],[-6,-34],[8,-12]] as const){c.beginPath();c.arc(sx,sy,1.7,0,Math.PI*2);c.fill();}
   c.fillStyle=XMAS.red;c.fillRect(-40,31,80,12);c.fillStyle=XMAS.goldLight;c.fillRect(-40,31,80,2.2);break;}
  case 8:{ // Purple with one big gold star.
   c.fillStyle='rgba(255,224,140,.18)';c.beginPath();c.arc(0,2,27,0,Math.PI*2);c.fill();
   star(c,0,3,25,10.5,5);c.fillStyle=XMAS.gold;c.fill();c.strokeStyle=XMAS.goldDeep;c.lineWidth=1.6;c.stroke();
   star(c,-1,1,12,5,5);c.fillStyle=XMAS.goldLight;c.fill();
   c.fillStyle='#e7d4ff';for(const [sx,sy] of [[-27,-16],[26,-18],[-22,24],[25,22]] as const){star(c,sx,sy,3,1.2,4);c.fill();}break;}
  case 9:{ // Christmas pudding: currants, white icing drips, holly on top.
   c.fillStyle='#2a1209';for(const [sx,sy] of [[-22,10],[-8,22],[12,14],[24,26],[-26,26],[2,32],[18,0],[-12,2],[30,8]] as const){c.beginPath();c.ellipse(sx,sy,2.6,2,sx*.05,0,Math.PI*2);c.fill();}
   c.fillStyle='#fffaf0';c.strokeStyle='#d9cfc0';c.lineWidth=1;c.beginPath();c.moveTo(-42,-42);c.lineTo(42,-42);c.lineTo(42,-12);
   const drips=[[34,-8],[26,-15],[17,-4],[8,-13],[-2,-6],[-12,-15],[-21,-2],[-30,-13],[-38,-7]];for(const [dx,dy] of drips)c.quadraticCurveTo(dx+4,dy+6,dx,dy);c.lineTo(-42,-12);c.closePath();c.fill();c.stroke();
   hollyLeaf(c,-1,-30,17,-2.75,XMAS.green);hollyLeaf(c,1,-30,17,-.39,'#36b065');berry(c,-4,-31,4);berry(c,4,-31,4);berry(c,0,-37,4);break;}
  case 10:{ // Grand ornament: red with gold filigree bands and jewels.
   c.fillStyle=XMAS.gold;c.fillRect(-40,-17,80,5);c.fillRect(-40,12,80,5);
   c.fillStyle=XMAS.goldLight;c.fillRect(-40,-16,80,1.5);c.fillRect(-40,13,80,1.5);
   for(let x=-36;x<=36;x+=12){c.beginPath();c.moveTo(x,-7);c.lineTo(x+5,0);c.lineTo(x,7);c.lineTo(x-5,0);c.closePath();c.fillStyle=XMAS.gold;c.fill();c.beginPath();c.arc(x+6,0,2,0,Math.PI*2);c.fillStyle='#2fb35a';c.fill();}
   c.strokeStyle=XMAS.gold;c.lineWidth=1.8;for(let x=-40;x<40;x+=10){c.beginPath();c.arc(x+5,-17,5,Math.PI,0,false);c.stroke();c.beginPath();c.arc(x+5,17,5,0,Math.PI,false);c.stroke();}
   c.fillStyle=XMAS.goldLight;for(let x=-35;x<=35;x+=10){c.beginPath();c.arc(x,-27,1.8,0,Math.PI*2);c.fill();c.beginPath();c.arc(x,27,1.8,0,Math.PI*2);c.fill();}break;}
 }
}

/** Hanging hardware above the circle (outside the body, like the original stems). */
function topper(c:Ctx,kind:Ornament['cap']){
 if(kind==='bell'){c.strokeStyle='#8a5c0c';c.lineWidth=4;c.beginPath();c.arc(0,-45,6,0,Math.PI*2);c.stroke();c.fillStyle=XMAS.red;c.beginPath();c.moveTo(0,-40);c.lineTo(-13,-47);c.lineTo(-13,-34);c.closePath();c.moveTo(0,-40);c.lineTo(13,-47);c.lineTo(13,-34);c.closePath();c.fill();c.beginPath();c.arc(0,-40,3.5,0,Math.PI*2);c.fill();return;}
 if(kind==='holly'){c.strokeStyle='#4a3218';c.lineWidth=3;c.lineCap='round';c.beginPath();c.moveTo(0,-37);c.quadraticCurveTo(-1,-44,3,-47);c.stroke();hollyLeaf(c,1,-40,26,-.45,'#2c9a55');hollyLeaf(c,-1,-40,22,-2.75,'#1f7a42');return;}
 if(kind==='cap'||kind==='crown'){
  const wide=kind==='crown'?24:16,h=kind==='crown'?9:7;
  c.strokeStyle=XMAS.goldDeep;c.lineWidth=2.6;c.beginPath();c.arc(0,-40-h-3.5,4,0,Math.PI*2);c.stroke();
  const g=c.createLinearGradient(-wide/2,0,wide/2,0);g.addColorStop(0,XMAS.goldDeep);g.addColorStop(.45,XMAS.goldLight);g.addColorStop(1,XMAS.goldDeep);
  roundRect(c,-wide/2,-40-h,wide,h+3,2);c.fillStyle=g;c.fill();c.strokeStyle='#7a5512';c.lineWidth=1;c.stroke();
  if(kind==='crown'){c.fillStyle=XMAS.gold;for(const x of [-10,0,10]){c.beginPath();c.moveTo(x-4,-40-h);c.lineTo(x,-40-h-6);c.lineTo(x+4,-40-h);c.closePath();c.fill();}}
 }
}

/** The turning layer: flat colour, motif and hanging topper, in radius-40 units at the origin. */
function paintTurning(c:Ctx,tier:number){
 const o=ORNAMENTS[tier]!;
 c.save();c.beginPath();c.arc(0,0,40,0,Math.PI*2);c.clip();c.fillStyle=o.color;c.fillRect(-40,-40,80,80);motif(c,tier);c.restore();
 topper(c,o.cap);
}
/** The fixed layer: light from the upper left, a darker rim and the specular glint, so light stays put while the ornament rolls. */
function paintLighting(c:Ctx,tier:number){
 const o=ORNAMENTS[tier]!;
 c.save();c.beginPath();c.arc(0,0,40,0,Math.PI*2);c.clip();
 const light=c.createRadialGradient(-13,-15,2,-13,-15,30);light.addColorStop(0,'rgba(255,255,255,.42)');light.addColorStop(1,'rgba(255,255,255,0)');
 c.fillStyle=light;c.fillRect(-40,-40,80,80);
 const shade=c.createRadialGradient(-10,-12,8,0,0,41);shade.addColorStop(0,withAlpha(o.deep,0));shade.addColorStop(.55,withAlpha(o.deep,0));shade.addColorStop(1,withAlpha(o.deep,.62));
 c.fillStyle=shade;c.fillRect(-40,-40,80,80);
 // Reflected light along the lower right rim reads as glass rather than paint.
 c.strokeStyle='rgba(255,255,255,.38)';c.lineWidth=3;c.lineCap='round';c.beginPath();c.arc(0,0,33,.15,1.35);c.stroke();
 c.strokeStyle='rgba(255,236,190,.22)';c.lineWidth=6;c.beginPath();c.arc(0,0,31,.25,1.2);c.stroke();
 const spec=c.createRadialGradient(-15,-19,0,-15,-19,13);spec.addColorStop(0,'rgba(255,255,255,.95)');spec.addColorStop(.6,'rgba(255,255,255,.55)');spec.addColorStop(1,'rgba(255,255,255,0)');
 c.fillStyle=spec;c.beginPath();c.ellipse(-15,-19,13,7,-.65,0,Math.PI*2);c.fill();
 c.fillStyle='rgba(255,255,255,.95)';c.beginPath();c.ellipse(-17,-21,4.5,2.2,-.65,0,Math.PI*2);c.fill();
 c.fillStyle='rgba(255,255,255,.5)';c.beginPath();c.arc(-25,-6,2.4,0,Math.PI*2);c.fill();
 c.restore();
 // The rim stroke is inset so the silhouette is exactly the physics circle.
 c.strokeStyle=o.deep;c.lineWidth=2.4;c.beginPath();c.arc(0,0,38.8,0,Math.PI*2);c.stroke();
}

// Ornaments are painted once per tier and device-pixel size, then stamped. Many
// small paths per frame are slow on software-GL canvases; one drawImage is not.
const SPAN=60; // sprite half-size in radius-40 units: room for loops, caps and holly
const sprites=new Map<string,HTMLCanvasElement>();
function sprite(kind:'turn'|'light',tier:number,pixels:number){
 const key=`${kind}:${tier}:${pixels}`;let s=sprites.get(key);
 if(!s){
  // 22 sprites per scale (11 tiers, two kinds): keep at most two scales so resizing cannot pile up large canvases.
  if(sprites.size>=44)sprites.clear();
  // Even size keeps the centre on a pixel corner; the scale is exactly `pixels` per 40 units.
  s=document.createElement('canvas');const size=2*Math.ceil(pixels*SPAN/40);s.width=s.height=size;
  const g=s.getContext('2d')!;g.setTransform(pixels/40,0,0,pixels/40,size/2,size/2);
  if(kind==='turn')paintTurning(g,tier);else paintLighting(g,tier);sprites.set(key,s);
 }
 return s;
}

/** `scale` enlarges the picture only (used by the merge pop) and reuses the sprites cached for radius r. */
export function drawOrnament(c:Ctx,tier:number,x:number,y:number,r:number,angle=0,number=false,scale=1){
 const m=c.getTransform(),pixels=Math.max(1,Math.round(r*Math.hypot(m.a,m.b)*2)/2);
 const turn=sprite('turn',tier,pixels),light=sprite('light',tier,pixels),span=turn.width/2*r/pixels;
 c.save();c.translate(x,y);if(scale!==1)c.scale(scale,scale);
 c.rotate(angle);c.drawImage(turn,-span,-span,span*2,span*2);c.rotate(-angle);
 c.drawImage(light,-span,-span,span*2,span*2);
 if(number){c.rotate(angle);c.scale(r/40,r/40);c.fillStyle='#fff8de';c.strokeStyle='#41333e';c.lineWidth=1;c.beginPath();c.arc(23,-23,10,0,Math.PI*2);c.fill();c.stroke();c.fillStyle='#41333e';c.font='bold 12px sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(String(tier+1),23,-22);}
 c.restore();
}

/* ------------------------------------------------------------------------
 * The scene: a snowy night outside a frosted, candlelit window-basket.
 * Static layers are painted once per pixel ratio and stamped; the moving
 * parts (snow, twinkling bulbs, glints, merge bursts, the hanging ornament's
 * swing) are a handful of cached sprites drawn per frame, which stays cheap
 * on software-GL canvases.
 * ---------------------------------------------------------------------- */
const BASKET={x:12,y:96,w:336,h:402,radii:[10,10,23,23]};
const BULB_COUNT=9;
const ease={outBack:(t:number)=>{const s=1.70158;return 1+(s+1)*(t-1)**3+s*(t-1)**2;},out:(t:number)=>1-(1-t)**3};

function canvasOf(w:number,h:number){const c=document.createElement('canvas');c.width=Math.max(1,Math.round(w));c.height=Math.max(1,Math.round(h));return c;}

/** Where the light string's bulbs hang: a scalloped wire across the top of the board. */
function bulbPoint(i:number,width:number){const x=(i+.5)*width/BULB_COUNT;return {x,y:13};}
function wireY(x:number,width:number){const span=width/BULB_COUNT,t=((x%span)+span)%span/span;return 3+Math.sin(t*Math.PI)*9;}

function paintSky(g:Ctx,width:number,height:number){
 const sky=g.createLinearGradient(0,0,0,height);sky.addColorStop(0,'#0a1532');sky.addColorStop(.45,'#13295a');sky.addColorStop(1,'#20457c');
 g.fillStyle=sky;g.fillRect(0,0,width,height);
 // A low moon glow behind the drop zone, then a crescent.
 const glow=g.createRadialGradient(306,46,4,306,46,90);glow.addColorStop(0,'rgba(255,240,200,.32)');glow.addColorStop(1,'rgba(255,240,200,0)');
 g.fillStyle=glow;g.fillRect(0,0,width,180);
 g.save();g.beginPath();g.arc(306,46,13,0,Math.PI*2);g.clip();g.beginPath();g.arc(306,46,13,0,Math.PI*2);g.arc(313,40,11.5,0,Math.PI*2);g.fillStyle='#fff4d6';g.fill('evenodd');g.restore();
 // Stars, deterministic.
 for(let i=0;i<70;i++){const x=hash(i*3+1)*width,y=hash(i*3+2)*height*.9,s=.5+hash(i*3+3)*1.1;g.fillStyle=`rgba(255,255,255,${.25+hash(i*7)*.55})`;g.beginPath();g.arc(x,y,s,0,Math.PI*2);g.fill();}
 for(const [x,y] of [[40,40],[222,30],[150,62],[338,84]] as const){g.fillStyle='rgba(255,250,230,.85)';star(g,x,y,3.4,.9,4,0);g.fill();}
 // Warm out-of-focus lights.
 for(let i=0;i<9;i++){const x=hash(i+40)*width,y=60+hash(i+50)*(height-80),r=10+hash(i+60)*18,col=BULBS[i%BULBS.length]!;
  const b=g.createRadialGradient(x,y,0,x,y,r);b.addColorStop(0,withAlpha(col,.22));b.addColorStop(1,withAlpha(col,0));g.fillStyle=b;g.fillRect(x-r,y-r,r*2,r*2);}
 // Snow on the ground beneath the basket.
 g.fillStyle='#e9f1fa';g.beginPath();g.moveTo(0,height);g.lineTo(0,494);for(let x=0;x<=width;x+=30)g.quadraticCurveTo(x+15,486+hash(x)*6,x+30,494);g.lineTo(width,height);g.closePath();g.fill();
}

function paintWire(g:Ctx,width:number){
 g.strokeStyle='#0f2a1c';g.lineWidth=1.6;g.beginPath();for(let x=-2;x<=width+2;x+=2){const y=wireY(x,width);if(x<=-2)g.moveTo(x,y);else g.lineTo(x,y);}g.stroke();
 for(let i=0;i<BULB_COUNT;i++){const p=bulbPoint(i,width);drawBulb(g,p.x,p.y-1,7,BULBS[i%BULBS.length]!,Math.PI/2,false);}
}

function basketPath(g:Ctx,inset=0){const {x,y,w,h,radii}=BASKET;g.roundRect(x+inset,y+inset,w-inset*2,h-inset*2,radii.map(r=>Math.max(0,r-inset)));}

/** Pine needles along a gentle curve, with small baubles tucked in. */
function paintGarland(g:Ctx){
 const y0=95,at=(x:number)=>y0+Math.sin(x/34)*1.6;
 for(let layer=0;layer<3;layer++){
  const col=['#0d3b24','#17603a','#2a8a52'][layer]!;g.strokeStyle=col;g.lineWidth=1.6;g.lineCap='round';g.beginPath();
  for(let x=8;x<=352;x+=2.2){const k=x*13+layer*977,a=(hash(k)-.5)*2.6+(hash(k+1)>.5?Math.PI:0),len=5+hash(k+2)*4-layer;const y=at(x)+(hash(k+3)-.5)*4;g.moveTo(x,y);g.lineTo(x+Math.cos(a)*len,y+Math.sin(a)*len*.8);}
  g.stroke();
 }
 drawSnowCap(g,8,92,344,4.5,11);
 const cols=[XMAS.red,XMAS.gold,'#2f8fe0',XMAS.red,'#b45cd6',XMAS.gold,'#2f8fe0'];
 for(let i=0;i<7;i++){const x=64+i*39;drawBauble(g,x,at(x)+6,4.4,cols[i]!,undefined,(hash(i+90)-.5)*.5);}
}

function paintFrost(g:Ctx){
 const {x,y,w,h}=BASKET;
 for(const [cx,cy,r] of [[x,y,110],[x+w,y,110],[x,y+h,90],[x+w,y+h,90]] as const){const f=g.createRadialGradient(cx,cy,0,cx,cy,r);f.addColorStop(0,'rgba(255,255,255,.75)');f.addColorStop(.5,'rgba(240,248,255,.25)');f.addColorStop(1,'rgba(240,248,255,0)');g.fillStyle=f;g.fillRect(cx-r,cy-r,r*2,r*2);}
 for(let i=0;i<26;i++){const corner=i%4,cx=corner%2?x+w-12-hash(i)*48:x+12+hash(i)*48,cy=corner<2?y+16+hash(i+30)*44:y+h-14-hash(i+30)*38;drawSnowflake(g,cx,cy,2+hash(i+60)*3.5,'#ffffff',.55+hash(i+70)*.35);}
}

function paintBasket(g:Ctx){
 const {x,y,w,h}=BASKET;
 // Frosted glass: translucent so the falling snow shows faintly behind it.
 g.save();g.beginPath();basketPath(g,4.5);g.clip();
 const glass=g.createLinearGradient(0,y,0,y+h);glass.addColorStop(0,'rgba(226,238,250,.86)');glass.addColorStop(.55,'rgba(244,246,248,.9)');glass.addColorStop(1,'rgba(255,243,224,.95)');
 g.fillStyle=glass;g.fillRect(x,y,w,h);
 const candle=g.createRadialGradient(180,y+h,10,180,y+h,260);candle.addColorStop(0,'rgba(255,200,120,.32)');candle.addColorStop(1,'rgba(255,200,120,0)');g.fillStyle=candle;g.fillRect(x,y,w,h);
 // A soft diagonal reflection across the glass.
 g.save();g.translate(x+60,y);g.rotate(.32);const sheen=g.createLinearGradient(0,0,46,0);sheen.addColorStop(0,'rgba(255,255,255,0)');sheen.addColorStop(.5,'rgba(255,255,255,.35)');sheen.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=sheen;g.fillRect(0,-40,46,h+80);g.fillRect(58,-40,12,h+80);g.restore();
 paintFrost(g);
 // Inner shadow so the glass reads as recessed.
 g.strokeStyle='rgba(40,60,100,.16)';g.lineWidth=7;g.beginPath();basketPath(g,4.5);g.stroke();
 g.restore();
 // Candy-cane frame: white band with diagonal red stripes, outlined.
 g.save();g.beginPath();basketPath(g,-4.5);basketPath(g,4.5);g.clip('evenodd');
 g.fillStyle='#fffaf2';g.fillRect(0,0,360,520);
 g.fillStyle=XMAS.red;for(let k=-520;k<720;k+=16){g.beginPath();g.moveTo(k,0);g.lineTo(k+8,0);g.lineTo(k+8-520,520);g.lineTo(k-520,520);g.closePath();g.fill();}
 const shade=g.createLinearGradient(0,0,360,0);shade.addColorStop(0,'rgba(0,0,0,.12)');shade.addColorStop(.5,'rgba(255,255,255,.12)');shade.addColorStop(1,'rgba(0,0,0,.14)');g.fillStyle=shade;g.fillRect(0,0,360,520);
 g.restore();
 g.lineWidth=1.4;g.strokeStyle='#6e1220';g.beginPath();basketPath(g,-4.5);g.stroke();g.beginPath();basketPath(g,4.5);g.stroke();
 g.strokeStyle='rgba(255,255,255,.55)';g.lineWidth=1;g.beginPath();basketPath(g,-3);g.stroke();
 g.strokeStyle=XMAS.goldLight;g.lineWidth=1.2;g.beginPath();basketPath(g,6.5);g.stroke();
 paintGarland(g);
 for(const [hx,flip] of [[22,1],[338,-1]] as const){g.save();g.translate(hx,96);g.scale(flip,1);hollyLeaf(g,0,0,19,-2.7,XMAS.green);hollyLeaf(g,0,0,19,-.25,'#36b065');berry(g,-2,1,3.8);berry(g,4,2,3.8);berry(g,1,-4,3.8);g.restore();}
}

/** The basket's lip along the floor: a red velvet ribbon with gold piping and a bow at the centre. */
export function drawFestiveRim(c:Ctx,floor:number){
 c.lineCap='round';c.strokeStyle=XMAS.redDark;c.lineWidth=10;c.beginPath();c.moveTo(17,floor+7);c.quadraticCurveTo(180,floor+15,343,floor+7);c.stroke();
 c.strokeStyle=XMAS.red;c.lineWidth=7;c.beginPath();c.moveTo(17,floor+6);c.quadraticCurveTo(180,floor+14,343,floor+6);c.stroke();
 c.strokeStyle=XMAS.goldLight;c.lineWidth=2.4;c.beginPath();c.moveTo(20,floor+3.5);c.quadraticCurveTo(180,floor+11,340,floor+3.5);c.stroke();
}

/* Cached sprites ---------------------------------------------------------- */
const fx=new Map<string,HTMLCanvasElement>();
function cached(key:string,size:number,paint:(g:Ctx,s:number)=>void){
 let s=fx.get(key);if(!s){s=canvasOf(size,size);const g=s.getContext('2d')!;paint(g,size);fx.set(key,s);}return s;
}
const flakeSprite=()=>cached('flake',32,(g,s)=>{const r=s/2,f=g.createRadialGradient(r,r,0,r,r,r);f.addColorStop(0,'rgba(255,255,255,1)');f.addColorStop(.35,'rgba(255,255,255,.85)');f.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=f;g.fillRect(0,0,s,s);});
const glowSprite=(color:string)=>cached(`glow:${color}`,64,(g,s)=>{const r=s/2,f=g.createRadialGradient(r,r,0,r,r,r);f.addColorStop(0,withAlpha(color,.85));f.addColorStop(.25,withAlpha(color,.4));f.addColorStop(1,withAlpha(color,0));g.fillStyle=f;g.fillRect(0,0,s,s);});
const sparkleSprite=(color:string)=>cached(`spark:${color}`,48,(g,s)=>{const r=s/2,f=g.createRadialGradient(r,r,0,r,r,r*.6);f.addColorStop(0,withAlpha(color,.7));f.addColorStop(1,withAlpha(color,0));g.fillStyle=f;g.fillRect(0,0,s,s);
 g.fillStyle='#ffffff';star(g,r,r,r*.95,r*.14,4,0);g.fill();g.fillStyle=color;star(g,r,r,r*.55,r*.1,4,Math.PI/4);g.globalAlpha=.9;g.fill();g.globalAlpha=1;g.fillStyle='#ffffff';g.beginPath();g.arc(r,r,r*.12,0,Math.PI*2);g.fill();});

interface Layers {key:string;sky:HTMLCanvasElement;basket:HTMLCanvasElement}
let layers:Layers|undefined;
function sceneLayers(width:number,height:number,ratio:number){
 const key=`${width}x${height}@${ratio}`;
 if(layers?.key!==key){
  const make=(paint:(g:Ctx)=>void)=>{const c=canvasOf(width*ratio,height*ratio),g=c.getContext('2d')!;g.setTransform(ratio,0,0,ratio,0,0);paint(g);return c;};
  layers={key,sky:make(g=>{paintSky(g,width,height);}),basket:make(g=>{paintBasket(g);paintWire(g,width);})};
 }
 return layers;
}
/** Kept for callers that only want the still picture (the board, lights and basket). */
export function festiveBackdrop(width:number,height:number,ratio:number){
 const l=sceneLayers(width,height,ratio),c=canvasOf(width*ratio,height*ratio),g=c.getContext('2d')!;g.drawImage(l.sky,0,0);g.drawImage(l.basket,0,0);return c;
}

/* The animated scene --------------------------------------------------------- */
interface Flake {x:number;y:number;r:number;speed:number;drift:number;phase:number;alpha:number}
interface Burst {x:number;y:number;r:number;tier:number;age:number;sparks:{a:number;v:number;spin:number;size:number;color:string}[]}
interface Glint {x:number;y:number;size:number;age:number}
interface Hanging {tier:number;x:number;y:number;r:number;alpha:number;number:boolean}
interface SceneFruit {id:number;tier:number;x:number;y:number;r:number}

export class FestiveScene {
 private time=0;private flakes:Flake[]=[];private bursts:Burst[]=[];private glints:Glint[]=[];private pops=new Map<number,number>();
 private swing=0;private swingV=0;private lastAim:number|undefined;private glintClock=0;private glintSeed=1;
 constructor(private width:number,private height:number){
  for(let i=0;i<54;i++){const near=hash(i+400)>.72;this.flakes.push({x:hash(i+100)*width,y:hash(i+200)*height,r:near?2.2+hash(i+300)*1.6:.9+hash(i+300)*1.2,speed:near?.75+hash(i+500)*.35:.3+hash(i+500)*.3,drift:4+hash(i+600)*10,phase:hash(i+700)*Math.PI*2,alpha:near?.9:.55+hash(i+800)*.3});}
 }
 reset(){this.bursts=[];this.glints=[];this.pops.clear();this.swing=0;this.swingV=0;this.lastAim=undefined;}
 /** One fixed physics step (ms). `fruits` lets the scene pick ornaments to glint. */
 step(dt:number,aim:number,fruits:readonly SceneFruit[],still:boolean){
  this.time+=dt;
  if(still){this.bursts=[];this.glints=[];this.pops.clear();this.swing=0;this.swingV=0;this.lastAim=aim;return;}
  for(const f of this.flakes){f.y+=f.speed*dt/16.7;if(f.y>this.height+4){f.y=-4;f.x=(f.x+97)%this.width;}}
  // The hanging ornament swings against the aim's motion, then settles with a gentle idle sway.
  const moved=this.lastAim===undefined?0:aim-this.lastAim;this.lastAim=aim;
  this.swingV+=-moved*.0045-this.swing*.035;this.swingV*=.9;this.swing=Math.max(-.5,Math.min(.5,this.swing+this.swingV));
  for(const b of this.bursts)b.age+=dt;this.bursts=this.bursts.filter(b=>b.age<700);
  for(const g of this.glints)g.age+=dt;this.glints=this.glints.filter(g=>g.age<650);
  for(const [id,t] of this.pops)if(this.time-t>420)this.pops.delete(id);
  this.glintClock+=dt;
  if(this.glintClock>520&&fruits.length){this.glintClock=0;const f=fruits[Math.floor(hash(this.glintSeed++)*fruits.length)]!;if(f.r>=18)this.glints.push({x:f.x-f.r*.38,y:f.y-f.r*.47,size:Math.min(16,6+f.r*.14),age:0});}
 }
 merged(x:number,y:number,tier:number,r:number,id:number|undefined){
  if(id!==undefined)this.pops.set(id,this.time);
  const palette=[ORNAMENTS[tier]!.color,XMAS.goldLight,'#ffffff'];
  const sparks=Array.from({length:12},(_,i)=>({a:i*Math.PI/6+hash(this.time+i)*.4,v:.9+hash(this.time*3+i)*.8,spin:(hash(i+this.time)-.5)*.02,size:7+hash(this.time+i*7)*7,color:palette[i%3]!}));
  this.bursts.push({x,y,r,tier,age:0,sparks});if(this.bursts.length>8)this.bursts.shift();
 }
 /** Visual scale for a freshly merged ornament: it springs out of the flash. */
 scale(id:number){const t=this.pops.get(id);if(t===undefined)return 1;const p=Math.min(1,(this.time-t)/380);return .55+.45*ease.outBack(p);}
 /** Sky, snow, twinkling lights and the glass basket. */
 drawBack(c:Ctx,ratio:number,reduced:boolean){
  const l=sceneLayers(this.width,this.height,ratio);
  c.drawImage(l.sky,0,0,this.width,this.height);
  const flake=flakeSprite();
  for(const f of this.flakes){const x=f.x+(reduced?0:Math.sin(this.time*.0011+f.phase)*f.drift);c.globalAlpha=f.alpha;c.drawImage(flake,x-f.r*1.6,f.y-f.r*1.6,f.r*3.2,f.r*3.2);}
  c.globalAlpha=1;
  c.drawImage(l.basket,0,0,this.width,this.height);
  // Bulb halos twinkle in a slow chase.
  c.globalCompositeOperation='lighter';
  for(let i=0;i<BULB_COUNT;i++){const p=bulbPoint(i,this.width),col=BULBS[i%BULBS.length]!,tw=reduced?.75:.55+.45*(.5+.5*Math.sin(this.time*.003-i*.9));c.globalAlpha=tw;const s=24+tw*10;c.drawImage(glowSprite(col),p.x-s/2,p.y+4-s/2,s,s);}
  c.globalCompositeOperation='source-over';c.globalAlpha=1;
 }
 /** The danger line as a gold bead-chain; it glows red while a pile sits above it. */
 drawDanger(c:Ctx,left:number,right:number,y:number,hot:boolean){
  if(hot){const pulse=.5+.5*Math.sin(this.time*.012);c.fillStyle=`rgba(232,50,63,${.12+.14*pulse})`;c.fillRect(left,y-6,right-left,12);}
  c.fillStyle=hot?'#e8323f':'rgba(200,150,60,.75)';for(let x=left+4;x<=right-4;x+=7){c.beginPath();c.arc(x,y,hot?1.8:1.4,0,Math.PI*2);c.fill();}
 }
 /** The ornament waiting to drop, hung from the light string on a gold thread. */
 drawHanging(c:Ctx,h:Hanging,reduced:boolean,paint:(c:Ctx,tier:number,x:number,y:number,r:number,angle:number,number:boolean)=>void){
  const angle=reduced?0:this.swing+Math.sin(this.time*.0019)*.035;
  const top=wireY(h.x,this.width)+1,hookOffset=h.r*1.33;
  const len=Math.max(4,h.y-hookOffset-top);
  const hx=h.x+Math.sin(angle)*len,hy=top+Math.cos(angle)*len;
  const cx=hx+Math.sin(angle)*hookOffset,cy=hy+Math.cos(angle)*hookOffset;
  c.globalAlpha=h.alpha;c.strokeStyle=XMAS.goldDeep;c.lineWidth=1.1;c.beginPath();c.moveTo(h.x,top);c.lineTo(hx,hy);c.stroke();
  paint(c,h.tier,cx,cy,h.r,-angle,h.number);c.globalAlpha=1;
 }
 /** Merge bursts and the little glints that travel across the pile. */
 drawFront(c:Ctx){
  c.globalCompositeOperation='lighter';
  for(const b of this.bursts){
   const p=b.age/700,col=ORNAMENTS[b.tier]!.color;
   if(p<.45){const q=p/.45,s=b.r*(1.6+q*1.4);c.globalAlpha=(1-q)*.85;c.drawImage(glowSprite(col),b.x-s,b.y-s,s*2,s*2);}
   c.globalAlpha=Math.max(0,1-p*1.4);c.strokeStyle=XMAS.goldLight;c.lineWidth=3*(1-p)+.5;c.beginPath();c.arc(b.x,b.y,b.r*(1+ease.out(p)*.7),0,Math.PI*2);c.stroke();
   for(const s of b.sparks){const d=b.r*.6+ease.out(p)*(b.r*.9+34*s.v),x=b.x+Math.cos(s.a)*d,y=b.y+Math.sin(s.a)*d+p*p*30,size=s.size*(1-p*.7);
    c.globalAlpha=Math.max(0,1-p);c.save();c.translate(x,y);c.rotate(s.spin*b.age);c.drawImage(sparkleSprite(s.color),-size,-size,size*2,size*2);c.restore();}
  }
  for(const g of this.glints){const p=g.age/650,k=Math.sin(p*Math.PI),s=g.size*k;c.globalAlpha=k;c.save();c.translate(g.x,g.y);c.rotate(p*1.2);c.drawImage(sparkleSprite('#fff4c2'),-s,-s,s*2,s*2);c.restore();}
  c.globalCompositeOperation='source-over';c.globalAlpha=1;
 }
}

/** The floating "+points" label: gold, outlined, with a quick pop. */
export function drawFestiveFlash(c:Ctx,text:string,x:number,y:number,life:number){
 const age=750-life,pop=age<160?.6+.4*ease.outBack(age/160):1;
 c.save();c.globalAlpha=Math.min(1,life/200);c.translate(x,y);c.scale(pop,pop);
 c.font='900 22px system-ui,sans-serif';c.textAlign='center';c.textBaseline='middle';c.lineJoin='round';
 c.strokeStyle=XMAS.redDark;c.lineWidth=6;c.strokeText(text,0,0);
 const g=c.createLinearGradient(0,-11,0,11);g.addColorStop(0,'#fff6cf');g.addColorStop(.5,XMAS.goldLight);g.addColorStop(1,XMAS.gold);c.fillStyle=g;c.fillText(text,0,0);
 c.restore();
}
