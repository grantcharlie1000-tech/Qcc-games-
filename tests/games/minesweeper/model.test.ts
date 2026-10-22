import {describe,it,expect} from 'vitest';
import {create,reveal,flag,chord,neighbors,restore,score,WIN,LEVELS} from '../../../src/games/minesweeper/model';
import type {Board,Level} from '../../../src/games/minesweeper/model';
// These catch missing/double mines, unsafe placement, wrapping flood edges,
// flag-based false wins, an unsafe chord, and accepting corrupted saves.
describe('seeded Minesweeper rules',()=>{
  for(const level of Object.keys(LEVELS) as Level[]) it(`${level}: delays exact mine count until safe first reveal`,()=>{
    const a=create(level,12345),b=create(level,12345);
    expect(a.cells.filter(x=>x===-1)).toHaveLength(0);
    reveal(a,0);reveal(b,0);
    expect(a.cells).toEqual(b.cells);
    expect(a.cells.filter(x=>x===-1)).toHaveLength(LEVELS[level].mines);
    expect(a.cells[0]).toBe(0);
    expect(neighbors(a,0).every(i=>a.cells[i]!==-1)).toBe(true);
    for(let i=0;i<a.cells.length;i++)if(a.cells[i]!==-1)expect(a.cells[i]).toBe(neighbors(a,i).filter(j=>a.cells[j]===-1).length);
  });
  it('has only real edge and corner neighbors',()=>{
    const b=create();expect(neighbors(b,0)).toEqual([1,9,10]);
    expect(neighbors(b,8)).toEqual([7,16,17]);expect(neighbors(b,40)).toHaveLength(8);
  });
  it('flags do not place mines or reveal cells or win',()=>{
    const b=create();for(let i=0;i<81;i++)flag(b,i);
    expect(b.first).toBeNull();expect(b.status).toBe('ready');expect(b.revealed.some(Boolean)).toBe(false);
    expect(reveal(b,0)).toBe(false);flag(b,0);expect(reveal(b,0)).toBe(true);
    expect(b.status).toBe('playing');expect(flag(b,0)).toBe(false);
  });
  it('floods blank components and numbered boundary without exposing a mine',()=>{
    const b=create('beginner',77);reveal(b,40);
    expect(b.revealed.filter(Boolean).length).toBeGreaterThan(9);
    b.revealed.forEach((open,i)=>{if(open){expect(b.cells[i]).not.toBe(-1);if(b.cells[i]===0)expect(neighbors(b,i).every(j=>b.revealed[j])).toBe(true);}});
  });
  it('wins by uncovering safe cells even with zero flags; stops terminal moves',()=>{
    const b=create('beginner',7);reveal(b,40);b.cells.forEach((v,i)=>{if(v!==-1)reveal(b,i);});
    expect(b.status).toBe('won');expect(b.flags.some(Boolean)).toBe(false);
    expect(flag(b,0)).toBe(false);expect(reveal(b,b.cells.indexOf(-1))).toBe(false);
  });
  function numbered():{b:Board;i:number}{const b=create('beginner',7);reveal(b,40);const i=b.cells.findIndex((n,i)=>n>0&&b.revealed[i]&&neighbors(b,i).some(j=>!b.revealed[j]&&b.cells[j]!==-1));return {b,i};}
  it('correct chord reveals neighboring safe cells only when flag count matches',()=>{
    const {b,i}=numbered();expect(i).toBeGreaterThan(-1);expect(chord(b,i)).toBe(false);
    neighbors(b,i).forEach(j=>{if(b.cells[j]===-1)flag(b,j);});
    expect(chord(b,i)).toBe(true);expect(b.status).not.toBe('lost');
    expect(neighbors(b,i).every(j=>b.revealed[j]||b.flags[j])).toBe(true);
  });
  it('wrong matched flags can detonate a chord',()=>{
    const b=create('beginner',7);reveal(b,40);
    const i=b.cells.findIndex((v,i)=>v>0&&b.revealed[i]&&neighbors(b,i).filter(j=>!b.revealed[j]&&b.cells[j]!==-1).length>=v);
    neighbors(b,i).filter(j=>!b.revealed[j]&&b.cells[j]!==-1).slice(0,b.cells[i]).forEach(j=>flag(b,j));
    expect(chord(b,i)).toBe(true);expect(b.status).toBe('lost');expect(b.cells[b.exploded!]).toBe(-1);
  });
  it('round trips ready, playing, loss and win and independently validates derived cells',()=>{
    const b=create('expert',456);flag(b,10);expect(restore(JSON.parse(JSON.stringify(b)))).toEqual(b);
    reveal(b,80);b.elapsedMs=1234;expect(restore(b)).toEqual(b);
    const bad=structuredClone(b);bad.cells[0]=99;expect(restore(bad)).toBeNull();
    const loss=structuredClone(b);reveal(loss,loss.cells.indexOf(-1));expect(restore(loss)).toEqual(loss);
    b.flags.fill(false);b.cells.forEach((v,i)=>{if(v!==-1)reveal(b,i);});expect(restore(b)).toEqual(b);
  });
  it('rejects malformed snapshots and impossible state',()=>{
    for(const data of [null,{},[],{version:1,level:'oops'}, {...create(),seed:-1}, {...create(),elapsedMs:Infinity}, {...create(),status:'won'}])expect(restore(data)).toBeNull();
    const b=create();reveal(b,40);const bad=structuredClone(b);bad.revealed[bad.cells.indexOf(-1)]=true;expect(restore(bad)).toBeNull();
    expect(reveal(b,-1)).toBe(false);expect(flag(b,500)).toBe(false);
  });
});

describe('placement invariants across the supported fields',()=>{
  it('preserves the seeded mine locations for a reproducible opening',()=>{
    const b=create('beginner',12345);reveal(b,0);
    expect(b.cells.flatMap((v,i)=>v===-1?[i]:[])).toEqual([17,22,31,33,44,60,70,73,75,77]);
    expect(b.cells.slice(0,9)).toEqual([0,0,0,0,0,0,0,1,1]);
  });
  for(const level of Object.keys(LEVELS) as Level[])it(`${level}: protects center and far edge for multiple seeds`,()=>{
    const {width,height,mines}=LEVELS[level],n=width*height;
    const boards=new Set<string>();
    for(const seed of [0,1,42,0xffffffff])for(const start of [n-1,Math.floor(height/2)*width+Math.floor(width/2)]){
      const b=create(level,seed);reveal(b,start);
      expect(b.cells.filter(v=>v===-1)).toHaveLength(mines);expect(b.cells[start]).toBe(0);
      expect(neighbors(b,start).every(j=>b.cells[j]!==-1)).toBe(true);expect(b.revealed[start]).toBe(true);
      boards.add(b.cells.join(','));
    }
    expect(boards.size).toBe(8);
  });
  it('keeps flags on a safe opening hidden until unflagged and revealed',()=>{
    const b=create('beginner',12345);flag(b,1);reveal(b,0);
    expect(b.cells[1]).toBe(0);expect(b.revealed[1]).toBe(false);expect(b.flags[1]).toBe(true);
    flag(b,1);reveal(b,1);expect(b.revealed[1]).toBe(true);
  });
});

it('rejects an impossible loss recorded after all safe cells were already open',()=>{
  const b=create('beginner',7);reveal(b,40);
  b.cells.forEach((v,i)=>{if(v!==-1)b.revealed[i]=true;});
  const mine=b.cells.indexOf(-1);b.revealed[mine]=true;b.exploded=mine;b.status='lost';
  expect(restore(b)).toBeNull();
});

describe('score',()=>{
  const at=(level:Level,ms:number)=>{const b=create(level,9);reveal(b,0);b.cells.forEach((v,i)=>{if(v!==-1)reveal(b,i);});b.elapsedMs=ms;expect(b.status).toBe('won');return score(b);};
  it('scores progress for unfinished and lost fields, below every win',()=>{
    const b=create('expert',9);expect(score(b)).toBe(0);reveal(b,0);const safe=b.revealed.filter(Boolean).length;expect(score(b)).toBe(safe);
    reveal(b,b.cells.indexOf(-1));expect(b.status).toBe('lost');expect(score(b)).toBe(safe);
    const most=LEVELS.expert.width*LEVELS.expert.height-LEVELS.expert.mines-1;expect(most).toBeLessThan(WIN.beginner.base);
  });
  it('ranks wins by level, then time, above the old maxima',()=>{
    expect(at('beginner',30500)).toBe(1000+270*3);expect(at('beginner',29000)).toBeGreaterThan(at('beginner',31000));
    expect(at('beginner',1e7)).toBe(1000);expect(at('intermediate',1e7)).toBe(3000);expect(at('expert',1e7)).toBe(6000);
    expect(at('beginner',0)).toBeLessThan(at('intermediate',1e7));expect(at('intermediate',0)).toBeLessThan(at('expert',1e7));
    expect(at('beginner',1e7)).toBeGreaterThan(910);expect(at('intermediate',1e7)).toBeGreaterThan(2960);expect(at('expert',1e7)).toBeGreaterThan(5790);
    expect(at('expert',0)).toBe(11400);
  });
});
