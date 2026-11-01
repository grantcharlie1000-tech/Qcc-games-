import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {Room} from '../../../src/multiplayer/room';
import {FakeNetwork,noIce} from '../../multiplayer/fake-transport';
import {OnlineSession} from '../../../src/games/strongroom/net/session';
import {neutralInput,type Entity,type SimEvent} from '../../../src/games/strongroom/sim';
import {packSnapshot} from '../../../src/games/strongroom/net/protocol';
beforeEach(()=>vi.useFakeTimers());afterEach(()=>vi.useRealTimers());
const world=()=>({spawns:[[0,0,0],[0,0,-8]] as [number,number,number][],blocked:()=>true,collide:(e:Entity,dx:number,dy:number,dz:number)=>({x:e.x+dx,y:Math.max(0,e.y+dy),z:e.z+dz,ground:true})});
const hooks=(x=0)=>({input:()=>({...neutralInput(),x}),state:()=>{},events:(_events:SimEvent[])=>{},lobby:()=>{},paused:()=>{},closed:()=>{},rates:()=>({tickHz:60,snapshotHz:20,maxTeam:3}),think:()=>5});
const cleanup:(()=>void)[]=[];afterEach(()=>{for(const fn of cleanup.splice(0))fn();});
async function pair(guestHooks=hooks(127)){
 const net=new FakeNetwork(),opts={game:'strongroom',version:'test',maxPlayers:6,endpoint:net.factory,ice:noIce};
 const hostRoom=await Room.create({...opts,name:'Hana'}),host=new OnlineSession(hostRoom,world(),hooks(),1);cleanup.push(()=>{host.dispose();hostRoom.close();});
 const joining=Room.join({...opts,name:'Tama'},hostRoom.code);await vi.advanceTimersByTimeAsync(60);const guestRoom=await joining,guest=new OnlineSession(guestRoom,world(),guestHooks,1);cleanup.push(()=>{guest.dispose();guestRoom.close();});await vi.advanceTimersByTimeAsync(100);host.start();await vi.advanceTimersByTimeAsync(100);return {host,guest,hostRoom,guestRoom};
}
test('countdown and round-end snapshots never replay guest movement',async()=>{
 const {host,guest}=await pair();const at=host.state.entities[3].x;await vi.advanceTimersByTimeAsync(1500);expect(guest.state.phase).toBe('prep');expect(guest.state.entities[3].x).toBeCloseTo(at,5);
 await vi.advanceTimersByTimeAsync(2000);host.state.endRound(1);await vi.advanceTimersByTimeAsync(100);const end=host.state.entities[3].x;await vi.advanceTimersByTimeAsync(2000);expect(guest.state.phase).toBe('roundEnd');expect(guest.state.entities[3].x).toBeCloseTo(end,2);
});
test('current inputs recover after a 3.5 second unreliable outage without faster movement',async()=>{
 const {host,guestRoom}=await pair();await vi.advanceTimersByTimeAsync(3200);const send=vi.spyOn(guestRoom,'sendUnreliable').mockImplementation(()=>{});await vi.advanceTimersByTimeAsync(3500);send.mockRestore();const at=host.state.entities[3].x;await vi.advanceTimersByTimeAsync(500);expect(host.state.entities[3].x-at).toBeGreaterThan(1);expect(host.state.entities[3].x-at).toBeLessThanOrEqual(2.11);
});
test('reliable events expose their authoritative phase before callbacks',async()=>{
 let observed:unknown;const h=hooks(0);const {host,guest,hostRoom}=await pair(h);h.events=events=>{if(events.some(e=>e.type==='phase'))observed={phase:guest.state.phase,winner:guest.state.winner};};hostRoom.setPaused(true);await vi.advanceTimersByTimeAsync(40);host.state.phase='roundEnd';host.state.winner=1;host.state.tick+=10;
 hostRoom.send(['events',host.lobby.epoch,100,host.state.round,host.state.tick,[{type:'phase',seat:0,phase:'roundEnd',winner:1}],packSnapshot(host.state,host.lobby.epoch)]);await vi.advanceTimersByTimeAsync(5);expect(observed).toEqual({phase:'roundEnd',winner:1});
});
test('a new-round snapshot cannot be damaged by delayed combat or an unscoped legacy event',async()=>{
 const h=hooks(0);let damaged=0;h.events=events=>{if(events.some(e=>e.type==='damage'))damaged++;};const {host,guest,hostRoom}=await pair(h);hostRoom.setPaused(true);await vi.advanceTimersByTimeAsync(40);const oldRound=host.state.round;host.state.nextRound();host.state.tick+=10;hostRoom.sendUnreliable(packSnapshot(host.state,host.lobby.epoch));await vi.advanceTimersByTimeAsync(5);expect(guest.state.round).toBe(oldRound+1);
 hostRoom.send(['events',host.lobby.epoch,100,[{type:'damage',seat:3,target:0,hp:1}],null]);hostRoom.send(['events',host.lobby.epoch,101,oldRound,host.state.tick-10,[{type:'damage',seat:3,target:0,hp:1}],null]);await vi.advanceTimersByTimeAsync(5);expect(damaged).toBe(0);expect(guest.state.entities[0].hp).toBe(100);
});
test('a capable host admits six humans until explicitly selecting 5v5',async()=>{
 const net=new FakeNetwork(),opts={game:'strongroom',version:'test',maxPlayers:10,endpoint:net.factory,ice:noIce},room=await Room.create({...opts,name:'Hana'}),h=hooks();h.rates=()=>({tickHz:60,snapshotHz:20,maxTeam:5});const host=new OnlineSession(room,world(),h);cleanup.push(()=>{host.dispose();room.close();});
 const capacity=vi.spyOn(room,'setMaxPlayers');expect((room as any).options.maxPlayers).toBe(6);expect(host.configure({teamSize:5,difficulty:'normal',quick:false})).toBe(true);expect(capacity).toHaveBeenCalledWith(10);expect(host.lobby.seats).toHaveLength(10);
});
test('two real Room sessions start 1v1 plus bots and host alone decides damage, pause and round results',async()=>{
 const net=new FakeNetwork(),opts={game:'strongroom',version:'test',maxPlayers:6,endpoint:net.factory,ice:noIce};
 const hostRoom=await Room.create({...opts,name:'Hana'}),host=new OnlineSession(hostRoom,world(),hooks(),1);
 const joining=Room.join({...opts,name:'Tama'},hostRoom.code);await vi.advanceTimersByTimeAsync(60);const guestRoom=await joining,guest=new OnlineSession(guestRoom,world(),hooks(127),1);
 await vi.advanceTimersByTimeAsync(100);expect(host.lobby.seats.filter(s=>!s.bot)).toHaveLength(2);host.start();await vi.advanceTimersByTimeAsync(4000);
 expect(host.state.entities).toHaveLength(6);expect(guest.state.phase).toBe('action');expect(guest.localSeat).toBe(3);
 expect(host.state.entities.find(e=>e.seat===3)!.x).toBeGreaterThan(0);expect(guest.state.entities.find(e=>e.seat===3)!.x).toBeGreaterThan(0);
 const before=host.state.entities[0].hp;guestRoom.send(['damage',0,0]);await vi.advanceTimersByTimeAsync(100);expect(host.state.entities[0].hp).toBe(before);
 hostRoom.setPaused(true);await vi.advanceTimersByTimeAsync(100);const timer=host.state.timer;await vi.advanceTimersByTimeAsync(500);expect(host.state.timer).toBe(timer);expect(guest.state.paused).toBe(true);
 hostRoom.setPaused(false);await vi.advanceTimersByTimeAsync(100);host.state.entities.filter(e=>e.team===1).forEach(e=>e.hp=0);await vi.advanceTimersByTimeAsync(150);expect(guest.state.phase).toBe('roundEnd');expect(guest.state.scores).toEqual(host.state.scores);
 const seat=host.state.entities.find(e=>e.peer===guestRoom.id)!.seat;guestRoom.close();await vi.advanceTimersByTimeAsync(400);expect(host.state.entities.find(e=>e.seat===seat)!.bot).toBe(true);
 host.dispose();guest.dispose();hostRoom.close();await vi.advanceTimersByTimeAsync(400);
});
