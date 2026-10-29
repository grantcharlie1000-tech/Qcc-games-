import {expect,test} from 'vitest';
import {railEdges,scrollStep,updateRails} from '../../src/ui/rails';

test('railEdges offers prev only after scrolling and next only before the end',()=>{
  expect(railEdges({scrollLeft:0,clientWidth:300,scrollWidth:900})).toEqual({canPrev:false,canNext:true});
  expect(railEdges({scrollLeft:300,clientWidth:300,scrollWidth:900})).toEqual({canPrev:true,canNext:true});
  expect(railEdges({scrollLeft:600,clientWidth:300,scrollWidth:900})).toEqual({canPrev:true,canNext:false});
  expect(railEdges({scrollLeft:0,clientWidth:900,scrollWidth:900})).toEqual({canPrev:false,canNext:false});
});

test('a row resting on its 4 px padding has nowhere to go back',()=>{
  // Snapping rests the first card on the row's leading padding, so 4 px is the start, not movement.
  expect(railEdges({scrollLeft:4,clientWidth:300,scrollWidth:900}).canPrev).toBe(false);
  expect(railEdges({scrollLeft:6,clientWidth:300,scrollWidth:900}).canPrev).toBe(true);
});

test('a sub-pixel scroll offset does not count as movement',()=>{
  expect(railEdges({scrollLeft:0.5,clientWidth:300,scrollWidth:900}).canPrev).toBe(false);
  expect(railEdges({scrollLeft:599.5,clientWidth:300,scrollWidth:900}).canNext).toBe(false);
});

test('each arrow scrolls three quarters of the visible row',()=>{
  expect(scrollStep({clientWidth:400},1)).toBe(300);
  expect(scrollStep({clientWidth:400},-1)).toBe(-300);
});

test('updateRails sets the arrow flags on every rail from its own row',()=>{
  // Fake objects: a rail has a dataset and finds its row; a rail without a row gets both flags false.
  const rail=(row?:{scrollLeft:number;clientWidth:number;scrollWidth:number})=>({dataset:{} as Record<string,string>,querySelector:()=>row??null});
  const scrolled=rail({scrollLeft:300,clientWidth:300,scrollWidth:900});
  const empty=rail();
  const root={querySelectorAll:()=>[scrolled,empty]} as unknown as ParentNode;
  updateRails(root);
  expect(scrolled.dataset).toEqual({canPrev:'true',canNext:'true'});
  expect(empty.dataset).toEqual({canPrev:'false',canNext:'false'});
});
