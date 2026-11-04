import {describe,expect,it} from 'vitest';
import {PoolGuest,PoolHost,parseCommand,parseHostMessage,type GuestMessage,type HostMessage} from '../../../src/games/pool/online';
import {planNow} from '../../../src/games/pool/ai';
import type {PoolState} from '../../../src/games/pool/game';

/** A host and a guest wired back to back through JSON, as the data channel carries them. */
function pair(){
  const toGuest:HostMessage[]=[],toHost:GuestMessage[]=[];
  const wire=<T>(m:T)=>JSON.parse(JSON.stringify(m)) as T;
  const host=new PoolHost('Hana',null,m=>toGuest.push(wire(m)),(seat,m)=>{if(seat===1)toGuest.push(wire(m));});
  const guest=new PoolGuest(m=>toHost.push(wire(m)));
  const pump=(now=0)=>{
    for(let i=0;i<1000&&(toGuest.length||toHost.length);i++){
      while(toGuest.length){const m=parseHostMessage(toGuest.shift());expect(m).not.toBeNull();guest.receive(m!,now);}
      while(toHost.length){const m=parseCommand(toHost.shift());expect(m).not.toBeNull();if(m!.t==='sync')host.sync(1);else if(m!.t==='aim')host.aim(1,m!);else host.command(1,m!);}
    }
  };
  host.setGuest('Tama');pump();
  return {host,guest,toGuest,toHost,pump};
}
const comparable=(s:PoolState)=>({...s,aim:null});

describe('online pool',()=>{
  it('plays a complete rack with both devices agreeing on every settled state',()=>{
    const {host,guest,pump}=pair();let hostSeq=0;
    expect(guest.state).toEqual(host.state);
    for(let shot=0;shot<300&&host.state.phase!=='over';shot++){
      const seat=host.state.turn,plan=planNow(host.state);
      if(plan.place){
        if(seat===0)expect(host.command(0,{t:'place',seq:++hostSeq,rev:host.rev,x:plan.place.x,y:plan.place.y})).toBeNull();
        else{expect(guest.command({t:'place',x:plan.place.x,y:plan.place.y})).toBe(true);pump();}
      }
      const shotMsg={angle:plan.angle,power:plan.power,spinX:plan.spinX,spinY:plan.spinY,called:plan.called};
      if(seat===0)expect(host.command(0,{t:'shoot',seq:++hostSeq,rev:host.rev,...shotMsg})).toBeNull();
      else{guest.command({t:'shoot',...shotMsg});pump();}
      expect(host.state.phase).toBe('moving');pump();
      expect(guest.state!.phase).toBe('moving');
      let n=0;while(!host.advance(30)&&n++<5000)pump();
      pump();
      expect(guest.rev).toBe(host.rev);
      expect(comparable(guest.state!)).toEqual(comparable(host.state));
    }
    expect(host.state.phase).toBe('over');
    expect(guest.state!.winner).toBe(host.state.winner);
    expect(guest.state!.groups).toEqual(host.state.groups);
  },60000);

  it('rejects guest commands out of turn, stale, duplicated, while moving or while paused',()=>{
    const {host,guest,toHost,pump}=pair();
    const shot={angle:0,power:.5,spinX:0,spinY:0,called:null};
    guest.command({t:'shoot',...shot,angle:-1.5});pump();
    expect(guest.lastReject).toBe('turn');expect(host.state.phase).toBe('aim');
    host.command(0,{t:'shoot',seq:1,rev:host.rev,...shot,power:1});pump();
    while(!host.advance(30))pump();pump();
    // Make it the guest's turn with the cue ball free, whatever the break did.
    if(host.state.phase==='over'||host.state.breakShot)return;
    host.state.turn=1;host.state.hand='table';host.changed();pump();
    const rev=host.rev;
    expect(host.command(1,{t:'shoot',seq:50,rev:rev-1,...shot})).toBe('stale');
    expect(host.command(1,{t:'place',seq:51,rev,x:-5,y:0})).toBe('invalid');
    expect(host.command(1,{t:'place',seq:51,rev,x:1,y:.5})).toBe('duplicate');
    host.paused=true;
    expect(host.command(1,{t:'shoot',seq:52,rev:host.rev,...shot})).toBe('paused');
    host.paused=false;
    expect(host.command(1,{t:'shoot',seq:53,rev:host.rev,...shot,power:7})).toBe('invalid');
    expect(host.command(1,{t:'shoot',seq:54,rev:host.rev,...shot})).toBeNull();
    expect(host.command(1,{t:'shoot',seq:55,rev:host.rev,...shot})).toBe('busy');
    expect(parseCommand({t:'shoot',seq:1,rev:1,...shot,angle:'x'})).toBeNull();
    expect(parseCommand({t:'pocket',seq:1,rev:1,pocket:0})).toBeNull();
    expect(toHost).toHaveLength(0);
  });

  it('streams frames during a shot and the guest plays them back between known positions',()=>{
    const {host,guest,toGuest,pump}=pair();
    const start=host.state.balls[0].x;
    host.command(0,{t:'shoot',seq:1,rev:host.rev,angle:0,power:.9,spinX:0,spinY:0,called:null});pump(0);
    let now=0;const seen:number[]=[];
    for(let i=0;i<40;i++){
      host.advance(30);now+=50;
      while(toGuest.length){const m=parseHostMessage(toGuest.shift())!;guest.receive(m,now);}
      guest.play(now);seen.push(guest.state!.balls[0].x);
    }
    // The cue ball moved up the table (toward the rack) on the guest without the guest simulating anything.
    expect(Math.max(...seen)).toBeGreaterThan(start+.3);
    expect(guest.state!.balls.every(b=>Number.isFinite(b.x)&&Number.isFinite(b.y))).toBe(true);
  });

  it('relays aim and ball-in-hand drags, and refuses malformed host states',()=>{
    const {host,guest,toGuest,pump}=pair();
    host.aim(0,{angle:1,power:.3,spinX:.2,spinY:-.2,hx:.3,hy:.4});pump();
    expect(guest.state!.aim).toEqual({angle:1,power:.3,spinX:.2,spinY:-.2});expect(guest.hand).toEqual({x:.3,y:.4});
    expect(toGuest).toHaveLength(0);
    expect(parseHostMessage({t:'state',rev:1,state:{version:1},names:['a','b']})).toBeNull();
    expect(parseHostMessage({t:'frame',rev:1,ms:0,b:[1,2],p:0})).toBeNull();
    expect(parseHostMessage({t:'aim',rev:1,angle:0,power:2,spinX:0,spinY:0})).toBeNull();
  });
});
