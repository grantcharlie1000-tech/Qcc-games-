import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {Room} from '../../../src/multiplayer/room';
import {FakeNetwork,noIce} from '../../multiplayer/fake-transport';
import {OnlineSession} from '../../../src/games/strongroom/net/session';
import {neutralInput,type Entity,type SimEvent} from '../../../src/games/strongroom/sim';
import {packSnapshot} from '../../../src/games/strongroom/net/protocol';
beforeEach(()=>vi.useFakeTimers());afterEach(()=>vi.useRealTimers());
const world=()=>({spawns:[[0,0,0],[0,0,-8]] as [number,number,number][],panels:[{id:0,axis:'x' as const,x:2,y:0,z:-4,cols:4,rows:6,material:'drywall' as const}],blocked:()=>true,collide:(e:Entity,dx:number,dy:number,dz:number)=>({x:e.x+dx,y:Math.max(0,e.y+dy),z:e.z+dz,ground:true})});
const hooks=(x=0)=>({input:()=>({...neutralInput(),x}),state:()=>{},events:(_events:SimEvent[])=>{},lobby:()=>{},paused:()=>{},closed:()=>{},rates:()=>({tickHz:60,snapshotHz:20,maxTeam:3}),think:()=>5});
const cleanup:(()=>void)[]=[];afterEach(()=>{for(const fn of cleanup.splice(0))fn();});
async function pair(guestHooks=hooks(127)){
 const net=new FakeNetwork(),opts={game:'strongroom',version:'test',maxPlayers:6,endpoint:net.factory,ice:noIce};
 const hostRoom=await Room.create({...opts,name:'Hana'}),host=new OnlineSession(hostRoom,world(),hooks(),1);cleanup.push(()=>{host.dispose();hostRoom.close();});
 const joining=Room.join({...opts,name:'Tama'},hostRoom.code);await vi.advanceTimersByTimeAsync(60);const guestRoom=await joining,guest=new OnlineSession(guestRoom,world(),guestHooks,1);cleanup.push(()=>{guest.dispose();guestRoom.close();});await vi.advanceTimersByTimeAsync(100);host.start();await vi.advanceTimersByTimeAsync(100);return {host,guest,hostRoom,guestRoom,net,opts};
}
async function beginAction(host:OnlineSession,guest:OnlineSession){
 host.requestPick({locked:true});guest.requestPick({locked:true});await vi.advanceTimersByTimeAsync(100);expect(host.state.phase).toBe('prep');
 host.state.timer=.001;await vi.advanceTimersByTimeAsync(100);expect(guest.state.phase).toBe('action');
}
test('countdown and round-end snapshots never replay guest movement',async()=>{
 const {host,guest}=await pair();const at=host.state.entities[3].x;await vi.advanceTimersByTimeAsync(1500);expect(guest.state.phase).toBe('pick');expect(guest.state.entities[3].x).toBeCloseTo(at,5);
 await beginAction(host,guest);host.state.endRound(1);await vi.advanceTimersByTimeAsync(100);const end=host.state.entities[3].x;await vi.advanceTimersByTimeAsync(2000);expect(guest.state.phase).toBe('roundEnd');expect(guest.state.entities[3].x).toBeCloseTo(end,2);
});
test('current inputs recover after a 3.5 second unreliable outage without faster movement',async()=>{
 const {host,guest,guestRoom}=await pair();await beginAction(host,guest);await vi.advanceTimersByTimeAsync(3200);const send=vi.spyOn(guestRoom,'sendUnreliable').mockImplementation(()=>{});await vi.advanceTimersByTimeAsync(3500);send.mockRestore();const at=host.state.entities[3].x;await vi.advanceTimersByTimeAsync(500);expect(host.state.entities[3].x-at).toBeGreaterThan(1);expect(host.state.entities[3].x-at).toBeLessThanOrEqual(1.98);
});
test('reliable events expose their authoritative phase before callbacks',async()=>{
 let observed:unknown;const h=hooks(0);const {host,guest,hostRoom}=await pair(h);h.events=events=>{if(events.some(e=>e.type==='phase'))observed={phase:guest.state.phase,winner:guest.state.winner};};hostRoom.setPaused(true);await vi.advanceTimersByTimeAsync(40);host.state.phase='roundEnd';host.state.winner=1;host.state.tick+=10;
 hostRoom.send(['events',host.lobby.epoch,100,host.state.round,host.state.tick,[{type:'phase',seat:0,phase:'roundEnd',winner:1}],packSnapshot(host.state,host.lobby.epoch)]);await vi.advanceTimersByTimeAsync(5);expect(observed).toEqual({phase:'roundEnd',winner:1});
});
test('a new-round snapshot cannot be damaged by delayed combat or an unscoped legacy event',async()=>{
 const h=hooks(0);let damaged=0;h.events=events=>{if(events.some(e=>e.type==='damage'))damaged++;};const {host,guest,hostRoom}=await pair(h);hostRoom.setPaused(true);await vi.advanceTimersByTimeAsync(40);const oldRound=host.state.round;host.state.nextRound();host.state.tick+=10;hostRoom.sendUnreliable(packSnapshot(host.state,host.lobby.epoch));await vi.advanceTimersByTimeAsync(5);expect(guest.state.round).toBe(oldRound+1);
 hostRoom.send(['events',host.lobby.epoch,100,[{type:'damage',seat:3,target:0,hp:1}],null]);hostRoom.send(['events',host.lobby.epoch,101,oldRound,host.state.tick-10,[{type:'damage',seat:3,target:0,hp:1}],null]);await vi.advanceTimersByTimeAsync(5);expect(damaged).toBe(0);expect(guest.state.entities[0].hp).toBe(112);
});
test('a capable host admits six humans until explicitly selecting 5v5',async()=>{
 const net=new FakeNetwork(),opts={game:'strongroom',version:'test',maxPlayers:10,endpoint:net.factory,ice:noIce},room=await Room.create({...opts,name:'Hana'}),h=hooks();h.rates=()=>({tickHz:60,snapshotHz:20,maxTeam:5});const host=new OnlineSession(room,world(),h);cleanup.push(()=>{host.dispose();room.close();});
 const capacity=vi.spyOn(room,'setMaxPlayers');expect((room as any).options.maxPlayers).toBe(6);expect(host.configure({teamSize:5,difficulty:'normal',quick:false})).toBe(true);expect(capacity).toHaveBeenCalledWith(10);expect(host.lobby.seats).toHaveLength(10);
});
test('two real Room sessions start 1v1 plus bots and host alone decides damage, pause and round results',async()=>{
 const net=new FakeNetwork(),opts={game:'strongroom',version:'test',maxPlayers:6,endpoint:net.factory,ice:noIce};
 const hostRoom=await Room.create({...opts,name:'Hana'}),host=new OnlineSession(hostRoom,world(),hooks(),1);
 const joining=Room.join({...opts,name:'Tama'},hostRoom.code);await vi.advanceTimersByTimeAsync(60);const guestRoom=await joining,guest=new OnlineSession(guestRoom,world(),hooks(127),1);
 await vi.advanceTimersByTimeAsync(100);expect(host.lobby.seats.filter(s=>!s.bot)).toHaveLength(2);host.start();await vi.advanceTimersByTimeAsync(100);await beginAction(host,guest);await vi.advanceTimersByTimeAsync(4000);
 expect(host.state.entities).toHaveLength(6);expect(guest.state.phase).toBe('action');expect(guest.localSeat).toBe(3);
 expect(host.state.entities.find(e=>e.seat===3)!.x).toBeGreaterThan(0);expect(guest.state.entities.find(e=>e.seat===3)!.x).toBeGreaterThan(0);
 const before=host.state.entities[0].hp;guestRoom.send(['damage',0,0]);await vi.advanceTimersByTimeAsync(100);expect(host.state.entities[0].hp).toBe(before);
 hostRoom.setPaused(true);await vi.advanceTimersByTimeAsync(100);const timer=host.state.timer;await vi.advanceTimersByTimeAsync(500);expect(host.state.timer).toBe(timer);expect(guest.state.paused).toBe(true);
 hostRoom.setPaused(false);await vi.advanceTimersByTimeAsync(100);host.state.entities.filter(e=>e.team===1).forEach(e=>e.hp=0);await vi.advanceTimersByTimeAsync(150);expect(guest.state.phase).toBe('roundEnd');expect(guest.state.scores).toEqual(host.state.scores);
 const seat=host.state.entities.find(e=>e.peer===guestRoom.id)!.seat;guestRoom.close();await vi.advanceTimersByTimeAsync(400);expect(host.state.entities.find(e=>e.seat===seat)!.bot).toBe(true);
 host.dispose();guest.dispose();hostRoom.close();await vi.advanceTimersByTimeAsync(400);
});

test('guest Pick requests are scoped to its seat, epoch, round and legal loadout',async()=>{
 const {host,guest,guestRoom}=await pair(hooks(0));expect(guest.state.phase).toBe('pick');
 expect(guest.requestPick({operator:'wren',primary:'awp',secondary:'glock',spawnChoice:'yard'})).toBe(true);await vi.advanceTimersByTimeAsync(100);
 expect(host.state.entities[3]).toMatchObject({operator:'wren',primary:'awp',spawnChoice:'yard'});expect(guest.state.entities[3]).toMatchObject({operator:'wren',primary:'awp',spawnChoice:'yard'});
 guestRoom.send(['pick',host.lobby.epoch,host.state.round,{operator:'hush',primary:'smg'}]);guestRoom.send(['pick',host.lobby.epoch-1,host.state.round,{primary:'m4a1'}]);guestRoom.send(['pick',host.lobby.epoch,host.state.round,{seat:0,primary:'m4a1'}]);await vi.advanceTimersByTimeAsync(100);
 expect(host.state.entities[3].primary).toBe('awp');expect(host.state.entities[0].operator).toBe('cadet');
});

test('walls replicate reliable host changes and reject guest cell-state claims',async()=>{
 const {host,guest,guestRoom}=await pair(hooks(0));await beginAction(host,guest);
 host.state.walls.damageCell(0,'melee');host.state.walls.damageCell(0,'melee');await vi.advanceTimersByTimeAsync(100);
 expect(guest.state.walls.states[0]).toBe(3);expect(guest.state.walls.hash()).toBe(host.state.walls.hash());
 const before=host.state.walls.hash();guestRoom.send(['walls',host.lobby.epoch,host.state.round,['wd',999,1,3]]);await vi.advanceTimersByTimeAsync(100);expect(host.state.walls.hash()).toBe(before);
});

test('a missing wall sequence requests the authoritative full snapshot',async()=>{
 const {host,guest,hostRoom}=await pair(hooks(0));await beginAction(host,guest);
 const real=hostRoom.send.bind(hostRoom);let dropped=false;
 vi.spyOn(hostRoom,'send').mockImplementation((data,to)=>{if(!dropped&&Array.isArray(data)&&data[0]==='walls'&&Array.isArray(data[3])&&data[3][0]==='wd'){dropped=true;return;}real(data,to);});
 host.state.walls.damageCell(0,'melee');await vi.advanceTimersByTimeAsync(100);host.state.walls.damageCell(1,'melee');await vi.advanceTimersByTimeAsync(200);
 expect(dropped).toBe(true);expect(guest.state.walls.needsResync).toBe(false);expect(guest.state.walls.hash()).toBe(host.state.walls.hash());
});

test('a full wall snapshot cannot smuggle another round inside a current-round envelope',async()=>{
 const {host,guest,hostRoom}=await pair(hooks(0)),packet=host.state.walls.snapshot();packet[1]=host.state.round+1;
 hostRoom.send(['walls',host.lobby.epoch,host.state.round,packet]);await vi.advanceTimersByTimeAsync(10);expect(guest.state.walls.roundId).toBe(host.state.round);
});

test('a guest who disconnected while Away can rejoin and lock its next Pick',async()=>{
 const {host,guest,hostRoom,guestRoom,opts}=await pair(hooks(0));await beginAction(host,guest);guest.setAway(true);await vi.advanceTimersByTimeAsync(50);expect(host.state.entities[3].away).not.toBeNull();guestRoom.close();await vi.advanceTimersByTimeAsync(50);
 const joining=Room.join({...opts,name:'Tama'},hostRoom.code);await vi.advanceTimersByTimeAsync(60);const room=await joining,rejoined=new OnlineSession(room,world(),hooks(0),1);cleanup.push(()=>{rejoined.dispose();room.close();});await vi.advanceTimersByTimeAsync(100);
 host.state.endRound(0);host.state.timer=.001;await vi.advanceTimersByTimeAsync(100);expect(rejoined.state.phase).toBe('pick');expect(host.state.entities[3].away).toBeNull();expect(rejoined.state.entities[3].bot).toBe(false);
 expect(host.requestPick({locked:true})).toBe(true);expect(rejoined.requestPick({locked:true})).toBe(true);await vi.advanceTimersByTimeAsync(100);expect(host.state.phase).toBe('prep');
});

test('an Away guest still connected keeps its bot at the next Pick until returning',async()=>{
 const {host,guest}=await pair(hooks(0));await beginAction(host,guest);guest.setAway(true);await vi.advanceTimersByTimeAsync(50);host.state.time+=60001;await vi.advanceTimersByTimeAsync(50);expect(host.state.entities[3].bot).toBe(true);
 host.state.endRound(0);host.state.timer=.001;await vi.advanceTimersByTimeAsync(100);expect(host.state.entities[3].bot).toBe(true);expect(host.state.entities[3].away).not.toBeNull();guest.setAway(false);await vi.advanceTimersByTimeAsync(100);expect(host.state.entities[3].bot).toBe(false);expect(host.state.entities[3].away).toBeNull();
});

test('a newer snapshot does not discard same-round reliable cosmetics or roll its state back',async()=>{
 const h=hooks(0),seen:SimEvent[]=[];h.events=events=>seen.push(...events);const {host,guest,hostRoom}=await pair(h);hostRoom.setPaused(true);await vi.advanceTimersByTimeAsync(50);seen.length=0;
 host.state.tick+=20;host.state.entities[0].hp=50;hostRoom.sendUnreliable(packSnapshot(host.state,host.lobby.epoch));await vi.advanceTimersByTimeAsync(10);const tick=host.state.tick;
 const old=packSnapshot(host.state,host.lobby.epoch);old[4]=tick-1;old[6]=3;
 const events:SimEvent[]=[{type:'shot',seat:3},{type:'damage',seat:3,target:0,hp:78},{type:'eliminated',seat:3,target:1},{type:'phase',seat:0,phase:'action'}];
 hostRoom.send(['events',host.lobby.epoch,100,host.state.round,tick-1,events,old]);await vi.advanceTimersByTimeAsync(10);
 expect(seen.map(e=>e.type)).toEqual(['shot','damage','eliminated']);expect(seen.find(e=>e.type==='damage')?.hp).toBeUndefined();expect(guest.state.entities[0].hp).toBe(50);expect(guest.state.phase).toBe('pick');expect(guest.state.tick).toBe(tick);
 hostRoom.send(['events',host.lobby.epoch,100,host.state.round,tick-1,events,null]);await vi.advanceTimersByTimeAsync(10);expect(seen).toHaveLength(3);
});
