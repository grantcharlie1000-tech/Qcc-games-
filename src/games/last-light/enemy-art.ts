import {surfaceTexture} from './generated-art';
import {enemyAt,type Enemy} from './enemies';
import {pressState,pressAt} from './press';
import type {Hazard} from './levels';
import type {Run} from './model';
type C=CanvasRenderingContext2D;
function px(c:C,color:string,x:number,y:number,w:number,h:number){c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),w,h);}
/** Clockwork scavengers share the courier's outlined, stitched material palette. */
export function drawEnemy(c:C,e:Enemy,s:Run,reduced:boolean){
 const defeated=s.defeated[e.id],at=enemyAt(e,defeated??s.clock),age=defeated===undefined?-1:s.clock-defeated;
 if(age>.38)return;
 c.save();c.translate(Math.round(at.x+at.w/2),Math.round(at.y+at.h));c.scale(at.facing,1);
 if(age>=0){
  if(reduced){c.restore();return;}const p=age/.38;
  c.globalAlpha=1-p;
  for(let i=0;i<9;i++){const x=(i%3-1)*7+(i%2?1:-1)*p*(8+i*2),y=-4-Math.sin(p*Math.PI)*(10+i%3*7)+p*p*25;
   px(c,'#162732',x-1,y-1,5+i%2,4);px(c,i%3===0?'#daa96c':i%3===1?'#707e77':'#9e7959',x,y,3+i%2,2);}
  c.restore();return;
 }
 const gait=reduced?0:Math.sin(s.clock*13),moth=e.kind==='moth';
 if(moth){
  const wing=reduced?3:Math.round(Math.sin(s.clock*15)*4);
  for(const side of [-1,1]){px(c,'#162732',side<0?-20:7,-17-wing,13,4);px(c,'#6c9294',side<0?-19:8,-16-wing,11,2);px(c,'#b2bba2',side<0?-19:9,-16-wing,7,1);px(c,'#3f666c',side<0?-16:9,-12,9,5);}
  px(c,'#172a35',-8,-19,16,17);px(c,'#66574e',-7,-17,14,14);px(c,'#a48560',-6,-17,12,3);px(c,'#c8af79',-5,-17,3,2);
  c.save();c.translate(-7,-17);surfaceTexture(c,'copper',2,14,14,.28);c.restore();
  // Brass wing ribs and verdigris match the district's sampled metalwork.
  for(const side of [-1,1])for(let j=0;j<3;j++)px(c,j%2?'#66887c':'#c3b084',side*(9+j*3)-(side<0?2:0),-15-wing+j,2,1);
  px(c,'#263e49',-6,-12,12,8);px(c,'#ba695a',-4,-11,9,4);px(c,'#f5bd7d',-3,-11,6,2);px(c,'#ffe4a4',2,-11,2,2);
  px(c,'#a89a75',-2,-4,4,5);px(c,'#172a35',-1,-2,2,4);px(c,'#93aaa0',-5,-22,1,5);px(c,'#93aaa0',5,-22,1,5);
 }else{
  for(const [i,x] of [-8,0,8].entries()){const stride=reduced?0:Math.round(gait*(i%2?2:-2));px(c,'#152a35',x-2,-7,4,7);px(c,'#8a8f7a',x-1,-6,2,4);px(c,'#253c45',x+stride-3,-2,6,3);px(c,'#bab491',x+stride-2,-2,4,1);}
  px(c,'#152733',-12,-14,24,9);px(c,'#152733',-9,-18,16,5);px(c,'#715444',-10,-13,20,6);px(c,'#9b7653',-8,-17,14,6);px(c,'#c5a775',-7,-17,11,2);px(c,'#464e4a',-9,-9,19,3);
  for(const x of [-6,-1,4]){px(c,'#4c483c',x,-15,1,4);px(c,'#b59868',x+1,-14,1,3);}
  c.save();c.translate(-8,-17);surfaceTexture(c,'patina',2,14,7,.3);c.restore();
  px(c,'#d8b77d',-5,-16,3,1);px(c,'#536d62',-3,-11,4,2);
  px(c,'#152733',7,-13,7,7);px(c,'#7f8e80',8,-12,5,4);px(c,'#cf7f59',10,-12,3,2);px(c,'#ffe0a1',12,-12,1,1);
  px(c,'#263d46',-9,-10,3,3);px(c,'#b4ad86',-8,-10,1,1);
 }
 if(at.turning){px(c,'#edd097',8,-20,1,3);px(c,'#edd097',10,-18,2,1);}
 c.restore();
}
/** A mounted press has a real piston, warning lamps and contact dust. */
export function drawPress(c:C,h:Hazard,s:Run,reduced:boolean){
 const state=pressState(h,s.clock),head=pressAt(h,s.clock),x=Math.round(h.x),top=Math.round(h.y),y=Math.round(head.y),w=h.w;
 c.save();
 // Rear posts anchor the press to its deck; the dark rails read as structure,
 // leaving the bright moving head as the only collision silhouette.
 const floor=top+112;
 for(const side of [-24,w+20]){px(c,'#293c43',x+side,top-10,5,floor-top+10);px(c,'#566c69',x+side,top-10,1,floor-top+8);px(c,'#20343e',x+side-4,floor-3,13,3);px(c,'#7b8879',x+side-3,floor-3,11,1);}
 px(c,'#293c43',x-24,top-12,w+49,5);px(c,'#87917e',x-23,top-12,w+47,1);
 px(c,'#182d38',x-10,top-8,w+20,10);px(c,'#7e8d84',x-9,top-8,w+18,2);px(c,'#475d62',x-7,top-5,w+14,5);
 for(const dx of [2,w-5]){px(c,'#152d38',x+dx,top,4,y-top+7);px(c,'#8b9d93',x+dx+1,top,1,y-top+6);}
 px(c,'#263b45',x+9,top+1,w-18,Math.max(0,y-top));px(c,'#697e7a',x+10,top+1,3,Math.max(0,y-top));
 px(c,'#162c36',x-2,y,w+4,18);px(c,'#8c7961',x-1,y+1,w+2,13);px(c,'#c3ad83',x,y+1,w,2);px(c,'#586965',x,y+4,w,7);
 for(let dx=3;dx<w-3;dx+=8){px(c,'#a7aa88',x+dx,y+5,3,3);px(c,'#273c46',x+dx,y+9,5,3);}
 px(c,'#233943',x-2,y+14,w+4,4);px(c,'#a3ab91',x,y+14,w,1);
 const lit=state.warning?'#ffcd79':state.extension>.1?'#ef8f73':'#779d8e';for(const dx of [-5,w+3]){px(c,'#172c36',x+dx-1,top-4,4,4);px(c,lit,x+dx,top-3,2,2);}
 if(state.warning){px(c,'#e6b876',x+w/2-1,top+7,2,6);px(c,'#e6b876',x+w/2-1,top+15,2,2);}
 if(state.impact&&!reduced){const p=(state.phase-.6)/.06;for(let i=0;i<7;i++){c.globalAlpha=(1-p)*.6;px(c,'#b7b79e',x+w/2+(i-3)*(5+p*8),y+16-Math.sin(p*Math.PI)*5,3,2);}}
 c.restore();
}
