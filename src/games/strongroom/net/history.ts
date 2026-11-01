import type {Entity,Point} from '../sim';
interface Capsule extends Point{seat:number;height:number}
/** One second of host capsules. Rewind queries never mutate the live simulation or collision world. */
export class CapsuleHistory{
 private frames:{time:number;capsules:Capsule[]}[]=[];
 record(time:number,entities:readonly Entity[]){this.frames.push({time,capsules:entities.map(e=>({seat:e.seat,x:e.x,y:e.y,z:e.z,height:e.crouch?1.25:1.83}))});while(this.frames[0]?.time<time-1000)this.frames.shift();}
 sample(seat:number,view:number,now:number):Capsule|null{
  if(!this.frames.length)return null;const at=Math.max(now-200,Math.min(now,Number.isFinite(view)?view:now));let a=this.frames[0],b=a;
  for(const frame of this.frames){if(frame.time<=at)a=frame;if(frame.time>=at){b=frame;break;}b=frame;}
  const p=a.capsules.find(e=>e.seat===seat),q=b.capsules.find(e=>e.seat===seat);if(!p||!q)return p??q??null;const k=Math.max(0,Math.min(1,(at-a.time)/(b.time-a.time||1)));return{seat,x:p.x+(q.x-p.x)*k,y:p.y+(q.y-p.y)*k,z:p.z+(q.z-p.z)*k,height:k<.5?p.height:q.height};
 }
 clear(){this.frames=[];}
 get size(){return this.frames.length;}
}
