import {describe,it,expect} from 'vitest';
import {mapDrag,grabCell} from '../../../src/games/color-blocks/input';
import {canPlace,place,createGame} from '../../../src/games/color-blocks/model';
const board={left:31,top:127,width:320,height:320};
describe('drag coordinates shared by preview and release',()=>{
 it('keeps the grabbed cell under the pointer on a translated board',()=>{
  expect(mapDrag(board,{x:171,y:267},{x:1,y:1},'mouse')).toEqual({x:2,y:2,left:111,top:207,cell:40,offsetY:0});
 });
 it('lifts touch footprint above the finger and snaps that exact footprint',()=>{
  const mapped=mapDrag(board,{x:131,y:277},{x:0,y:0},'touch');
  expect(mapped).toEqual({x:2,y:2,left:111,top:207,cell:40,offsetY:50});
  const s={...createGame(1),tray:[5,null,null]};
  expect(canPlace(s.board,5,mapped.x,mapped.y)).toBe(true);
  expect(place(s,0,mapped.x,mapped.y)!.state.board.map((v,i)=>v?i:-1).filter(i=>i>=0)).toEqual([18,19,26,27]);
 });
 it('scales offset and footprint from the actual current board bounds',()=>{
  expect(mapDrag({left:5,top:50,width:160,height:160},{x:75,y:150},{x:1,y:1},'touch')).toEqual({x:2,y:2,left:45,top:94,cell:20,offsetY:26});
 });
 it('does not clamp invalid edges into a legal drop',()=>{
  const s=createGame(1),m=mapDrag(board,{x:351,y:447},{x:0,y:0},'mouse');
  expect(canPlace(s.board,5,m.x,m.y)).toBe(false);expect(m.x).toBe(8);expect(m.y).toBe(8);
 });
 it('picks a real occupied constituent cell when grabbing an empty shape corner',()=>{
  expect(grabCell(9,{left:20,top:30,width:40,height:40},{x:21,y:31})).toEqual({x:1,y:0});
  expect(grabCell(5,{left:20,top:30,width:40,height:40},{x:59,y:69})).toEqual({x:1,y:1});
 });
});
