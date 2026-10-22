import {test,expect} from '../../fixtures';
import {openStage,stage,type Mob} from './passive-stage';

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
