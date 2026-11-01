import {expect,test} from 'vitest';
import {Simulation,BUTTON,neutralInput,type Entity,type SimWorld,type Seat} from '../../../src/games/strongroom/sim';

const seats:Seat[]=[{seat:0,name:'Defender',team:0,bot:false},{seat:1,name:'Attacker',team:1,bot:false},{seat:2,name:'Second attacker',team:1,bot:false}];
const world=():SimWorld=>({spawns:[[0,0,-4],[0,0,0]],strongrooms:[{name:'A',center:[0,1.2,-4],box:[-2,0,-6,2,3,-2]},{name:'B',center:[8,1.2,-4],box:[6,0,-6,10,3,-2]}],
 spawn:(team,index,site)=>({x:team===0?(site==='B'?8:0):index*1.5,y:0,z:team===0?-4:0,yaw:0}),blocked:()=>true,
 collide:(e:Entity,dx:number,dy:number,dz:number)=>({x:e.x+dx,y:Math.max(0,e.y+dy),z:e.z+dz,ground:true})});
function make(){const s=new Simulation(world(),seats.map(s=>({...s})),17);s.start();return s;}
function action(s:Simulation){for(const e of s.entities)s.requestPick(e.seat,{locked:true});s.step(30);expect(s.phase).toBe('action');}
function hold(s:Simulation,seat:number,seconds:number,buttons:number=BUTTON.INTERACT){
 const count=Math.round(seconds*30);for(let n=0;n<count;n++){const e=s.entities.find(e=>e.seat===seat)!;s.applyInput(seat,{...neutralInput(e.ack+1),buttons,yaw:e.yaw,weapon:e.weapon});s.step(1/30);}
}
function plant(s:Simulation){const carrier=s.entities.find(e=>e.seat===s.objective.carrier)!;Object.assign(carrier,{x:0,z:-4});hold(s,carrier.seat,5);return carrier;}

test('Pick lasts fifteen seconds or ends when every human locks, then Prep lasts thirty',()=>{
 const s=make();expect(s.phase).toBe('pick');expect(s.timer).toBe(15);
 expect(s.requestPick(0,{locked:true})).toBe(true);expect(s.phase).toBe('pick');s.requestPick(1,{locked:true});s.requestPick(2,{locked:true});
 expect(s.phase).toBe('prep');expect(s.timer).toBe(30);s.step(29.9);expect(s.phase).toBe('prep');s.step(.1);expect(s.phase).toBe('action');expect(s.timer).toBe(150);
});

test('an unknown objective exposes no assumed live floor box to presentation',()=>{
 const s=make();expect(s.site).toBeUndefined();s.objective.site='B';expect(s.site?.name).toBe('B');s.objective.site=null;expect(s.site).toBeUndefined();
});

test('the authoritative site vote drives defender spawns and timed reveal',()=>{
 const s=make();s.requestPick(0,{siteVote:'B',locked:true});s.requestPick(1,{locked:true});s.requestPick(2,{locked:true});
 expect(s.objective.site).toBe('B');expect(s.entities[0].x).toBe(8);expect(s.objective.revealed).toBe(false);
 s.step(30);s.step(19.9);expect(s.objective.revealed).toBe(false);s.step(.1);expect(s.objective.revealed).toBe(true);
});

test('an unobstructed attacker sightline reveals the site at the four-Hz check',()=>{
 const s=make();action(s);s.world.blocked=()=>false;s.step(.25);expect(s.objective.revealed).toBe(true);
});

test('only legal unlocked Pick requests change host loadouts or approach selection',()=>{
 const s=make();expect(s.requestPick(1,{operator:'hush'})).toBe(false);expect(s.entities[1].operator).toBe('cadet');
 expect(s.requestPick(1,{operator:'wren'})).toBe(true);expect(s.entities[1].primary).toBe('m4a1');
 expect(s.requestPick(1,{primary:'awp',secondary:'glock',spawnChoice:'yard',locked:true})).toBe(true);
 expect(s.requestPick(1,{primary:'ak47'})).toBe(false);expect(s.entities[1]).toMatchObject({operator:'wren',primary:'awp',secondary:'glock',spawnChoice:'yard'});
 expect(s.requestPick(0,{spawnChoice:'yard'})).toBe(false);expect(s.requestPick(1,{siteVote:'A'})).toBe(false);
});

test('a Cracker dropped by elimination needs a nearby living attacker for 0.3 seconds',()=>{
 const s=make();action(s);const first=s.entities.find(e=>e.seat===s.objective.carrier)!;Object.assign(first,{x:1,z:-1,hp:0});Object.assign(s.entities[2],{x:1,z:-1});
 s.step(.1);expect(s.objective.state).toBe('dropped');s.step(.1);expect(s.objective.carrier).toBeNull();s.step(.1);expect(s.objective.carrier).toBe(2);
});

test('planting requires five held seconds inside the chosen strongroom and replaces the clock',()=>{
 const s=make();action(s);const carrier=plant(s);expect(s.phase).toBe('planted');expect(s.timer).toBe(40);expect(s.objective.carrier).toBeNull();expect(s.objective.position).toMatchObject({x:carrier.x,z:carrier.z});
 s.entities.filter(e=>e.attacking).forEach(e=>e.hp=0);s.step(1);expect(s.phase).toBe('planted');s.step(39);expect(s.phase).toBe('roundEnd');expect(s.scores).toEqual([0,1]);expect(s.outcome).toBe('detonated');
});

test('releasing Interact or moving beyond half a metre cancels plant progress',()=>{
 const s=make();action(s);const carrier=s.entities.find(e=>e.seat===s.objective.carrier)!;Object.assign(carrier,{x:0,z:-4});
 hold(s,carrier.seat,2);expect(s.objective.progress).toBeCloseTo(2,5);hold(s,carrier.seat,1/30,0);expect(s.objective.progress).toBe(0);
 hold(s,carrier.seat,2);carrier.x=.51;hold(s,carrier.seat,1/30);expect(s.objective.progress).toBe(0);expect(s.phase).toBe('action');
});

test('a nearby defender disables for six seconds even when damaged during the hold',()=>{
 const s=make();action(s);plant(s);s.world.blocked=()=>false;Object.assign(s.entities[0],{x:0,z:-4});
 hold(s,0,3);s.entities[0].hp=12;hold(s,0,3);expect(s.phase).toBe('roundEnd');expect(s.scores).toEqual([1,0]);expect(s.outcome).toBe('disabled');
});

test('carry assignments balance human attackers before any bot',()=>{
 const s=make(),carriers:number[]=[];
 for(let round=1;round<=3;round++){action(s);carriers.push(s.objective.carrier!);if(round<3){s.endRound(0);s.nextRound();}}
 expect(carriers).toEqual([1,2,1]);expect(s.entities[1].carries).toBe(2);expect(s.entities[2].carries).toBe(1);
});

test('a tied regulation match gives its last losing team one decider side vote and preserves stable teams',()=>{
 const s=make();action(s);s.round=6;s.scores=[3,2];s.endRound(1);s.step(6);
 expect(s.round).toBe(7);expect(s.pickStage).toBe('side');expect(s.sideVoteTeam).toBe(0);expect(s.requestSideVote(1,'attack')).toBe(false);expect(s.requestSideVote(0,'defend')).toBe(true);
 s.step(10);expect(s.pickStage).toBe('loadout');expect(s.attackTeam).toBe(1);expect(s.entities.map(e=>e.team)).toEqual([0,1,1]);
 action(s);s.endRound(0);s.step(6);expect(s.phase).toBe('gameEnd');expect(s.scores).toEqual([4,3]);
});

test('one accepted shot invokes the world wall hook once even with several targets',()=>{
 const s=make();action(s);const calls:unknown[]=[];s.world.shot=(...args)=>{calls.push(args);return{blocked:true,scale:1};};
 const shooter=s.entities[1];expect(s.fire(shooter,0)).toBe(true);expect(calls).toHaveLength(1);expect(s.entities[0].hp).toBe(112);
});

test('a validated tool hold may stop steering before movement and receives extended tool buttons',()=>{
 const s=make();action(s);const e=s.entities[1],at=e.x;
 s.toolStep=(_actor,input)=>{if(input.buttons&128)input.x=input.z=0;};
 expect(s.applyInput(e.seat,{...neutralInput(1),x:127,buttons:128})).toBe(true);s.step(1/30);expect(e.x).toBe(at);
});

test('a defender over three metres outside is spotted for half a second every two seconds',()=>{
 const s=make();s.world.buildingFootprint={x0:-2,x1:2,z0:-6,z1:2};action(s);const e=s.entities[0];e.x=5; // Exactly three metres is safe.
 s.step(1/30);expect(e.spottedUntil).toBe(0);e.x=5.01;s.step(1/30);const first=e.spottedUntil;expect(first-s.time).toBeCloseTo(500,0);
 s.step(.6);expect(e.spottedUntil).toBeLessThan(s.time);s.step(1.4);expect(e.spottedUntil).toBeGreaterThan(first);
 e.x=0;s.step(1/30);expect(e.spottedUntil).toBe(0);expect(s.entities[1].spottedUntil).toBe(0);
});
