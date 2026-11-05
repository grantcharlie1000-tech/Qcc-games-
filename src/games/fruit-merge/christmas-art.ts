/**
 * Christmas ornaments for the eleven merge tiers. Presentation only: every
 * ornament's round body fills exactly the physics circle (radius r) and never
 * spills past it. Hanging loops, caps and holly sit above the circle, the same
 * way the original fruit stems and leaves did. Each tier has its own colour
 * family AND its own motif, so tiers stay distinct without relying on hue.
 */
import {XMAS,withAlpha,drawSnowflake,drawSnowCap,drawLightString,roundRect} from '../../festive/art';

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
 c.fillStyle='rgba(255,255,255,.72)';c.beginPath();c.ellipse(-15,-19,11,5.5,-.65,0,Math.PI*2);c.fill();
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
  if(sprites.size>160)sprites.clear();
  // Even size keeps the centre on a pixel corner; the scale is exactly `pixels` per 40 units.
  s=document.createElement('canvas');const size=2*Math.ceil(pixels*SPAN/40);s.width=s.height=size;
  const g=s.getContext('2d')!;g.setTransform(pixels/40,0,0,pixels/40,size/2,size/2);
  if(kind==='turn')paintTurning(g,tier);else paintLighting(g,tier);sprites.set(key,s);
 }
 return s;
}

export function drawOrnament(c:Ctx,tier:number,x:number,y:number,r:number,angle=0,number=false){
 const m=c.getTransform(),pixels=Math.max(1,Math.round(r*Math.hypot(m.a,m.b)*2)/2);
 const turn=sprite('turn',tier,pixels),light=sprite('light',tier,pixels),span=turn.width/2*r/pixels;
 c.save();c.translate(x,y);
 c.rotate(angle);c.drawImage(turn,-span,-span,span*2,span*2);c.rotate(-angle);
 c.drawImage(light,-span,-span,span*2,span*2);
 if(number){c.rotate(angle);c.scale(r/40,r/40);c.fillStyle='#fff8de';c.strokeStyle='#41333e';c.lineWidth=1;c.beginPath();c.arc(23,-23,10,0,Math.PI*2);c.fill();c.stroke();c.fillStyle='#41333e';c.font='bold 12px sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(String(tier+1),23,-22);}
 c.restore();
}

/** The basket's surroundings: the original 32px checkerboard geometry, re-coloured as frosted snow with flakes. */
export const SNOW_BASE='#f8f6f1';
const SNOW_CHECK='#e8eff5';
function drawSnowBoard(c:Ctx,width:number,height:number){
 c.fillStyle=SNOW_BASE;c.fillRect(0,0,width,height);
 c.fillStyle=SNOW_CHECK;for(let y=90;y<height;y+=32)for(let x=0;x<width;x+=32)if((x/32+(y-90)/32)%2===0)c.fillRect(x,y,32,32);
 for(let y=90;y<height;y+=64)for(let x=32;x<width;x+=64)drawSnowflake(c,x+16,y+16,5.5,'#a9c2d6',.7);
}

/** Snowy basket: evergreen frame, frosted interior, snow on the rim and a holly sprig in each top corner. */
function drawFestiveBasket(c:Ctx){
 c.fillStyle='#fdfeff';c.strokeStyle=XMAS.greenDeep;c.lineWidth=5;c.beginPath();c.roundRect(12,96,336,402,[10,10,23,23]);c.fill();c.stroke();
 c.strokeStyle=XMAS.goldLight;c.lineWidth=1.4;c.beginPath();c.roundRect(16.5,100.5,327,393,[7,7,19,19]);c.stroke();
 drawSnowCap(c,10,95,340,6,7);
 for(const [hx,flip] of [[24,1],[336,-1]] as const){c.save();c.translate(hx,94);c.scale(flip,1);hollyLeaf(c,0,0,17,-2.7,XMAS.green);hollyLeaf(c,0,0,17,-.25,'#36b065');berry(c,-2,1,3.6);berry(c,4,2,3.6);berry(c,1,-4,3.6);c.restore();}
}
/** The basket's lip along the floor: a red ribbon with a gold edge. */
export function drawFestiveRim(c:Ctx,floor:number){
 c.lineCap='round';c.strokeStyle=XMAS.redDeep;c.lineWidth=8;c.beginPath();c.moveTo(17,floor+7);c.quadraticCurveTo(180,floor+15,343,floor+7);c.stroke();
 c.strokeStyle=XMAS.goldLight;c.lineWidth=3;c.beginPath();c.moveTo(20,floor+5);c.lineTo(340,floor+5);c.stroke();
}

/** Board, lights and basket never change during play: paint them once per pixel ratio. */
let backdrop:{canvas:HTMLCanvasElement;key:string}|undefined;
export function festiveBackdrop(width:number,height:number,ratio:number){
 const key=`${width}x${height}@${ratio}`;
 if(backdrop?.key!==key){
  const canvas=document.createElement('canvas');canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);
  const g=canvas.getContext('2d')!;g.setTransform(ratio,0,0,ratio,0,0);
  drawSnowBoard(g,width,height);drawLightString(g,-8,3,width+8,3,10,6.5,7,1);drawFestiveBasket(g);
  backdrop={canvas,key};
 }
 return backdrop.canvas;
}
