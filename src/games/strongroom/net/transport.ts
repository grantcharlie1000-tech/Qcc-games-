import type {Room} from '../../../multiplayer/room';
/** Test impairment is deliberately outside the sim, so real Room/WebRTC messages traverse it. Production never delays. */
export class SessionTransport{
 private timers=new Set<ReturnType<typeof setTimeout>>();private disposed=false;private random=0x51ab923;readonly delay:number;readonly loss:number;sent=0;dropped=0;bytes=0;
 constructor(readonly room:Room,impair=false){this.delay=import.meta.env.DEV&&impair?75:0;this.loss=import.meta.env.DEV&&impair?.05:0;}
 private roll(){this.random^=this.random<<13;this.random^=this.random>>>17;this.random^=this.random<<5;return(this.random>>>0)/4294967296;}
 send(data:unknown,reliable:boolean,to?:string){
  if(this.disposed)return;this.sent++;this.bytes+=JSON.stringify(data).length;
  if(!reliable&&this.roll()<this.loss){this.dropped++;return;}
  const write=()=>{if(!this.disposed&&!this.room.closed){if(reliable)this.room.send(data,to);else this.room.sendUnreliable(data,to);}};
  if(this.delay){const id=setTimeout(()=>{this.timers.delete(id);write();},this.delay);this.timers.add(id);}else write();
 }
 dispose(){this.disposed=true;for(const id of this.timers)clearTimeout(id);this.timers.clear();}
}
