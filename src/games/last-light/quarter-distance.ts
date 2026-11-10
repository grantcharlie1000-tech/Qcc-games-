import {box,hash,sprite,type C} from './quarter-kit';

/** What you see when you look past the place you stand in: the night over the
 * Quarter and the houses that stand under it. A house is painted once, from
 * its own number, into a small canvas of its own; rows of them never repeat,
 * because no two lots share a number, a width or a height. */

const grads=new WeakMap<C,{h:number;ending:boolean;g:CanvasGradient}>();
/** Height in the sky, length and number of each cloud bank. */
const CLOUDS=[[.07,150,5],[.13,270,1],[.22,180,2],[.3,330,3],[.39,220,4]] as const;
function cloud(seed:number,W:number){
 return sprite(`sky/cloud/${seed}`,W,20,c=>{
  // Night stratus: long flat streaks stepped at both ends, moonlit along the top.
  for(let i=0;i<4;i++){
   const a=hash(seed,i,61),b=hash(seed,i,62),mid=Math.abs(i-1.4)/1.6,inset=Math.round(W*(.02+mid*.22+a*.1)),len=Math.max(14,W-inset*2-Math.round(b*W*.1)),x=inset+Math.round(b*W*.08),y=i*5;
   box(c,'#8ea2c21f',x,y+1,len,4);box(c,'#8ea2c214',x+8,y+5,len-20,1);
   box(c,'#b7c6dc2b',x+Math.round(len*.25),y,Math.round(len*.7),1);
  }
 });
}
/** The night sky every outdoor set stands under: one cached gradient, stars
 * of three weights, and cloud banks that drift across at their own depths. */
export function nightSky(c:C,w:number,h:number,ending:boolean,cx=0,t=0){
 let made=grads.get(c);
 if(!made||made.h!==h||made.ending!==ending){const g=c.createLinearGradient(0,0,0,h);g.addColorStop(0,ending?'#485572':'#111928');g.addColorStop(.55,ending?'#967b89':'#1e2a40');g.addColorStop(1,ending?'#d4ab8b':'#2e4058');made={h,ending,g};grads.set(c,made);}
 c.fillStyle=made.g;c.fillRect(0,0,w,h);
 for(let i=0;i<72;i++){
  const v=hash(i,3,7),x=Math.floor(hash(i,1,7)*w),y=Math.floor(hash(i,2,7)**1.7*h*.66);
  if(v>.92){if(Math.sin(t*1.7+i)>.8)continue;c.fillStyle='#e9ecd9';c.fillRect(x,y,1,1);c.fillStyle='#dfe6dc3d';c.fillRect(x-1,y,3,1);c.fillRect(x,y-1,1,3);}
  else{c.fillStyle=v>.55?'#dfe6dc7a':v<.06?'#f3c77a70':'#dfe6dc38';c.fillRect(x,y,1,1);}
 }
 for(const [at,W,seed] of CLOUDS){const span=w+W+90,x=(((hash(seed,4,9)*span-cx*.012*seed-t*(.8+seed*.35))%span)+span)%span-W;c.drawImage(cloud(seed,W),Math.round(x),Math.round(h*at));}
}
/** The moon: a crescent with the rest of its disc in earthshine, in a halo. */
export function moon(c:C,mx:number,my:number){
 c.drawImage(sprite('sky/moon',112,112,m=>{
  const disc=(color:string,r:number)=>{for(let y=-r;y<=r;y++){const s=Math.floor(Math.sqrt(r*r-y*y));box(m,color,56-s,56+y,s*2,1);}};
  disc('#9db3d407',54);disc('#9db3d40b',40);disc('#9db3d412',29);disc('#27354c',21);
  for(let yy=-21;yy<=21;yy++){const span=Math.floor(Math.sqrt(441-yy*yy)),cut=Math.abs(yy+5)<20?9-Math.sqrt(400-(yy+5)*(yy+5)):99,right=Math.min(span,Math.floor(cut));if(right>-span){box(m,yy>10?'#bbc8c2':'#e1e5d2',56-span,56+yy,right+span,1);box(m,'#f4f5e6',56-span,56+yy,Math.max(1,Math.round((right+span)*.3)),1);}}
  box(m,'#a7bbb5',40,63,3,2);box(m,'#a7bbb5',44,69,2,3);box(m,'#a7bbb5',38,54,2,3);box(m,'#324259',62,48,5,3);box(m,'#324259',66,62,4,4);box(m,'#324259',58,66,3,2);
 }),mx-56,my-56);
}

/** The towers at the head of the city, where the wires lead: two banded
 * shafts under stepped caps, a gantry between them, one beacon still lit.
 * One landmark on the horizon, drawn at its own size and never tiled. */
export function headTowers(){
 return sprite('sky/towers',104,260,c=>{
  const body='#1b2538',rim='#25324a',band='#151e2e',dark='#111827';
  for(const [x,top,wide] of [[10,64,26],[54,18,36]] as const){
   box(c,body,x,top+22,wide,260);box(c,rim,x+wide-2,top+22,2,260);box(c,band,x,top+22,1,260);
   for(let i=0;i<5;i++){const inset=i*Math.ceil(wide/11);box(c,body,x-2+inset,top+22-(i+1)*4,wide+4-inset*2,4);box(c,rim,x+wide-inset,top+22-(i+1)*4,2,4);}
   box(c,rim,x+Math.round(wide/2)-1,top-8,2,10);
   for(let y=top+44;y<260;y+=26){box(c,band,x,y,wide,2);box(c,rim,x,y+2,wide,1);}
   for(let y=top+52;y<260;y+=26)for(let wx=x+5;wx<x+wide-5;wx+=7)box(c,dark,wx,y,2,9);
  }
  box(c,body,36,118,18,7);box(c,rim,36,118,18,1);box(c,band,36,125,18,1);for(let x=38;x<54;x+=4)box(c,band,x,126,1,8);
  box(c,'#ffb76b33',68,26,8,8);box(c,'#f3c77a',70,28,4,4);box(c,'#fff0c4',71,29,2,2);
 });
}
/** The colours of one distance: walls, the lit and shaded edges, slate, glass. */
export interface Tone {walls:readonly string[];edge:string;shade:string;roof:string;course:string;ridge:string;glass:string;pane:string;lit:string;glow:string}
/** The size of a house at one distance: storey height, window, window pitch, and how many windows burn. */
export interface Scale {unit:number;ww:number;wh:number;pitch:number;lit:number}
const columns=(w:number,s:Scale)=>Math.max(1,Math.floor((w-s.ww-Math.round(s.pitch*.5))/s.pitch)+1);
export const windowX=(w:number,s:Scale,col:number)=>Math.round((w-(columns(w,s)-1)*s.pitch-s.ww)/2)+col*s.pitch;
export const windowColumns=columns;
/** Some houses are dark from top to bottom; a lit house burns a few windows. */
export function windowLit(seed:number,col:number,row:number,s:Scale){const bias=hash(seed,7,5);return bias>.42&&hash(seed*31+col,row,9)<s.lit*(.4+bias*1.6);}
function chimney(c:C,x:number,top:number,foot:number,w:number,wall:string,k:Tone){
 box(c,wall,x,top,w,foot-top);box(c,k.edge,x,top,w,1);box(c,k.shade,x,top+1,1,foot-top-1);
 for(let p=x+(w>4?1:0);p<x+w-1;p+=3){box(c,k.shade,p,top-3,2,3);box(c,k.edge,p,top-3,2,1);}
}
function pane(c:C,x:number,y:number,s:Scale,k:Tone,lit:boolean,shut:boolean){
 const {ww,wh}=s;
 if(shut&&ww>=5){box(c,k.shade,x,y,ww,wh);for(let yy=y+1;yy<y+wh;yy+=2)box(c,k.glass,x,yy,ww,1);}
 else if(lit){box(c,k.lit,x,y,ww,wh);if(ww>=5){box(c,k.glow,x+1,y+Math.floor(wh*.3),ww-2,Math.ceil(wh*.55));box(c,k.shade,x+Math.floor(ww/2),y,1,wh);box(c,k.shade,x,y+Math.floor(wh*.42),ww,1);}else box(c,k.glow,x,y+1,Math.max(1,ww-1),Math.max(1,wh-2));}
 else{box(c,k.glass,x,y,ww,wh);if(ww>=5){box(c,k.pane,x+1,y+1,Math.floor(ww/2)-1,Math.floor(wh*.4));box(c,k.shade,x+Math.floor(ww/2),y,1,wh);}else if(hash(x,y,3)>.6)box(c,k.pane,x,y,1,1);}
 if(ww>=5)box(c,k.edge,x-1,y+wh,ww+2,1);
}
/** One town house filling its lot: eaves at `top`, wall down to `bottom`.
 * The roof it carries, its chimneys, how its windows are set out and which
 * of them are lit all come from the house's own number. */
export function townHouse(c:C,w:number,top:number,bottom:number,seed:number,k:Tone,s:Scale,door=false){
 const wall=k.walls[Math.floor(hash(seed,2,5)*k.walls.length)],kind=w<s.pitch*1.6?[0,2,4][Math.floor(hash(seed,3,5)*3)]:w>s.pitch*5?[1,2,3,1][Math.floor(hash(seed,3,5)*4)]:Math.floor(hash(seed,3,5)*6),u=s.unit,flip=hash(seed,4,5)>.5;
 box(c,wall,0,top,w,bottom-top);
 let attic=0;
 if(kind===0){
  // A crow-stepped gable in the same brick as the front.
  const step=Math.max(2,Math.round(u/4)),inset=Math.max(2,Math.round(w/11));let i=1;
  for(;inset*i<w/2-1;i++){const y=top-step*i;box(c,wall,inset*i,y,w-inset*i*2,step);box(c,k.edge,inset*i,y,inset,1);box(c,k.edge,w-inset*(i+1),y,inset,1);}
  box(c,k.edge,inset*(i-1),top-step*(i-1),w-inset*(i-1)*2,1);box(c,k.edge,0,top,inset,1);box(c,k.edge,w-inset,top,inset,1);attic=step*(i-1);
 }else if(kind===1||kind===3){
  // A slate roof with its eaves to the street; a mansard is steeper and has dormers.
  const rise=Math.round(u*(kind===3?.95:.45+hash(seed,5,5)*.35)),cut=kind===3?Math.max(2,Math.round(u/7)):0;
  box(c,k.roof,cut,top-rise,w-cut*2,rise);if(cut)box(c,k.roof,Math.floor(cut/2),top-Math.floor(rise/2),w-Math.floor(cut/2)*2,Math.floor(rise/2));
  for(let y=top-rise+3;y<top;y+=3)box(c,k.course,cut,y,w-cut*2,1);
  box(c,k.ridge,cut,top-rise,w-cut*2,1);box(c,k.shade,0,top,w,1);
  const cw=Math.max(3,Math.round(u/3.5));chimney(c,flip?2:w-2-cw,top-rise-Math.round(u*.5),top-rise+2,cw,wall,k);if(w>s.pitch*4)chimney(c,flip?w-4-cw:4,top-rise-Math.round(u*.3),top-rise+2,cw,wall,k);
  if(kind===3||hash(seed,6,5)>.5)for(let col=0;col<columns(w,s);col+=kind===3?1:2){const x=windowX(w,s,col),dh=Math.min(rise-2,s.wh);box(c,wall,x-1,top-dh-2,s.ww+2,dh+2);box(c,k.ridge,x-2,top-dh-3,s.ww+4,1);pane(c,x,top-dh-1,{...s,wh:dh},k,windowLit(seed,col,-1,s),false);}
 }else if(kind===2){
  // A flat roof behind a parapet, with what stands on it.
  box(c,k.edge,0,top,w,1);box(c,k.shade,0,top+Math.max(2,Math.round(u/6)),w,1);
  const cw=Math.max(4,Math.round(u/2.6));chimney(c,flip?3:w-3-cw,top-Math.round(u*.55),top,cw,wall,k);
  if(w>s.pitch*3){const x=flip?w-Math.round(u*1.1)-4:5,tw=Math.round(u*.9),th=Math.round(u*.5);
   if(hash(seed,6,5)>.5){box(c,k.shade,x+1,top-Math.round(u*.3),1,Math.round(u*.3));box(c,k.shade,x+tw-2,top-Math.round(u*.3),1,Math.round(u*.3));box(c,k.roof,x,top-Math.round(u*.3)-th,tw,th);box(c,k.ridge,x,top-Math.round(u*.3)-th,tw,1);box(c,k.course,x,top-Math.round(u*.3)-Math.round(th/2),tw,1);}
   else{box(c,k.roof,x,top-th+2,tw,th-2);box(c,k.ridge,x,top-th+2,tw,1);for(let g=x+2;g<x+tw-2;g+=3)box(c,k.glass,g,top-th+4,2,Math.max(1,th-5));}}
 }else if(kind===4){
  // A gable end to the street: the roof's two slopes, a loft door and a hoist beam.
  const half=w/2,rise=Math.round(w*.42);
  for(let r=0;r<rise;r++){const inset=Math.round((r+1)*half/rise);if(w-inset*2<2)break;box(c,wall,inset,top-r-1,w-inset*2,1);box(c,k.roof,inset-1,top-r-1,2,1);box(c,k.ridge,w-inset-1,top-r-1,2,1);}
  box(c,k.roof,0,top,1,1);box(c,k.ridge,w-1,top,1,1);attic=rise;
  if(u>=13){box(c,k.shade,Math.round(half)-1,top-rise-1,Math.round(u*.45),2);box(c,k.shade,Math.round(half)+Math.round(u*.4)-2,top-rise+1,1,Math.round(u*.3));}
 }else{
  // A neck gable: a narrow raised centre between two shoulders, under a little pediment.
  const nw=Math.max(s.ww+4,Math.round(w*.42)),nx=Math.round((w-nw)/2),nh=Math.round(u*.95),sh=Math.max(2,Math.round(u/4));
  box(c,k.roof,0,top-3,w,3);box(c,k.ridge,0,top-3,w,1);box(c,wall,nx,top-nh,nw,nh);
  for(let i=1;i<=3;i++){box(c,wall,nx-i*2,top-sh*(4-i),2,sh*(4-i));box(c,wall,nx+nw+(i-1)*2,top-sh*(4-i),2,sh*(4-i));box(c,k.edge,nx-i*2,top-sh*(4-i),2,1);box(c,k.edge,nx+nw+(i-1)*2,top-sh*(4-i),2,1);}
  box(c,k.edge,nx-1,top-nh,nw+2,1);box(c,wall,nx+2,top-nh-2,nw-4,2);box(c,k.edge,nx+2,top-nh-2,nw-4,1);attic=nh;
 }
 // Storeys of windows, set out across this front's own width.
 const cols=columns(w,s),first=top+Math.max(2,Math.round(u*.28)),band=hash(seed,8,5)>.45;
 if(attic>=s.wh+4){const x=Math.round(w/2-s.ww/2);pane(c,x,top-Math.min(attic-s.wh-2,Math.round(attic*.55)),s,k,windowLit(seed,0,-2,s),false);}
 for(let row=0,y=first;y+s.wh<bottom-(door?u:0);row++,y+=u){
  if(band&&row)box(c,k.shade,0,y-Math.max(2,Math.round(u*.2)),w,1);
  for(let col=0;col<cols;col++)pane(c,windowX(w,s,col),y,s,k,windowLit(seed,col,row,s),hash(seed*17+col,row,13)>.88);
 }
 if(door){
  // The ground floor on the quay: a door under a fanlight, or a warehouse's double doors.
  const y=bottom-Math.round(u*.85),x=windowX(w,s,Math.floor(hash(seed,9,5)*cols));
  if(kind===4&&w>s.pitch*2){box(c,k.glass,Math.round(w/2)-s.ww,y,s.ww*2,bottom-y);box(c,k.shade,Math.round(w/2),y,1,bottom-y);box(c,k.edge,Math.round(w/2)-s.ww-1,y-1,s.ww*2+2,1);}
  else{box(c,k.glass,x,y,s.ww,bottom-y);box(c,windowLit(seed,9,9,s)?k.lit:k.pane,x+1,y+1,s.ww-2,2);box(c,k.edge,x-1,y-1,s.ww+2,1);}
 }
 box(c,k.shade,0,top,1,bottom-top);
}
/** The far city as a ridge of roofs against the sky: shapes only, and here
 * and there one window still burning. */
export function farRoof(c:C,w:number,top:number,bottom:number,seed:number,wall:string,rim:string,light:string){
 const kind=Math.floor(hash(seed,3,23)*8);
 box(c,wall,0,top,w,bottom-top);box(c,rim,0,top,w,1);
 if(kind<2)for(let i=1;i*2<w/2;i++)box(c,wall,i*2,top-i*(kind?2:1),w-i*4,kind?2:1);
 else if(kind===2){const x=Math.round(w*.3);box(c,wall,x,top-9,3,9);box(c,rim,x,top-9,3,1);if(w>20)box(c,wall,w-7,top-6,3,6);}
 else if(kind===3&&w>14){
  // A church: a square tower and the spire on it.
  const x=Math.round(w/2)-4;box(c,wall,x,top-16,8,16);box(c,rim,x,top-16,8,1);for(let i=0;i<14;i++)box(c,wall,x+1+Math.floor(i/5),top-17-i,6-Math.floor(i/5)*2,1);box(c,rim,x+3,top-33,1,3);
 }else if(kind===4&&w>18){
  // A dome on a drum.
  const m=Math.round(w/2);box(c,wall,m-8,top-6,16,6);for(let y=0;y<8;y++){const s=Math.floor(Math.sqrt(64-y*y));box(c,wall,m-s,top-6-y,s*2,1);}box(c,rim,m-1,top-17,2,3);box(c,rim,m-8,top-6,16,1);
 }else if(kind===5){box(c,wall,2,top-4,w-4,4);box(c,rim,2,top-4,w-4,1);}
 for(let i=0;i<w/9;i++)if(hash(seed,i,29)>.9)box(c,light,2+Math.floor(hash(seed,i,31)*(w-4)),top+3+Math.floor(hash(seed,i,37)*Math.max(1,Math.min(30,bottom-top-6))),1,2);
}
/** Where lot `i` of a row begins. Lots abut, and their widths wander. */
export const lotEdge=(i:number,lot:number,seed:number)=>Math.round(i*lot+(hash(i,seed,97)-.5)*lot*.62);
/** A row of houses at one distance. Each is painted once into a canvas the
 * size of its own lot and stood on its own base line; whatever is under that
 * canvas is the same wall going on down to the ground. */
export interface Row {lot:number;seed:number;height:number;made:Map<number,HTMLCanvasElement>;paint(c:C,i:number,w:number,h:number):void;under(i:number):string}
export function row(lot:number,seed:number,height:number,paint:Row['paint'],under:Row['under']):Row{return {lot,seed,height,made:new Map(),paint,under};}
export function drawRow(c:C,r:Row,w:number,shift:number,base:(i:number,x:number,wide:number)=>number,floor:number){
 for(let i=Math.floor(shift/r.lot)-2;;i++){
  const x0=lotEdge(i,r.lot,r.seed)-Math.round(shift);if(x0>=w)break;
  const wide=lotEdge(i+1,r.lot,r.seed)-Math.round(shift)-x0;if(x0+wide<=0||wide<1)continue;
  let art=r.made.get(i);if(!art){art=sprite(`row/${r.seed}/${i}`,wide,r.height,cc=>r.paint(cc,i,wide,r.height));r.made.set(i,art);}
  const y=Math.round(base(i,x0+Math.round(shift),wide));if(y-r.height>floor)continue;
  c.drawImage(art,x0,y-r.height);if(y<floor)box(c,r.under(i),x0,y,wide,floor-y);
 }
}
