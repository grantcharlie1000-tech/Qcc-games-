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
export function settingDetails(c:C,l:Level,t:number,cx:number,cy:number,w:number,h:number){const theme=WORLDS[l.world];const left=cx*.65,right=left+w;

if(l.setting==='canal'){for(let i=0;i<Math.ceil(l.width/220);i++){const x=i*220;if(x+220<left||x>right)continue;const y=(l.water??510)+64;box(c,theme.far,x,y,220,160);box(c,theme.edge+'16',x,y,220,2);c.fillStyle=theme.sky;c.beginPath();c.arc(x+110,y+90,62,Math.PI,0);c.lineTo(x+172,y+180);c.lineTo(x+48,y+180);c.fill();for(let j=0;j<9;j++){const a=Math.PI+j*Math.PI/8;box(c,theme.edge+'44',x+108+Math.cos(a)*69,y+88+Math.sin(a)*69,5,8);}for(let j=0;j<7;j++){box(c,theme.edge+'22',x+noise(i,j)*200,y+13+j*18,18,2);}box(c,'#233c4277',x+12,y+4,6,120);}}
if(l.setting==='factory')for(let i=0;i<3;i++){const x=140+i*480;if(x+160<left||x>right)continue;for(const yy of [122,196]){box(c,'#322e3866',x-12,yy,24,7);box(c,'#b79a6a55',x-11,yy,22,2);box(c,'#d6b28b55',x-9,yy+2,2,3);box(c,'#d6b28b55',x+8,yy+2,2,3);}box(c,'#27323c77',x+126,301,28,33);box(c,'#af9c7a66',x+129,304,22,25);box(c,'#263740',x+132,307,16,14);box(c,'#d1b98d88',x+138,309,2,9);box(c,'#b8775866',x+133,324,12,2);for(let yy=370;yy<610;yy+=43){box(c,'#c4a37544',x+130,yy,20,4);}}
if(l.setting==='cavern'){for(let i=0;i<Math.ceil(l.width/180);i++){const x=i*180;if(x+220<left||x>right)continue;poly(c,theme.near+'44',[x-40,700,x-20,330,x+12,255,x+30,150,x+65,120,x+80,220,x+120,280,x+170,700]);poly(c,theme.edge+'0d',[x+65,120,x+53,320,x+75,290,x+110,700,x+80,220]);}for(let i=0;i<Math.ceil(l.width/105);i++){const x=i*105;if(x+130<left||x>right)continue;const y=60+noise(i,l.id)*125;poly(c,theme.far,[x-30,-300,x+100,-300,x+87,y-45,x+59,y+42,x+43,y-8,x+24,y+62,x+5,y-32]);poly(c,theme.edge+'16',[x+13,-150,x+22,y+57,x+32,y-40,x+33,-150]);const drip=(t*.15+noise(i,1))%1;box(c,theme.edge+'44',x+24,y+63+drip*180,1,5);}}
if(l.setting==='cavern'){const x=l.width*.67,y=l.height-45;if(x+72>left&&x<right)for(let j=0;j<3;j++){const xx=x+j*19,yy=y+j%2*9;poly(c,theme.accent+'26',[xx,yy,xx-5,yy-21-j*5,xx+1,yy-34-j*5,xx+8,yy-17,xx+6,yy]);poly(c,theme.edge+'36',[xx+1,yy-32-j*5,xx+3,yy-4,xx+6,yy-17]);}}

// Quiet moths keep to warm lamps rather than filling the scene with random particles.
if(l.world===1||l.setting==='cavern')for(let i=0;i<2;i++){const x=left+noise(i,19)*w+Math.sin(t*.7+i)*12,y=cy*.55+100+noise(i,11)*(h-150)+Math.cos(t+i)*7;box(c,'#c9d4a688',x-3,y+Math.sin(t*7+i)*2,3,2);box(c,'#c5c9a555',x,y,1,2);box(c,'#c9d4a688',x+1,y-Math.sin(t*7+i)*2,3,2);}}
