import {describe,expect,it} from 'vitest';
import {getCourse} from '../../../src/games/ball-run/course';
import {DIFFICULTIES,type Gate} from '../../../src/games/ball-run/config';

describe('Ball Run gate windows',()=>{
  it.each(DIFFICULTIES)('returns every overlapping gate in order on %s courses',difficulty=>{
    for(const seed of [1,11,42]){
      const course=getCourse(seed,difficulty),all:Gate[]=[];
      course.forEachGate(0,8000,gate=>all.push(gate));
      expect(all.length).toBeGreaterThan(3);
      expect(all.length).toBe(course.gatesBefore(8000));
      expect(all.map(gate=>gate.index)).toEqual(Array.from({length:all.length},(_,i)=>i));
      for(const gate of all){
        const windows:[[number,number],[number,number],[number,number],[number,number]]=[
          [gate.start,gate.start],[gate.end,gate.end],
          [gate.start-1,gate.end+1],[gate.end+0.001,gate.end+0.002],
        ];
        for(const [from,to] of windows){
          const found:Gate[]=[];
          course.forEachGate(from,to,item=>found.push(item));
          expect(found).toEqual(all.filter(item=>item.start<=to&&item.end>=from));
        }
      }
      for(const [from,to] of [[NaN,100],[-Infinity,100],[Infinity,100],[500,300],[-1,-1],[0,Infinity],[0,-Infinity],[0,NaN],[all[0].start+20,all[0].start+10]]){
        const found:Gate[]=[];
        course.forEachGate(from,to,item=>found.push(item));
        const expected=to>=0&&to<Infinity?all.filter(item=>item.start<=to&&item.end>=from):[];
        expect(found).toEqual(expected);
      }
    }
  });

  it('finds every gate on a first narrow query of a fresh course',()=>{
    const course=getCourse(0x7a19,'hard'),found:Gate[]=[];
    course.forEachGate(0,1200,gate=>found.push(gate));
    expect(found.length).toBeGreaterThan(0);
    expect(found.length).toBe(course.gatesBefore(1200));
    expect(found.map(gate=>gate.index)).toEqual(Array.from({length:found.length},(_,i)=>i));
  });

  it('retains the outer window when a callback generates more course',()=>{
    const course=getCourse(0x51a7e,'medium'),outer:Gate[]=[],all:Gate[]=[];
    let expanded=false;
    course.forEachGate(0,2000,gate=>{
      outer.push(gate);
      if(!expanded){expanded=true;course.forEachGate(0,9000,item=>all.push(item));}
    });
    expect(expanded).toBe(true);
    expect(outer).toEqual(all.filter(gate=>gate.start<=2000&&gate.end>=0));
  });
});
