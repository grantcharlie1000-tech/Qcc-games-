import {describe,it,expect} from 'vitest';
import {mergeSaves} from '../../src/accounts/merge';
import {validSave,validSaves,validUsername,validPassword,MAX_KEY_BYTES} from '../../src/accounts/shared';
describe('account save merging and validation',()=>{
 it('keeps maximum best scores, uses newest favourites and uses newest settings and snapshots',()=>{
  const result=mergeSaves({'best:snake':{value:20,updated:1},favourites:{value:['snake'],updated:2},settings:{value:{sound:true},updated:10},'save:snake':{value:{version:1,data:{score:5},updated:5},updated:5}},{'best:snake':{value:10,updated:20},favourites:{value:['tower','snake'],updated:3},settings:{value:{sound:false},updated:9},'save:snake':{value:{version:1,data:{score:9},updated:15},updated:15}});
  expect(result['best:snake'].value).toBe(20);expect(result.favourites.value).toEqual(['tower','snake']);expect(result.settings.value).toEqual({sound:true});expect((result['save:snake'].value as any).data.score).toBe(9);
 });
 it('keeps an unfavourite after both devices sync',()=>{
  const a={favourites:{value:['snake'],updated:1}},removed={favourites:{value:[],updated:2}};
  const server=mergeSaves(a,removed);expect(server.favourites.value).toEqual([]);expect(mergeSaves(a,server).favourites.value).toEqual([]);
 });
 it('does not mutate inputs and breaks timestamp ties consistently',()=>{
  const a={settings:{value:{sound:true},updated:1}},b={settings:{value:{sound:false},updated:1}};
  expect(mergeSaves(a,b)).toEqual(mergeSaves(b,a));expect(a.settings.value.sound).toBe(true);
 });
 it('validates credentials, allowed keys, envelopes, limits and value shapes',()=>{
  expect(validUsername('Ada_1.x-y')).toBe(true);for(const v of ['ab','a b','<Ada>','a'.repeat(25)])expect(validUsername(v)).toBe(false);
  expect(validPassword('12345678')).toBe(true);expect(validPassword('a'.repeat(129))).toBe(false);
  expect(validSaves({'best:snake':{value:0,updated:1}})).toBe(true);
  for(const value of [{email:{value:'x',updated:1}},{settings:{value:{sound:'yes'},updated:1}},{favourites:{value:['unknown'],updated:1}},{'save:snake':{value:{data:{}},updated:1}},{'save:snake':{value:{version:1,data:'x'.repeat(MAX_KEY_BYTES),updated:1},updated:1}},{'best:snake':{value:Infinity,updated:1}},{'save:snake':{value:{version:1,data:{},updated:2},updated:1}}])expect(validSaves(value)).toBe(false);
 });
});

it('accepts only boolean auto-next settings and syncs the newest choice',()=>{
 for(const value of [true,false])expect(validSave('settings',{value:{autoNextEpisode:value},updated:1})).toBe(true);
 for(const value of ['true',1,null,{}])expect(validSave('settings',{value:{autoNextEpisode:value},updated:1})).toBe(false);
 expect(mergeSaves({settings:{value:{autoNextEpisode:true},updated:1}},{settings:{value:{autoNextEpisode:false},updated:2}}).settings.value).toEqual({autoNextEpisode:false});
});
