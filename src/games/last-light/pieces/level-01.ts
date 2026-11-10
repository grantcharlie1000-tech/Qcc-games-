import {box,hash,lay,sprite,stroke,type C,type Work} from '../quarter-kit';

/** Level 1's buildings. A piece is (c,x,y,w,h): x,y is the top-left corner of
 * the landing the courier walks on (the roof line), w is that landing's width
 * and h runs from the roof line down to the lane.
 *
 * Every building is painted once, at its own size, into its own canvas, and
 * blitted after that. Its walls are laid storey by storey from the building's
 * own seed, so no course repeats; its openings, roof and trade are its own.
 * The top two pixel rows of every piece are the walked edge, exactly on the
 * roof line; nothing is drawn above it. */
export type Piece=(c:C,x:number,y:number,w:number,h:number)=>void;
type Paint=(c:C,w:number,h:number,s:number)=>void;
const PAD=8,TOP=8;
function built(name:string,paint:Paint):Piece{
 const made=new Map<number,HTMLCanvasElement>();
 return (c,x,y,w,h)=>{
  x=Math.round(x);y=Math.round(y);w=Math.round(w);h=Math.round(h);if(w<1||h<1)return;
  const id=(x*4096+w)*2048+h;let art=made.get(id);
  if(!art){art=sprite(`l1/${name}/${x}/${w}/${h}`,w+PAD*2,h+TOP,k=>{k.translate(PAD,TOP);paint(k,w,h,x);});made.set(id,art);}
  c.drawImage(art,x-PAD,y-TOP);
 };
}

// ── Materials ───────────────────────────────────────────────────────────────
const W=(course:number,short:number,long:number,mortar:string,stones:readonly string[],lip:string,shade:string,chip:string):Work=>({course,short,long,mortar,stones,lip,shade,chip});
const RED=W(8,12,18,'#1a1415',['#4a3330','#503733','#563b35','#46302d'],'#644640','#3a2826','#6e4e46');
const PLUM=W(7,11,17,'#16121a',['#3b2b35','#402f39','#45333b','#372831'],'#524049','#2b2029','#5c4a52');
const SOOT=W(8,13,20,'#111113',['#2e292a','#322c2c','#37302f','#2a2627'],'#443b39','#222021','#4e4441');
const OCHRE=W(8,12,19,'#191712',['#484031','#4e4535','#534937','#433c2f'],'#635843','#363025','#6d614a');
const LIME=W(8,12,18,'#2a3239',['#48525c','#4d5761','#525c65','#454f58'],'#616c75','#3a434c','#3f3431');
const ASHLAR=W(12,18,40,'#151c24',['#2c3742','#2f3a46','#323e4a','#293440'],'#3f4c5a','#222b35','#4a5765');
const SQUARED=W(10,14,28,'#131a21',['#313b45','#343f49','#38424c','#2e3741'],'#45525e','#252e37','#4f5c68');
const RUBBLE=W(9,7,21,'#11171e',['#29313a','#2d353f','#323941','#262d36','#2f3439'],'#3b454f','#1e252d','#444e57');
const GREY=W(8,12,20,'#14181d',['#30333a','#34373e','#383a40','#2d3036'],'#454950','#24272d','#4e5258');
const SAND=W(11,16,34,'#16140f',['#3e392f','#423d32','#464135','#3a352c'],'#565040','#2d2921','#605a48');
const RUSTIC=W(15,26,48,'#10161d',['#333d48','#36414c','#3a4550','#303a44'],'#4a5764','#262f38','#54616e');
/** A dressing: its face, its lit edge and its shadow. */
type Tri=readonly [string,string,string];
const COOL:Tri=['#4c555d','#6a737a','#232a31'],WARM:Tri=['#57524a','#736c5f','#2b2823'],PALE:Tri=['#5d666c','#8b949a','#3e464c'];
const TIMBER:Tri=['#2a2019','#4a3a2c','#15100d'],LEAD:Tri=['#4a545c','#8f9aa0','#2c343b'],CLAY:Tri=['#63463c','#977a6c','#35231f'];
const INK='#0b0f14',IRON='#131a21',IRON_LIT='#3d4950';
const SLATE_BLUE=['#2b3540','#303a46','#35404b','#28313b'],SLATE_PURPLE=['#322d39','#37323e','#3c3743','#2e2934'],SLATE_GREEN=['#2a3533','#2f3a37','#343f3b','#27312f'];
const TILE=['#49312b','#4f352f','#553931','#442e29'],STONE_SLATE=['#3b4038','#40453b','#45493e','#363b35','#3f3e35'];
const BOARD_TAR=['#1f1d1c','#242120','#282524','#1b1a19'],BOARD_BROWN=['#3a2c22','#40312a','#45362b','#36291f'],BOARD_GREY=['#38342f','#3e3933','#433e37','#34302b'],BOARD_PITCH=['#21252a','#252a2f','#292e33','#1d2126'];

const wallAt=(c:C,k:Work,s:number,x:number,y:number,w:number,h:number)=>{if(w<1||h<1)return;c.save();c.translate(Math.round(x),Math.round(y));lay(c,Math.round(w),Math.round(h),k,s);c.restore();};
/** A render coat: one ground, blotched where it holds damp, cracked where it has moved. */
function renderAt(c:C,t:Tri,s:number,x:number,y:number,w:number,h:number){
 box(c,t[0],x,y,w,h);
 for(let i=0,n=Math.max(3,Math.round(w*h/1700));i<n;i++){
  const pw=8+Math.floor(hash(s,i,1)*Math.min(34,Math.max(1,w-12))),ph=3+Math.floor(hash(s,i,2)*9),px=x+Math.floor(hash(s,i,3)*Math.max(1,w-pw)),py=y+2+Math.floor(hash(s,i,4)*Math.max(1,h-ph-6)),tone=t[hash(s,i,5)>.45?1:2];
  box(c,tone,px,py,pw,ph);box(c,tone,px+2,py-1,Math.max(1,pw-6),1);box(c,tone,px+3,py+ph,Math.max(1,pw-8),2);
 }
 for(let i=0,n=Math.max(1,Math.round(w/90));i<n;i++){
  let px=x+6+Math.floor(hash(s,i,6)*Math.max(1,w-12)),py=y+Math.floor(hash(s,i,7)*h*.3);
  for(let k=0,len=14+Math.floor(hash(s,i,8)*Math.min(46,h*.5));k<len&&py<y+h;k++,py++){if(hash(s,i,k+20)>.68)px+=hash(s,i,k+70)>.5?1:-1;px=Math.max(x+1,Math.min(x+w-2,px));box(c,t[2],px,py,1,1);}
 }
}
/** Upright boards, each its own width and tone, butted or knotted here and there. */
function planks(c:C,tones:readonly string[],gap:string,s:number,x:number,y:number,w:number,h:number,min=5,max=9){
 box(c,gap,x,y,w,h);
 for(let px=x,i=0;px<x+w;i++){
  const bw=Math.min(x+w-px,min+Math.floor(hash(s,i,1)*(max-min+1))),v=hash(s,i,2);
  box(c,tones[Math.min(tones.length-1,Math.floor(v*tones.length))],px,y,bw-1,h);
  if(v>.62&&h>20)box(c,gap,px,y+4+Math.floor(hash(s,i,3)*(h-10)),bw-1,1);
  else if(v<.2&&bw>4&&h>14)box(c,gap,px+Math.floor(bw/2)-1,y+3+Math.floor(hash(s,i,4)*(h-8)),2,2);
  px+=bw;
 }
}
/** Weatherboards lapped one over the next, each course of boards butted end to end. */
function laps(c:C,tones:readonly string[],under:string,lit:string,s:number,x:number,y:number,w:number,h:number,row=6){
 for(let r=0,py=y;py<y+h;r++,py+=row){
  const rh=Math.min(row,y+h-py);
  for(let px=x-Math.floor(hash(s,r,1)*40),i=0;px<x+w;i++){const len=34+Math.floor(hash(s,r,i+2)*52),x0=Math.max(x,px),x1=Math.min(x+w,px+len);if(x1>x0){box(c,tones[Math.min(tones.length-1,Math.floor(hash(s,r,i+40)*tones.length))],x0,py,x1-x0,rh);if(px>x)box(c,under,x0,py,1,rh);}px+=len;}
  if(hash(s,r,9)>.35)box(c,lit,x,py,w,1);box(c,under,x,py+rh-1,w,1);
 }
}
/** Slates in courses; `grow` makes each course lower down deeper and wider, as stone slates are laid. */
function slates(c:C,tones:readonly string[],dark:string,s:number,x:number,y:number,w:number,h:number,row=6,sw=9,grow=0,gone=.972){
 box(c,dark,x,y,w,h);
 for(let r=0,py=y;py<y+h;r++){
  const rh=Math.min(row+Math.floor(r*grow),y+h-py),cw=sw+Math.floor(r*grow*1.5);
  for(let px=x-Math.floor(hash(s,r,1)*cw),i=0;px<x+w;i++,px+=cw){
   const x0=Math.max(x,px),x1=Math.min(x+w,px+cw);if(x1-x0<2)continue;
   const v=hash(s,r,i+2);if(v>gone)continue;
   box(c,tones[Math.min(tones.length-1,Math.floor(v*tones.length))],x0,py,x1-x0-1,rh-1);
   if(v<.05)box(c,tones[0],x0,py+rh-1,x1-x0-1,1);
  }
  py+=rh;
 }
}
function pantiles(c:C,tones:readonly string[],dark:string,lit:string,s:number,x:number,y:number,w:number,h:number){
 box(c,dark,x,y,w,h);
 for(let py=y,r=0;py<y+h;py+=7,r++)for(let px=x,i=0;px<x+w;px+=6,i++){
  const rh=Math.min(7,y+h-py),cw=Math.min(6,x+w-px),v=hash(s,r,i);
  box(c,tones[Math.min(tones.length-1,Math.floor(v*tones.length))],px,py,cw-1,rh-1);if(cw>2)box(c,v>.8?tones[2]:lit,px+1,py,1,rh-1);
 }
}
/** The walked edge of a coped wall: stones of their own lengths, light on top. */
function coping(c:C,x:number,w:number,t:number,k:Tri,s:number){
 box(c,k[0],x,0,w,t);box(c,k[1],x,0,w,2);box(c,k[2],x,t-1,w,1);
 for(let px=x+10+Math.floor(hash(s,0,90)*14),i=0;px<x+w-6;i++){box(c,k[2],px,2,1,t-3);px+=18+Math.floor(hash(s,i,91)*17);}
}
function gutter(c:C,x:number,y:number,w:number,s:number){
 box(c,'#0f151b',x,y,w,4);box(c,IRON_LIT,x,y,w,1);box(c,'#232d35',x,y+1,w,1);
 for(let px=x+6+Math.floor(hash(s,0,70)*10),i=0;px<x+w-4;i++){box(c,'#0f151b',px,y+4,2,2);px+=22+Math.floor(hash(s,i,71)*15);}
}
/** A downpipe from its hopper head to its shoe on the lane, strapped where the wall would take a nail. */
const PIPES=[[IRON,IRON_LIT],['#2a3138','#59646c'],['#2b1f1a','#5a4034']] as const;
function pipe(c:C,x:number,y0:number,y1:number,s:number){
 const v=hash(s,1,82),[dark,lit]=PIPES[Math.floor(hash(s,2,82)*3)],wide=hash(s,3,82)>.5?4:3;let top=y0;
 if(v<.34){box(c,dark,x-2,y0,wide+4,6);box(c,lit,x-2,y0,wide+4,1);box(c,dark,x-1,y0+6,wide+2,2);top=y0+8;}          // a square rainwater head
 else if(v<.67){for(let k=0;k<5;k++){const cut=Math.floor(k*.75);box(c,dark,x-3+cut,y0+k,wide+6-cut*2,1);}box(c,lit,x-3,y0,wide+6,1);top=y0+5;}   // a funnel head
 else{box(c,dark,x+5,y0,wide,5);stroke(c,dark,x+5,y0+5,x,y0+10,wide);box(c,lit,x+6,y0,1,5);top=y0+10;}                       // a swan-neck from the gutter
 box(c,dark,x,top,wide,y1-top);box(c,lit,x+1,top,1,y1-top);
 for(let py=y0+18+Math.floor(hash(s,0,80)*24),i=0;py<y1-10;i++){box(c,dark,x-1,py,wide+2,3);box(c,lit,x-1,py,wide+2,1);py+=38+Math.floor(hash(s,i,81)*34);}
 if(hash(s,4,82)>.4){box(c,dark,x+2,y1-4,wide+2,4);box(c,lit,x+2,y1-4,wide+2,1);}else{box(c,dark,x-2,y1-3,wide+4,3);box(c,lit,x-2,y1-3,wide+4,1);}
}
/** A slated pitch seen from the street: ridge on the roof line, verges down each gable, gutter at the eaves. */
function pitch(c:C,w:number,depth:number,tones:readonly string[],s:number,row=6,sw=9,ridge:Tri=PALE,grow=0){
 slates(c,tones,'#141a21',s,0,5,w,depth-9,row,sw,grow);
 box(c,ridge[0],0,0,w,5);box(c,ridge[1],0,0,w,2);box(c,'#141a21',0,5,w,1);
 for(let px=8+Math.floor(hash(s,0,60)*8),i=0;px<w-4;i++){box(c,ridge[2],px,2,1,3);px+=13+Math.floor(hash(s,i,61)*6);}
 box(c,ridge[0],0,5,3,depth-9);box(c,ridge[1],0,5,1,depth-9);box(c,ridge[2],w-3,5,3,depth-9);box(c,ridge[0],w-3,5,1,depth-9);
 gutter(c,-2,depth-4,w+4,s);
}
/** A band between two storeys: the courses above and below stop against it. */
function band(c:C,x:number,y:number,w:number,k:Tri,t=4){box(c,k[2],x,y,w,t+1);box(c,k[0],x,y,w,t);box(c,k[1],x,y,w,1);}
/** A corner in dressed stones, long and short by turns, from the foot up. */
function quoins(c:C,x:number,y0:number,y1:number,k:Tri,right=false,course=12,long=15,short=9){
 for(let y=y1-course,i=0;y>=y0-course+1;y-=course,i++){const wide=i%2?long:short,top=Math.max(y0,y),x0=right?x-wide:x;box(c,k[0],x0,top,wide,y+course-top-1);box(c,k[1],x0,top,wide,1);box(c,k[2],x0,y+course-1,wide,1);box(c,right?k[2]:k[1],right?x-1:x,top,1,y+course-top-1);}
}
/** The return of a wall round its corner: the side face, in its own shadow. */
function returnFace(c:C,x:number,y0:number,y1:number,wide=5){c.save();c.globalAlpha=.42;box(c,'#04070b',x,y0,wide,y1-y0);c.restore();box(c,INK,x,y0,1,y1-y0);}
function edges(c:C,w:number,y0:number,y1:number,lit:string){box(c,INK,0,y0,1,y1-y0);box(c,INK,w-1,y0,1,y1-y0);box(c,lit,1,y0,1,y1-y0);}

// ── Openings ────────────────────────────────────────────────────────────────
type Arch='seg'|'round'|'point';
/** How many pixels an arched head cuts from each side of an opening `dy` rows below its crown. */
function inset(w:number,dy:number,arch:Arch,rise:number){
 if(arch==='round'){const r=w/2;if(dy>=r)return 0;const t=r-dy-.5;return Math.round(r-Math.sqrt(Math.max(0,r*r-t*t)));}
 if(dy>=rise)return 0;
 if(arch==='seg'){const R=(w*w/4+rise*rise)/(2*rise),t=R-dy-.5;return Math.round(w/2-Math.sqrt(Math.max(0,R*R-t*t)));}
 const p=(rise*rise+w*w/4)/w,t=rise-dy-.5;return Math.min(Math.floor(w/2),Math.round(p-Math.sqrt(Math.max(0,p*p-t*t))));
}
const spring=(w:number,arch:Arch|undefined,rise:number)=>!arch?0:arch==='round'?Math.ceil(w/2):rise;
/** An opening's outline as whole pixel rows, so a clip or a fill of it stays sharp. */
function shape(c:C,x:number,y:number,w:number,h:number,arch?:Arch,rise=4){
 c.beginPath();if(!arch){c.rect(x,y,w,h);return;}
 for(let dy=0;dy<h;dy++){const k=inset(w,dy,arch,rise);if(w-2*k>0)c.rect(x+k,y+dy,w-2*k,1);}
}
type Look='dark'|'lit'|'dim'|'drawn'|'blind'|'shut'|'board'|'broken'|'fog'|'foglit'|'lead'|'leadlit';
function lattice(c:C,x:number,y:number,w:number,h:number,col:string){for(let k=-h;k<w;k+=4)for(let i=0;i<h;i++){const a=x+k+i,b=x+w-1-k-i;if(a>=x&&a<x+w)box(c,col,a,y+i,1,1);if(b>=x&&b<x+w)box(c,col,b,y+i,1,1);}}
function glass(c:C,x:number,y:number,w:number,h:number,look:Look,s:number,tint='#2a3038'){
 const v=hash(s,2,5);
 if(look==='lit'||look==='leadlit'){
  box(c,'#8f6233',x,y,w,h);box(c,'#c8913f',x+1,y+1,w-2,h-2);const cw=Math.max(2,Math.floor(w*.4)),ch=Math.max(3,Math.floor(h*.45));box(c,'#f3c77a',x+Math.floor((w-cw)/2),y+h-ch-2,cw,ch);
  if(look==='leadlit')lattice(c,x,y,w,h,'#7a5230');
  else if(v>.35){const k=Math.max(2,Math.floor(w/4));box(c,'#6b4a33',x,y,k,h);box(c,'#6b4a33',x+w-k,y,k,h);box(c,'#7d5a3e',x+k-1,y,1,h);}
  return;
 }
 if(look==='dim'){box(c,'#33261d',x,y,w,h);box(c,'#553a26',x+1,y+Math.floor(h/3),w-2,h-Math.floor(h/3)-1);box(c,'#7a5433',x+Math.floor(w/2)-1,y+h-5,3,3);return;}
 if(look==='fog'||look==='foglit'){
  const lit=look==='foglit';box(c,lit?'#6b583c':'#2c3944',x,y,w,h);box(c,lit?'#8a7048':'#384754',x+1,y+Math.floor(h*.4),w-2,h-Math.floor(h*.4));box(c,lit?'#a3844f':'#42525f',x+2,y+Math.floor(h*.7),w-4,h-Math.floor(h*.7)-1);
  for(let i=0;i<Math.max(2,w>>2);i++){const px=x+1+Math.floor(hash(s,i,6)*(w-2)),py=y+Math.floor(hash(s,i,7)*h*.5);box(c,lit?'#5a4830':'#222d37',px,py,1,3+Math.floor(hash(s,i,8)*h*.4));}
  return;
 }
 box(c,'#111a24',x,y,w,h);
 if(look==='dark'||look==='broken'||look==='lead'){
  if(v<.4)box(c,'#1c2c3e',x+1,y+1,Math.ceil(w*.4),Math.ceil(h*.3));
  else if(v<.75){box(c,'#1c2c3e',x+w-1-Math.ceil(w*.35),y+Math.floor(h*.5),Math.ceil(w*.35),Math.ceil(h*.3));box(c,'#24384d',x+1,y+2,2,Math.ceil(h*.2));}
  else box(c,'#172330',x+1,y+1,w-2,Math.ceil(h*.45));
  if(look==='lead')lattice(c,x,y,w,h,'#0c1219');
  if(look==='broken'){box(c,'#05080c',x+Math.floor(w*.3),y+Math.floor(h*.45),Math.ceil(w*.5),Math.ceil(h*.3));box(c,'#05080c',x+Math.floor(w*.45),y+Math.floor(h*.3),Math.ceil(w*.25),Math.ceil(h*.2));box(c,'#3a4c66',x+Math.floor(w*.3)-1,y+Math.floor(h*.45)+1,1,2);box(c,'#3a4c66',x+Math.floor(w*.8),y+Math.floor(h*.72),1,1);}
  return;
 }
 if(look==='drawn'){const k=Math.max(2,Math.floor(w*.45));box(c,tint,x,y,k,h);box(c,tint,x+w-k,y,k,h);c.save();c.globalAlpha=.3;for(let i=1;i<k;i+=2){box(c,'#000',x+i,y,1,h);box(c,'#000',x+w-1-i,y,1,h);}c.restore();return;}
 if(look==='blind'){const d=Math.floor(h*(.5+v*.45));box(c,'#33373a',x,y,w,d);box(c,'#464b4d',x,y+d-1,w,1);return;}
 if(look==='shut'){for(let yy=y;yy<y+h;yy+=3)box(c,tint,x,yy,w,2);box(c,'#0d1218',x+Math.floor(w/2),y,1,h);return;}
 for(let yy=y,i=0;yy<y+h;yy+=5,i++){box(c,i%2?'#372b22':'#3f3228',x,yy,w,4);box(c,'#54432f',x,yy,w,1);}
 box(c,'#17120e',x+2,y,1,h);box(c,'#17120e',x+w-3,y,1,h);
}
interface Win {look:Look;cols?:number;rows?:number;frame?:string;arch?:Arch;rise?:number;rail?:boolean;tint?:string;s?:number}
/** A window: its reveal, its frame, what shows in the glass, and its glazing bars. */
function win(c:C,x:number,y:number,w:number,h:number,o:Win){
 const {arch,rise=4,frame='#59636b',cols=2,rows=2,s=x*31+y*7}=o;
 c.fillStyle=INK;shape(c,x-1,y-1,w+2,h+1,arch,arch==='round'?rise:rise+1);c.fill();
 c.fillStyle=frame;shape(c,x,y,w,h,arch,rise);c.fill();
 c.save();shape(c,x+1,y+1,w-2,h-2,arch,Math.max(1,rise-1));c.clip();
 glass(c,x+1,y+1,w-2,h-2,o.look,s,o.tint);
 if(o.look!=='shut'&&o.look!=='board'){
  for(let i=1;i<cols;i++){const wide=w%2===0&&cols%2===0&&i*2===cols?2:1;box(c,frame,x+Math.round(i*w/cols-wide/2),y,wide,h);}
  for(let j=1;j<rows;j++)box(c,frame,x,y+Math.round(j*h/rows),w,1);
  if(o.rail)box(c,frame,x,y+Math.round(h/2)-1,w,2);
 }
 c.restore();
}
/** Brick or stone set on end over an opening; `joint` shows between them. */
function soldiers(c:C,x:number,y:number,w:number,h:number,a:string,b:string,joint:string,s=0,seg=4){box(c,joint,x,y,w,h);for(let px=x,i=0;px<x+w;px+=seg,i++)box(c,hash(s,i,5)>.5?a:b,px,y,Math.min(seg,x+w-px)-1,h-1);}
function lintel(c:C,x:number,y:number,w:number,k:Tri,t=6,over=2){box(c,k[2],x-over,y-t,w+over*2,t);box(c,k[0],x-over,y-t,w+over*2,t-1);box(c,k[1],x-over,y-t,w+over*2,1);}
/** The ring of an arch, turned in bricks on end round the opening's head. Painted before the window. */
function archRing(c:C,x:number,y:number,w:number,arch:Arch,rise:number,th:number,a:string,b:string,joint:string,s=0){
 const sp=spring(w,arch,rise);c.save();shape(c,x-th,y-th,w+th*2,th+sp,arch,arch==='point'?rise+Math.round(th*1.5):rise+1);c.clip();soldiers(c,x-th,y-th,w+th*2,th+sp+1,a,b,joint,s,3);c.restore();
}
function sill(c:C,x:number,y:number,w:number,k:Tri,over=2,t=3){box(c,k[2],x-over,y,w+over*2,t);box(c,k[0],x-over,y,w+over*2,t-1);box(c,k[1],x-over,y,w+over*2,1);}
function surround(c:C,x:number,y:number,w:number,h:number,k:Tri,t=3){box(c,k[2],x-t,y-t,w+t*2,h+t);box(c,k[0],x-t,y-t,w+t*2-1,h+t);box(c,k[1],x-t,y-t,w+t*2-1,1);box(c,k[1],x-t,y-t,1,h+t);}
/** A drip mould over a window, dropped at each end. */
function hood(c:C,x:number,y:number,w:number,k:Tri){box(c,k[2],x-4,y-4,w+8,3);box(c,k[0],x-4,y-5,w+8,3);box(c,k[1],x-4,y-5,w+8,1);box(c,k[0],x-4,y-2,2,6);box(c,k[0],x+w+2,y-2,2,6);box(c,k[2],x-4,y+4,2,1);box(c,k[2],x+w+2,y+4,2,1);}
/** Shutters folded back against the wall each side of a window. */
function leaves(c:C,x:number,y:number,w:number,h:number,col:string,lw=5){for(const lx of [x-lw-1,x+w+1]){box(c,INK,lx,y,lw,h);for(let yy=y+1;yy<y+h-1;yy+=3)box(c,col,lx+1,yy,lw-1,2);}}
interface Door {tone:Tri;style:'plank'|'panel'|'pair';arch?:Arch;rise?:number;fan?:Look;fanH?:number;knob?:string;straps?:boolean}
/** A door in its reveal: tone is its shadow, its boards and their lit edges. */
function door(c:C,x:number,y:number,w:number,h:number,o:Door){
 const {arch,rise=4,tone,fanH=8}=o,top=y+(o.fan?fanH:0);
 c.fillStyle=INK;shape(c,x-1,y-1,w+2,h+1,arch,arch==='round'?rise:rise+1);c.fill();
 c.save();shape(c,x,y,w,h,arch,rise);c.clip();
 box(c,tone[0],x,y,w,h);
 if(o.fan){glass(c,x+1,y+1,w-2,fanH-2,o.fan,x*13+y);box(c,tone[0],x+Math.floor(w/2),y,1,fanH);if(w>20){box(c,tone[0],x+Math.floor(w/4),y,1,fanH);box(c,tone[0],x+Math.floor(w*3/4),y,1,fanH);}}
 if(o.style==='panel'){
  box(c,tone[1],x+1,top+1,w-2,y+h-top-1);const pw=Math.floor((w-5)/2),ph=Math.floor((y+h-top-6)/3);
  for(let i=0;i<2;i++)for(let j=0;j<3;j++){const px=x+2+i*(pw+1),py=top+3+j*(ph+1),tall=j===2?ph-2:ph;box(c,tone[0],px,py,pw,tall);box(c,tone[1],px+1,py+1,pw-1,tall-1);box(c,tone[2],px+1,py+tall-1,pw-1,1);}
 }else{
  for(let px=x+1,i=0;px<x+w-1;px+=4,i++){box(c,tone[1],px,top+1,3,y+h-top-1);if(i%3!==1)box(c,tone[2],px,top+1,1,y+h-top-1);}
  if(o.style==='pair')box(c,tone[0],x+Math.floor(w/2)-1,top,2,y+h-top);
  if(o.straps!==false)for(const f of [.22,.74]){const py=top+Math.round((y+h-top)*f);box(c,IRON,x+1,py,w-2,2);box(c,IRON_LIT,x+1,py,Math.min(5,w-2),1);if(o.style==='pair')box(c,IRON_LIT,x+w-6,py,5,1);}
 }
 if(o.knob!=='')box(c,o.knob??'#a9905f',o.style==='pair'?x+Math.floor(w/2)-4:x+w-5,y+Math.round(h*.56),2,2);
 c.restore();
}
function step(c:C,x:number,y:number,w:number,k:Tri,over=3,t=3){box(c,k[0],x-over,y-t,w+over*2,t);box(c,k[1],x-over,y-t,w+over*2,1);box(c,k[2],x-over,y-1,w+over*2,1);}

// ── Lettering and things that stand or hang against a wall ──────────────────
const FONT:Readonly<Record<string,string>>={A:'010101111101101',B:'110101110101110',C:'011100100100011',D:'110101101101110',E:'111100110100111',H:'101101111101101',K:'101101110101101',L:'100100100100111',M:'101111111101101',N:'110101101101101',O:'111101101101111',P:'111101111100100',R:'110101110101101',S:'011100010001110',T:'111010010010010',U:'101101101101111',Y:'101101010010010'};
const textW=(t:string,k=1)=>t.length*4*k-k;
/** Sign-writer's capitals, painted straight onto a board or a wall. */
function text(c:C,t:string,x:number,y:number,col:string,k=1){for(const ch of t){const g=FONT[ch];if(g)for(let i=0;i<15;i++)if(g[i]==='1')box(c,col,x+(i%3)*k,y+Math.floor(i/3)*k,k,k);x+=4*k;}}
/** A sign board screwed flat to the wall, lettered across its middle. */
function board(c:C,x:number,y:number,w:number,h:number,t:string,k:number,ground:string,edge:string,ink:string){
 box(c,INK,x-1,y-1,w+2,h+2);box(c,edge,x,y,w,h);box(c,ground,x+1,y+1,w-2,h-2);text(c,t,x+Math.round((w-textW(t,k))/2),y+Math.round((h-5*k)/2),ink,k);
 for(const [px,py] of [[x+2,y+2],[x+w-3,y+2],[x+2,y+h-3],[x+w-3,y+h-3]] as const)box(c,edge,px,py,1,1);
}
/** A cask standing on its end: bellied staves in iron hoops. x,y is its top-left. */
function barrel(c:C,x:number,y:number,w:number,h:number,wood='#3d2f22'){
 const belly=(dy:number)=>{const t=Math.abs(dy-(h-1)/2)/(h/2);return Math.round(t*t*2.4);};
 for(let dy=0;dy<h;dy++){const k=belly(dy);box(c,wood,x+k,y+dy,w-2*k,1);}
 for(let px=x+3,i=0;px<x+w-2;px+=3+(i++%2))box(c,'#2a2018',px,y+1,1,h-2);
 box(c,'#5a4731',x+2,y+2,1,h-4);box(c,'#5a4731',x+2,y,w-4,1);
 for(const f of [.1,.34,.66,.9]){const dy=Math.round(f*(h-1)),k=belly(dy);box(c,'#181e24',x+k,y+dy,w-2*k,2);box(c,'#4a545b',x+k,y+dy,Math.max(2,(w-2*k)>>1),1);}
}
function hoop(c:C,cx:number,cy:number,r:number,col:string){for(let a=0;a<72;a++){const t=a/72*Math.PI*2;box(c,col,Math.round(cx+Math.cos(t)*r),Math.round(cy+Math.sin(t)*r),1,1);}}
/** Ivy grown up a corner from the ground, thinning as it climbs. */
function ivy(c:C,x:number,foot:number,top:number,reach:number,s:number,dir=1){
 const tones=['#1b2c24','#22382b','#2a4532','#182620'];
 for(let y=foot-1,i=0;y>top;y-=2,i++){
  const t=(foot-y)/(foot-top),wide=Math.max(2,Math.round(reach*(1-t*t)*(.7+hash(s,i,44)*.5)));
  for(let k=0;k<wide;k+=2)if(hash(s,i,k+45)>.34*(1+t))box(c,tones[Math.floor(hash(s,i,k+46)*4)],x+dir*k-(dir<0?2:0),y-Math.floor(hash(s,i,k+47)*2),2,2);
 }
}
/** A ladder stood on the ground and leant on the wall. */
function ladder(c:C,x0:number,y0:number,x1:number,y1:number,wide:number,col:string,lit:string){
 stroke(c,col,x0,y0,x1,y1,2);stroke(c,col,x0+wide,y0,x1+wide,y1,2);stroke(c,lit,x0,y0,x1,y1,1);
 for(let t=.06;t<1;t+=7/Math.max(8,Math.abs(y1-y0))){const px=Math.round(x0+(x1-x0)*t),py=Math.round(y0+(y1-y0)*t);box(c,col,px,py,wide+1,1);}
}
/** A plant box on a sill. */
function flowerBox(c:C,x:number,y:number,w:number,s:number){
 box(c,'#17120e',x-2,y-1,w+4,5);box(c,'#3a2c22',x-1,y,w+2,3);box(c,'#54422f',x-1,y,w+2,1);
 for(let px=x-1,i=0;px<x+w;px+=2,i++){const tall=1+Math.floor(hash(s,i,50)*4);box(c,hash(s,i,51)>.5?'#27402f':'#31503a',px,y-tall,2,tall);if(hash(s,i,52)>.72)box(c,'#8a4a44',px,y-tall,1,1);}
}
/** Soot or damp run down a wall from where it starts. */
function stain(c:C,col:string,x:number,y:number,w:number,len:number,s:number,alpha=.4,up=false){
 c.save();c.globalAlpha=alpha/2;
 for(let pass=0;pass<2;pass++)for(let i=0;i<w;i++){const l=Math.round(len*(pass?.6:1)*(.4+hash(s,i>>1,55+pass)*.6)*(1-Math.abs(i-(w-1)/2)/(w*.6)));if(l>0)box(c,col,x+i,up?y-l:y,1,l);}
 c.restore();
}

// ── The terrace: each house from its own seed ───────────────────────────────
const FRAMES=['#59636b','#27352f','#3b2e25','#1c232b','#4f4a42'] as const;
const DOOR_TONES:readonly Tri[]=[['#111815','#22362d','#2e483b'],['#170f0e','#3e231f','#53302a'],['#0f1318','#223042','#2f4158'],['#14100c','#382b21','#4a392b'],['#0f1113','#292d31','#3a3f44']];
const SHUTTERS=['#2a3a36','#3a2e33','#2c333c','#3b3328'] as const;
const CURTAINS=['#2a3038','#3d2c30','#2f3a36','#3a3629','#34303c'] as const;
const WORKS=[RED,PLUM,OCHRE,SOOT,LIME,ASHLAR] as const;
const RENDERS:readonly Tri[]=[['#39414a','#414952','#2f363e'],['#43423d','#4b4a44','#383733']];
/** One house front, from under its roof at `top` to the lane at `h`, between x0 and x0+w. */
function front(c:C,x0:number,w:number,top:number,h:number,s:number,kind:number){
 const u=(k:number)=>hash(s,k,23),p=(n:number,k:number)=>Math.min(n-1,Math.floor(u(k)*n));
 const work=kind<6?WORKS[kind]:null,coat=RENDERS[kind-6]??RENDERS[0];
 const avail=h-top,gh=Math.min(avail-44,64+p(16,2)),n=Math.max(1,Math.round((avail-gh)/66)),fh=Math.floor((avail-gh)/n),g0=top+n*fh;
 // The wall: a panel to each storey; a rendered house is one coat over a brick foot.
 if(work){for(let f=0;f<n;f++)wallAt(c,work,s+f*17+3,x0,top+f*fh,w,fh);wallAt(c,work,s+91,x0,g0,w,h-g0);}
 else{renderAt(c,coat,s+3,x0,top,w,h-top-14);wallAt(c,u(40)>.5?SOOT:GREY,s+5,x0,h-14,w,14);box(c,coat[2],x0,h-15,w,1);}
 const dress:Tri=kind===5?PALE:work?(u(3)>.5?COOL:WARM):[coat[1],'#5d666d',coat[2]];
 const head=work?p(3,4):3,frame=FRAMES[p(FRAMES.length,5)],ww=13+p(6,6),pat=p(4,7),curtain=CURTAINS[p(CURTAINS.length,33)];
 const cols=pat===2?1:pat===1&&ww>=16?3:2,rows=pat===1?4:pat===3?3:2,rail=pat===0||pat===2;
 const corner=p(3,30),nb=w<72?1:w<118?2:Math.max(2,Math.round((w-20)/(52+p(12,8)))),m=(corner===0?21:12)+p(8,9);
 const bx=(i:number)=>x0+(nb===1?Math.round((w-ww)/2):Math.round(m+i*(w-2*m-ww)/(nb-1)));
 const wh=Math.min(fh-28,Math.round(ww*(1.8+u(10)*.5))),lit=u(11)<.42?p(n*nb,12):-1,walled=work&&u(13)<.4?p(n*nb,14):-1,shut=u(15)<.3?SHUTTERS[p(4,16)]:null;
 const arch:Arch|undefined=head===2?'seg':undefined;
 const opening=(x:number,y:number,ow:number)=>{
  if(!work)return;
  if(head===0)lintel(c,x,y,ow,dress,6);
  else if(head===1)soldiers(c,x-2,y-8,ow+4,8,work.stones[2],work.stones[0],work.mortar,s+x);
  else archRing(c,x,y,ow,'seg',3,5,work.lip,work.stones[1],work.mortar,s+x);
 };
 for(let f=0;f<n;f++){
  const y0=top+f*fh,wy=y0+Math.round((fh-wh)/2)+(f===0?-1:2);
  if(f>0&&u(17)<.55)band(c,x0,y0-2,w,work?[work.stones[2],work.lip,work.mortar]:dress,3);
  for(let i=0;i<nb;i++){
   const x=bx(i),id=f*nb+i,v=hash(s,id,31);
   if(id===walled&&work){
    // A window walled up long ago, in whatever brick was to hand; its sill was left.
    opening(x,wy,ww);box(c,INK,x-1,wy-1,ww+2,wh+1);wallAt(c,work===RED?SOOT:work===LIME?GREY:RED,s+id,x,wy,ww,wh);box(c,'#00000040',x,wy,ww,wh);box(c,'#00000055',x,wy,ww,2);sill(c,x,wy+wh,ww,dress);continue;
   }
   const look:Look=id===lit?'lit':v<.46?'dark':v<.7?'drawn':v<.8?'blind':v<.88&&shut?'shut':v>.975?'broken':'dark';
   if(work)opening(x,wy,ww);else surround(c,x,wy,ww,wh,dress,2);
   if(shut&&look!=='shut')leaves(c,x,wy,ww,wh,shut,ww>15?5:4);
   win(c,x,wy,ww,wh,{look,cols,rows,rail,frame,arch,rise:3,tint:look==='shut'?shut??undefined:curtain,s:s+id*7});
   sill(c,x,wy+wh,ww,dress);
  }
 }
 if(u(17)<.55||!work)band(c,x0,g0-2,w,work?[work.stones[2],work.lip,work.mortar]:dress,3);
 // The ground storey: a door in one bay, a wider window in the others, a plinth at the lane.
 const db=nb===1?0:u(18)<.7?(u(19)<.5?0:nb-1):p(nb,20),dw=16+p(5,21),dh=Math.min(gh-16,40+p(9,22)),dx=bx(db)+Math.round((ww-dw)/2);
 if(work)box(c,work.shade,x0,h-7,w,7),box(c,work.mortar,x0,h-8,w,1);
 for(let i=0;i<nb;i++){
  if(i===db)continue;
  const gw=ww+(u(26)<.5?4:0),gwh=Math.min(gh-34,wh+3),x=bx(i)-Math.round((gw-ww)/2),y=h-20-gwh,v=hash(s,i,37);
  if(work)opening(x,y,gw);else surround(c,x,y,gw,gwh,dress,2);
  win(c,x,y,gw,gwh,{look:v<.5?'dark':v<.78?'drawn':v<.9?'blind':'board',cols:gw>18?3:cols,rows,rail,frame,arch,rise:3,tint:curtain,s:s+i*11+5});
  sill(c,x,y+gwh,gw,dress);
 }
 if(work)opening(dx,h-dh,dw);else surround(c,dx,h-dh,dw,dh-1,dress,2);
 door(c,dx,h-dh,dw,dh,{tone:DOOR_TONES[p(5,24)],style:u(25)<.4?'plank':'panel',fan:u(27)<.6?(u(28)<.22?'dim':'dark'):undefined,arch,rise:3,straps:u(29)<.5});
 step(c,dx,h,dw,dress);
 // The corners: quoins, a brick pier, or the plain return in shadow.
 if(corner===0){quoins(c,x0,top,h,dress,false,work?work.course*1.5:12);quoins(c,x0+w,top,h,dress,true,work?work.course*1.5:12);}
 else if(corner===1&&work){for(const px of [x0,x0+w-8]){wallAt(c,work,s+px+41,px,top,8,h-top);box(c,work.lip,px,top,1,h-top);box(c,work.mortar,px+7,top,1,h-top);}}
 else{box(c,work?work.lip:coat[1],x0+1,top,1,h-top);returnFace(c,x0+w-5,top,h);}
 box(c,INK,x0,top,1,h-top);box(c,INK,x0+w-1,top,1,h-top);
 const px=u(31)<.5?x0+4:x0+w-8;pipe(c,px,top,h,s);
 // One thing each house has that its neighbour has not.
 const extra=p(5,32);
 if(extra===0&&n>0)flowerBox(c,bx(nb-1-db>0?nb-1:0),top+(n-1)*fh+Math.round((fh-wh)/2)+(n===1?-1:2)+wh-2,ww,s);
 else if(extra===1){const lx=dx+dw+5<x0+w-10?dx+dw+5:dx-9;box(c,IRON,lx,h-dh-2,3,2);box(c,IRON,lx+1,h-dh,2,5);box(c,IRON,lx-1,h-dh+5,6,8);box(c,'#1c2830',lx,h-dh+6,4,6);box(c,IRON_LIT,lx-1,h-dh+5,6,1);}
 else if(extra===2){const ax=dx>x0+w/2?dx-22:dx+dw+8;box(c,INK,ax,h-7,14,6);for(let k=1;k<13;k+=3)box(c,IRON_LIT,ax+k,h-6,1,4);box(c,IRON,dx-6,h-9,2,9);box(c,IRON,dx-9,h-9,8,1);}
 else if(extra===3)ivy(c,px<x0+w/2?x0+w-2:x0+2,h,top+Math.round(avail*(.25+u(35)*.35)),26,s,px<x0+w/2?-1:1);
 else if(work)for(let i=0;i<nb-1;i++){const ax=Math.round((bx(i)+bx(i+1)+ww)/2),ay=g0-9;stroke(c,IRON,ax-3,ay-3,ax+3,ay+3,1);stroke(c,IRON,ax+3,ay-3,ax-3,ay+3,1);box(c,IRON_LIT,ax,ay,1,1);}
}
/** A terrace roof: slate or tile pitch, or a parapet; returns how deep it is. */
function terraceRoof(c:C,w:number,s:number,kind:number):number{
 const v=hash(s,60,28),depth=16+Math.floor(hash(s,61,23)*11);
 if(kind===5&&v>.45||v>.78){
  const k=kind<6?WORKS[kind]:null;
  if(k)wallAt(c,k,s+63,0,5,w,11);else box(c,RENDERS[kind-6][0],0,5,w,11);
  coping(c,0,w,5,kind===1||kind===3?WARM:PALE,s);band(c,-1,16,w+2,k?[k.stones[3],k.lip,k.mortar]:COOL,4);return 21;
 }
 if(v<.22){
  box(c,'#170f0d',0,5,w,depth-9);for(let py=5,r=0;py<depth-4;py+=5,r++)for(let px=-Math.floor(hash(s,r,62)*7),i=0;px<w;px+=7,i++){const x0=Math.max(0,px),x1=Math.min(w,px+7);if(x1-x0>1)box(c,TILE[Math.floor(hash(s,r,i+3)*4)],x0,py,x1-x0-1,Math.min(4,depth-4-py));}
  box(c,CLAY[0],0,0,w,5);box(c,CLAY[1],0,0,w,2);box(c,'#170f0d',0,5,w,1);for(let px=7;px<w-4;px+=11+Math.floor(hash(s,px,64)*4))box(c,CLAY[2],px,2,1,3);
  gutter(c,-2,depth-4,w+4,s);return depth;
 }
 pitch(c,w,depth,v<.4?SLATE_PURPLE:v<.6?SLATE_BLUE:SLATE_GREEN,s,5+Math.floor(hash(s,65,23)*3),7+Math.floor(hash(s,66,23)*5),v<.5?PALE:LEAD);return depth;
}
/** Which wall a terrace house is built of: its seed picks one of eight. */
const wallKind=(s:number,k=0)=>Math.min(7,Math.floor(hash(s,k,324)*8));
const terrace:Paint=(c,w,h,s)=>{
 if(w<320){const kind=wallKind(s),top=terraceRoof(c,w,s,kind);front(c,0,w,top,h,s,kind);return;}
 // A row of cottages under one roof, each its own house: party walls come up through the slates.
 const n=Math.round(w/155),depth=17,cuts=[0];for(let i=1;i<n;i++)cuts.push(Math.round(i*w/n+(hash(s,i,70)-.5)*34));cuts.push(w);
 pitch(c,w,depth,s%3?SLATE_BLUE:SLATE_PURPLE,s,5,8,LEAD);
 for(let i=0;i<n;i++){const x0=cuts[i],kind=wallKind(s,i+1);front(c,x0,cuts[i+1]-x0,depth,h,s+i*977+13,kind===5?4:kind);if(i){box(c,'#141a21',x0-3,5,6,depth-8);box(c,COOL[0],x0-2,5,4,depth-9);box(c,COOL[1],x0-2,5,1,depth-9);}}
};

// ── Yards: what stands behind the terrace ───────────────────────────────────
/** A hayloft over a stable. */
const stable:Paint=(c,w,h,s)=>{
 const loft=Math.min(86,Math.round(h*.45));
 box(c,TIMBER[0],0,0,w,7);box(c,'#7f878c',0,0,w,2);box(c,'#343b41',0,2,w,3);for(let px=5;px<w;px+=9+Math.floor(hash(s,px,1)*4))box(c,'#23292e',px,2,1,3);
 planks(c,BOARD_BROWN,'#17110d',s,0,7,w,loft-7,6,10);box(c,TIMBER[0],0,loft-5,w,5);box(c,TIMBER[1],0,loft-5,w,1);
 wallAt(c,GREY,s+3,0,loft,w,h-loft);
 // The loft door, a tuft of hay caught under it.
 const lx=Math.round(w*.5)-16;door(c,lx,22,32,loft-27,{tone:['#17110d','#3a2d22','#4c3b2c'],style:'pair'});box(c,TIMBER[0],lx-3,18,38,4);box(c,TIMBER[1],lx-3,18,38,1);
 for(let i=0;i<9;i++)box(c,i%2?'#8a7a4c':'#6f6238',lx+3+i*3,loft-5+Math.floor(hash(s,i,4)*2),2,3+Math.floor(hash(s,i,5)*4));
 win(c,14,26,14,12,{look:'dark',cols:2,rows:1,frame:'#2a2019'});win(c,w-30,30,12,12,{look:'board',frame:'#2a2019'});
 // The stable door below, its top leaf open on the dark; a tie ring and a trough.
 const dx=20,dh=Math.min(h-loft-14,56),dy=h-dh;archRing(c,dx,dy,30,'seg',4,5,RED.lip,RED.stones[1],RED.mortar,s);
 door(c,dx,dy,30,dh,{tone:['#15110e','#33291f','#463829'],style:'plank',arch:'seg',rise:4});box(c,'#06080b',dx+2,dy+5,26,Math.round(dh*.42));box(c,'#33291f',dx+2,dy+5+Math.round(dh*.42),26,2);
 const tx=w-70;archRing(c,tx,h-48,34,'seg',4,5,RED.lip,RED.stones[1],RED.mortar,s+1);win(c,tx,h-48,34,22,{look:'dark',cols:4,rows:2,frame:'#2a2019',arch:'seg',rise:4});sill(c,tx,h-26,34,COOL);
 box(c,'#1c242c',tx-2,h-12,40,12);box(c,COOL[0],tx-2,h-12,40,3);box(c,COOL[1],tx-2,h-12,40,1);box(c,'#10202a',tx,h-11,36,1);
 box(c,IRON,62,h-34,2,3);hoop(c,63,h-28,3,IRON_LIT);
 edges(c,w,7,h,GREY.lip);returnFace(c,w-5,7,h);
};
/** A boarded wash-house: copper inside, tin bath on its nail, the butt under the pipe. */
const washhouse:Paint=(c,w,h,s)=>{
 box(c,'#15100d',0,0,w,8);box(c,'#93745a',0,0,w,2);box(c,'#4a3a2c',0,2,w,3);box(c,'#23272c',0,5,w,3);
 planks(c,BOARD_GREY,'#151210',s,0,8,w,h-22,5,9);wallAt(c,RED,s+2,0,h-14,w,14);box(c,TIMBER[0],0,h-16,w,2);
 for(const px of [0,w-4]){box(c,TIMBER[0],px,8,4,h-22);box(c,TIMBER[1],px,8,1,h-22);}
 box(c,TIMBER[0],0,Math.round(h*.42),w,3);box(c,TIMBER[1],0,Math.round(h*.42),w,1);
 const dh=Math.min(h-20,54);door(c,16,h-dh,22,dh,{tone:['#14110e','#2f3a3a','#3c4a49'],style:'plank'});step(c,16,h,22,COOL,2);
 win(c,54,h-dh+4,22,18,{look:'fog',cols:2,rows:2,frame:'#4f4a42'});sill(c,54,h-dh+22,22,TIMBER);
 // The tin bath hung on the wall, and the water butt standing under the pipe.
 const bx=Math.min(w-34,92),by=h-dh+12;box(c,IRON,bx+9,by-13,2,3);for(let r=10;r>=8;r--)hoop(c,bx+10,by,r,r===10?'#6b757c':'#3a434a');box(c,'#2a3238',bx+3,by-5,14,10);box(c,'#4a545b',bx+4,by-6,6,1);
 pipe(c,w-13,8,h-30,s);barrel(c,w-24,h-30,20,30,'#34302a');
};
/** A brick coal store and privy under one sheet of iron. */
const coalStore:Paint=(c,w,h,s)=>{
 box(c,'#10151a',0,0,w,7);for(let px=0;px<w;px+=4){box(c,'#3d474e',px,2,2,5);box(c,'#272f35',px+2,2,2,5);}box(c,'#8b949a',0,0,w,2);box(c,'#10151a',0,7,w,2);
 wallAt(c,SOOT,s+1,0,9,w,h-9);
 const split=Math.round(w*.52);box(c,INK,split,9,2,h-9);wallAt(c,SOOT,s+9,split+2,9,6,h-9);box(c,SOOT.lip,split+2,9,1,h-9);
 // The privy: a plank door with a vent cut in it.
 const dh=Math.min(h-16,50);lintel(c,14,h-dh,20,COOL,5);door(c,14,h-dh,20,dh,{tone:['#14100c','#33291f','#463829'],style:'plank',knob:''});box(c,'#05070a',22,h-dh+7,4,4);box(c,'#05070a',23,h-dh+6,2,6);box(c,IRON,30,h-dh+26,2,5);
 win(c,44,h-dh+2,10,8,{look:'dark',cols:1,rows:1,frame:'#2a2019'});
 // The coal hole: a low hatch, and what the coalman spilt.
 const hx=split+18,hw=Math.min(40,w-hx-12);soldiers(c,hx-2,h-40,hw+4,7,SOOT.lip,SOOT.stones[2],SOOT.mortar,s);door(c,hx,h-33,hw,24,{tone:['#0d0d0e','#232425','#303233'],style:'pair',knob:''});box(c,SOOT.shade,hx-3,h-9,hw+6,9);
 for(let i=0;i<22;i++){const px=hx-6+Math.floor(hash(s,i,3)*(hw+12)),tall=1+Math.floor(hash(s,i,4)*5*(1-Math.abs(px-hx-hw/2)/(hw*.7)));if(tall>0)box(c,i%3?'#0c0d0f':'#1a1c1f',px,h-tall,3,tall);}
 edges(c,w,9,h,SOOT.lip);returnFace(c,w-5,9,h);
};
/** A passage through to the back court, with a room built over it. */
const passage:Paint=(c,w,h,s)=>{
 coping(c,0,w,5,WARM,s);wallAt(c,PLUM,s+1,0,5,w,10);band(c,-1,15,w+2,[PLUM.stones[3],PLUM.lip,PLUM.mortar],3);
 const arch=Math.min(h-70,74),room=h-arch;
 wallAt(c,PLUM,s+2,0,18,w,room-18);wallAt(c,PLUM,s+3,0,room,w,arch);
 const wy=18+Math.round((room-18-30)/2);soldiers(c,w/2-11,wy-8,22,8,PLUM.lip,PLUM.stones[0],PLUM.mortar,s);win(c,Math.round(w/2)-9,wy,18,30,{look:'blind',cols:2,rows:3,frame:'#4f4a42',s});sill(c,Math.round(w/2)-9,wy+30,18,WARM);
 band(c,0,room-4,w,WARM,4);
 // The archway: a round head in stone, the passage black behind it, one flag of the court catching light at the far end.
 const aw=w-20,ax=10,ay=h-arch+12;archRing(c,ax,ay,aw,'round',0,6,WARM[0],WARM[1],WARM[2],s);
 c.fillStyle='#07090c';shape(c,ax,ay,aw,h-ay,'round',0);c.fill();
 box(c,'#131a22',ax+Math.round(aw*.3),h-26,Math.round(aw*.4),20);box(c,'#1c2630',ax+Math.round(aw*.3),h-7,Math.round(aw*.4),2);box(c,'#0d1218',ax+3,h-3,aw-6,3);
 for(const px of [ax-4,ax+aw]){box(c,WARM[0],px,h-16,4,16);box(c,WARM[1],px,h-16,4,1);}
 edges(c,w,5,h,PLUM.lip);
};
/** A narrow pump house: the pump stands out on the lane with its trough. */
const pumpHouse:Paint=(c,w,h,s)=>{
 box(c,LEAD[0],0,0,w,6);box(c,LEAD[1],0,0,w,2);box(c,LEAD[2],0,6,w,1);for(let px=11;px<w-4;px+=15)box(c,LEAD[2],px,2,2,4);
 wallAt(c,OCHRE,s+1,0,7,w,Math.round(h*.5)-7);band(c,0,Math.round(h*.5)-3,w,[OCHRE.stones[2],OCHRE.lip,OCHRE.mortar],3);wallAt(c,OCHRE,s+2,0,Math.round(h*.5),w,h-Math.round(h*.5));
 // A louvred vent for the cistern under the roof.
 const vx=Math.round(w/2)-10;lintel(c,vx,22,20,COOL,5);box(c,INK,vx-1,21,22,20);for(let y=23;y<40;y+=3){box(c,'#2a2f33',vx,y,20,2);box(c,'#3b4146',vx,y,20,1);}sill(c,vx,40,20,COOL);
 const dh=Math.min(h-30,52),dx=8;lintel(c,dx,h-dh,20,COOL,5);door(c,dx,h-dh,20,dh,{tone:['#0f1318','#223042','#2f4158'],style:'plank'});step(c,dx,h,20,COOL,2);
 // The pump: an iron standard on its stone, the handle down, a lead-lined trough under the spout.
 const px=w-26;box(c,COOL[0],px-4,h-4,26,4);box(c,COOL[1],px-4,h-4,26,1);
 box(c,IRON,px,h-40,6,36);box(c,IRON_LIT,px+1,h-40,1,36);box(c,IRON,px-1,h-44,8,5);box(c,IRON_LIT,px-1,h-44,8,1);box(c,IRON,px+6,h-30,7,3);box(c,IRON,px+11,h-28,2,4);
 stroke(c,IRON,px+2,h-42,px-8,h-30,2);box(c,IRON_LIT,px-9,h-30,3,2);
 box(c,'#1c242c',px+5,h-14,17,10);box(c,COOL[0],px+5,h-14,17,2);box(c,'#10202a',px+7,h-12,13,1);
 edges(c,w,7,h,OCHRE.lip);returnFace(c,w-4,7,h,4);
};
/** Crates and a cask stacked on a roof. */
const crates:Paint=(c,w,h,s)=>{
 for(let y=h,r=0;y>0;r++){
  const ch=Math.min(y,20+Math.floor(hash(s,r,1)*8)),top=y-ch;
  for(let x=0,i=0;x<w;i++){
   const cw=Math.min(w-x,22+Math.floor(hash(s,r,i+2)*16));
   planks(c,BOARD_BROWN,'#17110d',s+r*7+i,x,top,cw-1,ch,5,8);box(c,TIMBER[0],x,top,cw-1,2);box(c,TIMBER[0],x,top+ch-2,cw-1,2);box(c,TIMBER[1],x,top,cw-1,1);box(c,TIMBER[0],x,top,2,ch);box(c,TIMBER[0],x+cw-3,top,2,ch);
   x+=cw;
  }
  y=top;
 }
 box(c,'#93745a',0,0,w,2);
};
const leanTo:Paint=(c,w,h,s)=>{
 if(h<=64){crates(c,w,h,s);return;}
 if(w<=84)((s>>3)%2?pumpHouse:passage)(c,w,h,s);
 else [stable,washhouse,coalStore][(s>>3)%3](c,w,h,s);
};

// ── Nell's house ────────────────────────────────────────────────────────────
const nell:Paint=(c,w,h,s)=>{
 const fl=[24,90,160,228,h],bays=[28,94,161,228,294],frame='#6a6f70',curtain='#46323a';
 for(let f=0;f<4;f++)wallAt(c,RED,s+f*13,0,fl[f],w,fl[f+1]-fl[f]);
 wallAt(c,RED,s+77,0,5,w,13);coping(c,0,w,5,PALE,s);
 // A brick cornice on a dentil course, under the parapet her dormer stands behind.
 box(c,'#1a1415',-2,17,w+4,7);box(c,'#5e423c',-2,18,w+4,4);box(c,'#7a5a50',-2,18,w+4,1);for(let px=1;px<w-2;px+=6)box(c,'#46302d',px,22,3,2);
 for(const y of [90,160,228])band(c,0,y-2,w,[RED.stones[2],RED.lip,RED.mortar],3);
 const looks:Look[][]=[['drawn','dark','blind','dark','drawn'],['dark','drawn','dim','drawn','dark'],['drawn','dark','drawn','dark','blind']];
 const tall=[32,40,40];
 for(let f=0;f<3;f++)for(let i=0;i<5;i++){
  const x=bays[i],y=fl[f]+(f?16:14),wh=tall[f];
  lintel(c,x,y,18,COOL,6);box(c,COOL[1],x+7,y-7,4,7);box(c,COOL[2],x+11,y-6,1,6);
  win(c,x,y,18,wh,{look:looks[f][i],cols:2,rows:2,rail:true,frame,tint:curtain,s:s+f*5+i});sill(c,x,y+wh,18,COOL);
  if(f===1&&i>0&&i<4)flowerBox(c,x,y+wh-2,18,s+i);
 }
 // The ground floor: her green door under a fanlight, the front area behind its railings.
 box(c,RED.shade,0,h-8,w,8);
 for(const i of [0,2,3,4]){const x=bays[i],y=fl[3]+12;lintel(c,x,y,18,COOL,6);win(c,x,y,18,34,{look:i===3?'dark':'drawn',cols:2,rows:2,rail:true,frame,tint:curtain,s:s+40+i});sill(c,x,y+34,18,COOL);}
 const dx=bays[1]-2;surround(c,dx,h-54,22,53,COOL,3);door(c,dx,h-54,22,54,{tone:['#101713','#213a2e','#2d4c3c'],style:'panel',fan:'dim',fanH:10});step(c,dx,h,22,PALE,4);
 for(const [x0,x1] of [[0,dx-8],[dx+30,w-22]] as const){box(c,COOL[0],x0,h-3,x1-x0,3);box(c,COOL[1],x0,h-3,x1-x0,1);box(c,IRON,x0,h-17,x1-x0,2);for(let px=x0+2;px<x1-1;px+=5){box(c,IRON,px,h-20,1,17);box(c,IRON_LIT,px,h-20,1,1);}}
 quoins(c,0,24,h,COOL);box(c,INK,0,24,1,h-24);box(c,INK,w-1,24,1,h-24);
 pipe(c,w-17,24,h,s);
};

// ── Bell Lane ───────────────────────────────────────────────────────────────
const bakehouse:Paint=(c,w,h,s)=>{
 const eave=36,sign=116,ground=132;
 // Pantiles to a clay ridge, sooted toward the stack on the east gable.
 pantiles(c,TILE,'#170f0d','#63433a',s,0,5,w,eave-9);box(c,CLAY[0],0,0,w,5);box(c,CLAY[1],0,0,w,2);box(c,'#170f0d',0,5,w,1);
 for(let px=6;px<w-4;px+=12+Math.floor(hash(s,px,1)*4))box(c,CLAY[2],px,2,1,3);
 c.save();c.globalAlpha=.13;for(const k of [84,58,34,16])box(c,'#000',w-k,5,k,eave-9);c.restore();box(c,CLAY[0],0,5,3,eave-9);box(c,CLAY[1],0,5,1,eave-9);gutter(c,-2,eave-4,w+4,s);
 // Limewashed brick over the bakery; the brick shows red where the gable takes the stack.
 wallAt(c,LIME,s+1,0,eave,w,sign-eave);wallAt(c,LIME,s+11,0,sign,w,ground-sign);wallAt(c,LIME,s+2,0,ground,w,h-ground-12);wallAt(c,SOOT,s+3,0,h-12,w,12);box(c,LIME.mortar,0,h-13,w,1);
 for(const [y0,y1,k] of [[eave,ground,4],[ground,h,5]] as const){wallAt(c,RED,s+k,w-12,y0,12,y1-y0);for(let y=y0;y<y1;y+=8)if(hash(s,y,6)>.5)wallAt(c,RED,s+y,w-18,y,6,8);}
 wallAt(c,RED,s+7,0,eave,9,ground-eave);wallAt(c,RED,s+8,0,ground,9,h-ground);box(c,RED.lip,0,eave,1,h-eave);box(c,RED.mortar,8,eave,1,h-eave);
 // The loft: small casements each side of the door the flour goes in at.
 const lx=Math.round(w/2)-13;
 for(const [x,look] of [[38,'dark'],[92,'drawn'],[214,'dark'],[268,'blind']] as const){archRing(c,x,56,16,'seg',3,5,RED.lip,RED.stones[1],RED.mortar,s+x);win(c,x,56,16,26,{look,cols:2,rows:3,frame:'#3b2e25',arch:'seg',rise:3,s:s+x});sill(c,x,82,16,WARM);}
 archRing(c,lx,50,26,'seg',4,6,RED.lip,RED.stones[1],RED.mortar,s);door(c,lx,50,26,48,{tone:['#17110d','#4a3b2a','#5e4c36'],style:'pair',arch:'seg',rise:4});sill(c,lx,98,26,WARM,4,4);
 stain(c,'#aeb6ba',lx,102,26,12,s+1,.22);
 // A louvred vent by the stack, and the soot it has put up the wall.
 box(c,INK,w-44,46,18,14);for(let y=48;y<58;y+=3){box(c,'#2a2f33',w-43,y,16,2);box(c,'#3b4146',w-43,y,16,1);}stain(c,'#000',w-48,46,26,10,s+2,.5,true);
 // The fascia, lettered, with a loaf painted at each end.
 board(c,26,sign,w-52,16,'BAKEHOUSE',2,'#1b2925','#3a4a42','#b3a888');
 for(const x of [44,w-64]){box(c,'#7a5a36',x,sign+5,18,7);box(c,'#7a5a36',x+2,sign+4,14,1);box(c,'#9a7646',x+2,sign+5,14,2);for(let k=0;k<3;k++)box(c,'#5a4028',x+4+k*5,sign+6,2,3);}
 // The shop: one window shuttered for the night, one lit where the bakers are at work, loaves on its shelves.
 const wy=ground+16;
 archRing(c,22,wy,58,'seg',6,6,RED.lip,RED.stones[1],RED.mortar,s+3);win(c,22,wy,58,60,{look:'board',arch:'seg',rise:6,frame:'#3b2e25'});sill(c,22,wy+60,58,WARM,3,4);box(c,IRON,22,wy+30,58,2);
 archRing(c,108,wy,58,'seg',6,6,RED.lip,RED.stones[1],RED.mortar,s+4);
 win(c,108,wy,58,60,{look:'lit',cols:5,rows:4,arch:'seg',rise:6,frame:'#3b2e25',s:1});
 for(const y of [wy+27,wy+42,wy+57])for(let x=112,i=0;x<160;x+=9,i++)if(hash(s,y,i)>.3){box(c,'#5a3a22',x,y-4,7,4);box(c,'#6e4a2a',x+1,y-5,5,1);}
 sill(c,108,wy+60,58,WARM,3,4);
 const dx=186;lintel(c,dx,h-62,24,WARM,6);door(c,dx,h-62,24,62,{tone:['#17110d','#3a2c20','#4c3a2a'],style:'panel',fan:'lit',fanH:10});step(c,dx,h,24,WARM,4);
 // The oven mouth in the gable end of the front: an iron door in a brick arch, fire behind its slots.
 const ox=238;wallAt(c,RED,s+9,ox-8,h-74,58,62);archRing(c,ox,h-58,42,'round',0,7,RED.lip,RED.stones[0],RED.mortar,s+5);
 c.fillStyle='#0d0d0e';shape(c,ox,h-58,42,46,'round',0);c.fill();box(c,'#1c1e20',ox+4,h-40,34,26);box(c,'#2c3033',ox+4,h-40,34,1);
 for(let i=0;i<5;i++){box(c,'#c8913f',ox+8+i*6,h-34,3,9);box(c,'#f3c77a',ox+9+i*6,h-31,1,4);}box(c,IRON_LIT,ox+18,h-20,8,2);
 stain(c,'#000',ox-6,h-64,54,34,s+6,.5,true);
 pipe(c,12,eave,h,s);box(c,INK,w-1,eave,1,h-eave);
};

const cooperage:Paint=(c,w,h,s)=>{
 const eave=20,jetty=112;
 pitch(c,w,eave,SLATE_PURPLE,s,5,10,LEAD);
 // The workshop floor: lapped boards, one long range of lights for the benches.
 laps(c,BOARD_BROWN,'#1a130f','#55432f',s,0,eave,w,jetty-eave,6);
 for(const px of [0,w-5]){box(c,TIMBER[0],px,eave,5,jetty-eave);box(c,TIMBER[1],px,eave,1,jetty-eave);}
 const bx=22,bw=w-44,by=eave+18;box(c,TIMBER[0],bx-3,by-4,bw+6,38);box(c,TIMBER[1],bx-3,by-4,bw+6,1);
 for(let x=bx,i=0;x<bx+bw-2;x+=16,i++){const lw=Math.min(15,bx+bw-x),v=hash(s,i,3);win(c,x,by,lw,28,{look:i===4?'board':v>.86?'broken':'dark',cols:2,rows:2,frame:'#3a2c22',s:s+i});}
 box(c,TIMBER[0],bx-4,by+28,bw+8,4);box(c,TIMBER[1],bx-4,by+28,bw+8,1);
 // Hoops on their pegs, and the sign.
 for(const r of [13,10,7]){hoop(c,41,jetty-35+r,r,'#10161b');hoop(c,41,jetty-36+r,r,r===10?'#59636a':'#4a545b');}box(c,TIMBER[0],40,jetty-39,3,4);box(c,TIMBER[1],40,jetty-39,3,1);
 board(c,Math.round(w/2)-34,jetty-34,68,18,'COOPER',2,'#2a2019','#5e4a36','#b3a888');
 for(const r of [11,8]){hoop(c,w-42,jetty-34+r,r,'#10161b');hoop(c,w-42,jetty-35+r,r,'#59636a');}box(c,TIMBER[0],w-43,jetty-38,3,4);box(c,TIMBER[1],w-43,jetty-38,3,1);
 // The bressummer the boarded floor sits on, joist ends under it.
 box(c,TIMBER[2],0,jetty,w,9);box(c,TIMBER[0],0,jetty,w,7);box(c,TIMBER[1],0,jetty,w,1);for(let px=6;px<w-6;px+=13)box(c,TIMBER[2],px,jetty+7,5,3);
 // Brick below: the yard doors, a barred light, casks waiting to go out.
 wallAt(c,SOOT,s+1,0,jetty+9,w,h-jetty-9);
 const dx=64,dw=84,dy=h-84;archRing(c,dx,dy,dw,'seg',8,7,RED.lip,RED.stones[1],RED.mortar,s+2);
 door(c,dx,dy,dw,84,{tone:['#17110d','#3a2d22','#4b3a2b'],style:'pair',arch:'seg',rise:8});
 for(const px of [dx-5,dx+dw]){box(c,COOL[0],px,h-14,5,14);box(c,COOL[1],px,h-14,5,1);}
 lintel(c,20,h-70,22,COOL,6);win(c,20,h-70,22,26,{look:'dark',cols:1,rows:1,frame:'#2a2019'});for(let px=24;px<40;px+=4)box(c,IRON,px,h-69,1,24);sill(c,20,h-44,22,COOL);
 barrel(c,w-76,h-30,22,30);barrel(c,w-52,h-30,22,30,'#44352a');barrel(c,w-28,h-26,20,26,'#37291e');barrel(c,w-64,h-58,22,28,'#40322a');
 for(let i=0;i<5;i++)stroke(c,i%2?'#4a3a2c':'#3a2c22',20+i*3,h-1,30+i*3,h-38,2);
 edges(c,w,jetty+9,h,SOOT.lip);returnFace(c,w-5,jetty+9,h);
};

const laundry:Paint=(c,w,h,s)=>{
 const loft=82,mid=178,brick:Tri=[OCHRE.stones[2],OCHRE.lip,OCHRE.mortar];
 wallAt(c,OCHRE,s+1,0,5,w,12);coping(c,0,w,5,PALE,s);band(c,-1,17,w+2,COOL,4);
 wallAt(c,OCHRE,s+2,0,21,w,loft-21);wallAt(c,OCHRE,s+3,0,loft+18,w,mid-loft-18);wallAt(c,LIME,s+4,0,mid,w,h-mid);
 // The drying loft under the roof: two bays of timber louvres either side of a pier.
 for(const x of [16,88]){lintel(c,x,30,56,COOL,5);box(c,INK,x-1,29,58,42);for(let y=31;y<70;y+=4){const v=hash(s,x,y);box(c,v>.5?'#3d3a34':'#44403a',x,y,56,3);box(c,'#5a554c',x,y,56,1);}box(c,'#2a2823',x+27,30,2,40);sill(c,x,70,56,COOL);}
 // The name painted on a rendered band.
 box(c,INK,0,loft-1,w,20);box(c,'#333d47',0,loft,w,18);box(c,'#46515c',0,loft,w,1);text(c,'LAUNDRY',Math.round((w-textW('LAUNDRY',2))/2),loft+4,'#a3aaa9',2);
 // The wash floor: tall windows running with steam, one with a lamp behind it, bedding put out to air on a sill.
 for(const [x,look] of [[18,'fog'],[69,'foglit'],[120,'fog']] as const){archRing(c,x,114,22,'seg',4,5,RED.lip,RED.stones[1],RED.mortar,s+x);win(c,x,114,22,46,{look,cols:2,rows:4,frame:'#6a7378',arch:'seg',rise:4,s:s+x});sill(c,x,160,22,COOL);}
 box(c,'#7f8a92',116,158,30,13);box(c,'#99a3a8',116,158,30,2);for(const px of [122,131,139])box(c,'#667078',px,160,1,11);box(c,'#667078',116,170,30,1);
 band(c,0,mid-3,w,brick,3);
 // Below: the ironing room's wide light, the door, the waste running to its gully.
 lintel(c,18,mid+18,66,COOL,6);win(c,18,mid+18,66,36,{look:'fog',cols:6,rows:3,frame:'#6a7378',s});sill(c,18,mid+54,66,COOL);
 lintel(c,112,h-50,22,COOL,6);door(c,112,h-50,22,50,{tone:['#0f1318','#27384a','#34495f'],style:'panel',fan:'fog'});step(c,112,h,22,PALE);
 box(c,LEAD[0],94,h-18,5,3);box(c,LEAD[1],94,h-18,5,1);stain(c,'#c3ccd0',92,h-15,9,15,s,.3);
 // Corner piers, a brick and a half proud of the wall.
 for(const px of [0,w-10]){wallAt(c,OCHRE,s+px+9,px,21,10,mid-21);wallAt(c,LIME,s+px+11,px,mid,10,h-mid);box(c,OCHRE.lip,px,21,1,h-21);box(c,INK,px+9,21,1,h-21);}
 box(c,LIME.shade,0,h-8,w,8);pipe(c,w-7,21,h,s);box(c,INK,0,21,1,h-21);box(c,INK,w-1,21,1,h-21);
};

const dyehouse:Paint=(c,w,h,s)=>{
 const hank=100,mid=126,ground=200,DYES=['#6a3038','#2c3a66','#5d5a30','#4a3058','#31564a'];
 wallAt(c,SOOT,s+1,0,5,w,10);coping(c,0,w,5,WARM,s);
 // A corbelled brick cornice, three courses stepping out.
 for(let k=0;k<3;k++){box(c,SOOT.mortar,-k,15+k*3,w+k*2,3);box(c,SOOT.stones[2],-k,15+k*3,w+k*2,2);box(c,SOOT.lip,-k,15+k*3,w+k*2,1);}
 wallAt(c,SOOT,s+2,0,24,w,hank-24);wallAt(c,SOOT,s+3,0,hank,w,mid-hank);wallAt(c,SOOT,s+4,0,mid,w,ground-mid);wallAt(c,SOOT,s+5,0,ground,w,h-ground);
 // The drying floor: round-headed iron lights.
 for(const [x,look] of [[20,'dark'],[78,'dark'],[136,'broken']] as const){archRing(c,x,40,24,'round',0,5,PLUM.lip,PLUM.stones[1],PLUM.mortar,s+x);win(c,x,40,24,46,{look,cols:3,rows:5,frame:'#1c232b',arch:'round',s:s+x});sill(c,x,86,24,WARM);}
 // Hanks of dyed yarn on two iron rails, and the sign between them.
 for(const [x0,x1] of [[8,62],[118,172]] as const){
  box(c,IRON,x0,hank+3,x1-x0,2);box(c,IRON_LIT,x0,hank+3,x1-x0,1);for(const px of [x0,x1-3]){box(c,IRON,px,hank,3,6);}
  for(let px=x0+5,i=0;px<x1-8;px+=7,i++){const tall=14+Math.floor(hash(s,px,2)*7),col=DYES[(i+(x0>>3))%5];box(c,INK,px-1,hank+4,6,tall+1);box(c,col,px,hank+4,4,tall);box(c,'#ffffff18',px,hank+4,1,tall);box(c,INK,px,hank+8,4,1);}
 }
 board(c,70,hank+2,40,18,'DYER',2,'#1d1a22','#4a3e52','#a8a08c');
 // The vat floor: wide low lights, a lead spout under each, and what has run from them down the wall for years.
 for(const [x,dye] of [[18,0],[120,1]] as const){
  archRing(c,x,mid+14,42,'seg',5,6,PLUM.lip,PLUM.stones[1],PLUM.mortar,s+x);win(c,x,mid+14,42,34,{look:'dark',cols:4,rows:3,frame:'#1c232b',arch:'seg',rise:5,s:s+x});sill(c,x,mid+48,42,WARM);
  const sx=x+18;box(c,LEAD[0],sx,mid+51,6,5);box(c,LEAD[1],sx,mid+51,6,1);stain(c,DYES[dye],sx-5,mid+56,16,h-mid-56,s+dye,.5);stain(c,DYES[dye+2],sx-2,mid+56,9,(h-mid-56)*.6,s+dye+5,.4);
 }
 band(c,0,ground-3,w,[SOOT.stones[2],SOOT.lip,SOOT.mortar],3);
 // The door, and a vat stood out on the lane to be scoured, the liquor still in it.
 soldiers(c,76,h-54,28,8,PLUM.lip,PLUM.stones[0],PLUM.mortar,s);door(c,78,h-46,24,46,{tone:['#170f0e','#3e231f','#53302a'],style:'plank'});step(c,78,h,24,WARM);
 barrel(c,w-50,h-30,36,30,'#352a22');box(c,'#2c3a66',w-47,h-30,30,2);box(c,'#3b4c80',w-44,h-30,10,1);
 box(c,SOOT.shade,0,h-7,w,7);edges(c,w,24,h,SOOT.lip);returnFace(c,w-5,24,h);
};

const store:Paint=(c,w,h,s)=>{
 const base=112;
 // A tarred flat with a timber kerb.
 box(c,TIMBER[2],0,0,w,12);box(c,'#93745a',0,0,w,2);box(c,TIMBER[1],0,2,w,3);box(c,'#23272c',0,5,w,6);for(let px=7;px<w;px+=17+Math.floor(hash(s,px,1)*6))box(c,'#15181c',px,5,1,6);
 planks(c,BOARD_PITCH,'#101316',s,0,12,w,base-12,5,9);
 for(const px of [0,w-4]){box(c,'#15181c',px,12,4,base-12);box(c,'#3a4046',px,12,1,base-12);}
 board(c,Math.round(w/2)-31,18,62,16,'SLATER',2,'#262b30','#5a636a','#a9a590');
 // The loading door the hoist serves, and its sill.
 const lx=Math.round(w/2)-20;box(c,TIMBER[0],lx-3,42,46,4);box(c,TIMBER[1],lx-3,42,46,1);door(c,lx,46,40,52,{tone:['#101316','#30363c','#414950'],style:'pair'});box(c,TIMBER[0],lx-4,98,48,4);box(c,TIMBER[1],lx-4,98,48,1);
 box(c,TIMBER[0],0,base-4,w,5);box(c,TIMBER[1],0,base-4,w,1);
 wallAt(c,GREY,s+2,0,base+1,w,h-base-1);
 lintel(c,12,h-72,46,COOL,6);door(c,12,h-72,46,72,{tone:['#101316','#2b3036','#3a4148'],style:'pair'});
 lintel(c,76,h-96,24,COOL,5);win(c,76,h-96,24,16,{look:'dark',cols:1,rows:1,frame:'#1c232b'});for(let px=80;px<98;px+=4)box(c,IRON,px,h-95,1,14);sill(c,76,h-80,24,COOL);
 // The roofers' stock: slates stood on edge, a roll of lead, a ladder leant from the lane.
 for(let px=66,i=0;px<92;px+=2,i++){const tall=20+Math.floor(hash(s,i,3)*5);box(c,i%2?'#303a46':'#28313b',px,h-tall,2,tall);box(c,'#3d4954',px,h-tall,1,1);}
 for(let r=6;r>0;r-=2)hoop(c,102,h-7,r,r===6?'#6a747b':'#3a434a');box(c,'#4a545c',97,h-2,11,2);
 ladder(c,w-8,h-1,w-26,base+12,8,'#3a2d22','#5e4a36');
 edges(c,w,base+1,h,GREY.lip);returnFace(c,w-4,12,h,4);
};

const tall:Paint=(c,w,h,s)=>{
 const fl=[28,92,170,254,350,446,h],bays=[30,90,150,210,270],frame='#59636b',stone=COOL;
 wallAt(c,PLUM,s+70,0,5,w,10);coping(c,0,w,5,PALE,s);
 // The cornice: a stone shelf on modillions.
 box(c,stone[2],-3,15,w+6,13);box(c,stone[0],-4,15,w+8,5);box(c,stone[1],-4,15,w+8,1);box(c,stone[2],-4,20,w+8,1);box(c,'#39424a',-1,21,w+2,6);for(let px=2;px<w-4;px+=9){box(c,stone[0],px,21,5,5);box(c,stone[1],px,21,5,1);}
 for(let f=0;f<5;f++)wallAt(c,PLUM,s+f*19,0,fl[f],w,fl[f+1]-fl[f]);
 wallAt(c,RUSTIC,s+9,0,fl[5],w,h-fl[5]);
 for(let f=1;f<6;f++)band(c,-1,fl[f]-3,w+2,stone,f===5?6:f===3?5:3);
 const tallOf=[22,40,46,56,52],looks:Look[][]=[
  ['dark','blind','dark','dim','dark'],['drawn','dark','dark','lit','drawn'],['dark','drawn','blind','dark','dark'],
  ['drawn','dark','drawn','dark','blind'],['lit','dark','shut','drawn','dark']];
 for(let f=0;f<5;f++)for(let i=0;i<5;i++){
  const wh=tallOf[f],x=bays[i],y=fl[f]+Math.round((fl[f+1]-fl[f]-wh)/2)-(f===0?2:0),id=f*5+i;
  if(f===2&&i===4){
   // A window walled up to save the tax, in a redder brick than the house.
   surround(c,x,y,20,wh,stone,3);box(c,INK,x-1,y-1,22,wh+1);wallAt(c,RED,s+id,x,y,20,wh);box(c,'#00000055',x,y,20,2);sill(c,x,y+wh,20,stone,4);continue;
  }
  if(f===3){surround(c,x,y,20,wh,stone,4);box(c,stone[2],x-7,y-9,34,5);box(c,stone[0],x-7,y-10,34,4);box(c,stone[1],x-7,y-10,34,1);}
  else if(f===0)lintel(c,x,y,20,stone,5,1);
  else surround(c,x,y,20,wh,stone,3);
  win(c,x,y,20,wh,{look:looks[f][i],cols:f===0?2:2,rows:f===0?2:f===3?4:3,rail:f>0,frame,tint:f===4?'#2a3a36':CURTAINS[(id*3+1)%5],s:s+id*3});
  sill(c,x,y+wh,20,stone,4);
  // The first-floor rooms have iron balconettes bolted under their sills.
  if(f===3&&i>0&&i<4){box(c,IRON,x-5,y+wh-12,30,1);box(c,IRON,x-5,y+wh+2,30,2);for(let px=x-5;px<x+25;px+=3)box(c,IRON,px,y+wh-12,1,14);box(c,IRON_LIT,x-5,y+wh-12,30,1);}
 }
 // The ground storey in channelled stone: an arched door up two steps, arched lights, the area's railings.
 const gy=fl[5]+26;
 for(const i of [0,1,3,4]){const x=bays[i]-2;archRing(c,x,gy,24,'round',0,7,stone[0],'#414a52',stone[2],s+i);win(c,x,gy,24,58,{look:i===1?'drawn':i===4?'blind':'dark',cols:2,rows:4,frame,arch:'round',tint:CURTAINS[i],s:s+50+i});sill(c,x,gy+58,24,stone,3,4);}
 const dx=145;archRing(c,dx,h-88,30,'round',0,8,stone[0],'#414a52',stone[2],s+7);box(c,stone[1],dx+12,h-98,6,10);
 door(c,dx,h-88,30,82,{tone:['#0f1113','#262b30','#373d43'],style:'panel',arch:'round',fan:'dim',fanH:17});
 box(c,stone[0],dx-8,h-6,46,6);box(c,stone[1],dx-8,h-6,46,1);box(c,stone[0],dx-4,h-10,38,4);box(c,stone[1],dx-4,h-10,38,1);
 for(const [x0,x1] of [[18,dx-12],[dx+42,w-18]] as const){box(c,stone[0],x0,h-4,x1-x0,4);box(c,stone[1],x0,h-4,x1-x0,1);box(c,IRON,x0,h-20,x1-x0,2);for(let px=x0+1;px<x1-1;px+=4){box(c,IRON,px,h-24,1,20);box(c,IRON_LIT,px,h-24,1,1);}}
 quoins(c,0,28,fl[5]-3,stone,false,14,17,10);quoins(c,w,28,fl[5]-3,stone,true,14,17,10);
 box(c,INK,0,28,1,h-28);box(c,INK,w-1,28,1,h-28);
 pipe(c,122,28,h,s);
};

const chandler:Paint=(c,w,h,s)=>{
 const fl=[30,124,236,338,h],plaster:Tri=['#555e66','#5e676e','#49515a'],post='#1d1814',lit='#3d3229';
 // Old clay tiles to a clay ridge.
 box(c,'#170f0d',0,5,w,21);for(let py=5,r=0;py<26;py+=5,r++)for(let px=-Math.floor(hash(s,r,1)*7),i=0;px<w;px+=7,i++){const x0=Math.max(0,px),x1=Math.min(w,px+7);if(x1-x0>1&&hash(s,r,i+9)<.975)box(c,TILE[Math.floor(hash(s,r,i+3)*4)],x0,py,x1-x0-1,4);}
 box(c,CLAY[0],0,0,w,5);box(c,CLAY[1],0,0,w,2);box(c,'#170f0d',0,5,w,1);for(let px=5;px<w-4;px+=10+Math.floor(hash(s,px,2)*5))box(c,CLAY[2],px,2,1,3);
 box(c,post,-2,26,w+4,4);box(c,lit,-2,26,w+4,1);for(let px=3;px<w;px+=11)box(c,post,px,30,4,3);
 // Three framed storeys, each framed its own way, each jettied on the bressummer under it.
 const beam=(y:number,t:number)=>{box(c,'#110d0a',0,y,w,t+2);box(c,'#231c16',0,y,w,t);box(c,'#4a3c2e',0,y,w,1);for(let px=5;px<w-6;px+=12)box(c,'#110d0a',px,y+t,5,3);};
 const stud=(x:number,y0:number,y1:number,wide=4)=>{box(c,post,x,y0,wide,y1-y0);box(c,lit,x,y0,1,y1-y0);};
 const brace=(x0:number,y0:number,x1:number,y1:number)=>{stroke(c,post,x0,y0,x1,y1,4);stroke(c,lit,x0,y0,x1,y1,1);};
 for(let f=0;f<3;f++){
  const y0=fl[f],y1=fl[f+1]-(f===2?16:10);renderAt(c,plaster,s+f*11,0,y0,w,y1-y0);
  stud(0,y0,y1,6);stud(w-6,y0,y1,6);
  if(f===0){for(let x=22;x<w-10;x+=17)stud(x,y0,y1,3);}
  else if(f===1){for(let x=38;x<w-10;x+=44)stud(x,y0,y1);box(c,post,0,y0+48,w,4);box(c,lit,0,y0+48,w,1);brace(6,y0+46,34,y0+4);brace(w-10,y0+46,w-38,y0+4);brace(6,y1-4,34,y0+54);brace(w-10,y1-4,w-38,y0+54);}
  else{for(let x=30;x<w-10;x+=30)stud(x,y0,y1);box(c,post,0,y0+30,w,4);box(c,lit,0,y0+30,w,1);for(let x=30;x<w-70;x+=60){brace(x+4,y1-2,x+28,y0+36);brace(x+56,y1-2,x+32,y0+36);}}
  beam(y1,f===2?13:7);
 }
 // The top room is lit: a row of dips burning on the sill behind the leaded lights.
 const mull=(x:number,y:number,n:number,lw:number,wh:number,look:(i:number)=>Look)=>{
  box(c,post,x-3,y-4,n*lw+7,wh+8);box(c,lit,x-3,y-4,n*lw+7,1);
  for(let i=0;i<n;i++)win(c,x+i*lw+1,y,lw-1,wh,{look:look(i),cols:1,rows:1,frame:'#16120f',s:s+x+i});
  box(c,post,x-5,y+wh,n*lw+11,4);box(c,lit,x-5,y+wh,n*lw+11,1);
 };
 const tx=Math.round(w/2)-40;mull(tx,fl[0]+30,5,16,34,()=>'leadlit');
 for(let i=0;i<7;i++){const px=tx+7+i*11,tall=7+Math.floor(hash(s,i,4)*6);box(c,'#e8dcc0',px,fl[0]+64-tall,2,tall);box(c,'#fff0c4',px,fl[0]+61-tall,2,3);box(c,'#ffffff',px,fl[0]+62-tall,1,1);}
 board(c,Math.round(w/2)-42,fl[1]-9,84,14,'CHANDLER',2,'#231c16','#5a4936','#b8ad8e');
 mull(40,fl[1]+60,3,14,34,i=>i===1?'lead':'dark');mull(w-86,fl[1]+60,3,14,34,i=>i===2?'broken':'lead');
 mull(Math.round(w/2)-49,fl[2]+38,7,14,38,i=>i%3===1?'dark':'lead');
 // The shop: a boarded stall-riser, the window hung with dips by their wicks, a studded door.
 wallAt(c,OCHRE,s+5,0,fl[3],w,h-fl[3]);stud(0,fl[3],h,6);stud(w-6,fl[3],h,6);
 const sx=24,sw=140,sy=fl[3]+18;box(c,post,sx-4,sy-5,sw+8,60);box(c,lit,sx-4,sy-5,sw+8,1);
 for(let i=0;i<7;i++)win(c,sx+i*20,sy,19,50,{look:'dark',cols:2,rows:4,frame:'#16120f',s:s+90+i});
 box(c,'#3a3026',sx+2,sy+6,sw-4,1);for(let px=sx+5,i=0;px<sx+sw-4;px+=4,i++)if(i%5!==4){const tall=12+Math.floor(hash(s,i,6)*10);box(c,'#8f8a78',px,sy+7,2,tall);}
 planks(c,BOARD_BROWN,'#17110d',s+7,sx-4,sy+55,sw+8,h-sy-55,6,10);box(c,lit,sx-4,sy+55,sw+8,1);
 const dx=w-74;box(c,post,dx-4,h-70,36,70);box(c,lit,dx-4,h-70,36,1);door(c,dx,h-66,28,66,{tone:['#110d0a','#33281e','#44362a'],style:'plank',arch:'seg',rise:5});
 for(let py=h-56;py<h-6;py+=9)for(let px=dx+4;px<dx+26;px+=7)box(c,'#59636a',px,py,1,1);
 step(c,dx,h,28,WARM,4);
 box(c,INK,0,30,1,h-30);box(c,INK,w-1,30,1,h-30);
};

const shed:Paint=(c,w,h,s)=>{
 const base=h-58,fl=[14,108,200,base];
 // Tarred boards under a felted roof with a zinc ridge: three lofts, a door to each, a ladder fixed up the face.
 box(c,'#0c0e10',0,0,w,14);box(c,'#7f878c',0,0,w,2);box(c,'#3a4146',0,2,w,3);box(c,'#1d2125',0,5,w,6);box(c,'#2c3136',-2,11,w+4,3);box(c,'#454b50',-2,11,w+4,1);
 for(let f=0;f<3;f++){planks(c,BOARD_TAR,'#0b0b0b',s+f*7,0,fl[f],w,fl[f+1]-fl[f],5,10);if(f)box(c,'#0b0b0b',0,fl[f]-1,w,3),box(c,'#34302d',0,fl[f]-1,w,1);}
 for(const px of [0,w-4]){box(c,'#141312',px,14,4,base-14);box(c,'#34302d',px,14,1,base-14);}
 const dx=40;
 for(let f=0;f<3;f++){
  const dy=fl[f]+(f===0?36:30),dh=fl[f+1]-dy-(f===2?22:14);
  box(c,'#0b0b0b',dx-3,dy-3,30,3);box(c,'#34302d',dx-3,dy-3,30,1);door(c,dx,dy,24,dh,{tone:['#0b0b0b','#2c2927','#3a3633'],style:'plank',knob:''});box(c,'#141312',dx-4,dy+dh,32,3);box(c,'#3a3633',dx-4,dy+dh,32,1);
  // A shuttered light beside each door, no two alike.
  if(f===0)win(c,96,dy+4,16,14,{look:'board',frame:'#141312'});
  else if(f===1){win(c,14,dy+8,12,12,{look:'dark',cols:1,rows:1,frame:'#141312'});box(c,'#141312',100,dy+2,20,16);for(let y=dy+4;y<dy+16;y+=3)box(c,'#2c2927',101,y,18,2);}
  else win(c,98,dy+6,18,16,{look:'shut',frame:'#141312',tint:'#2c2927'});
 }
 ladder(c,72,base-1,72,fl[0]+30,10,'#3a2f25','#5a4936');for(const y of [fl[1],fl[2],fl[0]+34]){box(c,IRON,70,y+4,2,3);box(c,IRON,83,y+4,2,3);}
 // The tallow mark, tarred on white: the yard's own shed.
 box(c,'#8f8a78',w-34,fl[0]+8,20,14);box(c,'#141312',w-33,fl[0]+9,18,12);box(c,'#8f8a78',w-25,fl[0]+11,2,8);box(c,'#f3c77a',w-25,fl[0]+10,2,2);
 // The brick foot: a ledged door, a tallow cask and a crate beside it.
 wallAt(c,GREY,s+3,0,base,w,h-base);box(c,'#141312',0,base-2,w,3);
 lintel(c,16,h-48,40,COOL,6);door(c,16,h-48,40,48,{tone:['#0f0f10','#2b2927','#3b3835'],style:'pair'});
 barrel(c,w-56,h-28,20,28,'#3a3026');box(c,'#17110d',w-32,h-20,24,20);planks(c,BOARD_BROWN,'#17110d',s+9,w-31,h-19,22,18,5,8);box(c,TIMBER[1],w-32,h-20,24,1);
 edges(c,w,base,h,GREY.lip);returnFace(c,w-4,14,h,4);
};

const almshouse:Paint=(c,w,h,s)=>{
 const eave=40,fl=[eave,136,232,h],stone=WARM,frame='#2a2824';
 pitch(c,w,eave,SLATE_GREEN,s,6,9,[stone[0],'#8f8a7c',stone[2]]);
 for(let f=0;f<3;f++)wallAt(c,SAND,s+f*23,0,fl[f],w,fl[f+1]-fl[f]);
 // Three stone gablets come up through the eaves, a light in each.
 const gablet=(cx:number,k:number)=>{
  c.save();c.beginPath();for(let dy=0;dy<30;dy++)c.rect(cx-2-dy,eave-22+dy,4+dy*2,1);c.clip();wallAt(c,SAND,s+k,cx-34,eave-22,68,34);c.restore();
  for(let dy=0;dy<30;dy++){box(c,stone[1],cx-3-dy,eave-23+dy,2,1);box(c,stone[0],cx+1+dy,eave-23+dy,2,1);box(c,stone[2],cx+3+dy,eave-22+dy,1,1);}
  box(c,stone[1],cx-2,eave-26,4,4);win(c,cx-5,eave-8,10,14,{look:k===2?'dim':'dark',cols:2,rows:1,frame,s:s+k});
 };
 for(const [cx,k] of [[52,1],[160,2],[268,3]] as const)gablet(cx,k);
 for(const y of [136,232])band(c,-1,y-3,w+2,stone,4);
 // Paired lights under drip moulds, the same on both floors as the trust laid down; what is in them is each pensioner's own.
 const xs=[22,74,222,274],looks:Look[][]=[['drawn','dark','blind','drawn'],['dark','drawn','lit','dark']];
 for(let f=0;f<2;f++)for(let i=0;i<4;i++){
  const x=xs[i],y=fl[f]+(f?28:34);hood(c,x,y,25,stone);
  for(const k of [0,1])win(c,x+k*13,y,12,30,{look:looks[f][i],cols:1,rows:2,frame,tint:CURTAINS[(i+f*2)%5],s:s+f*9+i*2+k});
  box(c,stone[0],x+11,y,3,30);box(c,stone[1],x+11,y,1,30);sill(c,x,y+30,25,stone);
 }
 // The founder in a niche over the tablet that names the house.
 const nx=Math.round(w/2)-10;archRing(c,nx,fl[0]+26,20,'round',0,4,stone[0],stone[1],stone[2],s);
 c.fillStyle='#14161a';shape(c,nx,fl[0]+26,20,40,'round',0);c.fill();
 box(c,'#59636b',nx+7,fl[0]+36,6,6);box(c,'#4c555d',nx+5,fl[0]+42,10,20);box(c,'#6a737a',nx+5,fl[0]+42,2,20);box(c,'#3a424a',nx+12,fl[0]+46,3,16);box(c,stone[0],nx-2,fl[0]+66,24,4);box(c,stone[1],nx-2,fl[0]+66,24,1);
 box(c,stone[2],nx-22,fl[1]+12,64,30);box(c,'#4a463f',nx-21,fl[1]+13,62,28);box(c,stone[1],nx-21,fl[1]+13,62,1);
 text(c,'ALMSHOUSES',nx-9,fl[1]+18,'#16140f');box(c,'#16140f',nx-12,fl[1]+27,44,1);box(c,'#16140f',nx-6,fl[1]+31,32,1);box(c,'#16140f',nx-12,fl[1]+35,44,1);
 // Four doors, four pointed heads, a light beside each, a bench where the old men sit.
 const doors=[34,104,198,268];
 for(let i=0;i<4;i++){
  const x=doors[i];archRing(c,x,h-52,20,'point',12,5,stone[0],stone[1],stone[2],s+i);
  door(c,x,h-52,20,52,{tone:DOOR_TONES[[3,0,3,2][i]],style:'plank',arch:'point',rise:12});step(c,x,h,20,stone);
  const wx=i%2?x-24:x+30;hood(c,wx,h-56,12,stone);win(c,wx,h-56,12,22,{look:i===1?'dim':i===3?'blind':'dark',cols:1,rows:2,frame,s:s+60+i});sill(c,wx,h-34,12,stone);
 }
 box(c,stone[0],138,h-14,44,3);box(c,stone[1],138,h-14,44,1);for(const px of [141,175])box(c,stone[0],px,h-11,4,11);
 box(c,SAND.shade,0,h-9,w,9);box(c,stone[0],0,h-11,w,2);box(c,stone[1],0,h-11,w,1);
 quoins(c,0,eave,h-11,stone,false,11,14,8);quoins(c,w,eave,h-11,stone,true,11,14,8);
 box(c,INK,0,eave,1,h-eave);box(c,INK,w-1,eave,1,h-eave);
 pipe(c,130,eave,h,s);pipe(c,188,eave,h,s+5);
};

const chapel:Paint=(c,w,h,s)=>{
 const eave=64,gable=w-68,stone:Tri=['#3f4a55','#5a6672','#1c242c'];
 // Stone slates, the courses deepening to the eaves, between the west verge and the east gable.
 slates(c,STONE_SLATE,'#14170f',s,0,5,gable,eave-9,5,7,.45,.994);
 box(c,PALE[0],0,0,w,5);box(c,PALE[1],0,0,w,2);box(c,'#12171c',0,5,gable,1);for(let px=9;px<gable-4;px+=15+Math.floor(hash(s,px,1)*6))box(c,PALE[2],px,2,1,3);
 box(c,stone[0],0,5,5,eave-9);box(c,stone[1],0,5,1,eave-9);box(c,stone[2],4,5,1,eave-9);
 // The eaves course on its corbels.
 box(c,stone[2],-2,eave-4,gable+2,6);box(c,stone[0],-2,eave-4,gable+2,4);box(c,stone[1],-2,eave-4,gable+2,1);for(let px=4;px<gable-6;px+=14){box(c,stone[0],px,eave,6,4);box(c,stone[2],px,eave+4,6,1);}
 // The nave wall in rubble, a sill band across it, a battered plinth.
 const sillY=216;wallAt(c,RUBBLE,s+1,0,eave,gable,sillY-eave);wallAt(c,RUBBLE,s+2,0,sillY,gable,h-sillY-18);band(c,0,sillY-3,gable,stone,4);
 wallAt(c,ASHLAR,s+3,-3,h-18,gable+3,18);box(c,stone[1],-3,h-18,gable+3,1);box(c,stone[2],-3,h-19,gable+3,1);
 // Three lancets, leaded; a little colour left in the glass, the sanctuary lamp behind the eastmost.
 const bays=[38,128,220],GLASS=['#2c3a66','#5a2f38','#4a4a2a','#274a44'];
 for(let i=0;i<3;i++){
  const x=bays[i],y=92,lh=112;archRing(c,x,y,20,'point',24,4,stone[0],'#46525e',stone[2],s+i);
  box(c,stone[0],x-3,y+24,3,lh-24);box(c,stone[1],x-3,y+24,1,lh-24);box(c,stone[2],x+20,y+24,3,lh-24);
  c.fillStyle=INK;shape(c,x-1,y-1,22,lh+1,'point',25);c.fill();
  c.save();shape(c,x,y,20,lh,'point',24);c.clip();
  box(c,'#101924',x,y,20,lh);box(c,'#18273a',x+1,y+10,9,34);
  for(let k=0;k<16;k++){const px=x+1+Math.floor(hash(s,i,k+3)*4)*5,py=y+6+Math.floor(hash(s,i,k+30)*17)*6;box(c,GLASS[Math.floor(hash(s,i,k+60)*4)],px,py,4,5);}
  if(i===2){box(c,'#5a3324',x+7,y+72,7,10);box(c,'#a8563a',x+9,y+75,3,4);box(c,'#f3c77a',x+10,y+76,1,2);}
  for(let py=y+5;py<y+lh;py+=6)box(c,'#0a0f15',x,py,20,1);for(const px of [x+5,x+10,x+15])box(c,'#0a0f15',px,y,1,lh);
  c.restore();
  sill(c,x,y+lh,20,stone,4,4);
 }
 // Buttresses in dressed stone, set back twice as they rise, each offset weathered.
 const buttress=(x:number,k:number)=>{
  const steps=[[eave+18,10],[178,14],[292,18]] as const;
  for(let i=0;i<3;i++){const [top,wide]=steps[i],bottom=i<2?steps[i+1][0]:h,x0=x-Math.round((wide-10)/2);wallAt(c,ASHLAR,s+k+i*5,x0,top,wide,bottom-top);box(c,stone[1],x0,top,1,bottom-top);box(c,INK,x0+wide-1,top,1,bottom-top);box(c,INK,x0-1,top,1,bottom-top);
   box(c,stone[1],x0,top-3,wide,2);box(c,stone[0],x0+1,top-1,wide-2,1);box(c,stone[1],x0+2,top-5,wide-4,2);}
 };
 buttress(4,10);buttress(92,20);buttress(182,30);
 // The priest's door, low under the west lancet.
 const dx=bays[0]-3;archRing(c,dx,h-66,26,'point',16,5,stone[0],'#46525e',stone[2],s+9);
 door(c,dx,h-66,26,48,{tone:['#0f0d0c','#2b2420','#3b322b'],style:'plank',arch:'point',rise:16,knob:'#59636a'});box(c,stone[0],dx-4,h-21,34,3);box(c,stone[1],dx-4,h-21,34,1);
 // The east gable: dressed stone the whole height, kneelered at the eaves, the wall the bellcote stands on.
 wallAt(c,SQUARED,s+4,gable,5,68,eave-1);wallAt(c,SQUARED,s+5,gable,eave+4,68,sillY-eave-7);wallAt(c,SQUARED,s+6,gable,sillY,68,h-sillY);
 box(c,stone[2],gable-2,eave-2,72,7);box(c,stone[0],gable-3,eave-2,74,5);box(c,stone[1],gable-3,eave-2,74,1);
 band(c,gable,sillY-3,68,stone,4);box(c,INK,gable-1,5,1,h-5);box(c,stone[1],gable,5,1,h-5);
 quoins(c,w,5,h,stone,true,12,16,10);
 // A slit to light the rope loft, and the east window's blind tracery in the gable below.
 lintel(c,gable+26,26,8,stone,4);box(c,INK,gable+25,25,10,26);box(c,'#141c2c',gable+27,27,6,22);sill(c,gable+26,50,8,stone,3);
 const ex=gable+18;archRing(c,ex,96,30,'point',30,5,stone[0],'#46525e',stone[2],s+8);
 c.fillStyle=INK;shape(c,ex-1,95,32,119,'point',31);c.fill();c.save();shape(c,ex,96,30,118,'point',30);c.clip();
 box(c,'#101924',ex,96,30,118);box(c,'#18273a',ex+2,110,11,40);for(let k=0;k<22;k++)box(c,GLASS[Math.floor(hash(s,9,k)*4)],ex+1+Math.floor(hash(s,8,k)*6)*5,100+Math.floor(hash(s,7,k)*18)*6,4,5);
 for(let py=101;py<214;py+=6)box(c,'#0a0f15',ex,py,30,1);box(c,stone[0],ex+9,118,2,96);box(c,stone[0],ex+19,118,2,96);
 c.restore();sill(c,ex,214,30,stone,4,4);
 box(c,INK,0,eave,1,h-eave);box(c,INK,w-1,5,1,h-5);
};

const vestry:Paint=(c,w,h,s)=>{
 const stone:Tri=['#434e59','#606c78','#1d252d'],mid=150;
 // A lead flat behind a moulded parapet.
 wallAt(c,SQUARED,s+1,0,5,w,17);box(c,LEAD[0],0,0,w,5);box(c,LEAD[1],0,0,w,2);box(c,LEAD[2],0,5,w,1);for(let px=13;px<w-6;px+=19)box(c,LEAD[2],px,2,2,3);
 box(c,stone[2],-2,22,w+4,7);box(c,stone[0],-3,22,w+6,3);box(c,stone[1],-3,22,w+6,1);box(c,'#39434d',-1,25,w+2,3);
 wallAt(c,SQUARED,s+2,0,29,w,mid-29);wallAt(c,SQUARED,s+3,0,mid,w,h-mid-14);band(c,0,mid-3,w,stone,4);
 wallAt(c,ASHLAR,s+4,-2,h-14,w+4,14);box(c,stone[1],-2,h-14,w+4,1);
 // Three cusped lights under one square label.
 const x=44,y=60;hood(c,x,y,53,stone);
 for(let i=0;i<3;i++){win(c,x+i*18,y,17,40,{look:'lead',cols:1,rows:1,frame:'#1c242c',arch:'point',rise:9,s:s+i});box(c,stone[0],x+i*18,y,1,3);box(c,stone[0],x+i*18+16,y,1,3);}
 box(c,stone[0],x+17,y+9,1,31);box(c,stone[0],x+35,y+9,1,31);sill(c,x,y+40,53,stone,3,4);
 // The vestry door on its strap hinges, the parish board beside it, a small light for the stair.
 const dx=18;archRing(c,dx,h-70,26,'point',15,5,stone[0],'#4a5662',stone[2],s+5);
 door(c,dx,h-70,26,70,{tone:['#0f0d0c','#30271f','#41352a'],style:'plank',arch:'point',rise:15,knob:'#59636a'});step(c,dx,h,26,stone,3,4);
 box(c,'#17120e',58,h-64,26,34);box(c,'#2c241c',59,h-63,24,32);box(c,'#4a3c2e',58,h-64,26,1);
 for(const [px,py,pw,ph] of [[61,h-60,9,12],[72,h-59,9,8],[62,h-46,7,10],[71,h-49,10,14]] as const){box(c,'#8a8674',px,py,pw,ph);for(let k=2;k<ph-1;k+=2)box(c,'#5e5b4e',px+1,py+k,pw-3,1);}
 lintel(c,100,mid+34,14,stone,5);win(c,100,mid+34,14,24,{look:'dark',cols:1,rows:2,frame:'#1c242c',s});sill(c,100,mid+58,14,stone);
 // Clasping buttresses at both corners, set back at the band.
 for(const px of [0,w-9]){wallAt(c,ASHLAR,s+px+7,px,40,9,mid-40);wallAt(c,ASHLAR,s+px+8,px-(px?0:0),mid,9,h-mid);box(c,stone[1],px,36,9,2);box(c,stone[0],px+1,38,7,2);box(c,ASHLAR.lip,px,40,1,h-40);box(c,INK,px+8,40,1,h-40);}
 box(c,INK,0,29,1,h-29);box(c,INK,w-1,29,1,h-29);
};

const sexton:Paint=(c,w,h,s)=>{
 const eave=26,fl=[eave,122,216,h],coat:Tri=['#44494d','#4c5155','#383d41'],brick:Tri=[RED.stones[1],RED.lip,RED.mortar],frame='#6a6f70';
 pitch(c,w,eave,SLATE_BLUE,s,6,10,LEAD);
 renderAt(c,coat,s+1,0,eave,w,h-eave-16);wallAt(c,RED,s+2,0,h-16,w,16);box(c,coat[2],0,h-17,w,1);band(c,0,fl[1]-2,w-9,brick,3);
 // Brick dressings left out of the render: jambs toothed long and short, a brick head to each opening.
 const jambs=(x:number,y:number,ow:number,oh:number)=>{
  soldiers(c,x-4,y-8,ow+8,8,RED.lip,RED.stones[0],RED.mortar,s+x+y);
  for(let py=y,k=0;py<y+oh;py+=8,k++){const wide=k%2?5:3,tall=Math.min(8,y+oh-py);for(const px of [x-wide,x+ow]){box(c,RED.mortar,px,py,wide,tall);box(c,RED.stones[(k+px)%4],px,py,wide,tall-1);box(c,RED.lip,px,py,wide,1);}}
 };
 const xs=[24,81,138],looks:Look[][]=[['dark','lit','drawn'],['drawn','dark','blind']];
 for(let f=0;f<2;f++)for(let i=0;i<3;i++){const x=xs[i],y=fl[f]+(f?22:24);jambs(x,y,18,38);win(c,x,y,18,38,{look:looks[f][i],cols:2,rows:2,rail:true,frame,tint:'#3a3629',s:s+f*3+i});sill(c,x,y+38,18,COOL);}
 // The door under a slated hood on two iron brackets; his lantern on its hook, unlit, his spade and pick against the wall.
 const dx=78;jambs(dx,h-56,24,56);door(c,dx,h-56,24,56,{tone:['#0f1113','#25292d','#353a3f'],style:'panel',fan:'dark'});step(c,dx,h,24,COOL,4);
 box(c,'#141a21',dx-10,h-70,44,5);box(c,SLATE_BLUE[2],dx-10,h-71,44,4);box(c,LEAD[1],dx-10,h-71,44,1);stroke(c,IRON,dx-8,h-66,dx-3,h-56,2);stroke(c,IRON,dx+31,h-66,dx+26,h-56,2);
 for(const i of [0,2]){const x=xs[i],y=fl[2]+22;jambs(x,y,18,40);win(c,x,y,18,40,{look:i?'dark':'drawn',cols:2,rows:2,rail:true,frame,tint:'#3a3629',s:s+20+i});sill(c,x,y+40,18,COOL);}
 const lx=dx+31;box(c,IRON,lx,h-50,5,2);box(c,IRON,lx+3,h-48,1,3);box(c,IRON,lx,h-45,7,10);box(c,'#1c2830',lx+1,h-44,5,8);box(c,IRON_LIT,lx,h-45,7,1);
 stroke(c,'#4a3a2c',dx+50,h-1,dx+45,h-44,2);box(c,'#59636a',dx+41,h-10,8,9);box(c,'#3a434a',dx+42,h-2,6,2);
 stroke(c,'#3a2d22',dx+56,h-1,dx+54,h-40,2);stroke(c,'#59636a',dx+47,h-38,dx+62,h-41,2);
 // Ivy up the west corner, and the red brick of the east one.
 for(let py=eave,k=0;py<h-16;py+=8,k++){const wide=k%2?9:6;box(c,RED.mortar,w-wide,py,wide,8);box(c,RED.stones[k%4],w-wide,py,wide-1,7);box(c,RED.lip,w-wide,py,wide-1,1);}
 ivy(c,2,h,eave+40,34,s,1);
 box(c,INK,0,eave,1,h-eave);box(c,INK,w-1,eave,1,h-eave);box(c,coat[1],1,eave,1,60);
 pipe(c,w-22,eave,h,s);
};

const lean:Paint=(c,w,h,s)=>{
 const base=132;
 // Sheet lead dressed over rolls, a board fascia under it.
 box(c,LEAD[0],0,0,w,6);box(c,LEAD[1],0,0,w,2);box(c,LEAD[2],0,6,w,1);for(let px=10;px<w-4;px+=16){box(c,LEAD[2],px+2,2,1,4);box(c,'#6b767d',px,2,2,4);}
 box(c,TIMBER[0],0,7,w,5);box(c,TIMBER[1],0,7,w,1);
 planks(c,BOARD_GREY,'#151210',s,0,12,w,base-12,5,9);
 for(const px of [0,w-4]){box(c,TIMBER[0],px,12,4,base-12);box(c,TIMBER[1],px,12,1,base-12);}
 // The loft hatch where the bier and the planks are kept, a coil of bell rope on its peg.
 box(c,TIMBER[0],27,36,42,4);box(c,TIMBER[1],27,36,42,1);door(c,30,40,36,54,{tone:['#151210','#35312b','#45403a'],style:'pair'});box(c,TIMBER[0],26,94,44,4);box(c,TIMBER[1],26,94,44,1);
 box(c,TIMBER[0],80,62,3,5);for(const r of [7,5])hoop(c,81,74,r,r===7?'#8a7a5c':'#5c513d');box(c,'#8a7a5c',80,66,2,3);
 box(c,TIMBER[0],0,base-4,w,5);box(c,TIMBER[1],0,base-4,w,1);
 wallAt(c,RED,s+1,0,base+1,w,h-base-1);
 lintel(c,12,h-66,28,COOL,6);door(c,12,h-66,28,66,{tone:['#14110e','#2f2b26','#403a33'],style:'plank'});step(c,12,h,28,COOL,2);
 // Two stones not yet cut, leant where the mason left them.
 for(const [x,tall,tone] of [[50,34,'#4c555d'],[70,26,'#434c54']] as const){c.fillStyle=tone;shape(c,x,h-tall,18,tall,'round',0);c.fill();c.fillStyle='#6a737a';shape(c,x,h-tall,18,4,'round',0);c.fill();box(c,'#2c343b',x+16,h-tall+8,2,tall-8);}
 box(c,RED.shade,0,h-7,48,7);edges(c,w,base+1,h,RED.lip);returnFace(c,w-4,12,h,4);
};

export const HOUSE_PIECES:Readonly<Record<string,Piece>>={
 terrace:built('terrace',terrace),leanTo:built('leanTo',leanTo),nell:built('nell',nell),bakehouse:built('bakehouse',bakehouse),
 cooperage:built('cooperage',cooperage),laundry:built('laundry',laundry),dyehouse:built('dyehouse',dyehouse),store:built('store',store),
 tall:built('tall',tall),chandler:built('chandler',chandler),shed:built('shed',shed),almshouse:built('almshouse',almshouse),
 chapel:built('chapel',chapel),vestry:built('vestry',vestry),sexton:built('sexton',sexton),lean:built('lean',lean),
};

/** The stairhead on the tall house's roof: a brick hut over the stair, its top a lead flat. */
const stairhead:Piece=(c,x,y,w,h)=>{
 c.save();c.translate(x,y);
 wallAt(c,PLUM,5584,0,7,w,h-7);box(c,LEAD[0],0,0,w,7);box(c,LEAD[1],0,0,w,2);box(c,LEAD[2],0,6,w,1);for(let px=12;px<w-6;px+=17){box(c,'#6b767d',px,2,2,4);box(c,LEAD[2],px+2,2,1,4);}
 lintel(c,18,h-28,18,COOL,5);door(c,18,h-28,18,28,{tone:['#101713','#213a2e','#2d4c3c'],style:'plank'});
 box(c,INK,42,14,9,9);for(let py=15;py<22;py+=3)box(c,'#3b4146',43,py,7,2);
 box(c,INK,0,7,1,h-7);box(c,INK,w-1,7,1,h-7);box(c,PLUM.lip,1,7,1,h-7);box(c,'#00000050',w-5,7,4,h-7);
 box(c,LEAD[0],0,h-3,17,3);box(c,LEAD[0],37,h-3,w-37,3);box(c,LEAD[1],0,h-3,17,1);box(c,LEAD[1],37,h-3,w-37,1);
 c.restore();
};
/** The chapel's bellcote: two dressed piers and an arch, the bell hung between them, a flat capstone. */
const bellcote:Piece=(c,x,y,w,h)=>{
 const stone:Tri=['#3f4a55','#5a6672','#1c242c'],ax=14,aw=w-28,ay=14;
 c.save();c.translate(x,y);
 wallAt(c,SQUARED,7212,0,6,w,h-6);
 box(c,PALE[0],0,0,w,6);box(c,PALE[1],0,0,w,2);box(c,PALE[2],0,5,w,1);
 archRing(c,ax,ay,aw,'point',14,4,stone[0],'#4a5662',stone[2],3);
 // The opening is cut clean through: the sky shows behind the bell.
 c.save();c.globalCompositeOperation='destination-out';c.fillStyle='#000';shape(c,ax,ay,aw,h-ay-5,'point',14);c.fill();c.restore();
 for(let dy=0;dy<h-ay-5;dy++){const k=inset(aw,dy,'point',14);if(aw-2*k>0){box(c,INK,ax+k,ay+dy,1,1);box(c,stone[2],ax+aw-k-1,ay+dy,1,1);}}
 box(c,TIMBER[0],ax,ay+10,aw,4);box(c,TIMBER[1],ax,ay+10,aw,1);
 const bx=Math.round(w/2);box(c,'#3a3020',bx-1,ay+14,2,3);
 for(let dy=0;dy<13;dy++){const half=dy<3?3:dy<9?4+Math.floor((dy-3)/3):dy<12?7:8;box(c,'#6e5a2c',bx-half,ay+17+dy,half*2,1);box(c,'#a88f4a',bx-half,ay+17+dy,2,1);}
 box(c,'#3a3020',bx-8,ay+29,16,1);box(c,'#2a2218',bx-1,ay+30,2,3);
 box(c,stone[0],ax-2,h-5,aw+4,5);box(c,stone[1],ax-2,h-5,aw+4,1);
 box(c,INK,0,6,1,h-6);box(c,INK,w-1,6,1,h-6);box(c,stone[1],1,6,1,h-6);
 c.restore();
};
/** Solids standing on a roof, drawn into their own cached tile at (0,0); h is the solid's height. */
export const FIXTURE_PIECES:Readonly<Record<'stairhead'|'bellcote',Piece>>={stairhead,bellcote};
