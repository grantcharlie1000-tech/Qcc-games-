import {LEVELS,type Level} from './levels';
import {stationAt,type Events,type Run} from './model';
import {goalComposition,completionMotion} from './composition';
type Mark={x:number;y:number;age:number;kind:'dust'|'spark'|'connection'};
/** Presentation-only, bounded marks. Simulation events are the sole clock source. */
export class Effects {
 private marks:Mark[]=[];
 reset(){this.marks=[];}
 step(s:Run,e:Events,dt:number){
  for(const m of this.marks)m.age+=dt;
  this.marks=this.marks.filter(m=>m.age<(m.kind==='connection'?.85:.48));
  if(e.land)this.marks.push({x:s.x+8,y:s.y+24,age:0,kind:'dust'});
  if(e.pickup)this.marks.push({x:s.x+8,y:s.y+10,age:0,kind:'spark'});
  if(e.interact){const l=LEVELS[s.stage],id=s.activated[s.activated.length-1],station=l.stations.find(p=>p.id===id);if(station&&Math.abs(s.x+8-stationAt(station,l,s.clock).x)<48){const at=stationAt(station,l,s.clock);this.marks.push({x:at.x,y:at.y-35,age:0,kind:'connection'});}}
  if(e.checkpoint)this.marks.push({x:LEVELS[s.stage].checkpoint.x,y:LEVELS[s.stage].checkpoint.y-40,age:0,kind:'connection'});
  if(this.marks.length>16)this.marks.splice(0,this.marks.length-16);
 }
 draw(c:CanvasRenderingContext2D,cx:number,cy:number,w:number,h:number,color:string,reduced:boolean){
  c.save();
  for(const m of this.marks){if(m.x<cx-70||m.x>cx+w+70||m.y<cy-70||m.y>cy+h+70)continue;
   const p=m.age/(m.kind==='connection'?.85:.48);c.globalAlpha=(1-p)*.75;c.fillStyle=m.kind==='dust'?'#c2b7a0':color;
   if(reduced){if(m.kind!=='dust'){c.fillRect(m.x-10,m.y-12,20,2);c.fillRect(m.x-10,m.y+10,20,2);}continue;}
   if(m.kind==='dust'){for(let i=0;i<6;i++)c.fillRect(m.x+(i-2.5)*(3+p*10),m.y-2-Math.sin(p*Math.PI)*(i%2+1)*3,3,2);}
   else if(m.kind==='spark'){for(let i=0;i<6;i++){const a=i*Math.PI/3;c.fillRect(m.x+Math.cos(a)*(7+p*16),m.y+Math.sin(a)*(7+p*16)-p*9,2,3);}}
   else{c.strokeStyle=color;c.lineWidth=1;c.beginPath();c.moveTo(m.x-6,m.y);c.lineTo(m.x-1,m.y+5);c.lineTo(m.x+8,m.y-7);c.stroke();for(let i=0;i<3;i++)c.fillRect(m.x-13+i*12,m.y-13-p*18,2,3);}
  }c.restore();
 }
}
export function completionTravel(s:Run,reduced:boolean){const p=Math.max(0,Math.min(1,(2.8-s.cinematic)/2.8));return reduced?0:p*p*(3-2*p);}
const motionCache=new WeakMap<Run,{stage:number;x:number;y:number;offset:{x:number;y:number}}>();
export function completionOffset(s:Run,reduced:boolean){
 if(reduced||s.phase==='playing')return {x:0,y:0};
 let cached=motionCache.get(s);
 if(!cached||cached.stage!==s.stage||cached.x!==s.x||cached.y!==s.y){cached={stage:s.stage,x:s.x,y:s.y,offset:completionMotion(LEVELS[s.stage],{x:s.x-10,y:s.y-12,w:36,h:38})};motionCache.set(s,cached);}
 const p=completionTravel(s,false);return {x:cached.offset.x*p,y:cached.offset.y*p};
}
/** Each restored system has a visual consequence, rather than a shared confetti burst. */
export function drawCompletion(c:CanvasRenderingContext2D,l:Level,s:Run,color:string,reduced:boolean){
 if(s.phase==='playing')return;
 const art=goalComposition(l),x=art.x,y=art.y,p=reduced?1:completionTravel(s,false),t=reduced?1:2.8-s.cinematic,offset=completionOffset(s,reduced);
 c.save();c.strokeStyle=color;c.fillStyle=color;c.lineWidth=1;
 if(l.goal!=='escape'&&l.goal!=='ferry'){c.beginPath();c.rect(art.bounds.x,art.bounds.y,art.bounds.w,art.bounds.h);c.clip();}
 if(l.goal==='shelter'||l.goal==='rescue'){
  c.globalAlpha=.13;c.beginPath();c.moveTo(x-12,y-45);c.lineTo(x+12,y-45);c.lineTo(x+78,y+12);c.lineTo(x-78,y+12);c.fill();
  // Interior window light and the shelter's welcoming hearth smoke.
  c.globalAlpha=.7;c.fillRect(x-9,y-35,18,2);
  for(let i=0;i<5;i++){c.globalAlpha=.12*(1-i/6);c.fillRect(x+28-i*2,y-80-i*10-(reduced?0:p*12),9+i*3,3);}
  if(l.goal==='rescue'){c.globalAlpha=.8;c.fillRect(x-5,y-20,3,12);c.fillRect(x+4,y-22,3,14);}
 }else if(l.goal==='ferry'){
  // Wake separates from the accelerating hull; dock mooring drops slack.
  if(art.art==='ferry'||art.art==='airship'){
   c.globalAlpha=.4;for(let i=0;i<7;i++){const trail=i*17;c.fillRect(x+offset.x-trail-40,y+10+i%2*3,12+i*3,1);}
   c.globalAlpha=.65;c.beginPath();c.moveTo(x-43,y-2);c.quadraticCurveTo(x-22,y+14,x+8,y+8);c.stroke();
  }
 }else if(l.goal==='engine'){
  c.globalAlpha=.55;for(const dx of [-23,23]){c.fillRect(x+dx,y-85,1,77+offset.y);for(let i=0;i<4;i++)c.fillRect(x+dx-3,y-12+offset.y+i*5,7,1);}
  c.globalAlpha=.22;for(let i=0;i<6;i++)c.fillRect(x-32-i*4,y-6-i*3,12,2);
 }else if(l.goal==='relay'){
  // The consequence belongs to the selected fixture. Electrical relays light
  // their panel; only a tree in a real garden pocket grows a crown of leaves.
  c.beginPath();c.rect(art.bounds.x,art.bounds.y,art.bounds.w,art.bounds.h);c.clip();
  if(art.art==='lifeTree'){
   c.globalAlpha=.6;c.fillRect(x-1,y-92*p,2,92*p);
   for(let i=0;i<12;i++){if(i/18>p)continue;const a=i*2.399,r=15+(i%5)*10,px=x+Math.cos(a)*r,py=y-66+Math.sin(a)*r*.65;c.globalAlpha=.45;c.fillRect(px,py,4,2);c.fillRect(px+2,py-2,2,4);}
  }else{
   c.globalAlpha=.32;for(let i=0;i<3;i++)if(p>(i+1)/5)c.fillRect(x-10+i*8,y-24,4,7);
   c.globalAlpha=.5;c.fillRect(x-12,y-8,Math.round(24*p),1);
  }
 }else if(l.goal==='signal'){
  c.beginPath();c.rect(art.bounds.x,art.bounds.y,art.bounds.w,art.bounds.h);c.clip();
  const antenna=art.art==='signal'?y-60:y-24;
  c.globalAlpha=.55;for(let i=0;i<3;i++){const r=5+i*7+(reduced?0:t*4%7);c.beginPath();c.arc(x,antenna,r,.2,1.2);c.stroke();}
 }else if(l.goal==='escape'){
  // A diagonal curtain of masonry falls behind the safe doorway.
  for(let i=0;i<24;i++){const px=x-80-i*13,fall=reduced?22:Math.max(0,t-i*.045)*65;c.globalAlpha=.22+(i%3)*.1;c.fillStyle=i%2?'#aaa38e':'#565d62';c.fillRect(px,y-95+(i%5)*16+fall,4+i%4,3+i%3);}
 }else if(l.goal==='dawn'){
  c.beginPath();c.rect(art.bounds.x,art.bounds.y,art.bounds.w,art.bounds.h);c.clip();
  c.globalAlpha=.25;c.fillRect(x-3,y-48,6,16);
  c.globalAlpha=.12;c.fillRect(x-12,y-54,24,26);
 }c.restore();
}
export function drawDawn(c:CanvasRenderingContext2D,w:number,h:number,s:Run,reduced:boolean){
 if(LEVELS[s.stage].goal!=='dawn'||s.phase==='playing')return;
 const p=reduced?1:completionTravel(s,false),g=c.createLinearGradient(0,0,0,h);g.addColorStop(0,'#efb7a000');g.addColorStop(.65,`rgba(241,184,139,${p*.13})`);g.addColorStop(1,`rgba(255,215,153,${p*.3})`);c.fillStyle=g;c.fillRect(0,0,w,h);
}
/** The chosen ending remains legible while the final card pauses simulation. */
export function drawEndingSky(c:CanvasRenderingContext2D,w:number,h:number,s:Run){
 if(s.phase!=='complete'||!s.ending)return;
 c.save();
 const share=s.ending==='share';
 // A quiet row of inhabited roofs frames the aftermath behind the playable city.
 for(let i=0;i<9;i++){
  const x=i*w/8-24,y=h*(.57+(i%3)*.07),width=w/10+12;
  c.fillStyle='#263342';c.fillRect(x,y,width,h-y);c.fillStyle='#3b4953';c.fillRect(x-3,y-3,width+6,3);
  for(let row=0;row<3;row++)for(let col=0;col<3;col++){
   const wx=x+10+col*(width-20)/3,wy=y+14+row*24,lit=share||(i===1)||(i>1&&i<5&&row===2&&col===0);
   c.fillStyle=lit?(share?'#e4bb87':i===1?'#ffe0a1':'#9f896d'):'#41505b';c.globalAlpha=lit?.8:.5;c.fillRect(wx,wy,5,9);
   if(lit){c.globalAlpha=share?.1:i===1?.2:.06;c.fillStyle='#ffcf8a';c.fillRect(wx-3,wy-3,11,15);}c.globalAlpha=1;
  }
 }
 if(share){
  // Separate carried embers form a broad canopy above many homes.
  for(let i=0;i<32;i++){const x=(i*.61803398875%1)*w,y=h*(.2+(i%7)*.044);c.globalAlpha=.3+(i%3)*.13;c.fillStyle='#ffdf9b';c.fillRect(x,y,2,i%3===0?4:2);}
 }else{
  // One hearth anchors the composition; a few neighbouring lamps continue its path.
  const x=w/8+6,y=h*.64+30,g=c.createRadialGradient(x,y,4,x,y,w*.2);g.addColorStop(0,'#f6bc6c38');g.addColorStop(1,'#f6bc6c00');c.fillStyle=g;c.fillRect(x-w*.2,y-w*.2,w*.4,w*.4);
  c.strokeStyle='#e8c28b';c.globalAlpha=.55;c.strokeRect(w/8-3,h*.64+8,25,42);c.fillStyle='#ffe4ad';c.fillRect(w/8+8,h*.64+11,2,35);
 }
 c.restore();
}
