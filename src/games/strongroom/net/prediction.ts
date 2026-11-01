import {move,type Entity,type InputFrame,type SimWorld} from '../sim';
export function reconcile(predicted:Entity,authoritative:Entity,pending:readonly InputFrame[],world:SimWorld){
 const entity={...authoritative,mags:[...authoritative.mags] as [number,number],reserves:[...authoritative.reserves] as [number,number]},rest=pending.filter(i=>i.seq>authoritative.ack);
 for(const input of rest)move(entity,input,1/30,world);
 return{entity,pending:rest,error:Math.hypot(predicted.x-entity.x,predicted.y-entity.y,predicted.z-entity.z)};
}
export class Interpolation{
 private frames:{time:number;entities:Entity[]}[]=[];private clock={time:0,arrival:0};
 add(time:number,entities:Entity[],arrival:number,oneWay=0){if(this.frames.length&&time<=this.frames.at(-1)!.time)return;this.frames.push({time,entities:entities.map(e=>({...e}))});this.clock={time:time+oneWay,arrival};while(this.frames.length>32)this.frames.shift();}
 sample(now:number):Entity[]{
  if(!this.frames.length)return[];const at=this.clock.time+now-this.clock.arrival-100,last=this.frames.at(-1)!;
  if(at>last.time){const dt=Math.max(0,Math.min(150,at-last.time))/1000;return last.entities.map(e=>({...e,x:e.x+e.vx*dt,y:e.y,z:e.z+e.vz*dt}));}
  let a=this.frames[0],b=a;for(const frame of this.frames){if(frame.time<=at)a=frame;if(frame.time>=at){b=frame;break;}b=frame;}
  const k=Math.max(0,Math.min(1,(at-a.time)/(b.time-a.time||1)));
  return b.entities.map(e=>{const old=a.entities.find(o=>o.seat===e.seat)??e,d=Math.atan2(Math.sin(e.yaw-old.yaw),Math.cos(e.yaw-old.yaw));return{...e,x:old.x+(e.x-old.x)*k,y:old.y+(e.y-old.y)*k,z:old.z+(e.z-old.z)*k,yaw:old.yaw+d*k,pitch:old.pitch+(e.pitch-old.pitch)*k};});
 }
 clear(){this.frames=[];}
}
