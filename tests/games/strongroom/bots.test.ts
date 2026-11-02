import {expect,test} from 'vitest';
import {Simulation,type Team,type Entity,type SimWorld} from '../../../src/games/strongroom/sim';
import {customsWorld} from './customs-world';

function match(seed:number,humanTeam:Team){
 const f=customsWorld(),seats=Array.from({length:6},(_,seat)=>({seat,name:seat===humanTeam*3?'Human':'Bot '+seat,team:(seat<3?0:1) as Team,bot:seat!==humanTeam*3}));
 const s=new Simulation(f.world,seats,seed);f.attach(s);s.start();return s;
}
function run(s:Simulation,until:(s:Simulation)=>boolean){
 const events:string[]=[];let steps=0;
 for(;steps<45000&&!until(s);steps++){
  if(s.phase==='pick'&&s.pickStage==='loadout')for(const e of s.entities.filter(e=>!e.bot&&!e.locked))s.requestPick(e.seat,{locked:true});
  s.step(1/30);events.push(...s.events.splice(0).map(e=>e.type==='objective'?e.action??'':e.type));
 }
 return{events,steps};
}

test('objective bots plant the Cracker during ten seeded live-combat Customs House simulations',()=>{
 const planted:number[]=[];
 for(let seed=1;seed<=10;seed++){const s=match(seed,0),result=run(s,s=>s.round>3||s.phase==='gameEnd');if(result.events.includes('plant'))planted.push(seed);}
 expect(planted,`seeds with a plant: ${planted.join(', ')}`).not.toHaveLength(0);
},60000);

test.each([0,1] as const)('a solo human on stable team %i completes a full match with five objective bots',humanTeam=>{
 const s=match(17+humanTeam,humanTeam),teams=s.entities.map(e=>e.team),result=run(s,s=>s.phase==='gameEnd');
 expect(s.phase).toBe('gameEnd');expect(Math.max(...s.scores)).toBe(4);expect(s.round).toBeLessThanOrEqual(7);expect(s.entities.map(e=>e.team)).toEqual(teams);expect(result.steps).toBeLessThan(45000);
},60000);

test('a carrier bot advances toward the strongroom while firing at a visible defender',()=>{
 const world:SimWorld={spawns:[[0,0,-10],[0,0,0]],strongrooms:[{name:'A',center:[0,1.2,-20],box:[-2,0,-22,2,3,-18]}],blocked:()=>false,collide:(e:Entity,dx,dy,dz)=>({x:e.x+dx,y:Math.max(0,e.y+dy),z:e.z+dz,ground:true})};
 const s=new Simulation(world,[{seat:0,name:'Human',team:0,bot:false},{seat:1,name:'Carrier',team:1,bot:true}],17);s.start();s.requestPick(0,{locked:true});s.step(30);s.objective.revealed=true;
 s.step(1/30);expect(s.entities[1].z).toBeLessThan(-.05);expect(s.entities[1].ammo).toBe(29);
});
