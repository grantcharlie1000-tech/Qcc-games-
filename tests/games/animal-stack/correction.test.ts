import Matter from 'matter-js';
import { describe, expect, it } from 'vitest';
import { createAnimal, KINDS, AnimalWorld } from '../../../src/games/animal-stack/model';
const inside=(kind:typeof KINDS[number],x:number,y:number)=>{const a=createAnimal(kind,0,0);return Matter.Query.point(a.body.parts.slice(1),{x:x+a.offset.x,y:y+a.offset.y}).length>0;};
describe('corrected animal cutouts',()=>{
 it('retains distinct species and the approved relative scales',()=>{expect(KINDS.slice(0,6)).toEqual(['elephant','giraffe','horse','tapir','penguin','sloth']);expect(new Set(KINDS).size).toBe(24);const e=createAnimal('elephant',0,0).body,g=createAnimal('giraffe',0,0).body,p=createAnimal('penguin',0,0).body;expect(g.bounds.max.y-g.bounds.min.y).toBeGreaterThan((e.bounds.max.y-e.bounds.min.y)*1.45);expect(e.area).toBeGreaterThan(p.area*1.8);});
 it('keeps elephant legs and trunk physical with air in between',()=>{expect(inside('elephant',-39,25)).toBe(true);expect(inside('elephant',10,28)).toBe(true);expect(inside('elephant',-28,27)).toBe(false);expect(inside('elephant',0,28)).toBe(false);});
 it('keeps giraffe neck and projecting legs physical, leg gaps empty',()=>{expect(inside('giraffe',-27,-34)).toBe(true);expect(inside('giraffe',-30,46)).toBe(true);expect(inside('giraffe',-18,44)).toBe(false);expect(inside('giraffe',14,42)).toBe(false);});
 it('keeps horse, tapir and sloth major limb recesses empty',()=>{expect(inside('horse',-41,39)).toBe(true);expect(inside('horse',0,30)).toBe(false);expect(inside('tapir',-28,30)).toBe(true);expect(inside('tapir',-15,30)).toBe(false);expect(inside('sloth',-41,24)).toBe(true);expect(inside('sloth',0,25)).toBe(false);});
 it('rotates the waiting pose and releases that complete rigid body',()=>{const w=new AnimalWorld();w.rotateBy(Math.PI/2);const y=w.spawnY;w.aim(240);expect(w.spawnY).toBe(y);expect(w.drop()).toBe(true);expect(w.animals[0].body.angle).toBeCloseTo(Math.PI/2);w.dispose();});
});
