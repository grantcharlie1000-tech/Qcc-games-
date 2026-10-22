import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {Room,RoomError,type RoomEvent} from '../../src/multiplayer/room';
import {Reassembler,cleanName,frame,hostPeerId,normalizeCode,randomCode,PART_CHARS} from '../../src/multiplayer/protocol';
import {FakeNetwork,noIce} from './fake-transport';

const settle=async(ms=50)=>{await vi.advanceTimersByTimeAsync(ms);};
function opts(net:FakeNetwork,name:string,extra:Partial<Parameters<typeof Room.create>[0]>={}){
  return {game:'pool',version:'v1',maxPlayers:2,name,endpoint:net.factory,ice:noIce,...extra};
}
async function joined(net:FakeNetwork,host:Room,name:string,extra={}){
  const p=Room.join(opts(net,name,extra),host.code);await settle();return p;
}

describe('protocol',()=>{
  it('normalizes room codes and rejects look-alikes',()=>{
    expect(normalizeCode(' k7q-2mx ')).toBe('K7Q2MX');
    expect(normalizeCode('K7Q2M0')).toBeNull();
    expect(normalizeCode('ABC')).toBeNull();
    expect(normalizeCode(randomCode())).not.toBeNull();
    expect(hostPeerId('pool','K7Q2MX')).toBe('qcc-games-v1-pool-k7q2mx');
  });
  it('cleans names',()=>{
    expect(cleanName('  <Ana>\u0007  ')).toBe('Ana');
    expect(cleanName('   ')).toBeNull();
    expect(cleanName('x'.repeat(40))).toHaveLength(16);
    expect(cleanName(5)).toBeNull();
  });
  it('splits and reassembles large messages in order',()=>{
    let id=0;const big={t:'game',d:{blob:'é'.repeat(PART_CHARS*3+17)}};
    const frames=frame(big,()=>++id);expect(frames.length).toBeGreaterThan(3);
    const r=new Reassembler();let out:unknown;
    for(const f of frames){expect(f.length).toBeLessThanOrEqual(PART_CHARS*3);out=r.push(f);}
    expect(out).toEqual(big);
    expect(()=>new Reassembler().push(frames[1])).toThrow();
  });
});

describe('Room',()=>{
  beforeEach(()=>{vi.useFakeTimers();});
  afterEach(()=>{vi.useRealTimers();});

  it('admits a guest, assigns seats and relays game messages both ways',async()=>{
    const net=new FakeNetwork(),host=await Room.create(opts(net,'Hana'));
    const hostEvents:RoomEvent[]=[];host.on(e=>hostEvents.push(e));
    const guest=await joined(net,host,'Tama');
    expect(guest.self).toMatchObject({seat:1,name:'Tama',host:false});
    expect(host.players.map(p=>p.name)).toEqual(['Hana','Tama']);
    const got:unknown[]=[];guest.on(e=>{if(e.type==='message')got.push(e.data);});
    host.send({hello:1});guest.send({shot:2});await settle();
    expect(got).toEqual([{hello:1}]);
    expect(hostEvents.find(e=>e.type==='message')).toMatchObject({from:{name:'Tama'},data:{shot:2}});
  });

  it('rejects invalid codes, missing rooms, full rooms and other versions clearly',async()=>{
    const net=new FakeNetwork(),host=await Room.create(opts(net,'Hana'));
    await expect(Room.join(opts(net,'A'),'nope')).rejects.toMatchObject({code:'invalid-code'});
    const missing=Room.join(opts(net,'A'),'ZZZZZZ');missing.catch(()=>{});await settle();
    await expect(missing).rejects.toMatchObject({code:'not-found'});
    const old=Room.join(opts(net,'A',{version:'v0'}),host.code);old.catch(()=>{});await settle();
    await expect(old).rejects.toMatchObject({code:'version'});
    await joined(net,host,'Tama');
    const third=Room.join(opts(net,'Rua'),host.code);third.catch(()=>{});await settle();
    await expect(third).rejects.toBeInstanceOf(RoomError);
    await expect(third).rejects.toMatchObject({code:'full',message:'That room is full.'});
    expect(host.players).toHaveLength(2);
  });

  it('makes duplicate names unique and frees the seat when a guest leaves',async()=>{
    const net=new FakeNetwork(),host=await Room.create(opts(net,'Ana',{maxPlayers:4}));
    const a=await joined(net,host,'Ana'),b=await joined(net,host,'Bo');
    expect(a.self?.name).toBe('Ana 2');
    const left:string[]=[];host.on(e=>{if(e.type==='left')left.push(`${e.player.name}:${e.reason}`);});
    a.close();await settle(400);
    expect(left).toEqual(['Ana 2:left']);
    expect(b.players.map(p=>p.seat)).toEqual([0,2]);
    const c=await joined(net,host,'Cy');expect(c.self?.seat).toBe(1);
  });

  it('pauses guests with the host and ends the room when the host leaves',async()=>{
    const net=new FakeNetwork(),host=await Room.create(opts(net,'Hana'));
    const guest=await joined(net,host,'Tama');
    const events:RoomEvent[]=[];guest.on(e=>events.push(e));
    host.setPaused(true);await settle();
    expect(guest.paused).toBe(true);
    // A paused (throttled background) host keeps the room open far longer than the normal timeout.
    await settle(30000);expect(guest.closed).toBe(false);
    host.setPaused(false);await settle();expect(guest.paused).toBe(false);
    host.close();await settle(400);
    expect(events.find(e=>e.type==='closed')).toMatchObject({reason:'host-left'});
    expect(guest.closed).toBe(true);
  });

  it('times out a silent host',async()=>{
    const net=new FakeNetwork(),host=await Room.create(opts(net,'Hana'));
    const guest=await joined(net,host,'Tama');
    // Stop the host's heartbeat without a goodbye: the network went away.
    (host as unknown as {heartbeat:ReturnType<typeof setInterval>}).heartbeat&&clearInterval((host as unknown as {heartbeat:ReturnType<typeof setInterval>}).heartbeat);
    for(const l of net.links)l.send=()=>{};
    await settle(13000);
    expect(guest.closed).toBe(true);
  });

  it('retries a taken room code',async()=>{
    const net=new FakeNetwork();let calls=0;const factory=net.factory;
    net.factory=async(id,ice)=>{if(calls++===0)throw {type:'unavailable-id',message:'taken'};return factory(id,ice);};
    const host=await Room.create(opts(net,'Hana'));expect(calls).toBe(2);expect(host.code).toHaveLength(6);
  });
});
