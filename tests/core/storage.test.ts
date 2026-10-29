import {beforeEach,expect,test,vi} from 'vitest';
import {GAME_IDS} from '../../src/core/types';
import {games} from '../../src/core/catalog';
import {canRetain,probeStorage,flushPending,write,read,recordScore,highScore,savedAt,savedGame,saveGame,toggleFavourite,favourites,settings} from '../../src/core/storage';
beforeEach(()=>{const map=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>map.set(k,v),removeItem:(k:string)=>map.delete(k)});});
test('library contains every registered game including separate Slither.io, Globle and Minecraft',()=>{expect(games).toHaveLength(21);expect(new Set(games.map(g=>g.id))).toEqual(new Set(GAME_IDS));});
test('high scores cannot decrease',()=>{recordScore('snake',21);recordScore('snake',5);expect(highScore('snake')).toBe(21);});
test('versioned progress and favourite toggle round trip',()=>{saveGame('water-sort',{level:4,tubes:[[1,1]]});expect(savedGame('water-sort')).toEqual({level:4,tubes:[[1,1]]});expect(toggleFavourite('pool')).toBe(true);expect(favourites()).toContain('pool');expect(toggleFavourite('pool')).toBe(false);});
test('blocked storage allows memory play and reports retention truthfully',()=>{vi.stubGlobal('localStorage',{getItem(){throw new Error('blocked')},setItem(){throw new Error('blocked')},removeItem(){}});expect(probeStorage()).toBe(false);saveGame('tower',{score:42});expect(savedGame('tower')).toEqual({score:42});expect(canRetain()).toBe(false);});
test('quota failures keep the newest save and best score in memory when older values remain readable',()=>{const map=new Map<string,string>();let full=false;vi.stubGlobal('localStorage',{getItem:(key:string)=>map.get(key)??null,setItem:(key:string,value:string)=>{if(full)throw new Error('quota');map.set(key,value);},removeItem:(key:string)=>map.delete(key)});saveGame('block-fill',{level:2});recordScore('block-fill',10);full=true;saveGame('block-fill',{level:7});recordScore('block-fill',42);expect(savedGame('block-fill')).toEqual({level:7});expect(highScore('block-fill')).toBe(42);expect(canRetain()).toBe(false);});
test('durable save result distinguishes memory fallback and a later successful write',()=>{
 const map=new Map<string,string>();let full=true;
 vi.stubGlobal('localStorage',{getItem:(key:string)=>map.get(key)??null,setItem:(key:string,value:string)=>{if(full)throw new DOMException('full','QuotaExceededError');map.set(key,value);},removeItem:(key:string)=>map.delete(key)});
 expect(saveGame('fruit-merge',{fruit:1})).toBe(false);expect(savedGame('fruit-merge')).toEqual({fruit:1});expect(map.has('pocket-arcade:v1:save:fruit-merge')).toBe(false);
 full=false;expect(saveGame('fruit-merge',{fruit:2})).toBe(true);expect(JSON.parse(map.get('pocket-arcade:v1:save:fruit-merge')!).data).toEqual({fruit:2});
});

test('reload persistence flush retries every pending score, preference, favourite and game key',()=>{
 const map=new Map<string,string>();let full=true;
 vi.stubGlobal('localStorage',{getItem:(key:string)=>map.get(key)??null,setItem:(key:string,value:string)=>{if(full)throw new DOMException('full','QuotaExceededError');map.set(key,value);},removeItem:(key:string)=>map.delete(key)});
 recordScore('fruit-merge',9999);write('settings',{sound:true});write('favourites',['fruit-merge']);saveGame('fruit-merge',{fruit:3});
 expect(flushPending()).toBe(false);full=false;expect(flushPending()).toBe(true);
 expect(JSON.parse(map.get('pocket-arcade:v1:best:fruit-merge')!)).toBe(9999);
 expect(JSON.parse(map.get('pocket-arcade:v1:settings')!)).toEqual({sound:true});expect(JSON.parse(map.get('pocket-arcade:v1:favourites')!)).toEqual(['fruit-merge']);
 expect(JSON.parse(map.get('pocket-arcade:v1:save:fruit-merge')!).data).toEqual({fruit:3});
});

test('auto-next defaults on for legacy settings and preserves an explicit choice',()=>{
 vi.stubGlobal('matchMedia',()=>({matches:false}));write('settings',{sound:true});expect(settings().autoNextEpisode).toBe(true);
 write('settings',{sound:true,autoNextEpisode:false});expect(settings().autoNextEpisode).toBe(false);expect(settings().sound).toBe(true);
});

test('savedAt reports when a game was last saved and ignores unversioned saves',()=>{
 const stamp=vi.spyOn(Date,'now').mockReturnValue(1_700_000_000_000);
 try{
  saveGame('maze-muncher',{dots:3});
  expect(savedAt('maze-muncher')).toBe(1_700_000_000_000);
  expect(savedAt('globle')).toBeUndefined();
  localStorage.setItem('pocket-arcade:v1:save:globle',JSON.stringify({version:2,data:{},updated:5}));
  expect(savedAt('globle')).toBeUndefined();
 }finally{stamp.mockRestore();}
});
