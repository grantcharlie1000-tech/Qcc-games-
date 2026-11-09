import {WORLDS,type Level} from './levels';
type C=CanvasRenderingContext2D;
const rect=(c:C,color:string,x:number,y:number,w:number,h:number)=>{c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),w,h);};
function shape(c:C,color:string,points:number[]){c.fillStyle=color;c.beginPath();for(let i=0;i<points.length;i+=2)i?c.lineTo(points[i],points[i+1]):c.moveTo(points[i],points[i+1]);c.closePath();c.fill();}
function line(c:C,color:string,width:number,points:number[]){c.strokeStyle=color;c.lineWidth=width;c.beginPath();for(let i=0;i<points.length;i+=2)i?c.lineTo(points[i],points[i+1]):c.moveTo(points[i],points[i+1]);c.stroke();}
function rivet(c:C,x:number,y:number,color:string){rect(c,color,x,y,2,2);rect(c,'#15253244',x+1,y+2,2,1);}
function arch(c:C,x:number,y:number,w:number,h:number,fill:string){c.fillStyle=fill;c.beginPath();c.moveTo(x,y+h);c.lineTo(x,y+w/2);c.arc(x+w/2,y+w/2,w/2,Math.PI,0);c.lineTo(x+w,y+h);c.closePath();c.fill();}
/** A few landmarks, not a second repeated tile layer. All geometry is behind play. */
export function landmarks(c:C,l:Level,cx:number,cy:number,w:number,h:number,t:number){
 const a=WORLDS[l.world],left=cx*.65,right=left+w;
 const visible=(x:number,width:number)=>x+width>left-50&&x<right+50;
 c.save();c.globalAlpha*=.58;
 if(l.setting==='roofs'&&visible(l.width*.67,245)){
  const x=l.width*.67,y=162;
  // A riveted rooftop cistern and its maintenance stair identify the old quarter.
  for(const xx of [x+7,x+71]){rect(c,'#293c49',xx,y+42,7,170);rect(c,'#7e929044',xx,y+43,2,167);}
  line(c,'#50636c',3,[x+12,y+85,x+71,y+142,x+12,y+194]);line(c,'#50636c',3,[x+71,y+85,x+12,y+142,x+71,y+194]);
  shape(c,'#263d48',[x-5,y,x+8,y-11,x+67,y-11,x+82,y,x+82,y+60,x+67,y+68,x+8,y+68,x-5,y+60]);
  rect(c,'#50636a',x+1,y,74,59);rect(c,'#657875',x+4,y+2,15,54);rect(c,'#354e58',x+59,y+1,15,58);
  for(const yy of [y+5,y+48]){rect(c,'#83918a66',x-3,yy,82,3);rect(c,'#243e48',x-3,yy+3,82,2);for(let j=0;j<6;j++)rivet(c,x+3+j*14,yy,'#b8b39666');}
  shape(c,'#637875',[x-8,y-2,x+38,y-23,x+83,y-2]);line(c,'#9bab9a66',1,[x-8,y-2,x+38,y-23,x+83,y-2]);rect(c,'#8e9e8a',x+36,y-28,4,6);
  line(c,'#76867c',2,[x+86,y-8,x+86,y+166]);line(c,'#76867c',2,[x+98,y-8,x+98,y+166]);for(let yy=y;yy<y+168;yy+=10)rect(c,'#778984',x+85,yy,15,1);
  // Narrow recessed windows keep this facade distinct from walkable roof edges.
  rect(c,'#344a58',x+103,y+110,139,210);for(let row=0;row<3;row++)for(let col=0;col<3;col++){rect(c,'#263b49',x+120+col*34,y+130+row*53,14,26);rect(c,'#8d9b8b22',x+122+col*34,y+132+row*53,3,20);}
 }
 if((l.setting==='bridge'||l.setting==='canal')&&visible(0,l.width)){
  // The distant bridge sits below the lowest playable shelf. Its hanging
  // cables describe depth without introducing a bright false landing edge.
  const base=l.setting==='canal'?(l.water??510)+95:Math.max(...l.platforms.map(p=>p.y))+155,span=510;
  for(let x=100;x<l.width;x+=span){if(!visible(x-30,span+70))continue;
   rect(c,a.far,x,base-100,19,320);rect(c,a.edge+'22',x+2,base-100,3,320);rect(c,a.near,x-7,base-103,33,7);shape(c,a.near,[x-8,base-104,x+9,base-124,x+26,base-104]);
   c.strokeStyle=a.edge+'44';c.lineWidth=2;c.beginPath();c.moveTo(x+9,base-103);c.quadraticCurveTo(x+span*.5,base+18,x+span+9,base-103);c.stroke();
   for(let k=1;k<8;k++){const f=k/8,xx=x+9+span*f,yy=base-103+242*f*(1-f);rect(c,a.edge+'17',xx,yy,1,base+90-yy);}
  }
 }

 if(l.setting==='factory'&&visible(320,260)){
  const x=390,y=215;
  shape(c,'#3d353f',[x-48,y+20,x-38,y-9,x-17,y-25,x+27,y-25,x+48,y-9,x+58,y+20,x+58,y+228,x+43,y+244,x-32,y+244,x-48,y+228]);
  rect(c,'#76564e',x-40,y+20,89,208);rect(c,'#916e5555',x-34,y+18,13,209);rect(c,'#342f3c77',x+30,y+18,20,211);
  for(const yy of [y+37,y+162,y+224]){rect(c,'#ad876277',x-47,yy,105,6);rect(c,'#382f3988',x-47,yy+6,105,2);for(let j=0;j<8;j++)rivet(c,x-42+j*13,yy+2,'#d6a77788');}
  arch(c,x-20,y+77,44,62,'#2d2934');arch(c,x-15,y+82,34,53,'#ad744633');for(let j=0;j<5;j++)rect(c,'#564044',x-12+j*6,y+92,2,39);
  line(c,'#51434a',12,[x+3,y-25,x+3,y-62,x+98,y-62,x+98,y+41]);line(c,'#a5835b55',2,[x+1,y-26,x+1,y-64,x+96,y-64]);
  // Counterweighted travelling crane behind the service floors.
  rect(c,'#56454a',x+145,y-135,10,380);rect(c,'#9b7d5e44',x+145,y-135,2,380);line(c,'#80614e77',3,[x+149,y-134,x-91,y-134,x+149,y-184,x+204,y-134,x+149,y-134]);
  for(let i=0;i<8;i++)line(c,'#9b805b44',1,[x-88+i*29,y-134,x-73+i*29,y-154+(i<4?i*3:0),x-59+i*29,y-134]);rect(c,'#a18c6c66',x-67,y-132,1,107);rect(c,'#3d3440',x-80,y-27,27,19);
 }
 if(l.setting==='tower'&&visible(l.width*.43-15,210)){
  const x=l.width*.43+87,y=90;
  // The clock has an architectural stone surround, inset face and twelve brass marks.
  c.fillStyle=a.near;c.beginPath();c.arc(x,y,51,0,Math.PI*2);c.fill();c.fillStyle=a.sky;c.beginPath();c.arc(x,y,43,0,Math.PI*2);c.fill();c.strokeStyle=a.edge+'66';c.lineWidth=2;c.beginPath();c.arc(x,y,46,0,Math.PI*2);c.stroke();
  for(let j=0;j<12;j++){const angle=j*Math.PI/6;line(c,a.accent+'77',2,[x+Math.sin(angle)*34,y+Math.cos(angle)*34,x+Math.sin(angle)*39,y+Math.cos(angle)*39]);}
  line(c,a.edge+'aa',3,[x-14,y-17,x,y,x+26,y-8]);rect(c,a.accent+'99',x-3,y-3,6,6);
  for(let yy=165;yy<l.height;yy+=132)for(const xx of [x-75,x+68]){rect(c,a.near,xx,yy+3,7,70);rect(c,a.edge+'1a',xx,yy+3,2,70);}
 }
 if(l.setting==='cavern'){
  // Light enters one fissure, giving the cave a destination and asymmetric composition.
  const x=370;if(visible(x-50,350)){shape(c,a.edge+'06',[x-12,-100,x+12,-100,x+300,650,x-120,650]);shape(c,a.accent+'06',[x-8,-100,x+8,-100,x+180,650,x-35,650]);for(let j=0;j<9;j++){const yy=120+j*50,xx=x+Math.sin(j*2+t*.15)*23+j*8;rect(c,a.edge+'55',xx,yy+(t*4+j*13)%35,1,2);}}
 }

 c.restore();

}

export function atmosphere(c:C,l:Level,w:number,h:number,cx:number,t:number){
 const a=WORLDS[l.world];if(l.setting==='cavern')return;
 // Wide translucent cloud shelves add depth without competing with silhouettes.
 for(let layer=0;layer<2;layer++){const speed=layer?1.8:.8,period=w+280;for(let i=0;i<3;i++){const x=((i*period/3+t*speed-cx*.025)%period+period)%period-140,y=h*(.19+layer*.18)+i*17;c.fillStyle=a.edge+(layer?'04':'06');c.beginPath();c.moveTo(x-110,y+12);c.bezierCurveTo(x-75,y+5,x-74,y-3,x-29,y+3);c.bezierCurveTo(x+3,y-8,x+16,y-5,x+35,y+4);c.bezierCurveTo(x+76,y+1,x+94,y+9,x+123,y+12);c.closePath();c.fill();}}
 if(l.world!==3)return;
 // Feathered auroral curtain; irregular vertical folds replace identical horizontal bands.
 const curtain=['#90dabd02','#90dabd04','#8fc9c008','#8fc9c00d','#94d6be18','#94d6be23','#b0c9dc0c'];
 for(let x=-8;x<w+8;x+=5){const phase=x*.008+t*.09,crest=65+Math.sin(phase)*25+Math.sin(phase*2.1)*9,depth=20+Math.sin(x*.031+t*.17)*8;for(let j=0;j<7;j++){c.fillStyle=curtain[j];c.fillRect(x,Math.round(crest-depth+j*(depth+19)/7),5,Math.ceil((depth+19)/7));}}
}
