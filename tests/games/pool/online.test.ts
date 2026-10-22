import {describe,expect,it} from 'vitest';
import {PoolGuest,PoolHost,parseCommand,parseHostMessage,type GuestMessage,type HostMessage} from '../../../src/games/pool/online';
import {chooseAI,placeAICue,type PoolState} from '../../../src/games/pool/model';

/** A host and a guest wired back to back through JSON, as the data channel carries them. */
function pair(){
  const toGuest:HostMessage[]=[],toHost:GuestMessage[]=[];
  const wire=<T>(m:T)=>JSON.parse(JSON.stringify(m)) as T;
  const host=new PoolHost('Hana',null,m=>toGuest.push(wire(m)),(seat,m)=>{if(seat===1)toGuest.push(wire(m));});
  const guest=new PoolGuest(m=>toHost.push(wire(m)));
  const pump=(now=0)=>{
    for(let i=0;i<1000&&(toGuest.length||toHost.length);i++){
      while(toGuest.length){const m=parseHostMessage(toGuest.shift());expect(m).not.toBeNull();guest.receive(m!,now);}
      while(toHost.length){const m=parseCommand(toHost.shift());expect(m).not.toBeNull();if(m!.t==='sync')host.sync(1);else if(m!.t==='aim')host.aim(1,m!.angle,m!.power);else host.command(1,m!);}
    }
  };
  host.setGuest('Tama');pump();
  return {host,guest,toGuest,toHost,pump};
}
const comparable=(s:PoolState)=>({...s,message:s.message,angle:0,power:0});

describe('online pool',()=>{
  it('plays a complete rack with both devices agreeing on every settled state',()=>{
    const {host,guest,pump}=pair();let hostSeq=0;
    expect(guest.state).toEqual(host.state);
    for(let shot=0;shot<400&&host.state.phase!=='over';shot++){
      const s=host.state,seat=s.turn;
      if(s.ballInHand){
        const copy=JSON.parse(JSON.stringify(s)) as PoolState;placeAICue(copy);const c=copy.balls[0];
        if(seat===0)expect(host.command(0,{t:'place',seq:++hostSeq,rev:host.rev,x:c.x,y:c.y})).toBeNull();
        else{expect(guest.command({t:'place',x:c.x,y:c.y})).toBe(true);pump();}
      }
      const plan=chooseAI(host.state);
      if(seat===0)expect(host.command(0,{t:'shoot',seq:++hostSeq,rev:host.rev,angle:plan.angle,power:plan.power,pocket:plan.pocket})).toBeNull();
      else{guest.command({t:'shoot',angle:plan.angle,power:plan.power,pocket:plan.pocket});pump();}
      expect(host.state.phase).toBe('moving');pump();
      expect(guest.state!.phase).toBe('moving');
      let n=0;while(!host.advance(8)&&n++<2000)pump();
      pump();
      expect(guest.rev).toBe(host.rev);
      expect(comparable(guest.state!)).toEqual(comparable(host.state));
    }
    expect(host.state.phase).toBe('over');
    expect(guest.state!.winner).toBe(host.state.winner);
    expect(guest.state!.groups).toEqual(host.state.groups);
  });

  it('rejects guest commands out of turn, stale, duplicated, while moving or while paused',()=>{
    const {host,guest,toHost,pump}=pair();
    // Host breaks first: a guest shot is out of turn.
    guest.command({t:'shoot',angle:-1.5,power:.9,pocket:0});pump();
    expect(guest.lastReject).toBe('turn');expect(host.state.phase).toBe('aim');
    host.command(0,{t:'shoot',seq:1,rev:host.rev,angle:-Math.PI/2,power:.95,pocket:0});pump();
    while(!host.advance(8))pump();pump();
    // Make it the guest's turn regardless of the break result.
    if(host.state.turn!==1){host.state.turn=1;host.state.ballInHand=false;host.changed();pump();}
    const rev=host.rev;
    expect(host.command(1,{t:'shoot',seq:50,rev:rev-1,angle:0,power:.5,pocket:0})).toBe('stale');
    expect(host.command(1,{t:'pocket',seq:51,rev,pocket:2})).toBeNull();
    expect(host.command(1,{t:'pocket',seq:51,rev:host.rev,pocket:3})).toBe('duplicate');
    host.paused=true;
    expect(host.command(1,{t:'shoot',seq:52,rev:host.rev,angle:0,power:.5,pocket:0})).toBe('paused');
    host.paused=false;
    expect(host.command(1,{t:'shoot',seq:53,rev:host.rev,angle:0,power:.5,pocket:0})).toBeNull();
    expect(host.command(1,{t:'shoot',seq:54,rev:host.rev,angle:0,power:.5,pocket:0})).toBe('busy');
    expect(host.command(1,{t:'shoot',seq:55,rev:host.rev,angle:0,power:7,pocket:0})).not.toBeNull();
    expect(parseCommand({t:'shoot',seq:1,rev:1,angle:'x',power:1,pocket:0})).toBeNull();
    expect(toHost).toHaveLength(0);
  });

  it('streams frames during a shot and the guest plays them back between known positions',()=>{
    const {host,guest,toGuest,pump}=pair();
    host.command(0,{t:'shoot',seq:1,rev:host.rev,angle:-Math.PI/2,power:.95,pocket:0});pump(0);
    let now=0;const seen:number[]=[];
    for(let i=0;i<40;i++){
      host.advance(12);now+=50;
      while(toGuest.length){const m=parseHostMessage(toGuest.shift())!;guest.receive(m,now);}
      guest.play(now);seen.push(guest.state!.balls[0].y);
    }
    // The cue ball moved up the table (toward the rack) on the guest without the guest simulating anything.
    expect(Math.min(...seen)).toBeLessThan(600);
    expect(guest.state!.balls.every(b=>Number.isFinite(b.x)&&Number.isFinite(b.y))).toBe(true);
  });

  it('refuses malformed host states',()=>{
    expect(parseHostMessage({t:'state',rev:1,state:{version:1},names:['a','b']})).toBeNull();
    expect(parseHostMessage({t:'frame',rev:1,ms:0,b:[1,2],p:0})).toBeNull();
  });
});
