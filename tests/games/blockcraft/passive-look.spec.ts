import {test,expect} from '../../fixtures';
import {openStage,stage,type Mob} from './passive-stage';
import type {Game} from '../../../src/games/blockcraft/engine/contracts';

// The passive mobs in the real engine at noon (evidence: tests/games/blockcraft/evidence/mobs-*.png): cow, mooshroom and
// calf, pig and piglet, white, pink, sheared sheep and a lamb, chicken and chick, the six rabbit coats. The models must
// render through the entity layer without errors and within the draw-call budget.
const GROUPS:[string,Mob[]][]=[
  ['cow',[['cow',-1.6,4,.7,{data:{variant:'cow'}}],['cow',1.6,4.5,-.7,{data:{variant:'mooshroom'}}],['cow',0,2.6,.3,{baby:true,data:{variant:'cow'}}]]],
  ['pig',[['pig',-.9,3.4,.7],['pig',1.1,3,-.6,{baby:true}]]],
  ['sheep',[['sheep',-2,4,.7,{data:{color:'white'}}],['sheep',0,4.8,-.4,{data:{color:'pink'}}],['sheep',2,4,-.7,{data:{color:'white',sheared:true}}],
    ['sheep',-.2,2.5,.4,{baby:true,data:{color:'white'}}]]],
  ['chicken',[['chicken',-.6,2.4,.7],['chicken',.7,2.2,-.6,{baby:true}]]],
  ['rabbit',(['brown','white','black','white_splotched','gold','salt'] as const).map((v,i):Mob=>['rabbit',(i-2.5)*.7,2,.6,{data:{variant:v}}])]
];

test('passive mobs read as the vanilla mobs in daylight',async({page})=>{
  test.setTimeout(420000);
  const errors=await openStage(page);
  for(const [name,mobs] of GROUPS){
    const stats=await stage(page,name,mobs,name==='rabbit'||name==='chicken'?{pitch:-.55}:{});
    expect(stats.count,name).toBe(mobs.length);
    expect(stats.entities,name).toBe(mobs.length);
    expect(stats.drawCalls,name).toBeLessThanOrEqual(3);
  }
  expect(errors).toEqual([]);
});

test('photo stage clears pending entities before delayed chunk delivery',async({page})=>{
  test.setTimeout(120000);
  const errors=await openStage(page);
  await page.evaluate(()=>{
    const g=(window as unknown as {blockcraft:Game}).blockcraft,p=g.player.state,x=p.x+4,z=p.z-4;
    // A previously unloaded animal is waiting for its chunk, independently of natural-spawning settings.
    g.entities.restore!({v:1,list:[],far:[{k:'cow',i:900001,x,y:p.y,z,h:10,d:{variant:'cow'}}]});
    const off=g.events.on('entitySpawned',({entity,reason})=>{
      if(entity.kind!=='rabbit'||reason!=='egg')return;
      off();setTimeout(()=>g.events.emit('chunkLoaded',{cx:Math.floor(x/16),cz:Math.floor(z/16),fresh:false}),0);
    });
  });
  const mobs=GROUPS.find(([name])=>name==='rabbit')![1];
  const stats=await stage(page,'pending-rabbit',mobs,{pitch:-.55});
  expect(stats.count).toBe(6);
  expect(stats.entities).toBe(6);
  expect(stats.drawCalls).toBeLessThanOrEqual(3);
  expect(errors).toEqual([]);
});
