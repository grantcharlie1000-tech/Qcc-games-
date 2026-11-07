import {expect,test} from 'vitest';
import {availability,free,type Board} from '../../../src/games/slipline/model';

test('availability ignores an arrow on its own exit ray but keeps overlapping blockers',()=>{
 const board:Board={size:6,arrows:[
  {id:'self',vertices:[[4,2],[1,2]],exitHeading:[1,0]},
  {id:'blocker',vertices:[[3,1],[3,2]],exitHeading:[0,1]},
  {id:'second',vertices:[[3,3],[3,2]],exitHeading:[0,-1]},
 ]};
 const all=['self','blocker','second'],oneBlocker=['self','second'],onlySelf=['self'];
 expect(availability(board,all).get('self')).toBe(false);
 expect(availability(board,oneBlocker).get('self')).toBe(false);
 expect(availability(board,onlySelf).get('self')).toBe(true);
 for(const active of [all,oneBlocker,onlySelf])for(const arrow of board.arrows.filter(a=>active.includes(a.id))){
  expect(availability(board,active).get(arrow.id)).toBe(free(board,arrow,active));
 }
});
