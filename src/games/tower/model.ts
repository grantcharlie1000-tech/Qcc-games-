/** Logical x/z footprint. Rendering is deliberately absent from the rules. */
export interface Block { x:number; z:number; w:number; d:number }
export type Axis = 'x'|'z';
export interface TowerState {
  version:1; blocks:Block[]; score:number; combo:number; bestCombo:number; time:number;
  phase:'sliding'|'settling'|'over'; phaseElapsed:number;
  motion:{axis:Axis;elapsed:number;direction:1|-1};
  last:{kind:'perfect'|'cut'|'miss';cut:Block|null;time:number;height:number;side:1|-1}|null;
}
const RANGE=145;
const SETTLE=.2;
export function createTower():TowerState {
  return {version:1,blocks:[{x:-55,z:-55,w:110,d:110}],score:0,combo:0,bestCombo:0,time:0,phase:'sliding',phaseElapsed:0,motion:{axis:'x',elapsed:0,direction:1},last:null};
}
export const perfectTolerance=(width:number)=>Math.min(3.2,width*.08);
export const speed=(height:number)=>95+Math.min(height*4,85);
/** A triangle wave resolves any number of bounces analytically, with no frame-step error. */
export function movingBlock(s:TowerState):Block {
  const top=s.blocks[s.blocks.length-1];
  const travel=(s.motion.elapsed*speed(s.blocks.length-1))%(RANGE*4);
  const offset=(travel<=RANGE*2 ? -RANGE+travel : RANGE*3-travel)*s.motion.direction;
  return {...top,[s.motion.axis]:top[s.motion.axis]+offset};
}
export function intersect(moving:Block,top:Block,axis:Axis):{kept:Block|null;cut:Block|null;perfect:boolean} {
  const edge=axis==='x'?'w':'d';
  const shift=moving[axis]-top[axis];
  if(Math.abs(shift)<=perfectTolerance(top[edge]))return {kept:{...top},cut:null,perfect:true};
  const start=Math.max(moving[axis],top[axis]);
  const end=Math.min(moving[axis]+moving[edge],top[axis]+top[edge]);
  if(end<=start)return {kept:null,cut:{...moving},perfect:false};
  const kept={...moving,[axis]:start,[edge]:end-start};
  const cut=shift<0?{...moving,[edge]:start-moving[axis]}:{...moving,[axis]:end,[edge]:moving[axis]+moving[edge]-end};
  return {kept,cut,perfect:false};
}
export function advance(s:TowerState,dt:number):TowerState {
  if(!Number.isFinite(dt)||dt<=0)return s;
  const time=s.time+dt;
  if(s.phase==='over')return {...s,time};
  if(s.phase==='sliding')return {...s,time,motion:{...s.motion,elapsed:s.motion.elapsed+dt}};
  const elapsed=s.phaseElapsed+dt;
  if(elapsed+1e-12<SETTLE)return {...s,time,phaseElapsed:elapsed};
  const height=s.blocks.length-1;
  return {...s,time,phase:'sliding',phaseElapsed:0,motion:{axis:height%2===0?'x':'z',direction:height%2===0?1:-1,elapsed:Math.max(0,elapsed-SETTLE)}};
}
export function drop(s:TowerState):TowerState {
  if(s.phase!=='sliding')return s;
  const moving=movingBlock(s),top=s.blocks[s.blocks.length-1];
  const result=intersect(moving,top,s.motion.axis);
  const side=moving[s.motion.axis]<top[s.motion.axis]?-1:1;
  const last={kind:result.kept?(result.perfect?'perfect':'cut'):'miss',cut:result.cut,time:s.time,height:s.blocks.length,side} as NonNullable<TowerState['last']>;
  if(!result.kept)return {...s,phase:'over',phaseElapsed:0,combo:0,last};
  const combo=result.perfect?s.combo+1:0;
  return {...s,blocks:[...s.blocks,result.kept],score:s.score+1+Math.min(combo,5),combo,bestCombo:Math.max(combo,s.bestCombo),phase:'settling',phaseElapsed:0,last};
}
function record(value:unknown):value is Record<string,unknown>{return value!==null&&typeof value==='object'&&!Array.isArray(value);}
function number(value:unknown,min:number,max:number):value is number{return typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max;}
function block(value:unknown,extent=55):value is Block {
  return record(value)&&number(value.x,-200,200)&&number(value.z,-200,200)&&number(value.w,Number.MIN_VALUE,110)&&number(value.d,Number.MIN_VALUE,110)&&value.x+value.w<=extent+1e-7&&value.z+value.d<=extent+1e-7;
}
/** Reject invalid input atomically; copy accepted data so callers cannot mutate the live run. */
export function restoreTower(data:unknown):TowerState|null {
  if(!record(data)||data.version!==1||!Array.isArray(data.blocks)||data.blocks.length<1||data.blocks.length>4096)return null;
  const blocks:Block[]=[];
  for(const value of data.blocks){
    if(!block(value))return null;
    const previous=blocks.at(-1);
    if(previous&&(value.x<previous.x-1e-7||value.z<previous.z-1e-7||value.x+value.w>previous.x+previous.w+1e-7||value.z+value.d>previous.z+previous.d+1e-7))return null;
    blocks.push({x:value.x,z:value.z,w:value.w,d:value.d});
  }
  const base=blocks[0];if(base.x!==-55||base.z!==-55||base.w!==110||base.d!==110)return null;
  const height=blocks.length-1;
  if(!number(data.score,height,height*6)||!Number.isInteger(data.score)||!number(data.combo,0,height)||!Number.isInteger(data.combo)||!number(data.bestCombo,data.combo,height)||!Number.isInteger(data.bestCombo)||!number(data.time,0,1e9)||!number(data.phaseElapsed,0,SETTLE))return null;
  if(data.phase!=='sliding'&&data.phase!=='settling'&&data.phase!=='over')return null;
  if(!record(data.motion)||(data.motion.axis!=='x'&&data.motion.axis!=='z')||(data.motion.direction!==1&&data.motion.direction!==-1)||!number(data.motion.elapsed,0,1e9))return null;
  let last:TowerState['last']=null;
  if(data.last!==null){
    const value=data.last;
    if(!record(value)||(value.kind!=='perfect'&&value.kind!=='cut'&&value.kind!=='miss')||!number(value.time,0,data.time)||!number(value.height,1,blocks.length)||!Number.isInteger(value.height)||(value.side!==1&&value.side!==-1)||(value.cut!==null&&!block(value.cut,255)))return null;
    last={kind:value.kind,time:value.time,height:value.height,side:value.side,cut:value.cut===null?null:{x:value.cut.x,z:value.cut.z,w:value.cut.w,d:value.cut.d}};
  }
  if((data.phase==='settling'&&(!last||last.kind==='miss'))||(data.phase==='over'&&last?.kind!=='miss')||(height>0&&!last))return null;
  return {version:1,blocks,score:data.score,combo:data.combo,bestCombo:data.bestCombo,time:data.time,phase:data.phase,phaseElapsed:data.phaseElapsed,motion:{axis:data.motion.axis,elapsed:data.motion.elapsed,direction:data.motion.direction},last};
}
