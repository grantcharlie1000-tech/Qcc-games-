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
