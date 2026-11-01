import {expect,test} from 'vitest';
import {Simulation,move,neutralInput,type Entity} from '../../../src/games/strongroom/sim';
const world={spawns:[[0,0,0],[0,0,-8]] as [number,number,number][],blocked:()=>false,collide:(e:Entity,dx:number,dy:number,dz:number)=>({x:e.x+dx,y:Math.max(0,e.y+dy),z:e.z+dz,ground:e.y+dy<=0})};
const seats=[{seat:0,name:'Host',team:0 as const,bot:false},{seat:1,name:'Guest',team:1 as const,bot:false}];
test('diagonal movement is normalized and replay has the same result as a host input step',()=>{
 const sim=new Simulation(world,seats,1);sim.start();sim.phase='action';const a={...sim.entities[0]},b={...a};
 const input={...neutralInput(1),x:127,z:127,yaw:0};
 move(a,input,1/30,world);move(b,input,1/60,world);move(b,input,1/60,world);
 expect(Math.hypot(a.x,a.z)).toBeCloseTo(.14,3);expect(a.x).toBeCloseTo(b.x,3);expect(a.z).toBeCloseTo(b.z,3);
});
test('host enforces fire rate, ammo, friendly fire and wall line of sight',()=>{
 const sim=new Simulation(world,seats,1);sim.start();sim.phase='action';
 const a=sim.entities[0],b=sim.entities[1];a.yaw=0;a.pitch=-Math.atan2(.42,8);
 expect(sim.fire(a,0)).toBe(true);expect(b.hp).toBe(66);expect(a.ammo).toBe(29);
 expect(sim.fire(a,0)).toBe(false);expect(b.hp).toBe(66);
 sim.time=200;sim.world.blocked=()=>true;expect(sim.fire(a,200)).toBe(true);expect(b.hp).toBe(66);
 sim.world.blocked=()=>false;b.team=0;sim.time=400;sim.fire(a,400);expect(b.hp).toBe(66);
});
test('elimination ends once and all clients can consume the same round result',()=>{
 const sim=new Simulation(world,seats,3);sim.start();sim.phase='action';
 sim.entities[1].hp=0;sim.step(1/60);
 expect(sim.phase).toBe('roundEnd');expect(sim.scores).toEqual([1,0]);
 for(let i=0;i<30;i++)sim.step(1/60);expect(sim.scores).toEqual([1,0]);
});
test('Away zeros input immediately; sixty seconds later the same seat is bot owned',()=>{
 const sim=new Simulation(world,seats,2);sim.start();sim.phase='action';const e=sim.entities[1];
 sim.setAway(1,true);sim.applyInput(1,{...neutralInput(1),x:127});sim.step(1/30);expect(e.x).toBe(0);
 sim.time=60001;sim.step(1/30);expect(e.bot).toBe(true);expect(e.seat).toBe(1);
 sim.setAway(1,false);expect(e.bot).toBe(false);
});
test('switching weapons cannot refill ammunition',()=>{
 const sim=new Simulation(world,seats,1);sim.start();sim.phase='action';const e=sim.entities[0];e.ammo=7;
 sim.applyInput(0,{...neutralInput(1),weapon:1});sim.step(1/30);
 sim.applyInput(0,{...neutralInput(2),weapon:0});sim.step(1/30);
 expect(e.ammo).toBe(7);expect(e.reserve).toBe(150);
});
test('returning from an Away bot takeover immediately accepts human input again',()=>{
 const sim=new Simulation(world,seats,2);sim.start();sim.phase='action';const e=sim.entities[1];
 sim.setAway(1,true);sim.time=60001;sim.tick=2000;sim.step(1/30);expect(e.bot).toBe(true);
 sim.setAway(1,false);expect(sim.applyInput(1,{...neutralInput(10),x:127})).toBe(true);sim.step(1/30);expect(e.x).toBeGreaterThan(0);
});
