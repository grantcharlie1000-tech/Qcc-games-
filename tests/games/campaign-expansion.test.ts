import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { LEVELS as water } from '../../src/games/water-sort/levels';
import { Session, readSnapshot } from '../../src/games/water-sort/session';
import { LEVEL_COUNT, generateLevel, restoreState } from '../../src/games/block-fill/logic';
import { LEVELS as connect, emptyPaths, restoreSnapshot } from '../../src/games/color-connect/model';

test('appends 50 water puzzles and 20 gardens and connections without replacing old content',()=>{
 expect(water).toHaveLength(77);expect(LEVEL_COUNT).toBe(32);expect(connect).toHaveLength(32);
 const old=JSON.parse(readFileSync(new URL('./campaign-legacy.json',import.meta.url),'utf8'));
 expect(water.slice(0,27)).toEqual(old.water);
 expect(Array.from({length:12},(_,i)=>generateLevel(i))).toEqual(old.fill);
 expect(connect.slice(0,12)).toEqual(old.connect);
});

test('keeps completed legacy campaigns and partial paths when the new levels become available',()=>{
 const s=new Session(26,{'0':{pours:3,assists:0},'26':{pours:18,assists:1}});
 expect(readSnapshot(s.state)).toEqual(s.state);
 const l=generateLevel(11),fill={version:1,level:11,path:l.solution,rewarded:true,steps:35,hints:0,best:{'0':{steps:8,hints:0},'11':{steps:35,hints:0}}};
 expect(restoreState(fill)).toEqual(fill);
 const paths=emptyPaths(connect[11]);paths[0]=[connect[11].pairs[0][0]];
 const snapshot={version:1,level:11,paths,completed:[0,11],moves:1,history:[],assists:0,best:{'0':{moves:3,assists:0}}};
 expect(restoreSnapshot(snapshot)).toEqual(snapshot);
});

test('accepts and resumes the final new level of every campaign',()=>{
 expect(water[76]).toBeDefined();expect(connect[31]).toBeDefined();
 if(water[76]){const s=new Session(76);expect(readSnapshot(s.state)?.level).toBe(76);}
 const l=generateLevel(31);
 expect(restoreState({version:1,level:31,path:[l.start],rewarded:false})?.level).toBe(31);
 if(connect[31])expect(restoreSnapshot({version:1,level:31,paths:emptyPaths(connect[31]),completed:[0,11],moves:0,history:[]})?.level).toBe(31);
});
