// Overlays drawn on top of blocks: the ten block-breaking crack stages.
import {type Painter,type RGBA,T,CLEAR,rgb,rng} from './tiles-core';

/** Every crack pixel in the order it appears as the block breaks, with its colour. Branches grow outward from
 *  near the centre, fork into side cracks and chip their edges late, so each stage only adds pixels. */
const crackOrder:{index:number;colour:RGBA}[]=(()=>{
  const random=rng(1101),time=new Float32Array(T*T).fill(Infinity),colour:RGBA[]=new Array(T*T);
  const mark=(x:number,y:number,t:number,c:RGBA)=>{
    if(x<0||y<0||x>=T||y>=T)return false;const i=y*T+x;if(t<time[i]){time[i]=t;colour[i]=c;}return true;
  };
  const branch=(x:number,y:number,angle:number,start:number,steps:number,depth:number)=>{
    let t=start;
    for(let s=0;s<steps;s++){
      angle+=(random()-.5)*.9;x+=Math.cos(angle);y+=Math.sin(angle);
      const px=Math.round(x),py=Math.round(y);
      if(!mark(px,py,t,depth?rgb(0x2e2e2e):rgb(0x1c1c1c)))return;
      // Chips: a lighter pixel beside the crack, appearing much later.
      if(random()<.45){const side=random()<.5?1:-1;mark(px+(Math.abs(Math.sin(angle))>.7?side:0),py+(Math.abs(Math.sin(angle))>.7?0:side),t+.9+random()*.6,rgb(0x4a4a4a));}
      if(depth<2&&random()<.22)branch(x,y,angle+(random()<.5?1:-1)*(.9+random()*.5),t+.25,3+Math.floor(random()*4),depth+1);
      t+=.08+random()*.05;
    }
  };
  mark(7,8,0,rgb(0x141414));mark(8,7,.02,rgb(0x141414));
  const arms=6;
  for(let a=0;a<arms;a++)branch(7.5,7.5,a/arms*Math.PI*2+random()*.6,.04+a*.07,6+Math.floor(random()*4),0);
  const order:{index:number;colour:RGBA}[]=[];
  for(let i=0;i<T*T;i++)if(Number.isFinite(time[i]))order.push({index:i,colour:colour[i]});
  order.sort((a,b)=>time[a.index]-time[b.index]||a.index-b.index);
  return order;
})();
/** Crack overlay for breaking stage 0..9: a growing prefix of crackOrder (about 5% at stage 0, all of it at stage 9). */
export function destroyStage(stage:number):Painter{
  const count=Math.max(1,Math.round(crackOrder.length*((stage+1)/10)**1.3)),shown=new Map<number,RGBA>();
  for(const {index,colour} of crackOrder.slice(0,count))shown.set(index,colour);
  return(x,y)=>shown.get(y*T+x)??CLEAR;
}
