import {expect,test} from 'vitest';
import {roundResult,attackTeamForRound,matchComplete,resolveVote,matchTiming} from '../../../src/games/strongroom/rounds';

// These fixtures catch incorrect winner branches without depending on Simulation.
test.each([
 {phase:'planted',timer:0,attackers:0,defenders:2,disabled:false,want:{attacking:true,reason:'detonated'}},
 {phase:'action',timer:80,attackers:2,defenders:0,disabled:false,want:{attacking:true,reason:'defendersEliminated'}},
 {phase:'planted',timer:20,attackers:2,defenders:0,disabled:false,want:{attacking:true,reason:'defendersEliminated'}},
 {phase:'action',timer:0,attackers:2,defenders:2,disabled:false,want:{attacking:false,reason:'timeout'}},
 {phase:'action',timer:80,attackers:0,defenders:2,disabled:false,want:{attacking:false,reason:'attackersEliminated'}},
 {phase:'planted',timer:20,attackers:0,defenders:2,disabled:true,want:{attacking:false,reason:'disabled'}},
 {phase:'planted',timer:20,attackers:0,defenders:2,disabled:false,want:null},
 {phase:'prep',timer:0,attackers:0,defenders:0,disabled:false,want:null},
] as const)('$phase resolves $want with $attackers attackers and $defenders defenders',({want,...state})=>{
 expect(roundResult(state)).toEqual(want);
});

test('side swaps change attacking teams after three rounds while scores remain stable',()=>{
 expect([1,2,3,4,5,6].map(n=>attackTeamForRound(n,false))).toEqual([1,1,1,0,0,0]);
 expect(attackTeamForRound(7,false,1)).toBe(1);
 expect(attackTeamForRound(7,false,0)).toBe(0);
 expect(matchComplete([3,3],false)).toBe(false);
 expect(matchComplete([4,3],false)).toBe(true);
 expect(matchComplete([3,2],true)).toBe(true);
});

test('majority votes ignore abstentions and tied votes consume one seeded coin',()=>{
 expect(resolveVote(['A','B','B'],['A','B'],()=>.1)).toBe('B');
 expect(resolveVote(['A','B'],['A','B'],()=>.1)).toBe('A');
 expect(resolveVote(['A','B'],['A','B'],()=>.9)).toBe('B');
 expect(resolveVote([],['attack','defend'],()=>.9)).toBe('defend');
});

test('the selected match length controls the phase clocks and win target',()=>{
 expect(matchTiming(false,3)).toEqual({pick:15,prep:30,action:150,fuse:40,plant:5,disable:6,roundEnd:6,sideVote:10,swapAfter:3,target:4});
 expect(matchTiming(true,3)).toMatchObject({action:120,swapAfter:2,target:3});
 expect(matchTiming(false,5)).toMatchObject({prep:40,action:165});
});
