import {FIELD,POCKETS,R,preview,legalTargets,groupOf,type PoolState} from './model';
import type {Drag} from './input';
const backdrops=new WeakMap<HTMLCanvasElement,HTMLCanvasElement>();
const COLORS=['#faf6e7','#efbc25','#2781d1','#e7484d','#9868ce','#ed802f','#33a481','#a64445','#162330'];
export function drawTable(canvas:HTMLCanvasElement,s:PoolState,ghost:{x:number;y:number;valid:boolean}|null,paused:boolean,drag:Drag|null=null){
 const ratio=Math.min(2,window.devicePixelRatio||1),width=840,height=440;
 if(canvas.width!==width*ratio||canvas.height!==height*ratio){canvas.width=width*ratio;canvas.height=height*ratio;}
 const c=canvas.getContext('2d')!;c.setTransform(ratio,0,0,ratio,0,0);c.clearRect(0,0,width,height);
 // Rotate the view, keeping all physics and saved positions in their original units.
 const rotated=()=>c.setTransform(0,ratio,-ratio,0,840*ratio,0);
 const text=(value:string,x:number,y:number)=>{c.save();c.translate(x,y);c.rotate(-Math.PI/2);c.fillText(value,0,0);c.restore();};

 function round(x:number,y:number,w:number,h:number,r:number,fill:string){c.fillStyle=fill;c.beginPath();c.roundRect(x,y,w,h,r);c.fill();}
 const cached=backdrops.get(canvas);if(cached&&cached.width===canvas.width&&cached.height===canvas.height){c.drawImage(cached,0,0,width,height);rotated();}else{rotated();
 const wood=c.createLinearGradient(0,0,440,840);wood.addColorStop(0,'#af7152');wood.addColorStop(.3,'#663327');wood.addColorStop(.6,'#9f5740');wood.addColorStop(1,'#442420');
 c.shadowColor='#0008';c.shadowBlur=10;c.shadowOffsetY=7;round(8,12,424,812,32,'#102338');c.shadowBlur=0;c.shadowOffsetY=0;
 c.fillStyle=wood;c.beginPath();c.roundRect(14,17,412,800,28);c.fill();
 c.strokeStyle='#e7b46c44';c.lineWidth=2;for(let x=22;x<425;x+=7){c.beginPath();c.moveTo(x,43);c.lineTo(x,793);c.stroke();}
 round(26,42,388,756,20,'#072539');
 const felt=c.createRadialGradient(205,330,30,220,420,450);felt.addColorStop(0,'#197cba');felt.addColorStop(1,'#074b83');
 c.fillStyle=felt;c.fillRect(FIELD.left,FIELD.top,360,720);
 c.save();c.beginPath();c.rect(40,60,360,720);c.clip();c.fillStyle='#fff';c.globalAlpha=.04;for(let y=64;y<780;y+=6)for(let x=44+(y%12?0:3);x<400;x+=7)c.fillRect(x,y,1,1);c.restore();
 // Raised cushion noses; pockets interrupt the border visually and capture before collision.
 c.lineWidth=10;c.strokeStyle='#083d65';c.beginPath();for(const x of [35,405]){c.moveTo(x,88);c.lineTo(x,390);c.moveTo(x,450);c.lineTo(x,752);}for(const y of [55,785]){c.moveTo(70,y);c.lineTo(370,y);}c.stroke();
 c.strokeStyle='#64b5df';c.lineWidth=2;c.beginPath();for(const x of [42,398]){c.moveTo(x,87);c.lineTo(x,393);c.moveTo(x,447);c.lineTo(x,753);}for(const y of [62,778]){c.moveTo(69,y);c.lineTo(371,y);}c.stroke();
 c.fillStyle='#f2d6a0';for(const x of [23,417])for(const y of [150,240,330,510,600,690]){c.beginPath();c.moveTo(x,y-4);c.lineTo(x+3,y);c.lineTo(x,y+4);c.lineTo(x-3,y);c.closePath();c.fill();}for(const y of [31,805])for(const x of [130,220,310]){c.beginPath();c.arc(x,y,2.6,0,Math.PI*2);c.fill();}
 for(let i=0;i<POCKETS.length;i++){const p=POCKETS[i];c.fillStyle='#c49257';c.beginPath();c.arc(p.x,p.y,23,0,Math.PI*2);c.fill();c.fillStyle='#091b20';c.beginPath();c.arc(p.x,p.y,19.5,0,Math.PI*2);c.fill();c.strokeStyle='#ffffff12';c.lineWidth=2;c.stroke();c.fillStyle='#f8e3b2';c.font='bold 10px system-ui';c.textAlign='center';text(String(i+1),p.x,p.y+3);}
 c.fillStyle='#afd9f0aa';for(const y of [240,600]){c.beginPath();c.arc(220,y,2,0,Math.PI*2);c.fill();}
 c.save();c.font='bold 16px system-ui';c.textAlign='center';c.fillStyle='#a9d7f024';text('POCKET CLUB',220,420);c.font='10px system-ui';text('E I G H T  B A L L',238,420);c.restore();
 const backdrop=document.createElement('canvas');backdrop.width=canvas.width;backdrop.height=canvas.height;backdrop.getContext('2d')!.drawImage(canvas,0,0);backdrops.set(canvas,backdrop);
 }
 if(!s.break){const p=POCKETS[s.calledPocket];c.strokeStyle='#f8dd7b';c.lineWidth=3;c.beginPath();c.arc(p.x,p.y,25,0,Math.PI*2);c.stroke();}
 const cue=s.balls.find(b=>b.id===0)!;
 if(s.phase==='aim'&&!s.ballInHand&&!paused){const p=preview(s,s.angle),targets=legalTargets(s),legal=p.hit===null||targets.some(b=>b.id===p.hit),dx=Math.cos(s.angle),dy=Math.sin(s.angle);
  c.save();c.beginPath();c.rect(40,60,360,720);c.clip();c.setLineDash([6,6]);c.strokeStyle=legal?'#e9ffcebc':'#ffad9bcc';c.lineWidth=1.8;c.beginPath();c.moveTo(cue.x,cue.y);c.lineTo(p.x,p.y);c.stroke();c.setLineDash([]);c.strokeStyle=legal?'#f1ffdf':'#ff9c82';c.beginPath();c.arc(p.x,p.y,R,0,Math.PI*2);c.stroke();
  if(p.hit!==null){const b=s.balls.find(b=>b.id===p.hit)!;const n=Math.hypot(b.x-p.x,b.y-p.y),nx=(b.x-p.x)/n,ny=(b.y-p.y)/n;c.beginPath();c.moveTo(b.x,b.y);c.lineTo(b.x+nx*65,b.y+ny*65);c.stroke();}c.restore();
  const pull=12+(drag?.kind==='pull'?drag.power*120:0);
  if(!drag){c.strokeStyle='#fff5c788';c.lineWidth=2;c.setLineDash([3,4]);c.beginPath();c.arc(cue.x,cue.y,23,0,Math.PI*2);c.stroke();c.setLineDash([]);}c.lineCap='round';c.lineWidth=6;c.strokeStyle='#30262b';c.beginPath();c.moveTo(cue.x-dx*(R+pull),cue.y-dy*(R+pull));c.lineTo(cue.x-dx*(R+pull+104),cue.y-dy*(R+pull+104));c.stroke();c.lineWidth=3.5;c.strokeStyle='#ecd6a5';c.beginPath();c.moveTo(cue.x-dx*(R+pull),cue.y-dy*(R+pull));c.lineTo(cue.x-dx*(R+pull+75),cue.y-dy*(R+pull+75));c.stroke();c.lineWidth=4;c.strokeStyle='#7fd2dd';c.beginPath();c.moveTo(cue.x-dx*(R+pull),cue.y-dy*(R+pull));c.lineTo(cue.x-dx*(R+pull+4),cue.y-dy*(R+pull+4));c.stroke();
 }
 for(const b of s.balls){if(b.pocketed||b.id===0&&s.ballInHand)continue;const color=COLORS[b.id===0?0:b.id===8?8:b.id>8?b.id-8:b.id];c.save();c.translate(b.x,b.y);c.shadowColor='#00192faa';c.shadowBlur=3;c.shadowOffsetY=2;c.fillStyle=b.id>8?'#fff8e5':color;c.beginPath();c.arc(0,0,R,0,Math.PI*2);c.fill();c.shadowBlur=0;c.shadowOffsetY=0;
  if(b.id>8){c.save();c.beginPath();c.arc(0,0,R,0,Math.PI*2);c.clip();c.fillStyle=color;c.fillRect(-R,-4.6,R*2,9.2);c.restore();}
  const shine=c.createRadialGradient(-3,-4,.1,0,0,R);shine.addColorStop(0,'#ffffff66');shine.addColorStop(.4,'#ffffff00');shine.addColorStop(1,'#00000044');c.fillStyle=shine;c.beginPath();c.arc(0,0,R,0,Math.PI*2);c.fill();
  if(b.id){c.fillStyle='#fffbed';c.beginPath();c.arc(0,0,4.9,0,Math.PI*2);c.fill();c.fillStyle='#142a31';c.font=`bold ${b.id>9?6.5:8}px system-ui`;c.textAlign='center';c.textBaseline='middle';c.rotate(-Math.PI/2);c.fillText(String(b.id),0,.4);}c.restore();
 }
 if(s.ballInHand&&ghost){c.save();c.globalAlpha=.75;c.fillStyle=ghost.valid?'#fff7de':'#ff816b';c.beginPath();c.arc(ghost.x,ghost.y,R,0,Math.PI*2);c.fill();c.strokeStyle=ghost.valid?'#fff8c9':'#ff816b';c.lineWidth=2;c.setLineDash([4,4]);c.beginPath();c.arc(ghost.x,ghost.y,R+6,0,Math.PI*2);c.stroke();c.restore();}
 if(s.phase==='over'){
  c.setTransform(ratio,0,0,ratio,0,0);c.fillStyle='#082840dd';c.fillRect(235,150,370,130);c.fillStyle='#fce5a2';c.textAlign='center';c.font='bold 25px system-ui';c.fillText(`${s.mode==='ai'?(s.winner===0?'You win':'Computer wins'):`Player ${s.winner!+1} wins`}`,420,205);c.font='14px system-ui';c.fillText('Use Restart for a fresh rack',420,239);
 }
}
