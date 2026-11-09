import {WORLDS,type Level} from './levels';
import {tree} from './environment-art';
type C=CanvasRenderingContext2D;
type Kind='canopy'|'glasshouse'|'aqueduct'|'mountain'|'monastery'|'observatory'|'spire';
const cache=new Map<string,HTMLCanvasElement>();
const noise=(a:number,b:number)=>Math.abs(Math.sin(a*71.31+b*193.7)*19341.73)%1;
function r(c:C,k:string,x:number,y:number,w:number,h:number){c.fillStyle=k;c.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));}
function line(c:C,k:string,x:number,y:number,xx:number,yy:number,width=1){
 x=Math.round(x);y=Math.round(y);xx=Math.round(xx);yy=Math.round(yy);const dx=Math.abs(xx-x),sx=x<xx?1:-1,dy=-Math.abs(yy-y),sy=y<yy?1:-1;let e=dx+dy;
 for(;;){r(c,k,x,y,width,width);if(x===xx&&y===yy)break;const q=e*2;if(q>=dy){e+=dy;x+=sx;}if(q<=dx){e+=dx;y+=sy;}}
}
function poly(c:C,k:string,p:number[]){
 let lo=Infinity,hi=-Infinity;for(let i=1;i<p.length;i+=2){lo=Math.min(lo,p[i]);hi=Math.max(hi,p[i]);}
 for(let y=Math.ceil(lo);y<hi;y++){const xs:number[]=[];for(let i=0,j=p.length-2;i<p.length;j=i,i+=2){if((p[i+1]<=y&&p[j+1]>y)||(p[j+1]<=y&&p[i+1]>y))xs.push(p[i]+(y-p[i+1])*(p[j]-p[i])/(p[j+1]-p[i+1]));}xs.sort((a,b)=>a-b);for(let i=0;i+1<xs.length;i+=2)r(c,k,Math.ceil(xs[i]),y,Math.floor(xs[i+1])-Math.ceil(xs[i])+1,1);}
}
function arch(c:C,x:number,y:number,w:number,h:number,k:string){for(let row=0;row<h;row++){const radius=w/2,yy=radius-row,half=row<radius?Math.floor(Math.sqrt(Math.max(0,radius*radius-yy*yy))):radius;r(c,k,x+radius-half,y+row,half*2,1);}}
function wall(c:C,x:number,y:number,w:number,h:number,world:number,seed=0){
 const a=WORLDS[world];r(c,a.far,x,y,w,h);r(c,a.sky+'80',x+w-7,y,7,h);
 for(let row=0;row<h/9;row++)for(let col=-1;col<w/20;col++){
  const xx=x+col*20+(row%2)*10,yy=y+row*9,left=Math.max(x+1,xx+1),right=Math.min(x+w-1,xx+19);if(right<=left)continue;
  r(c,a.near,left,yy+1,right-left,7);r(c,a.edge+'30',left+1,yy+1,Math.max(1,right-left-2),1);r(c,a.sky+'70',left,yy+7,right-left,1);
  if(noise(col+seed,row)>.63){r(c,a.edge+'20',left+3,yy+3,3,1);r(c,a.sky+'60',right-4,yy+5,2,1);}
 }
}
function win(c:C,x:number,y:number,w:number,h:number,world:number,lit=true){
 const a=WORLDS[world];arch(c,x-2,y-2,w+4,h+4,a.near);arch(c,x,y,w,h,a.sky);arch(c,x+2,y+2,w-4,h-4,lit?'#a79168':'#4f6871');
 r(c,lit?'#dcc58c':'#879f9c',x+2,y+4,2,h-7);r(c,a.sky,x+w/2,y+3,1,h-4);r(c,a.sky,x+1,y+h*.58,w-2,1);r(c,a.edge+'66',x-3,y+h+1,w+6,1);r(c,a.sky+'a0',x-2,y+h+2,w+4,2);
}
function cornice(c:C,x:number,y:number,w:number,world:number){const a=WORLDS[world];r(c,a.sky,x-3,y,w+6,5);r(c,a.edge+'77',x-2,y,w+4,1);r(c,a.near,x-1,y+1,w+2,2);for(let i=x+5;i<x+w-3;i+=13){r(c,a.near,i,y+4,4,5);r(c,a.edge+'35',i,y+4,1,4);}}
function canopy(c:C){
 tree(c,86,218,0,5,1.7,false);tree(c,171,236,0,13,1.1,false);
 // Branches and leaves use the same drawing routine as the playable streets.
}
function glasshouse(c:C,world:number){
 const a=WORLDS[world];wall(c,29,126,211,104,world,3);
 // A domed glass roof is built from the same bronze, glass and stone ramps
 // as the native-pixel doors and machinery, with no photographic texture.
 for(let y=35;y<128;y++){
  const yy=(127-y)/92,half=Math.floor(Math.sqrt(Math.max(0,1-yy*yy))*82);
  r(c,'#182e36',134-half,y,half*2,1);r(c,'#31524c',136-half,y,Math.max(0,half*2-4),1);
  if(y<100)r(c,'#557c6844',140-half,y,Math.max(0,half*.7),1);
 }
 // Interior ferns and sparse amber panes remain darker than playable edges.
 for(let i=0;i<8;i++){
  const x=67+i*19,top=91+noise(i,4)*19;r(c,'#607d55',x,top,2,126-top);
  for(let j=0;j<3;j++){line(c,'#78926a',x,top+j*7,x-8,top+j*7-5);line(c,'#446c50',x+1,top+j*7+3,x+9,top+j*7-3);}
 }
 for(const xx of [-76,-57,-31,0,31,57,76]){
  let oldX=134,oldY=35;for(let y=36;y<=126;y++){const p=(y-35)/91,x=134+xx*Math.sqrt(Math.max(0,1-(1-p)**2));line(c,'#81927c',oldX,oldY,x,y);oldX=x;oldY=y;}
 }
 for(const y of [65,93,124]){const half=Math.floor(Math.sqrt(1-((127-y)/92)**2)*82);r(c,'#82947a',134-half,y,half*2,1);r(c,'#203d3c',134-half,y+1,half*2,1);}
 // Broken glass reflections stay within individual panes; bronze joints have
 // the same small fasteners and upper-left bevel as the street fixtures.
 for(const [x,y] of [[96,62],[78,88],[148,69],[174,95]]){line(c,'#89a58b66',x,y,x+6,y+8);line(c,'#608b7c55',x+3,y+1,x+9,y+9);r(c,'#c4c9a966',x,y,2,1);}
 for(const [x,y] of [[67,93],[103,65],[134,65],[166,93],[201,124]]){r(c,'#243f3d',x-1,y-1,3,3);r(c,'#b3b18a',x-1,y-1,2,1);}
 for(const [x,w] of [[8,45],[215,45]]){
  arch(c,x,102,w,74,'#2a4744');for(const xx of [x+6,x+22,x+38]){r(c,'#5c7a67',xx,116,1,58);r(c,'#84917a',xx,116,1,2);}cornice(c,x,151,w,world);
  for(let i=0;i<2;i++)win(c,x+7+i*19,164,10,25,world,i===0);
 }
 cornice(c,26,126,217,world);cornice(c,26,184,217,world);
 for(let i=0;i<8;i++){const x=41+i*25;win(c,x,142,11,29,world,i%3===1);r(c,a.near,x-7,135,3,48);r(c,a.edge+'45',x-7,135,1,43);}
 r(c,'#183139',130,21,9,15);r(c,'#7f9078',131,22,6,12);poly(c,'#a7ac82',[125,23,134,13,143,23]);r(c,'#c4b98a',134,6,1,8);
 for(let i=0;i<24;i++){const x=30+noise(i,4)*200,y=191+noise(i,8)*25;r(c,i%3?'#456951':'#6c865c',x,y,4,2);r(c,'#273f37',x+2,y+2,3,2);}
}
function aqueduct(c:C,world:number){
 const a=WORLDS[world];for(let i=0;i<5;i++){
  const x=i*62;wall(c,x,51,11,144,world,i);for(let yy=13;yy<52;yy++){const dy=51-yy,half=Math.sqrt(Math.max(0,29*29-dy*dy));if(half<1)continue;r(c,a.near,x+36-half,yy,half*2,3);r(c,a.edge+'27',x+36-half,yy,half*2,1);}
 }cornice(c,0,18,310,world);
}
function mountain(c:C,seed:number){
 const h=330,w=430,ridge:number[]=[];
 // An irregular continuous crest, overlapping shoulders and scree strata;
 // no repeated pyramids. Every edge is rasterised on the game's pixel grid.
 const knots=[250,208,215,165,143,159,95,117,64,78,35,54,69,109,97,151,167,145,193,181,220,234,256];
 for(let x=0;x<w;x++){
  const index=x/(w-1)*(knots.length-1),lo=Math.floor(index),f=index-lo;
  const y=knots[lo]+((knots[lo+1]??knots[lo])-knots[lo])*f+Math.sin(x*.29+seed)*2+Math.sin(x*.073)*3;ridge.push(y);
  r(c,'#2b435e',x,y,1,h-y);
  const light=x<185;r(c,light?'#496781':'#35536e',x,y+3,1,h-y-3);
  const snow=Math.max(2,13+Math.sin(x*.16)*9-(Math.abs(knots[lo+1]-knots[lo])||0)*.22);
  r(c,light?'#8daab8':'#6d8da4',x,y+1,1,snow);r(c,'#b4c7cd',x,y,1,1);
 }
 c.save();c.beginPath();c.moveTo(0,h);for(let x=0;x<w;x++)c.lineTo(x,ridge[x]);c.lineTo(w-1,h);c.closePath();c.clip();
 poly(c,'#395974',[110,95,176,45,169,103,196,146,187,203,217,330,124,330,148,238,118,178,137,137]);
 poly(c,'#29445f',[190,40,217,71,242,103,239,132,275,169,269,212,314,330,225,330,212,228,217,181,193,141,204,103]);
 poly(c,'#56758b',[111,100,143,71,139,107,152,131,137,158,141,186,126,205,113,238,99,246,119,196,117,167,128,139,119,124]);
 poly(c,'#9db6c0',[176,45,165,75,158,91,165,103,151,117,154,130,142,147,145,160,128,181,133,159,129,147,141,131,137,116,151,97,149,85]);
 poly(c,'#829faf',[190,40,192,74,204,99,198,113,209,139,203,147,186,111,193,99,183,77]);
 poly(c,'#6a899d',[262,149,271,162,268,181,279,199,274,210,287,236,280,242,262,207,266,196,258,181]);
 for(let i=0;i<132;i++){
  const x=8+noise(i,seed)*411,y=ridge[Math.floor(x)]+19+noise(i,seed+4)*170,len=5+noise(i,7)*16;
  line(c,i%4===0?'#829dab':i%2?'#263e59':'#58778c',x,y,x+len*.7,y-2);line(c,i%4===0?'#9cb2bd':'#39556f',x+len*.7,y-2,x+len,y+1);
  if(i%3===0){line(c,'#1f3651',x,y,x+5,y+12);line(c,'#1f3651',x+5,y+12,x+2,y+19);}
 }
 for(let i=0;i<9;i++){const x=40+i*42,y=ridge[x]+12;line(c,'#9db6c2',x,y,x-6,y+23);line(c,'#7d9aac',x-6,y+23,x-16,y+32);}
 c.restore();
}
function monastery(c:C,world:number){
 const a=WORLDS[world];poly(c,'#2b4358',[7,160,36,146,199,147,222,169,205,197,178,205,173,242,132,261,114,299,85,263,55,237,43,196,19,192]);
 poly(c,'#57717f',[23,159,54,149,191,150,204,166,174,171,165,185,136,181,119,200,75,191,56,177,31,179]);
 for(let i=0;i<26;i++){const x=39+noise(i,4)*148,y=183+noise(i,7)*61;r(c,i%3?'#6f87904d':'#1f354d80',x,y,5+noise(i,8)*9,1);}
 wall(c,37,106,159,55,world,2);poly(c,a.sky,[29,106,47,92,179,92,204,106]);line(c,'#a8bfc5',30,105,47,92);line(c,'#a8bfc5',47,92,178,92);line(c,'#91adb9',178,92,203,105);
 for(let i=0;i<9;i++)win(c,45+i*17,116,7,18,world,i%3===1);
 for(let i=0;i<8;i++){arch(c,44+i*19,144,12,24,a.sky);r(c,'#819ba4',42+i*19,145,2,22);}
 for(const [x,top] of [[43,51],[150,26],[192,76]]){
  wall(c,x,top,17,166-top,world,x);poly(c,a.sky,[x-3,top,x+8,top-25,x+21,top]);line(c,'#bed1d3',x-3,top,x+8,top-25);line(c,'#708d9f',x+8,top-25,x+20,top);
  cornice(c,x-1,top+27,19,world);win(c,x+4,top+7,8,14,world,true);r(c,'#d0c49c',x+8,top-32,1,8);
 }
 cornice(c,34,137,165,world);line(c,'#a6bdc1',26,161,203,161);
}
function observatory(c:C,world:number,small=false){
 const a=WORLDS[world];wall(c,43,124,113,166,world,5);
 for(let row=0;row<3;row++)for(let i=0;i<5;i++){const x=53+i*21,y=144+row*49;win(c,x,y,9,24,world,(i+row)%3===1);r(c,a.near,x-5,y-5,2,35);r(c,a.edge+'3a',x-5,y-5,1,31);}
 for(const yy of [125,184,235])cornice(c,40,yy,119,world);
 for(let y=48;y<125;y++){
  const half=Math.floor(Math.sqrt(Math.max(0,1-((124-y)/77)**2))*63);r(c,'#243a46',100-half,y,half*2,1);r(c,'#4c6b6a',102-half,y,Math.max(0,half*2-4),1);r(c,'#7b8e7c',103-half,y,Math.max(0,half*.45),1);
 }
 poly(c,'#1d2c40',[101,49,117,56,134,74,143,99,145,125,117,125,116,97,111,72]);
 line(c,'#baaa82',101,49,117,56);line(c,'#baaa82',117,56,134,74);line(c,'#a99b79',134,74,143,99);line(c,'#a99b79',143,99,145,125);
 for(const xx of [-56,-34,-13]){let oldX=100,oldY=48;for(let y=49;y<=123;y++){const p=(y-48)/75,x=100+xx*Math.sqrt(1-(1-p)**2);line(c,'#a89e80',oldX,oldY,x,y);oldX=x;oldY=y;}}
 for(const y of [78,103]){const half=Math.floor(Math.sqrt(1-((124-y)/77)**2)*63);r(c,'#899780',100-half,y,half+9,1);r(c,'#304f53',100-half,y+1,half+9,1);}
 // Patina forms restrained patches beside panel seams, not scattered noise.
 for(const [x,y] of [[54,105],[71,88],[82,113],[63,116]]){r(c,'#38665f',x,y,7,4);r(c,'#789989',x+1,y,4,1);}
 for(const [x,y] of [[46,111],[55,99],[62,84],[78,67],[84,95],[92,117]]){
  r(c,'#2e4d50',x,y,5,3);r(c,'#5c8273',x+1,y,5,2);r(c,'#90a18a',x+1,y,3,1);r(c,'#3c635b',x-2,y+3,4,2);
 }
 for(const [x,y] of [[44,103],[65,78],[83,103],[99,78],[102,124]]){r(c,'#233e46',x-1,y-1,3,3);r(c,'#c1b18c',x-1,y-1,2,1);r(c,'#718478',x,y,1,1);}
 if(!small){
  r(c,'#162b3a',107,107,19,14);r(c,'#7b8578',109,109,15,4);r(c,'#a99675',113,114,7,5);r(c,'#d0bc8e',114,114,2,2);
  line(c,'#162b3a',114,101,151,76,11);line(c,'#82958b',114,98,151,73,7);line(c,'#4d6b71',116,101,151,77,3);line(c,'#bfad83',115,96,151,72,2);
  for(const [x,y] of [[125,90],[137,82]]){line(c,'#233d49',x-1,y-3,x+4,y+4,2);line(c,'#b6a680',x,y-3,x+5,y+4);}
  line(c,'#152c3d',148,66,158,79,5);line(c,'#cfba88',148,68,156,79,3);line(c,'#395a68',151,69,156,76,2);r(c,'#c5d3c0',153,70,1,2);
 }
 cornice(c,35,124,131,world);r(c,'#7e8b7b',97,34,6,14);poly(c,'#b8ac85',[92,36,100,27,108,36]);r(c,'#dac18d',100,18,1,10);
 // Balcony rail is vertical decoration on a building, not a false landing.
 r(c,a.sky,32,196,135,4);r(c,a.edge+'66',33,196,133,1);for(let x=37;x<165;x+=10)r(c,a.edge+'55',x,188,2,8);r(c,a.edge+'66',35,187,130,1);
}
function spire(c:C,world:number){const a=WORLDS[world];wall(c,24,67,31,168,world,7);poly(c,a.near,[19,68,39,25,61,68]);line(c,a.edge+'66',19,68,39,25);r(c,a.accent+'99',39,15,1,12);cornice(c,22,68,35,world);for(let y=87;y<210;y+=37)win(c,34,y,9,18,world,y%3===0);}
const SIZES:Record<Kind,[number,number]>={canopy:[240,250],glasshouse:[270,240],aqueduct:[312,210],mountain:[430,330],monastery:[230,310],observatory:[200,310],spire:[80,250]};
function asset(kind:Kind,world:number,seed=0){
 const key=`${kind}/${world}/${seed}`;let canvas=cache.get(key);if(canvas)return canvas;
 canvas=document.createElement('canvas');[canvas.width,canvas.height]=SIZES[kind];const c=canvas.getContext('2d',{willReadFrequently:true})!;c.imageSmoothingEnabled=false;
 if(kind==='canopy')canopy(c);else if(kind==='glasshouse')glasshouse(c,world);else if(kind==='aqueduct')aqueduct(c,world);else if(kind==='mountain')mountain(c,seed);else if(kind==='monastery')monastery(c,world);else if(kind==='observatory')observatory(c,world);else spire(c,world);
 cache.set(key,canvas);return canvas;
}
interface Piece {kind:Kind;at:number;bottom:number;depth:number;alpha:number;seed?:number;scale?:number}
const SCENES:Record<number,Piece[]>={
 1:[{kind:'canopy',at:-120,bottom:.93,depth:.055,alpha:.3,scale:1.4},{kind:'canopy',at:470,bottom:.9,depth:.055,alpha:.3,scale:1.3},{kind:'aqueduct',at:200,bottom:1.12,depth:.11,alpha:.34},{kind:'glasshouse',at:370,bottom:.98,depth:.2,alpha:.66},{kind:'canopy',at:-25,bottom:1.16,depth:.3,alpha:.64},{kind:'canopy',at:780,bottom:1.09,depth:.27,alpha:.58}],
 3:[{kind:'mountain',at:-90,bottom:.91,depth:.035,alpha:.38,seed:3,scale:1.05},{kind:'mountain',at:350,bottom:.87,depth:.065,alpha:.46,seed:9,scale:1},{kind:'aqueduct',at:170,bottom:1.23,depth:.12,alpha:.32},{kind:'monastery',at:470,bottom:1.08,depth:.22,alpha:.65},{kind:'mountain',at:-40,bottom:1.3,depth:.28,alpha:.28,seed:17,scale:.8}],
 4:[{kind:'spire',at:290,bottom:.95,depth:.045,alpha:.29,scale:.7},{kind:'spire',at:580,bottom:1.01,depth:.065,alpha:.35,scale:.95},{kind:'aqueduct',at:330,bottom:1.16,depth:.11,alpha:.31},{kind:'observatory',at:110,bottom:1.03,depth:.2,alpha:.65},{kind:'spire',at:760,bottom:1.14,depth:.28,alpha:.56,scale:1.18}],
};
/** Kept as an async preparation hook for browser captures. All art is now
 * native Canvas geometry; there is no panoramic image or network asset. */
export const prepareDistrictVistas=Promise.resolve();
function mist(c:C,l:Level,w:number,h:number,cx:number,vertical:number,time:number,close=false){
 const key=`cloud/${l.world}`;let canvas=cache.get(key);
 if(!canvas){canvas=document.createElement('canvas');canvas.width=240;canvas.height=64;const out=canvas.getContext('2d',{willReadFrequently:true})!,a=WORLDS[l.world];
  for(let x=0;x<240;x++){
   const top=Math.round(18+Math.sin(x*.039)*8+Math.sin(x*.095+1)*4);
   for(let y=top;y<64;y++){const opacity=Math.round(Math.min(32,(y-top)*1.2)*(1-y/90)).toString(16).padStart(2,'0');r(out,a.edge+opacity,x,y,1,1);}
  }cache.set(key,canvas);
 }
 const scale=close?2:1.6,span=240*scale,shift=cx*(close?.32:.12)-time*(close?1.1:.5),first=Math.floor(shift/span),y=Math.round(h*(close?.88:.64)-vertical*.06);
 c.save();c.globalAlpha=l.world===4?.85:.45;for(let i=first;i*span-shift<w;i++)c.drawImage(canvas,Math.round(i*span-shift),y,span,64*scale);c.restore();
}
export function drawDistrictVistas(c:C,l:Level,w:number,h:number,cx:number,cy:number,time=0){
 if(l.setting==='cavern')return false;const pieces=SCENES[l.world];if(!pieces)return false;
 const startY=Math.max(-170,Math.min(Math.max(0,l.height-h),l.spawn.y-h*.57)),vertical=cy-startY;
 let mistDrawn=false;for(const piece of pieces){
  if(!mistDrawn&&piece.depth>=.2){mist(c,l,w,h,cx,vertical,time);mistDrawn=true;}
  const art=asset(piece.kind,l.world,piece.seed),baseScale=piece.scale??1,portrait=h>w?1.4:1,scale=baseScale*portrait,period=1050,shift=cx*piece.depth;
  const at=h>w?piece.at*w/640-art.width*(scale-baseScale)/2:piece.at,first=Math.floor((shift-at-art.width*scale)/period);
  const bottom=h>w?.82+(piece.bottom-1)*.65:piece.bottom;
  const y=Math.round(h*bottom-art.height*scale-vertical*piece.depth*.45);
  c.save();c.globalAlpha=piece.alpha;
  for(let i=first;i*period+at-shift<w;i++){const x=Math.round(i*period+at-shift);if(x+art.width*scale<0)continue;c.drawImage(art,x,y,art.width*scale,art.height*scale);}
  c.restore();
 }
 if(l.world===4)mist(c,l,w,h,cx,vertical,time,true);
 return true;
}
