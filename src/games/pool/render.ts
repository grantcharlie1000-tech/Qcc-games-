import {FIELD,POCKETS,RAILS,pocketRadius,R,preview,legalTargets,type PoolState} from './model';
import type {Drag} from './input';
import {ballColor} from './appearance';
import {VIEW_WIDTH,VIEW_HEIGHT} from './view';
const backdrops=new WeakMap<HTMLCanvasElement,HTMLCanvasElement>();
export function drawTable(canvas:HTMLCanvasElement,s:PoolState,ghost:{x:number;y:number;valid:boolean}|null,paused:boolean,drag:Drag|null=null,names:[string,string]|null=null){
 const ratio=Math.min(2,window.devicePixelRatio||1),width=VIEW_WIDTH,height=VIEW_HEIGHT;
 if(canvas.width!==width*ratio||canvas.height!==height*ratio){canvas.width=width*ratio;canvas.height=height*ratio;}
 const c=canvas.getContext('2d')!;c.setTransform(ratio,0,0,ratio,0,0);c.clearRect(0,0,width,height);
 // Rotate the view, keeping all physics and saved positions in their original units.
 const rotated=()=>c.setTransform(0,ratio,-ratio,0,VIEW_WIDTH*ratio,0);
 const text=(value:string,x:number,y:number)=>{c.save();c.translate(x,y);c.rotate(-Math.PI/2);c.fillText(value,0,0);c.restore();};

 function round(x:number,y:number,w:number,h:number,r:number,fill:string){c.fillStyle=fill;c.beginPath();c.roundRect(x,y,w,h,r);c.fill();}
 const cached=backdrops.get(canvas);if(cached&&cached.width===canvas.width&&cached.height===canvas.height){c.drawImage(cached,0,0,width,height);rotated();}else{rotated();
 const lacquer=c.createLinearGradient(0,0,440,0);
 lacquer.addColorStop(0,'#451215');lacquer.addColorStop(.045,'#b52c24');lacquer.addColorStop(.09,'#e3563b');lacquer.addColorStop(.17,'#6f1718');lacquer.addColorStop(.83,'#6f1718');lacquer.addColorStop(.91,'#e3563b');lacquer.addColorStop(.955,'#b52c24');lacquer.addColorStop(1,'#451215');
 c.shadowColor='#000a';c.shadowBlur=12;c.shadowOffsetY=5;round(9,20,422,800,25,'#121d30');c.shadowBlur=0;c.shadowOffsetY=0;
 round(13,22,414,796,23,'#767f92');round(16,25,408,790,20,'#c3b6b4');
 c.fillStyle=lacquer;c.beginPath();c.roundRect(18,27,404,786,18);c.fill();
 // Polished steel corner caps frame the red rails and dark pocket wells.
 for(const x of [18,366])for(const y of [27,757]){
  const metal=c.createLinearGradient(x,y,x+56,y+56);metal.addColorStop(0,'#b8bdcc');metal.addColorStop(.45,'#525c71');metal.addColorStop(1,'#8e7181');
  c.fillStyle=metal;c.beginPath();c.roundRect(x,y,56,56,12);c.fill();
 }
 round(26,42,388,756,16,'#072539');
 const felt=c.createRadialGradient(205,330,30,220,420,450);felt.addColorStop(0,'#39b8d2');felt.addColorStop(.6,'#1697b8');felt.addColorStop(1,'#087192');
 c.fillStyle=felt;c.fillRect(FIELD.left,FIELD.top,360,720);
 c.save();c.beginPath();c.rect(40,60,360,720);c.clip();c.fillStyle='#fff';c.globalAlpha=.04;for(let y=64;y<780;y+=6)for(let x=44+(y%12?0:3);x<400;x+=7)c.fillRect(x,y,1,1);c.restore();
 // Broad, bevelled cushions stop at the exact physical jaw endpoints.
 for(const rail of RAILS){
  const length=Math.hypot(rail.bx-rail.ax,rail.by-rail.ay),tx=(rail.bx-rail.ax)/length,ty=(rail.by-rail.ay)/length;
  c.beginPath();c.moveTo(rail.ax,rail.ay);c.lineTo(rail.bx,rail.by);
  c.lineTo(rail.bx-rail.nx*14-tx*8,rail.by-rail.ny*14-ty*8);
  c.lineTo(rail.ax-rail.nx*14+tx*8,rail.ay-rail.ny*14+ty*8);c.closePath();
  c.fillStyle='#11789b';c.fill();c.strokeStyle='#075772';c.lineWidth=2;c.stroke();
  c.beginPath();c.moveTo(rail.ax-rail.nx*6+tx*5,rail.ay-rail.ny*6+ty*5);
  c.lineTo(rail.bx-rail.nx*6-tx*5,rail.by-rail.ny*6-ty*5);c.strokeStyle='#299fc0';c.lineWidth=4;c.stroke();
  c.beginPath();c.moveTo(rail.ax,rail.ay);c.lineTo(rail.bx,rail.by);
  c.strokeStyle='#6dd8eb';c.lineWidth=2.5;c.stroke();
 }
 c.fillStyle='#cce4ef';for(const x of [23,417])for(const y of [150,240,330,510,600,690]){c.beginPath();c.moveTo(x,y-4);c.lineTo(x+3,y);c.lineTo(x,y+4);c.lineTo(x-3,y);c.closePath();c.fill();}for(const y of [31,805])for(const x of [130,220,310]){c.beginPath();c.arc(x,y,2.6,0,Math.PI*2);c.fill();}
 for(let i=0;i<POCKETS.length;i++){
  const p=POCKETS[i],middle=p.y===420,radius=pocketRadius(p);
  c.save();
  // The middle openings are inset semicircles; the four corner wells stay fully round.
  if(middle){c.beginPath();c.rect(p.x===FIELD.left?FIELD.left-4:0,0,p.x===FIELD.left?VIEW_HEIGHT:FIELD.right+4,VIEW_WIDTH);c.clip();}
  const rim=c.createRadialGradient(p.x,p.y,radius-1,p.x,p.y,radius+2);
  rim.addColorStop(0,'#05090f');rim.addColorStop(.55,'#34141b');rim.addColorStop(1,'#a43b36');
  c.fillStyle=rim;c.beginPath();c.arc(p.x,p.y,radius+2,0,Math.PI*2);c.fill();
  // The black well has exactly the same radius as the physical capture region.
  const well=c.createRadialGradient(p.x-7,p.y-7,1,p.x,p.y,radius);
  well.addColorStop(0,'#16161b');well.addColorStop(.65,'#020508');well.addColorStop(1,'#000103');
  c.fillStyle=well;c.beginPath();c.arc(p.x,p.y,radius,0,Math.PI*2);c.fill();
  c.restore();
 }
 c.fillStyle='#afd9f0aa';for(const y of [240,600]){c.beginPath();c.arc(220,y,2,0,Math.PI*2);c.fill();}
 // The head string is a quiet orientation aid, as on the reference table.
 c.strokeStyle='#d5f5fc30';c.lineWidth=1;c.beginPath();c.moveTo(FIELD.left,615);c.lineTo(FIELD.right,615);c.stroke();
 const backdrop=document.createElement('canvas');backdrop.width=canvas.width;backdrop.height=canvas.height;backdrop.getContext('2d')!.drawImage(canvas,0,0);backdrops.set(canvas,backdrop);
 }
 if(!s.break&&legalTargets(s).some(b=>b.id===8)){
  c.fillStyle='#e4edf8';c.font='bold 10px system-ui';c.textAlign='center';for(let i=0;i<POCKETS.length;i++){const p=POCKETS[i];text(String(i+1),p.x===FIELD.left?8:435,p.y+3);}
  const p=POCKETS[s.calledPocket];c.strokeStyle='#f8dd7b';c.lineWidth=3;c.beginPath();c.arc(p.x,p.y,pocketRadius(p)+6,0,Math.PI*2);c.stroke();}
 const cue=s.balls.find(b=>b.id===0)!;
 if(s.phase==='aim'&&!s.ballInHand&&!paused){const p=preview(s,s.angle),targets=legalTargets(s),legal=p.hit===null||targets.some(b=>b.id===p.hit),dx=Math.cos(s.angle),dy=Math.sin(s.angle);
  c.save();c.beginPath();c.rect(40,60,360,720);c.clip();c.strokeStyle='#122a39';c.lineWidth=4;c.beginPath();c.moveTo(cue.x,cue.y);c.lineTo(p.x,p.y);c.stroke();c.strokeStyle=legal?'#f3fcff':'#ff9c82';c.lineWidth=1.6;c.stroke();c.strokeStyle=legal?'#f3fcff':'#ff9c82';c.lineWidth=2;c.beginPath();c.arc(p.x,p.y,R,0,Math.PI*2);c.stroke();
  if(p.hit!==null){const b=s.balls.find(b=>b.id===p.hit)!;const n=Math.hypot(b.x-p.x,b.y-p.y),nx=(b.x-p.x)/n,ny=(b.y-p.y)/n;c.beginPath();c.moveTo(b.x,b.y);c.lineTo(b.x+nx*65,b.y+ny*65);c.stroke();}c.restore();
  const pull=12+(drag?.kind==='pull'?drag.power*120:0);
  const tip=R+pull,tail=tip+230;
  const shaft=c.createLinearGradient(cue.x-dx*tail,cue.y-dy*tail,cue.x-dx*tip,cue.y-dy*tip);
  shaft.addColorStop(0,'#8d4929');shaft.addColorStop(.2,'#c78a45');shaft.addColorStop(.65,'#e9c489');shaft.addColorStop(1,'#fff0c5');
  c.lineCap='round';c.lineWidth=6;c.strokeStyle='#30262b';c.beginPath();c.moveTo(cue.x-dx*tip,cue.y-dy*tip);c.lineTo(cue.x-dx*tail,cue.y-dy*tail);c.stroke();
  c.lineWidth=4;c.strokeStyle=shaft;c.stroke();
  c.lineWidth=4.5;c.strokeStyle='#78d8ed';c.beginPath();c.moveTo(cue.x-dx*tip,cue.y-dy*tip);c.lineTo(cue.x-dx*(tip+4),cue.y-dy*(tip+4));c.stroke();

 }
 for(const b of s.balls){if(b.pocketed||b.id===0&&s.ballInHand)continue;const color=ballColor(b.id);c.save();c.translate(b.x,b.y);c.shadowColor='#00192faa';c.shadowBlur=3;c.shadowOffsetY=2;c.fillStyle=b.id>8?'#fff8e5':color;c.beginPath();c.arc(0,0,R,0,Math.PI*2);c.fill();c.shadowBlur=0;c.shadowOffsetY=0;
  if(b.id>8){c.save();c.beginPath();c.arc(0,0,R,0,Math.PI*2);c.clip();c.fillStyle=color;c.fillRect(-R,-4.6,R*2,9.2);c.restore();}
  const shine=c.createRadialGradient(-3,-4,.1,0,0,R);shine.addColorStop(0,'#ffffff66');shine.addColorStop(.4,'#ffffff00');shine.addColorStop(1,'#00000044');c.fillStyle=shine;c.beginPath();c.arc(0,0,R,0,Math.PI*2);c.fill();
  if(b.id){c.fillStyle='#fffbed';c.beginPath();c.arc(0,0,4.9,0,Math.PI*2);c.fill();c.fillStyle='#142a31';c.font=`bold ${b.id>9?6.5:8}px system-ui`;c.textAlign='center';c.textBaseline='middle';c.rotate(-Math.PI/2);c.fillText(String(b.id),0,.4);}c.restore();
 }
 if(s.ballInHand&&ghost){c.save();c.globalAlpha=.75;c.fillStyle=ghost.valid?'#fff7de':'#ff816b';c.beginPath();c.arc(ghost.x,ghost.y,R,0,Math.PI*2);c.fill();c.strokeStyle=ghost.valid?'#fff8c9':'#ff816b';c.lineWidth=2;c.setLineDash([4,4]);c.beginPath();c.arc(ghost.x,ghost.y,R+6,0,Math.PI*2);c.stroke();c.restore();}
 if(s.phase==='over'){
  c.setTransform(ratio,0,0,ratio,0,0);c.fillStyle='#082840dd';c.fillRect(235,150,370,130);c.fillStyle='#fce5a2';c.textAlign='center';c.font='bold 25px system-ui';c.fillText(`${names?`${names[s.winner!]} wins`:s.mode==='ai'?(s.winner===0?'You win':'Computer wins'):`Player ${s.winner!+1} wins`}`,420,205);c.font='14px system-ui';c.fillText('Use Restart for a fresh rack',420,239);
 }
}
