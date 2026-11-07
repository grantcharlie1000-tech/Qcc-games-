import { beforeEach, expect, it, vi } from 'vitest';
import { hintFor } from '../../../src/games/water-sort/hint';
import { solve } from '../../../src/games/water-sort/solver';
vi.mock('../../../src/games/water-sort/solver', () => ({ solve: vi.fn() }));
const search=vi.mocked(solve);
const board=[[0,1],[1],[0],[]];
beforeEach(()=>search.mockReset());

it('chooses the newest successful historical route after current search finds none within its budget',()=>{
  search.mockReturnValueOnce(null).mockReturnValueOnce(null).mockReturnValueOnce([[0,1]]);
  expect(hintFor({tubes:board,history:[board,board,board]})).toEqual({kind:'undo',steps:2});
  expect(search).toHaveBeenCalledTimes(3);
});
it('preserves an empty historical path as a successful recovery',()=>{
  search.mockReturnValueOnce(null).mockReturnValueOnce([]);
  expect(hintFor({tubes:board,history:[board]})).toEqual({kind:'undo',steps:1});
});
it('preserves the finite full-history fallback even when all searches return null',()=>{
  search.mockReturnValue(null);
  expect(hintFor({tubes:board,history:Array.from({length:5000},()=>board)}))
    .toEqual({kind:'undo',steps:5000});
  expect(search).toHaveBeenCalledTimes(5001);
});
it('keeps the legacy zero-history fallback without claiming impossibility',()=>{
  search.mockReturnValue(null);
  expect(hintFor({tubes:board,history:[]})).toEqual({kind:'undo',steps:0});
});
