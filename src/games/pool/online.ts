// Online Pool: the room host runs the only simulation. Guests send numbered commands made against a state revision; the
// host checks seat, turn, phase, revision and sequence, applies them with the normal rules, streams ball positions while
// they roll and sends the complete authoritative state whenever it changes (always when the balls settle). Guests never
// simulate physics, so both devices show the same pockets, fouls, ball-in-hand, turns and winner.
import {createGame,placeCue,restoreGame,shoot,step,DT,type PoolState} from './model';

/** Bump when rules, physics or messages change: peers with another version are refused. */
export const POOL_ONLINE_VERSION='pool-online-1';
export const FRAME_MS=50;

export type Command=
  |{t:'shoot';seq:number;rev:number;angle:number;power:number;pocket:number}
  |{t:'place';seq:number;rev:number;x:number;y:number}
  |{t:'pocket';seq:number;rev:number;pocket:number};
export type RejectReason='paused'|'duplicate'|'stale'|'turn'|'busy'|'invalid'|'waiting';
export type HostMessage=
  |{t:'state';rev:number;state:PoolState;names:[string,string]}
  |{t:'frame';rev:number;ms:number;b:number[];p:number}
  |{t:'aim';rev:number;angle:number;power:number}
  |{t:'reject';seq:number;reason:RejectReason;rev:number};
export type GuestMessage=Command|{t:'aim';rev:number;angle:number;power:number}|{t:'sync'};

const finite=(v:unknown,min:number,max:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
export function parseCommand(v:unknown):GuestMessage|null{
  if(!v||typeof v!=='object')return null;
  const m=v as Record<string,unknown>;
  if(m.t==='sync')return {t:'sync'};
  if(m.t==='aim')return finite(m.rev,0,1e9)&&finite(m.angle,-10,10)&&finite(m.power,0,1)?m as GuestMessage:null;
  if(!Number.isInteger(m.seq)||!Number.isInteger(m.rev)||(m.seq as number)<1||(m.rev as number)<0)return null;
  if(m.t==='shoot')return finite(m.angle,-10,10)&&finite(m.power,0,1)&&Number.isInteger(m.pocket)?m as Command:null;
  if(m.t==='place')return finite(m.x,-1000,1000)&&finite(m.y,-1000,1000)?m as Command:null;
  if(m.t==='pocket')return Number.isInteger(m.pocket)?m as Command:null;
  return null;
}
export function parseHostMessage(v:unknown):HostMessage|null{
  if(!v||typeof v!=='object')return null;
  const m=v as Record<string,unknown>;
  if(!Number.isInteger(m.rev))return null;
  if(m.t==='state'){const state=restoreGame(m.state);const names=m.names;return state&&state.mode==='two'&&Array.isArray(names)&&names.length===2&&names.every(n=>typeof n==='string')?{t:'state',rev:m.rev as number,state,names:names as [string,string]}:null;}
  if(m.t==='frame')return Array.isArray(m.b)&&m.b.length===32&&m.b.every(n=>Number.isInteger(n))&&Number.isInteger(m.p)&&finite(m.ms,0,1e8)?m as HostMessage:null;
  if(m.t==='aim')return finite(m.angle,-10,10)&&finite(m.power,0,1)?m as HostMessage:null;
  if(m.t==='reject')return Number.isInteger(m.seq)&&typeof m.reason==='string'?m as HostMessage:null;
  return null;
}
/** Ball positions at 0.1-unit resolution plus a pocketed bitmask. */
export function encodeFrame(s:PoolState,rev:number,ms:number):HostMessage{
  const b:number[]=[];let p=0;
  for(const ball of s.balls){b[ball.id*2]=Math.round(ball.x*10);b[ball.id*2+1]=Math.round(ball.y*10);if(ball.pocketed)p|=1<<ball.id;}
  return {t:'frame',rev,ms:Math.round(ms),b,p};
}

/** Host side. `seats[0]` is the host, `seats[1]` the guest. */
export class PoolHost{
  state:PoolState=createGame('two');
  rev=1;
  names:[string,string];
  paused=false;
  private lastSeq=[0,0];
  private simMs=0;private lastFrame=-Infinity;
  constructor(hostName:string,guestName:string|null,private sendAll:(m:HostMessage)=>void,private sendTo:(seat:number,m:HostMessage)=>void){this.names=[hostName,guestName??''];}
  get opponent(){return !!this.names[1];}
  setGuest(name:string|null){this.names[1]=name??'';this.lastSeq[1]=0;this.newRack();}
  newRack(){this.state=createGame('two');this.simMs=0;this.lastFrame=-Infinity;this.changed();}
  /** A state change everyone must see. */
  changed(){this.rev++;this.sendAll({t:'state',rev:this.rev,state:this.snapshot(),names:this.names});}
  snapshot():PoolState{return JSON.parse(JSON.stringify(this.state)) as PoolState;}
  sync(seat:number){this.sendTo(seat,{t:'state',rev:this.rev,state:this.snapshot(),names:this.names});}
  /** Validates and applies a command from a seat. Returns the rejection reason, or null when applied. */
  command(seat:number,c:Command):RejectReason|null{
    const reason=this.check(seat,c);
    if(reason){if(seat!==0){this.sendTo(seat,{t:'reject',seq:c.seq,reason,rev:this.rev});if(reason==='stale')this.sync(seat);}return reason;}
    this.lastSeq[seat]=c.seq;
    const s=this.state;let ok=false;
    if(c.t==='shoot'){ok=shoot(s,c.angle,c.power,c.pocket);if(ok){this.simMs=0;this.lastFrame=-Infinity;}}
    else if(c.t==='place')ok=placeCue(s,c.x,c.y);
    else if(c.t==='pocket'){ok=!s.break&&Number.isInteger(c.pocket)&&c.pocket>=0&&c.pocket<=5&&!s.ballInHand;if(ok)s.calledPocket=c.pocket;}
    if(!ok){if(seat!==0)this.sendTo(seat,{t:'reject',seq:c.seq,reason:'invalid',rev:this.rev});return 'invalid';}
    this.changed();
    return null;
  }
  private check(seat:number,c:Command):RejectReason|null{
    if(this.paused)return 'paused';
    if(!this.opponent)return 'waiting';
    if(c.seq<=this.lastSeq[seat])return 'duplicate';
    if(c.rev!==this.rev)return 'stale';
    if(this.state.phase!=='aim')return 'busy';
    if(this.state.turn!==seat)return 'turn';
    return null;
  }
  /** Cosmetic aim from the player whose turn it is, relayed to the other. */
  aim(seat:number,angle:number,power:number){
    if(this.paused||this.state.phase!=='aim'||this.state.turn!==seat)return;
    this.state.angle=Math.atan2(Math.sin(angle),Math.cos(angle));this.state.power=Math.max(.05,Math.min(1,power));
    const m:HostMessage={t:'aim',rev:this.rev,angle:this.state.angle,power:this.state.power};
    if(seat===0)this.sendTo(1,m);else this.sendTo(0,m);
  }
  /** Runs `steps` fixed steps of the official simulation, streaming frames. Returns true when the shot settled now. */
  advance(steps:number):boolean{
    const s=this.state;if(this.paused||s.phase!=='moving')return false;
    for(let i=0;i<steps&&s.phase==='moving';i++){step(s);this.simMs+=DT*1000;}
    if(s.phase!=='moving'){this.changed();return true;}
    if(this.simMs-this.lastFrame>=FRAME_MS){this.lastFrame=this.simMs;this.sendAll(encodeFrame(s,this.rev,this.simMs));}
    return false;
  }
}

/** Guest side: applies authoritative states, plays frames back slightly delayed and numbers outgoing commands. */
export class PoolGuest{
  state:PoolState|null=null;
  rev=0;
  names:[string,string]=['',''];
  pending:number|null=null;
  lastReject:RejectReason|null=null;
  private seq=0;
  private frames:{ms:number;b:number[];p:number}[]=[];
  private clock:{wall:number;ms:number}|null=null;
  constructor(private send:(m:GuestMessage)=>void){}
  receive(m:HostMessage,now:number):'state'|'frame'|'aim'|'reject'|null{
    if(m.t==='state'){
      if(m.rev<this.rev)return null;
      const shotStarted=m.state.phase==='moving'&&this.state?.phase!=='moving';
      this.state=m.state;this.rev=m.rev;this.names=m.names;this.pending=null;
      if(m.state.phase!=='moving'||shotStarted){this.frames=[];this.clock=null;}
      return 'state';
    }
    if(m.t==='frame'){
      if(m.rev!==this.rev||this.state?.phase!=='moving')return null;
      this.frames.push({ms:m.ms,b:m.b,p:m.p});if(this.frames.length>64)this.frames.splice(0,this.frames.length-64);
      if(!this.clock)this.clock={wall:now,ms:m.ms-100};
      return 'frame';
    }
    if(m.t==='aim'){if(m.rev===this.rev&&this.state&&this.state.phase==='aim'){this.state.angle=m.angle;this.state.power=m.power;}return 'aim';}
    if(m.t==='reject'){if(m.seq===this.pending){this.pending=null;this.lastReject=m.reason;}return 'reject';}
    return null;
  }
  command(c:{t:'shoot';angle:number;power:number;pocket:number}|{t:'place';x:number;y:number}|{t:'pocket';pocket:number}):boolean{
    if(!this.state||this.pending!==null)return false;
    const seq=++this.seq;this.pending=seq;this.lastReject=null;
    this.send({...c,seq,rev:this.rev} as Command);
    return true;
  }
  aim(angle:number,power:number){if(this.state)this.send({t:'aim',rev:this.rev,angle,power});}
  /** Interpolated ball positions written into `state` for drawing. */
  play(now:number){
    const s=this.state;if(!s||s.phase!=='moving'||!this.frames.length||!this.clock)return;
    let at=this.clock.ms+(now-this.clock.wall);
    const last=this.frames[this.frames.length-1];
    // Stay about 100 ms behind the newest frame: catch up when the buffer grows, hold when it runs dry.
    if(last.ms-at>300){this.clock={wall:now,ms:last.ms-100};at=last.ms-100;}
    let a=this.frames[0],b=a;
    for(const f of this.frames){if(f.ms<=at)a=f;if(f.ms>=at){b=f;break;}b=f;}
    const span=b.ms-a.ms,k=span>0?Math.max(0,Math.min(1,(at-a.ms)/span)):1;
    for(const ball of s.balls){
      const i=ball.id*2;
      ball.x=(a.b[i]+(b.b[i]-a.b[i])*k)/10;ball.y=(a.b[i+1]+(b.b[i+1]-a.b[i+1])*k)/10;
      ball.pocketed=!!(((k<1?a.p:b.p)>>ball.id)&1);
    }
    while(this.frames.length>2&&this.frames[1].ms<at)this.frames.shift();
  }
}
