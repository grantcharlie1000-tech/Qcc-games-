import { describe, expect, it } from 'vitest';
import { AnimalWorld, createAnimal, parseSnapshot } from '../../../src/games/animal-stack/model';
const run = (world: AnimalWorld, frames = 240) => { for (let i = 0; i < frames; i++) world.step(); };
describe('Animal Stack rules and real physics', () => {
  it('keeps preview outside physics and never loses while aiming', () => {
    const w = new AnimalWorld(17); w.aim(0); run(w, 1000);
    expect(w.animals).toHaveLength(0); expect(w.over).toBe(false); expect(w.score).toBe(0); w.dispose();
  });
  it('awards supported animals once and rewards actual height', () => {
    const w = new AnimalWorld(17); expect(w.drop()).toBe(true); expect(w.drop()).toBe(false);
    run(w); expect(w.supportedCount).toBe(1); expect(w.score).toBeGreaterThan(150);
    const score = w.score; run(w, 600); expect(w.score).toBe(score); expect(w.over).toBe(false); w.dispose();
  });
  it('stacks five centered distinct animals without spontaneous energy', () => {
    const w = new AnimalWorld(17);
    for (let i = 0; i < 5; i++) { w.aim(180); expect(w.drop()).toBe(true); run(w, 300); expect(w.over).toBe(false); }
    run(w, 1800); expect(w.supportedCount).toBe(5); expect(w.height).toBeGreaterThan(190);
    expect(Math.max(...w.animals.map(a => a.body.speed))).toBeLessThan(0.5);
    expect(new Set(w.animals.map(a => a.kind)).size).toBeGreaterThan(2); w.dispose();
  });
  it('physically rotates an overhanging animal and ends when it tumbles away', () => {
    const w = new AnimalWorld(17); w.aim(65); w.drop(); run(w, 400);
    expect(Math.abs(w.animals[0].body.angle)).toBeGreaterThan(0.2);
    expect(w.over).toBe(true); expect(w.supportedCount).toBe(0); w.dispose();
  });
  it('uses compound silhouettes with different finite masses', () => {
    const bodies = ['hippo','fox','sheep','turtle','capybara'].map(k => createAnimal(k as 'hippo', 180, 100).body);
    expect(bodies.every(b => b.parts.length > 1 && Number.isFinite(b.inertia))).toBe(true);
    expect(new Set(bodies.map(b => b.mass.toFixed(2))).size).toBeGreaterThan(3);
  });
  it('continues a saved live simulation deterministically', () => {
    const a = new AnimalWorld(123); a.drop(); run(a, 32); const save = a.snapshot();
    const b = new AnimalWorld(1); expect(b.restore(save)).toBe(true); run(a, 240); run(b, 240);
    expect(b.score).toBe(a.score); expect(b.nextKind).toBe(a.nextKind); expect(b.animals[0].body.position.y).toBeCloseTo(a.animals[0].body.position.y, 1);
    a.dispose(); b.dispose();
  });
  it('rejects corrupt snapshots atomically', () => {
    const w = new AnimalWorld(4); w.drop(); const before = w.snapshot();
    for (const bad of [null, {}, {...before, animals:[{kind:'fox',x:NaN}]}, {...before,seed:Infinity}, {...before,complete:true}, {...before,score:9999}, {...before,animals:Array(100).fill(before.animals[0])}]) {
      expect(parseSnapshot(bad)).toBeNull(); expect(w.restore(bad)).toBe(false);
    }
    expect(w.animals).toHaveLength(1); w.dispose();
  });
  it('starts every body clear of the highest existing geometry', () => {
    const w = new AnimalWorld(17); for (let i = 0; i < 4; i++) { w.drop(); run(w, 240); }
    const top = Math.min(...w.animals.map(a => a.body.bounds.min.y)); w.drop();
    expect(w.animals.at(-1)!.body.bounds.max.y).toBeLessThan(top - 25); w.dispose();
  });
  it('replays the seed and queue exactly', () => {
    const a = new AnimalWorld(17), b = new AnimalWorld(17); a.drop(); b.drop(); run(a); run(b);
    expect(a.nextKind).toBe(b.nextKind); expect(a.snapshot()).toEqual(b.snapshot()); a.dispose(); b.dispose();
  });
  it('rejects exact duplicated body records without mutating the run', () => {
    const w=new AnimalWorld(17);w.drop();run(w);const save=w.snapshot();
    const duplicated={...save,score:save.score+100,animals:[save.animals[0],save.animals[0]]};
    expect(parseSnapshot(duplicated)).not.toBeNull();
    expect(w.restore(duplicated)).toBe(false);
    expect(w.animals).toHaveLength(1);expect(w.supportedCount).toBe(1);w.dispose();
  });
  it('caps the population and completes only when forty animals have earned support', () => {
    const w=new AnimalWorld(17);w.drop();run(w);const base=w.snapshot();
    const animals=Array.from({length:40},(_,i)=>({...base.animals[0],y:base.animals[0].y-i*54.1}));
    expect(w.restore({...base,active:null,animals,score:8400,height:2200})).toBe(true);
    expect(w.drop()).toBe(false);expect(w.animals).toHaveLength(40);w.step();expect(w.complete).toBe(true);w.dispose();
  });

  it('lets an off-centre load tip from a supported tower under real gravity', () => {
    const w=new AnimalWorld(17);for(let i=0;i<3;i++){w.aim(180);w.drop();run(w,240);}
    w.aim(230);w.drop();const dropped=w.animals.at(-1)!;let rotation=0;
    for(let i=0;i<300&&!w.over;i++){w.step();rotation=Math.max(rotation,Math.abs(dropped.body.angle));}
    expect(rotation).toBeGreaterThan(0.25);w.dispose();
  });

  it('never counts an airborne newcomer in a different animal height reward', () => {
    const w=new AnimalWorld(17);w.drop();run(w,240);w.drop();const save=w.snapshot();
    save.animals[0].scored=false;save.animals[0].stable=29;save.score=0;save.height=0;
    expect(w.restore(save)).toBe(true);w.step();expect(w.height).toBeLessThan(70);expect(w.score).toBeLessThan(240);w.dispose();
  });

  it('restores the valid seed-4 sixth-drop impact at world tick 1531', () => {
    const original=new AnimalWorld(4);
    for(let i=0;i<5;i++){original.aim(150);expect(original.drop()).toBe(true);run(original,300);}
    original.aim(150);expect(original.drop()).toBe(true);run(original,31);
    const save=original.snapshot();
    expect(save.tick).toBe(1531);expect(save.over).toBe(false);expect(save.score).toBe(980);
    expect(parseSnapshot(save)).not.toBeNull();
    const restored=new AnimalWorld(1);expect(restored.restore(save)).toBe(true);
    expect(restored.snapshot()).toEqual(save);
    run(restored,300);
    expect(restored.animals.every(a=>[a.body.position.x,a.body.position.y,a.body.angle,a.body.velocity.x,a.body.velocity.y].every(Number.isFinite))).toBe(true);
    original.dispose();restored.dispose();
  });

});
