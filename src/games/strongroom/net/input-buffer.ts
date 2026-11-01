import type {InputFrame} from '../sim';
/** A bounded ordered queue. Only the host's fixed 30Hz consumer advances it; packet bursts earn no sim time. */
export class InputBuffer{
 private queue=new Map<number,InputFrame>();last=0;
 push(frames:readonly InputFrame[]){let accepted=0;for(const i of frames){if(i.seq<=this.last||i.seq>this.last+90||this.queue.has(i.seq)||this.queue.size>=90)continue;this.queue.set(i.seq,i);accepted++;}return accepted;}
 take():InputFrame|null{if(!this.queue.size)return null;const next=Math.min(...this.queue.keys()),i=this.queue.get(next)!;this.queue.delete(next);this.last=next;return i;}
 discard(){this.queue.clear();}
 clear(){this.queue.clear();this.last=0;}
 get size(){return this.queue.size;}
}
