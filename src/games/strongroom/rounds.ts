/** Pure round decisions; no rendering, transport, or actor mutation. */
export type Team=0|1;
export type Phase='menu'|'pick'|'prep'|'action'|'planted'|'roundEnd'|'gameEnd';
export const PHASES:readonly Phase[]=['menu','pick','prep','action','planted','roundEnd','gameEnd'];
export type RoundReason='detonated'|'defendersEliminated'|'attackersEliminated'|'timeout'|'disabled';
export interface RoundResult{attacking:boolean;reason:RoundReason}
export interface RoundCheck{phase:Phase;timer:number;attackers:number;defenders:number;disabled?:boolean}
export function roundResult(state:RoundCheck):RoundResult|null{
 if(state.phase!=='action'&&state.phase!=='planted')return null;
 if(state.disabled)return{attacking:false,reason:'disabled'};
 if(state.defenders===0)return{attacking:true,reason:'defendersEliminated'};
 if(state.phase==='action'&&state.attackers===0)return{attacking:false,reason:'attackersEliminated'};
 if(state.timer<=0)return state.phase==='planted'?{attacking:true,reason:'detonated'}:{attacking:false,reason:'timeout'};
 return null;
}
export function attackTeamForRound(round:number,quick=false,overtimeTeam?:Team):Team{
 const swapAfter=quick?2:3;
 if(round>swapAfter*2&&overtimeTeam!==undefined)return overtimeTeam;
 return round<=swapAfter?1:0;
}
export function matchComplete(scores:readonly number[],quick=false){return Math.max(...scores)>=(quick?3:4);}
export function resolveVote<T extends string>(votes:readonly T[],options:readonly [T,T],random:()=>number):T{
 const a=votes.filter(v=>v===options[0]).length,b=votes.filter(v=>v===options[1]).length;
 return a===b?options[random()<.5?0:1]:options[a>b?0:1];
}
export function matchTiming(quick=false,teamSize=3){return{pick:15,prep:teamSize>3?40:30,action:quick?120:teamSize>3?165:150,fuse:40,plant:5,disable:6,roundEnd:6,sideVote:10,swapAfter:quick?2:3,target:quick?3:4};}
