import { describe, expect, it } from 'vitest';
import { LEVEL_COUNT, generateLevel, initialState, step, undo, solved, solve, hint, restoreState, sampleSegment } from '../../../src/games/block-fill/logic';

const square = { size: 3, cells: [0,1,2,3,4,5,6,7,8], start: 0, solution: [0,1,2,5,4,3,6,7,8] };
function independentlyValid(cells:number[], size:number, path:number[]) {
  return path.length === cells.length && new Set(path).size === cells.length && path.every((c,i)=>cells.includes(c) && (i===0 || Math.abs(c%size-path[i-1]!%size)+Math.abs(Math.floor(c/size)-Math.floor(path[i-1]!/size))===1));
}
describe('Block Fill path rules',()=>{
  it('rejects diagonal, jump, wall and non-adjacent revisit; permits one-step backtracking',()=>{
    let state = initialState();
    expect(step(square,[0],4)).toEqual([0]);
    expect(step(square,[0],2)).toEqual([0]);
    expect(step({...square,cells:[0,1]},[0],3)).toEqual([0]);
    expect(step(square,[0,1,2,5,4],1)).toEqual([0,1,2,5,4]);
    expect(step(square,[0,1,2],1)).toEqual([0,1]);
    state.path=[0,1]; expect(undo(state.path)).toEqual([0]); expect(undo([0])).toEqual([0]);
  });
  it('wins only after the last square and accepts multiple valid solutions',()=>{
    expect(solved(square,square.solution.slice(0,-1))).toBe(false);
    expect(solved(square,square.solution)).toBe(true);
    expect(solved(square,[0,3,6,7,8,5,4,1,2])).toBe(true);
  });
  it('independently checks every seeded shipped board and solves each from scratch',()=>{
    let previous=0;
    for(let i=0;i<LEVEL_COUNT;i++) {
      const level=generateLevel(i);
      expect(independentlyValid(level.cells,level.size,level.solution)).toBe(true);
      expect(level.start).toBe(level.solution[0]);
      expect(level.cells.length).toBeGreaterThanOrEqual(previous); previous=level.cells.length;
      const found=solve(level,[level.start]);
      expect(found).not.toBeNull(); expect(independentlyValid(level.cells,level.size,found!)).toBe(true);
      expect(generateLevel(i)).toEqual(level);
    }
  });
  it('hints solve the CURRENT path and truthfully request recovery from a dead end',()=>{
    const alternate=[0,3,6]; const h=hint(square,alternate);
    expect(h.kind).toBe('step');
    if(h.kind==='step') { expect(step(square,alternate,h.cell).length).toBe(4); expect(solve(square,[...alternate,h.cell])).not.toBeNull(); }
    const dead=[0,1,4,7];
    expect(solve(square,dead)).toBeNull();
    const recovery=hint(square,dead); expect(recovery.kind).toBe('backtrack');
    if(recovery.kind==='backtrack') {expect(recovery.count).toBeGreaterThan(0); expect(solve(square,dead.slice(0,-recovery.count))).not.toBeNull();}
  });
  it('roundtrips valid snapshots and rejects corrupt, forged completed and incompatible states',()=>{
    const s=initialState(); s.path=generateLevel(0).solution.slice(0,3);
    expect(restoreState(JSON.parse(JSON.stringify(s)))).toEqual(s);
    for(const bad of [null,{}, {...s,version:4},{...s,level:100},{...s,path:[0,8]},{...s,path:[s.path[0],s.path[0]]},{...s,completed:999},{...s,path:[]},{...s,path:[generateLevel(0).start,...new Array(1)]},{...s,path:Object.assign(new Array(2),{0:generateLevel(0).start})}]) expect(restoreState(bad)).toBeNull();
  });
  it('samples a fast pointer segment through every crossed cell without diagonal bridges',()=>{
    expect(sampleSegment({x:.5,y:.5},{x:4.5,y:.5},5)).toEqual([0,1,2,3,4]);
    expect(sampleSegment({x:.5,y:.5},{x:.5,y:4.5},5)).toEqual([0,5,10,15,20]);
    const diagonal=sampleSegment({x:.5,y:.5},{x:2.5,y:2.5},3);
    expect(diagonal).toEqual([0,4,8]); // rules reject these; interpolation does not invent corners.
  });
});

describe('current-prefix search evidence',()=>{
  it('agrees with an independent exhaustive enumerator for every 3x3 prefix',()=>{
    const canFinish=(p:number[]):boolean=>{
      if(p.length===9)return true;
      const h=p[p.length-1]!;
      return [0,1,2,3,4,5,6,7,8].some(c=>!p.includes(c)&&Math.abs(c%3-h%3)+Math.abs(Math.floor(c/3)-Math.floor(h/3))===1&&canFinish([...p,c]));
    };
    const inspect=(p:number[])=>{
      const possible=canFinish(p);expect(solve(square,p)!==null).toBe(possible);
      const result=hint(square,p);
      if(p.length===9)expect(result.kind).toBe('done');
      else if(possible){expect(result.kind).toBe('step');if(result.kind==='step')expect(canFinish([...p,result.cell])).toBe(true);}
      else {expect(result.kind).toBe('backtrack');if(result.kind==='backtrack')expect(canFinish(p.slice(0,-result.count))).toBe(true);}
      const h=p[p.length-1]!;
      for(const c of square.cells)if(!p.includes(c)&&Math.abs(c%3-h%3)+Math.abs(Math.floor(c/3)-Math.floor(h/3))===1)inspect([...p,c]);
    };
    inspect([0]);
  });
  it('provides verified legal hints at every prefix of every shipped witness and restores completed games',()=>{
    for(let i=0;i<LEVEL_COUNT;i++){
      const l=generateLevel(i);
      for(let n=1;n<l.cells.length;n++){
        const p=l.solution.slice(0,n),h=hint(l,p);expect(h.kind).toBe('step');
        if(h.kind==='step'){expect(step(l,p,h.cell).length).toBe(n+1);expect(solve(l,[...p,h.cell])).not.toBeNull();}
      }
      const completed={version:1,level:i,path:l.solution,rewarded:true};expect(restoreState(completed)).toEqual(completed);
    }
  });
});
