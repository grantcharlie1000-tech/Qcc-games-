import {describe,it,expect} from 'vitest';
import {AnimalGesture} from '../../../src/games/animal-stack/input';
describe('waiting animal pointer state',()=>{
 it('distinguishes a short tap from a horizontal drag without a drop action',()=>{const g=new AnimalGesture();g.begin(1,100,200,180);expect(g.end(1,103,202)).toBe(true);g.begin(2,100,200,180);expect(g.move(2,140,240)).toBe(220);expect(g.end(2,140,240)).toBe(false);expect(g.pointer).toBeNull();});
 it('does not reclassify a drag returned to its origin as a tap',()=>{const g=new AnimalGesture();g.begin(1,0,0,180);g.move(1,30,0);expect(g.end(1,0,0)).toBe(false);});
 it('does not treat a stationary long press as a short tap',()=>{const g=new AnimalGesture();g.begin(1,0,0,180,100);expect(g.end(1,0,0,1000)).toBe(false);});
 it('ignores secondary pointers and interrupted releases',()=>{const g=new AnimalGesture();expect(g.begin(1,0,0,180)).toBe(true);expect(g.begin(2,0,0,180)).toBe(false);expect(g.move(2,50,50)).toBeNull();g.clear();expect(g.end(1,0,0)).toBe(false);expect(g.pointer).toBeNull();});
});
