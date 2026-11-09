import {WORLDS,type Level} from './levels';
import {noise} from './terrain';
type C=CanvasRenderingContext2D;
function box(c:C,color:string,x:number,y:number,w:number,h:number){c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));}
function poly(c:C,color:string,points:number[]){c.fillStyle=color;c.beginPath();for(let i=0;i<points.length;i+=2){if(i)c.lineTo(Math.round(points[i]),Math.round(points[i+1]));else c.moveTo(Math.round(points[i]),Math.round(points[i+1]));}c.closePath();c.fill();}
/** Leaf clusters have a dark silhouette, an irregular lit crown and individual leaf tips. */
function crown(c:C,x:number,y:number,scale:number,lit:boolean){c.save();c.translate(Math.round(x),Math.round(y));c.scale(scale,scale);poly(c,lit?'#294d43':'#25483f',[-18,5,-23,-1,-20,-9,-13,-11,-11,-17,-3,-19,3,-16,10,-18,18,-12,17,-6,24,-3,21,4,12,9,-7,11]);poly(c,lit?'#567e50':'#355e48',[-18,-7,-11,-10,-10,-15,-2,-16,3,-13,9,-15,17,-10,12,-6,15,-2,5,1,-2,-3,-9,0]);for(let j=0;j<8;j++){const xx=noise(j,6)*27-14,yy=noise(j,2)*17-14;poly(c,lit?'#8eaa68':'#4c7755',[xx,yy,xx+5,yy-2,xx+7,yy,xx+3,yy+2]);}c.restore();}
export function tree(c:C,x:number,y:number,t:number,seed:number,scale=1,lit=true){c.save();c.translate(x,y);c.scale(scale,scale);const sway=Math.sin(t*.85+seed)*1.3;poly(c,'#223831',[-8,0,-4,-35,-7,-64,-2,-77,4,-69,5,-35,10,0]);poly(c,lit?'#7e7953':'#59674d',[-4,-2,-1,-36,-4,-66,-1,-71,1,-35,5,-2]);box(c,lit?'#bbb47a':'#7a8b62',-2,-30,1,23);for(let j=0;j<5;j++){const side=j%2?1:-1,yy=-28-j*9;poly(c,'#665f43',[0,yy+5,side*26,yy-18,side*27,yy-22,0,yy]);}for(const [xx,yy,s] of [[-24,-49,.75],[23,-54,.8],[-24,-70,.85],[21,-76,.85],[0,-90,1],[-5,-66,.9]])crown(c,xx+sway,yy,s,lit);for(let j=0;j<4;j++){box(c,lit?'#d9c599':'#7b9262',-17+j*11,-67-noise(j,seed)*17,2,2);}poly(c,'#456b48',[-14,0,-10,-9,-4,-4,0,-10,5,-4,10,-8,15,0]);c.restore();}
export function cat(c:C,x:number,y:number,t:number,alert:boolean,affection=0,reduced=false){
 c.save();c.translate(Math.round(x),Math.round(y));if(alert)c.scale(-1,1);
 const p=affection,lean=reduced?p:Math.round(Math.sin(t*3)*p),blink=p>0||t>0&&t%6>5.8;
 poly(c,'#182631',[-12,-1,-12,-8-p,-8,-12-p,1,-12-p,7,-8,9,-1]);
 poly(c,'#b89370',[-11,-3,-10,-8-p,-6,-10-p,3,-10-p,6,-7,7,-3]);
 box(c,'#d2b187',-8,-10-p,9,2);for(const xx of [-7,-2])box(c,'#6e6558',xx,-10-p,2,5);
 box(c,'#e3c99b',-10,-3,5,2);box(c,'#e3c99b',5,-3,5,2);
 c.save();c.translate(-p*2,lean-p);
 poly(c,'#182631',[3,-10,4,-17,4+p,-23+p*2,8,-20,13,-22+p*2,15,-16,14,-9,9,-7]);
 poly(c,'#b89370',[5,-11,5,-17,8,-18,12,-18,13,-14,10,-10,6,-7]);
 box(c,'#dfb69a',5,-20+p,2,3);box(c,'#e3c99b',5,-14,7,4);box(c,'#d2b187',6,-18,6,2);
 box(c,'#20313a',10,-16,3,blink?1:2);if(!blink)box(c,'#e6dc91',11,-16,1,1);
 box(c,'#9d7268',13,-12,2,1);box(c,'#cbbda1',14,-11,4,1);if(p)box(c,'#cbbda1',13,-9,4,1);c.restore();
 const flick=reduced?0:Math.round(Math.sin(t*(p?4:2))*(p?3:2));
 poly(c,'#182631',[-10,-3,-17,-4,-21,-9,-21,-16+flick-p*3,-18,-17+flick-p*3,-17,-10,-13,-8,-10,-8]);
 poly(c,'#b89370',[-11,-5,-16,-6,-19,-10,-19,-15+flick-p*3,-18,-10,-14,-7,-11,-7]);
 box(c,'#e3c99b',-20,-15+flick-p*3,2,3);c.restore();
}
export function washing(c:C,x:number,y:number,width:number,t:number){box(c,'#243743',x,y-58,3,58);box(c,'#7a8b87',x,y-58,1,56);box(c,'#243743',x+width,y-54,3,54);c.strokeStyle='#839b91';c.lineWidth=1;c.beginPath();c.moveTo(x,y-57);c.quadraticCurveTo(x+width*.5,y-49,x+width,y-53);c.stroke();for(let i=0;i<4;i++){const xx=x+13+i*(width-24)/4,yy=y-55+Math.sin(i)*2,sw=Math.round(Math.sin(t*1.8+i)),color=i%2?'#876d73':'#6e8d89';if(i%2===0){poly(c,'#263b46',[xx-3,yy,xx+3,yy,xx+5,yy+2,xx+9,yy,xx+15,yy+3,xx+13+sw,yy+8,xx+11+sw,yy+7,xx+11+sw,yy+20,xx+1+sw,yy+19,xx+1,yy+7,xx-3,yy+8]);poly(c,color,[xx-2,yy+1,xx+3,yy+1,xx+6,yy+4,xx+9,yy+1,xx+14,yy+4,xx+12,yy+7,xx+10,yy+6,xx+10+sw,yy+18,xx+2+sw,yy+18,xx+2,yy+5,xx-2,yy+7]);}else{box(c,'#273846',xx,yy,14,25);box(c,color,xx+1,yy+1,12,23);box(c,'#d3b4a366',xx+2,yy+2,2,20);box(c,'#674c6055',xx+8,yy+3,2,19);box(c,'#e1c9ae',xx+1,yy+21,12,1);}box(c,'#d6bd8d',xx+2,yy-2,2,4);box(c,'#d6bd8d',xx+10,yy-2,2,4);}}
/** World architecture is authored at three depth scales; detailing falls off with distance. */
export function skyline(c:C,l:Level,w:number,h:number,cx:number,cy:number,t:number,warm:number){const theme=WORLDS[l.world];
if(l.world===1){
 for(let layer=0;layer<2;layer++){
  const factor=layer?.17:.07,spacing=layer?375:310,base=h*.93-cy*.1;
  for(let i=Math.floor(cx*factor/spacing)-1;i<Math.ceil((cx*factor+w)/spacing)+1;i++){
   const x=Math.round(i*spacing-cx*factor+noise(i,4)*75),top=Math.round(base-100-noise(i,layer+2)*160);
   c.save();c.globalAlpha=layer?.48:.4;
   poly(c,layer?'#244a40':'#204039',[x-9,h,x-6,top+18,x+3,top-25,x+10,top+30,x+18,h]);
   const fill=layer?'#2a5042':'#27463e';
   poly(c,fill,[x-102,top+51,x-86,top+22,x-58,top+20,x-51,top-9,x-22,top-18,x-11,top-35,x+18,top-34,x+40,top-12,x+67,top-7,x+68,top+11,x+96,top+25,x+111,top+51,x+62,top+61,x+25,top+50,x-14,top+61,x-54,top+54]);
   if(layer){poly(c,'#365a4666',[x-75,top+24,x-51,top-6,x-23,top-14,x-8,top-28,x+18,top-27,x+39,top-7,x+7,top+2,x-15,top+13,x-39,top+8]);crown(c,x+48,top+27,1.25,false);}
   c.restore();
  }
 }
 return;
}
for(let layer=0;layer<(l.world===3?2:3);layer++){const factor=[.08,.19,.34][layer],bw=l.world===3?[310,260][layer]:[180,154,134][layer],base=h*.83+layer*35-cy*.13;for(let i=Math.floor(cx*factor/bw)-1;i<Math.ceil((cx*factor+w)/bw)+1;i++){const x=Math.floor(i*bw-cx*factor),bh=65+noise(i,layer+4)*150,y=Math.floor(base-bh),fill=layer===1?theme.near:theme.far; c.save();c.globalAlpha=layer===0?.35:layer===1?.46:.64;
if(l.world===3){poly(c,fill,[x-90,h,x+39,y-110,x+75,y-57,x+104,y-70,x+220,h]);poly(c,layer===2?'#7295ae':'#506c88',[x+39,y-110,x+16,y-51,x+34,y-61,x+40,y-37,x+51,y-65,x+75,y-57]);poly(c,'#c0d7dd55',[x+39,y-110,x+27,y-77,x+38,y-84,x+44,y-72,x+51,y-78]);poly(c,'#1c324a55',[x+40,y-65,x+64,y+25,x+87,y+45,x+125,h,x+39,y-110]);for(let j=0;j<3;j++){const xx=x+j*40,yy=base-20-j%2*20;poly(c,'#273f52',[xx-15,yy,xx,yy-70,xx+15,yy,xx+8,yy-5,xx+20,yy+15,xx-20,yy+15]);}c.restore();continue;}
box(c,fill,x,y,bw-12,h-y);box(c,theme.sky+'44',x+bw-30,y,18,h-y);box(c,theme.edge+'20',x+2,y+3,bw-17,2);
if(l.world===0){const roof=y-17-noise(i,7)*20;poly(c,fill,[x-7,y,x+bw*.35,roof,x+bw-5,y]);poly(c,theme.edge+'22',[x-7,y,x+bw*.35,roof,x+bw*.35+5,roof+3,x,y+3]);box(c,fill,x+22,roof-17,12,24);box(c,theme.edge+'30',x+19,roof-19,18,3);if(i%3===0){box(c,theme.sky+'77',x+70,roof+9,18,13);box(c,theme.glow+'55',x+75,roof+11,8,10);poly(c,fill,[x+65,roof+9,x+79,roof-2,x+93,roof+9]);}if(layer===2){box(c,theme.edge+'33',x+8,y+37,bw-24,2);box(c,theme.sky+'55',x+12,y+39,bw-32,3);for(let j=0;j<4;j++){box(c,theme.edge+'22',x+18+j*25,y+30,2,8);}box(c,theme.sky+'66',x+bw-20,y+3,3,bh);}}
if(l.world===2){for(let j=0;j<2;j++){const xx=x+17+j*43,top=y-45-j*14;box(c,fill,xx,top,15,55+j*14);box(c,theme.edge+'33',xx-3,top,21,4);box(c,theme.sky+'55',xx+10,top+4,4,52);for(let k=1;k<4;k++)box(c,theme.edge+'22',xx,top+k*13,15,2);for(let k=0;k<4;k++){const age=(t*.1+k*.25)%1;box(c,theme.near+'55',xx-2+Math.sin(age*4+i)*14,top-9-age*65,19+age*30,8+age*10);}}poly(c,fill,[x,y,x+28,y-20,x+28,y,x+60,y-20,x+60,y,x+93,y-20,x+93,y]);box(c,theme.edge+'33',x+5,y+20,bw-24,3);}
if(l.world===4){poly(c,fill,[x-3,y,x+2,y-13,x+13,y-28,x+31,y-38,x+55,y-38,x+73,y-28,x+84,y-13,x+88,y]);poly(c,theme.edge+'22',[x+1,y-1,x+6,y-13,x+18,y-26,x+33,y-34,x+41,y-35,x+29,y-24,x+20,y-11,x+18,y]);box(c,theme.sky+'66',x+42,y-35,7,34);box(c,theme.edge+'33',x-4,y,96,4);box(c,theme.edge+'55',x+40,y-53,2,17);box(c,theme.glow+'77',x+38,y-55,6,2);if(i%2===0){c.strokeStyle=theme.edge+'55';c.lineWidth=1;c.beginPath();c.ellipse(x+43,y-45,24,8,-.4,0,Math.PI*2);c.stroke();}}
for(let row=0;row<bh/38;row++)for(let col=0;col<3;col++){const n=noise(i*5+col,row+layer);if(n<.48)continue;const xx=x+17+col*34,yy=y+18+row*38;box(c,theme.sky+'66',xx-2,yy-2,11,15);box(c,n<.4+warm*.3?theme.glow+'55':theme.accent+'10',xx,yy,7,10);if(layer===2){box(c,fill,xx+3,yy,1,10);box(c,fill,xx,yy+4,7,1);box(c,theme.edge+'33',xx-2,yy+11,11,2);}}
c.restore();}}}
export function settingDetails(c:C,l:Level,t:number,cx:number,cy:number,w:number,h:number){const theme=WORLDS[l.world];const left=cx*.65,right=left+w;
if(l.setting==='garden'){
 // Two quiet side wings frame the conservatory. Long unbroken foreground ribs
 // and repeated hanging roots previously read as another set of playable bars.
 for(const x of [70,l.width*.81]){
  if(x+156<left||x>right)continue;
  c.strokeStyle='#77977727';c.lineWidth=2;c.beginPath();c.moveTo(x,610);c.lineTo(x,258);c.quadraticCurveTo(x+76,172,x+152,258);c.lineTo(x+152,610);c.stroke();
  box(c,'#98b49b08',x+3,261,146,347);box(c,'#8caa8120',x+75,219,2,390);
  for(let j=0;j<2;j++){const xx=x+15+j*111,drop=42+noise(j,l.id)*32;c.strokeStyle='#50764b44';c.lineWidth=2;c.beginPath();c.moveTo(xx,261);c.bezierCurveTo(xx-6,282,xx+8,294,xx+2,261+drop);c.stroke();for(let k=0;k<3;k++)poly(c,'#64875533',[xx+2,275+k*13,xx-6,268+k*13,xx-11,271+k*13,xx-3,278+k*13]);}
 }
}
if(l.setting==='canal'){for(let i=0;i<Math.ceil(l.width/220);i++){const x=i*220;if(x+220<left||x>right)continue;const y=(l.water??510)+64;box(c,theme.far,x,y,220,160);box(c,theme.edge+'16',x,y,220,2);c.fillStyle=theme.sky;c.beginPath();c.arc(x+110,y+90,62,Math.PI,0);c.lineTo(x+172,y+180);c.lineTo(x+48,y+180);c.fill();for(let j=0;j<9;j++){const a=Math.PI+j*Math.PI/8;box(c,theme.edge+'44',x+108+Math.cos(a)*69,y+88+Math.sin(a)*69,5,8);}for(let j=0;j<7;j++){box(c,theme.edge+'22',x+noise(i,j)*200,y+13+j*18,18,2);}box(c,'#233c4277',x+12,y+4,6,120);}}
if(l.setting==='factory')for(let i=0;i<3;i++){const x=140+i*480;if(x+160<left||x>right)continue;for(const yy of [122,196]){box(c,'#322e3866',x-12,yy,24,7);box(c,'#b79a6a55',x-11,yy,22,2);box(c,'#d6b28b55',x-9,yy+2,2,3);box(c,'#d6b28b55',x+8,yy+2,2,3);}box(c,'#27323c77',x+126,301,28,33);box(c,'#af9c7a66',x+129,304,22,25);box(c,'#263740',x+132,307,16,14);box(c,'#d1b98d88',x+138,309,2,9);box(c,'#b8775866',x+133,324,12,2);for(let yy=370;yy<610;yy+=43){box(c,'#c4a37544',x+130,yy,20,4);}}
if(l.setting==='cavern'){for(let i=0;i<Math.ceil(l.width/180);i++){const x=i*180;if(x+220<left||x>right)continue;poly(c,theme.near+'44',[x-40,700,x-20,330,x+12,255,x+30,150,x+65,120,x+80,220,x+120,280,x+170,700]);poly(c,theme.edge+'0d',[x+65,120,x+53,320,x+75,290,x+110,700,x+80,220]);}for(let i=0;i<Math.ceil(l.width/105);i++){const x=i*105;if(x+130<left||x>right)continue;const y=60+noise(i,l.id)*125;poly(c,theme.far,[x-30,-300,x+100,-300,x+87,y-45,x+59,y+42,x+43,y-8,x+24,y+62,x+5,y-32]);poly(c,theme.edge+'16',[x+13,-150,x+22,y+57,x+32,y-40,x+33,-150]);const drip=(t*.15+noise(i,1))%1;box(c,theme.edge+'44',x+24,y+63+drip*180,1,5);}}
if(l.setting==='cavern'){const x=l.width*.67,y=l.height-45;if(x+72>left&&x<right)for(let j=0;j<3;j++){const xx=x+j*19,yy=y+j%2*9;poly(c,theme.accent+'26',[xx,yy,xx-5,yy-21-j*5,xx+1,yy-34-j*5,xx+8,yy-17,xx+6,yy]);poly(c,theme.edge+'36',[xx+1,yy-32-j*5,xx+3,yy-4,xx+6,yy-17]);}}
if(l.world===4){const x=620,y=130;if(x+200>left&&x-100<right){c.save();c.translate(x,y);c.strokeStyle='#aa91bc44';c.lineWidth=2;c.beginPath();c.ellipse(0,0,62,22,-.55,0,Math.PI*2);c.stroke();c.beginPath();c.ellipse(0,0,28,62,-.55,0,Math.PI*2);c.stroke();box(c,'#a9a0bb55',-2,0,4,126);poly(c,'#4f4568',[-30,126,0,80,30,126]);c.rotate(-.45);box(c,'#242b43',-40,-9,94,18);box(c,'#8c809d',-37,-8,87,4);box(c,'#635774',-34,-4,84,9);box(c,'#c5b5b777',45,-11,8,22);box(c,'#d2c8bd55',-27,-7,5,15);c.restore();}}
// Quiet moths keep to warm lamps rather than filling the scene with random particles.
if(l.world===1||l.setting==='cavern')for(let i=0;i<2;i++){const x=left+noise(i,19)*w+Math.sin(t*.7+i)*12,y=cy*.55+100+noise(i,11)*(h-150)+Math.cos(t+i)*7;box(c,'#c9d4a688',x-3,y+Math.sin(t*7+i)*2,3,2);box(c,'#c5c9a555',x,y,1,2);box(c,'#c9d4a688',x+1,y-Math.sin(t*7+i)*2,3,2);}}
