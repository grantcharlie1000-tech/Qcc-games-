import {expect,test} from 'vitest';
import {packInputs,unpackInputs,packSnapshot,unpackSnapshot} from '../../../src/games/strongroom/net/protocol';
import {InputBuffer} from '../../../src/games/strongroom/net/input-buffer';
import {reconcile,Interpolation} from '../../../src/games/strongroom/net/prediction';
import {CapsuleHistory} from '../../../src/games/strongroom/net/history';
import {Simulation,neutralInput,type Entity} from '../../../src/games/strongroom/sim';
const world={spawns:[[0,0,0],[0,0,-8]] as [number,number,number][],blocked:()=>false,collide:(e:Entity,dx:number,dy:number,dz:number)=>({x:e.x+dx,y:Math.max(0,e.y+dy),z:e.z+dz,ground:true})};
const make=()=>{const s=new Simulation(world,[{seat:0,name:'Hana',team:0,bot:false},{seat:1,name:'Tama',team:1,bot:false}]);s.start();s.phase='action';return s;};
test('packed integer snapshots preserve authority, acknowledgements and centimeter positions',()=>{
 const s=make();s.entities[1].x=12.345;s.entities[1].hp=66;s.entities[1].ack=42;s.round=3;s.time=5012;s.tick=300;s.timer=95.15;s.scores=[1,1];
 const packed=packSnapshot(s,7);expect(packed.slice(0,5)).toEqual(['s',1,7,3,300]);
 const snap=unpackSnapshot(packed,s.entities)!;expect(snap.entities[1]).toMatchObject({x:12.35,hp:66,ack:42,name:'Tama'});expect(snap.timer).toBe(95.15);expect(snap.scores).toEqual([1,1]);expect(snap.epoch).toBe(7);
 expect(unpackSnapshot([...packed,12])).toBeNull();const bad=[...packed];bad[12]=NaN;expect(unpackSnapshot(bad)).toBeNull();
});
test('input packets contain exactly the last three frames and reject forged movement, weapons and oversized packets',()=>{
 const inputs=Array.from({length:5},(_,i)=>({...neutralInput(i+1),x:127,yaw:.1234,pitch:-.21}));const p=packInputs(7,1,inputs),got=unpackInputs(p)!;
 expect(got.frames.map(i=>i.seq)).toEqual([3,4,5]);expect(got.frames[0].yaw).toBeCloseTo(.123,3);
 const bad=[...p];bad[7]=128;expect(unpackInputs(bad)).toBeNull();expect(unpackInputs([...p,...p])).toBeNull();
});
test('input buffer deduplicates redundancy, orders reordering, bounds lead, and cannot buy extra simulation time',()=>{
 const b=new InputBuffer();expect(b.push([neutralInput(3),neutralInput(1),neutralInput(2)])).toBe(3);expect(b.push([neutralInput(1),neutralInput(2)])).toBe(0);
 expect(b.take()?.seq).toBe(1);expect(b.take()?.seq).toBe(2);expect(b.take()?.seq).toBe(3);expect(b.take()).toBeNull();expect(b.push([neutralInput(10000)])).toBe(0);
});
test('redundant inputs recover a lost packet without repeating its movement',()=>{
 const b=new InputBuffer();b.push([neutralInput(1)]);expect(b.take()?.seq).toBe(1);b.push([neutralInput(1),neutralInput(2),neutralInput(3)]);expect([b.take()?.seq,b.take()?.seq,b.take()]).toEqual([2,3,null]);
});
test('reconciliation replays only inputs newer than the host acknowledgement',()=>{
 const sim=make(),auth={...sim.entities[0],ack:1};const pending=[{...neutralInput(1),x:127},{...neutralInput(2),x:127},{...neutralInput(3),x:127}];
 const result=reconcile({...auth,x:4},auth,pending,world);expect(result.entity.x).toBeCloseTo(.28,5);expect(result.pending.map(i=>i.seq)).toEqual([2,3]);expect(result.error).toBeCloseTo(3.72,5);
});
test('remote interpolation keeps a 100ms buffer and never extrapolates beyond 150ms',()=>{
 const e=make().entities[1],i=new Interpolation();i.add(1000,[{...e,x:0}],1000);i.add(1100,[{...e,x:1,vx:10}],1100);
 expect(i.sample(1150)[0].x).toBeCloseTo(.5,5);expect(i.sample(2000)[0].x).toBeLessThanOrEqual(2.5);
});
test('capsule history interpolates posture, retains a second, and caps rewind at 200ms',()=>{
 const h=new CapsuleHistory(),e=make().entities[1];for(let t=0;t<=1200;t+=100)h.record(t,[{...e,x:t/100,y:0,crouch:t>=1100}]);
 expect(h.sample(1,950,1200)?.x).toBe(10);expect(h.sample(1,1150,1200)?.x).toBe(11.5);expect(h.sample(1,1150,1200)?.height).toBe(1.25);expect(h.size).toBeLessThanOrEqual(12);
});
