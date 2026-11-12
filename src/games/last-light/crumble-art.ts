import type {Platform,Hazard,Rect} from './levels';
import {drawEmitter,drawSpikes} from './hazard-art';
/** Mirrors model.CRUMBLE_RETURN: pieces reassemble over the last half second. */
const RETURN=7;
type C=CanvasRenderingContext2D;
interface Cell {points:{x:number;y:number}[];x:number;y:number;w:number;h:number;cx:number;cy:number;seed:number;slotX:number;slotY:number}
interface Fracture {atlas:HTMLCanvasElement;cells:Cell[];w:number;h:number}
const bodyCache=new WeakMap<Platform,Fracture>(),hazardCache=new WeakMap<Hazard,Fracture>();
const random=(i:number,seed:number)=>Math.abs(Math.sin(i*127.1+seed*311.7)*43758.5453)%1;
function bake(source:HTMLCanvasElement,sx:number,sy:number,w:number,h:number,seed:number):Fracture {
 const columns=Math.max(2,Math.ceil(w/19)),rows=Math.max(2,Math.ceil(h/17)),seeds:{x:number;y:number}[]=[];
 for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){const i=y*columns+x;seeds.push({x:(x+.22+random(i,seed)*.56)*w/columns,y:(y+.2+random(i+37,seed)*.6)*h/rows});}
 const cells:Cell[]=[];
 for(const [i,a] of seeds.entries()){
  let polygon=[{x:0,y:0},{x:w,y:0},{x:w,y:h},{x:0,y:h}];
  for(const b of seeds){if(b===a)continue;const nx=b.x-a.x,ny=b.y-a.y,d=(b.x*b.x+b.y*b.y-a.x*a.x-a.y*a.y)/2,next:typeof polygon=[];
   for(let j=0;j<polygon.length;j++){const p=polygon[j],q=polygon[(j+1)%polygon.length],dp=p.x*nx+p.y*ny-d,dq=q.x*nx+q.y*ny-d;if(dp<=0)next.push(p);if((dp<=0)!==(dq<=0)){const t=dp/(dp-dq);next.push({x:p.x+(q.x-p.x)*t,y:p.y+(q.y-p.y)*t});}}
   polygon=next;if(!polygon.length)break;
  }
  if(polygon.length<3)continue;
  const x=Math.floor(Math.min(...polygon.map(p=>p.x))),y=Math.floor(Math.min(...polygon.map(p=>p.y))),right=Math.ceil(Math.max(...polygon.map(p=>p.x))),bottom=Math.ceil(Math.max(...polygon.map(p=>p.y)));
  cells.push({points:polygon.map(p=>({x:Math.round(p.x),y:Math.round(p.y)})),x,y,w:right-x,h:bottom-y,cx:a.x,cy:a.y,seed:random(i+71,seed),slotX:0,slotY:0});
 }
 const size=Math.ceil(Math.max(...cells.map(c=>Math.max(c.w,c.h))))+4,across=Math.ceil(Math.sqrt(cells.length)),atlas=document.createElement('canvas');atlas.width=across*size;atlas.height=Math.ceil(cells.length/across)*size;
 const c=atlas.getContext('2d')!;c.imageSmoothingEnabled=false;
 for(const [i,cell] of cells.entries()){
  cell.slotX=i%across*size;cell.slotY=Math.floor(i/across)*size;c.save();c.translate(cell.slotX+2-cell.x,cell.slotY+2-cell.y);c.beginPath();cell.points.forEach((p,j)=>j?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();c.clip();c.drawImage(source,sx,sy,w,h,0,0,w,h);c.restore();
 }
 return {atlas,cells,w,h};
}
function motion(cell:Cell,w:number,age:number,stress:number,reduced:boolean){
 if(age<0)return {dx:Math.round((cell.cx-w/2)*stress*.04),dy:Math.round((cell.seed-.5)*stress*2),rotation:0,alpha:1};
 if(age<1.15)return {dx:reduced?0:(cell.cx-w/2)*(.04+age*.32)+(cell.seed-.5)*age*34,dy:reduced?12:(cell.seed-.5)*2+age*22+age*age*(190+cell.seed*95),rotation:reduced?0:(cell.seed-.5)*age*2.2,alpha:Math.max(0,1-age/1.15)};
 const rebuilt=Math.max(0,Math.min(1,(age-(RETURN-.5)-cell.seed*.05)/.38));
 return {dx:reduced?0:(1-rebuilt)*(cell.seed-.5)*8,dy:reduced?0:(1-rebuilt)*(1-rebuilt)*18,rotation:0,alpha:rebuilt};
}
function pieces(c:C,art:Fracture,x:number,y:number,age:number,stress:number,reduced:boolean){
 for(const cell of art.cells){const m=motion(cell,art.w,age,stress,reduced);if(m.alpha<=0)continue;
  c.save();c.globalAlpha*=m.alpha;c.translate(Math.round(x+cell.cx+m.dx),Math.round(y+cell.cy+m.dy));c.rotate(m.rotation);c.drawImage(art.atlas,cell.slotX,cell.slotY,cell.w+4,cell.h+4,Math.round(cell.x-cell.cx-2),Math.round(cell.y-cell.cy-2),cell.w+4,cell.h+4);c.restore();
 }
}
/** Each chip retains its actual material texels. Warning fissures are gaps
 * between irregular textured pieces, rather than black lines over the deck. */
export function drawCrumble(c:C,p:Platform,source:HTMLCanvasElement,x:number,y:number,timer:number,reduced:boolean){
 let art=bodyCache.get(p);if(!art){art=bake(source,4,4,p.w,p.h+4,p.id+31);bodyCache.set(p,art);}
 const stress=Math.max(0,Math.min(1,1-timer/(p.crumbleDelay??.85))),age=timer<=0?-timer:-1;
 pieces(c,art,x,y-4,age,stress,reduced);
 if(!reduced&&timer<.3&&timer>-1.1){
  c.fillStyle='#bcac8c';for(let i=0;i<7;i++){const a=(Math.abs(timer)*2+i*.137)%1;c.globalAlpha=(1-a)*.55;c.fillRect(Math.round(x+random(i,p.id)*p.w+(i%2?1:-1)*a*4),Math.round(y+23+a*a*48),1+i%2,2);}c.globalAlpha=1;
 }
}
/** Dead emitters and spike tips break into smaller irregular fragments with
 * the floor. There is no floating collision or surviving powered column. */
export function drawCrumblingHazard(c:C,h:Hazard,timer:number,reduced:boolean,position:Rect=h){
 let art=hazardCache.get(h);if(!art){
  const source=document.createElement('canvas');source.width=h.w+12;source.height=h.h+14;const ctx=source.getContext('2d')!;ctx.imageSmoothingEnabled=false;const r={x:6,y:6,w:h.w,h:h.h};
  if(h.kind==='spikes')drawSpikes(ctx,r);else if(h.kind==='steam'||h.kind==='laser')drawEmitter(ctx,h,r,false,false,true,0,true);else {ctx.fillStyle='#85948e';ctx.fillRect(6,6,h.w,h.h);}
  art=bake(source,0,0,source.width,source.height,(h.platform??0)+97);hazardCache.set(h,art);
 }
 pieces(c,art,position.x-6,position.y-6,-timer,0,reduced);
 if(h.kind==='steam'&&!reduced&&-timer<.32){
  c.save();c.beginPath();c.rect(position.x-20,position.y-15,position.w+40,position.h+9);c.clip();
  const off=(h.period??3)*(h.duty??.55)-timer;
  drawEmitter(c,{...h,offset:0},position,false,false,false,off,false);c.restore();
 }
}

// Shared by saw deaths: the courier's real texture tears into irregular chips.
export {bake as bakeFracture,pieces as drawFracturePieces};
