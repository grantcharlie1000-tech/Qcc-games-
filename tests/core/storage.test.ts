import {beforeEach,expect,test,vi} from 'vitest';
import {GAME_IDS} from '../../src/core/types';
import {games} from '../../src/core/catalog';
import {canRetain,probeStorage,recordScore,highScore,savedGame,saveGame,toggleFavourite,favourites} from '../../src/core/storage';
beforeEach(()=>{const map=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>map.set(k,v),removeItem:(k:string)=>map.delete(k)});});
test('library contains exactly the twelve approved games',()=>{expect(games).toHaveLength(12);expect(new Set(games.map(g=>g.id))).toEqual(new Set(GAME_IDS));});
test('high scores cannot decrease',()=>{recordScore('snake',21);recordScore('snake',5);expect(highScore('snake')).toBe(21);});
test('versioned progress and favourite toggle round trip',()=>{saveGame('water-sort',{level:4,tubes:[[1,1]]});expect(savedGame('water-sort')).toEqual({level:4,tubes:[[1,1]]});expect(toggleFavourite('pool')).toBe(true);expect(favourites()).toContain('pool');expect(toggleFavourite('pool')).toBe(false);});
test('blocked storage allows memory play and reports retention truthfully',()=>{vi.stubGlobal('localStorage',{getItem(){throw new Error('blocked')},setItem(){throw new Error('blocked')},removeItem(){}});expect(probeStorage()).toBe(false);saveGame('tower',{score:42});expect(savedGame('tower')).toEqual({score:42});expect(canRetain()).toBe(false);});
