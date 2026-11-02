// @ts-nocheck -- vendored input preferences are JavaScript.
import {expect,test} from 'vitest';
import Settings from '../../../src/games/strongroom/engine/core/settings.js';
test('browser Escape cannot become an action and remapping swaps occupied keys',()=>{
 const s=new Settings(null,null);
 expect(s.get('crouch')).toBe('c');expect(s.get('use')).toBe('f');expect(s.get('menu')).toBe('p');
 expect(s.rebind('reload','Escape').rejected).toBe(true);
 expect(s.rebind('crouch','r').swappedActionId).toBe('reload');
 expect(s.get('reload')).toBe('c');expect(s.resolveInputKey('r')).toBe('c');
 expect(s.resolveInputKey('Escape')).toBe(null);
});
test('hold/toggle preferences, volume and a keyboard fire binding survive a new mount',()=>{
 const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
 const settings=new Settings(null,storage);settings.setMode('ads','toggle');settings.setMode('walk','toggle');settings.setVolume(.35);settings.rebind('fire','h');
 const restored=new Settings(null,storage);expect(restored.modes.ads).toBe('toggle');expect(restored.modes.walk).toBe('toggle');expect(restored.volume).toBe(.35);expect(restored.get('fire')).toBe('h');expect(restored.setMode('ads','invalid')).toBe(false);
});
