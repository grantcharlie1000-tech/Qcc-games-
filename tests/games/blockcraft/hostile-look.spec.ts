import {test,expect} from '../../fixtures';
import {openStage,stage,type Mob} from './passive-stage';

// The hostile mobs in the real engine at noon (evidence: tests/games/blockcraft/evidence/mobs-*.png): zombie, husk,
// drowned and a baby zombie; skeleton and stray, idle and aiming their bows; a creeper and a charged creeper; a spider.
// They stand frozen (no AI, no burning) on a grass stage. The models must render through the entity layer without errors
// and within the draw-call budget.
const GROUPS:[string,Mob[]][]=[
  ['zombie',[['zombie',-2.4,5.6,.6],['husk',-.8,6,.2],['drowned',.8,6,-.2],['zombie',2.3,5,-.6,{baby:true}]]],
  ['skeleton',[['skeleton',-2.3,5.6,.6],['skeleton',-.8,6,.2,{data:{aggressive:true}}],['stray',.8,6,-.2],['stray',2.3,5.6,-.6,{data:{aggressive:true}}]]],
  ['creeper',[['creeper',-1.1,4.6,.6],['creeper',1.2,4.9,-.5,{data:{charged:true}}]]],
  ['spider',[['spider',0,4.2,.6]]]
];

test('hostile mobs read as the vanilla mobs in daylight',async({page})=>{
  test.setTimeout(420000);
  const errors=await openStage(page);
  for(const [name,mobs] of GROUPS){
    const stats=await stage(page,name,mobs,name==='spider'?{pitch:-.45}:{pitch:-.22});
    expect(stats.count,name).toBe(mobs.length);
    expect(stats.entities,name).toBe(mobs.length);
    expect(stats.drawCalls,name).toBeLessThanOrEqual(3);
  }
  expect(errors).toEqual([]);
});
