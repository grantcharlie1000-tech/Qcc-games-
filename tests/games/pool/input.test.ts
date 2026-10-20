import {describe,it,expect} from 'vitest';
import {tablePoint,beginDrag,moveDrag,releaseDrag} from '../../../src/games/pool/input';
const cue={x:220,y:600};
describe('direct table input',()=>{
 it('maps a scaled horizontal canvas back to the saved physics coordinates',()=>{
  expect(tablePoint(220,130,{left:100,top:20,width:420,height:220})).toEqual({x:220,y:600});
 });
 it('aiming on the felt never releases a shot',()=>{
  const drag=beginDrag({x:220,y:300},cue,-Math.PI/2,30)!;
  moveDrag(drag,{x:240,y:200},cue);
  expect(releaseDrag(drag)).toBeNull();
 });
 it('pulls opposite the locked aim and releases proportional power',()=>{
  const drag=beginDrag(cue,cue,-Math.PI/2,30)!;
  moveDrag(drag,{x:220,y:660},cue);
  expect(releaseDrag(drag)).toEqual({angle:-Math.PI/2,power:.5});
 });
 it('returning to the cue cancels a loaded shot',()=>{
  const drag=beginDrag(cue,cue,-Math.PI/2,30)!;
  moveDrag(drag,{x:220,y:720},cue);moveDrag(drag,cue,cue);
  expect(releaseDrag(drag)).toBeNull();
 });
 it('cancels near the white ball even when the pull began off centre',()=>{
  const drag=beginDrag({x:220,y:585},cue,-Math.PI/2,50)!;
  moveDrag(drag,{x:220,y:700},cue);moveDrag(drag,cue,cue);
  expect(releaseDrag(drag)).toBeNull();
 });
 it('ignores finger jitter below the screen-scaled deadzone',()=>{
  const drag=beginDrag(cue,cue,-Math.PI/2,50)!;moveDrag(drag,{x:220,y:615},cue);
  expect(releaseDrag(drag)).toBeNull();
 });
 it('rejects the rail and locations outside the playing surface',()=>{
  for(const p of [{x:20,y:600},{x:220,y:820},{x:-2,y:300}])expect(beginDrag(p,cue,0,30)).toBeNull();
 });
 it('does not load power for a forward or sideways drag',()=>{
  for(const p of [{x:220,y:500},{x:300,y:600}]){const d=beginDrag(cue,cue,-Math.PI/2,30)!;moveDrag(d,p,cue);expect(releaseDrag(d)).toBeNull();}
 });
});
