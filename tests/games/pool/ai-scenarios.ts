import {createGame,type Difficulty,type PoolState} from '../../../src/games/pool/game';

type Layout={name:string;tier:'routine'|'precision';cue:[number,number];balls:[number,number,number][];hand?:PoolState['hand'];open?:boolean};
// Fixed physical layouts, independent of the planner. No candidate/ease filtering.
export const layouts:readonly Layout[]=[
  {name:'short-corner',tier:'routine',cue:[1.2,.5],balls:[[10,1.7,.25],[8,.4,.7],[3,.6,.2]]},
  {name:'short-side',tier:'routine',cue:[.99,.65],balls:[[10,.99,.28],[8,1.65,.7],[3,.4,.3]]},
  {name:'straight-corner',tier:'routine',cue:[1.15,.74],balls:[[10,1.65,.29],[8,.4,.7],[3,.6,.2]]},
  {name:'ball-in-hand',tier:'routine',cue:[1,.5],balls:[[9,1.6,.3],[1,.5,.3],[8,.9,.8]],hand:'table'},
  {name:'called-eight',tier:'routine',cue:[1.2,.5],balls:[[8,1.7,.25],[3,.6,.2]]},
  {name:'long-corner',tier:'precision',cue:[.3,.8],balls:[[10,1.3,.32],[8,.4,.2],[3,1.2,.8]]},
  {name:'thin-side',tier:'precision',cue:[.35,.65],balls:[[10,.9,.28],[8,1.6,.7],[3,.4,.2]]},
  {name:'long-cut',tier:'precision',cue:[.3,.3],balls:[[10,1.4,.65],[8,1.5,.2],[3,.6,.8]]},
  {name:'rail-pot',tier:'precision',cue:[.6,.35],balls:[[10,1.5,.045],[8,.4,.7],[3,1.2,.8]]},
  {name:'open-table',tier:'precision',cue:[.4,.6],balls:[[10,1.5,.4],[8,.8,.75],[3,1.2,.23],[11,.8,.25]],open:true},
];

export function scenario(layout:Layout,difficulty:Difficulty,seed:number):PoolState{
  const s=createGame('ai',difficulty,seed);
  s.breakShot=false;s.hand=layout.hand??null;s.turn=1;
  s.groups=layout.open?[null,null]:['solids','stripes'];
  for(const b of s.balls)b.on=false;
  Object.assign(s.balls[0],{x:layout.cue[0],y:layout.cue[1],on:true});
  for(const [id,x,y] of layout.balls)Object.assign(s.balls[id],{x,y,on:true});
  s.potted=s.balls.filter(b=>!b.on&&b.id!==0).map(b=>b.id);
  return s;
}
