import {describe,expect,it} from 'vitest';
import {AIR,B,blockId,OUTLINE_BOX} from '../../../src/games/blockcraft/data/blocks';
import {stack} from '../../../src/games/blockcraft/data/items';
import {breakTicks,destroyProgress} from '../../../src/games/blockcraft/interact/interaction';
import {createHarness} from './interaction-harness';

const ground={onGround:true,underwater:false};
const ticks=(block:string,tool:string|null,o=ground)=>breakTicks(blockId(block),tool?stack(tool):null,o);

describe('vanilla break times',()=>{
  it('hand: hardness × 1.5 s when harvestable, × 5 when not',()=>{
    expect(ticks('dirt',null)).toBe(15);// 0.75 s
    expect(ticks('oak_log',null)).toBe(60);// 3 s
    expect(ticks('stone',null)).toBe(150);// 7.5 s, no drop
    expect(ticks('obsidian',null)).toBe(5000);// 250 s
  });
  it('matching tools divide by their tier speed',()=>{
    expect(ticks('stone','wooden_pickaxe')).toBe(23);// 1.15 s
    expect(ticks('stone','diamond_pickaxe')).toBe(6);
    expect(ticks('stone','golden_pickaxe')).toBe(4);
    expect(ticks('oak_log','iron_axe')).toBe(10);
    expect(ticks('dirt','stone_shovel')).toBe(4);
    expect(ticks('stone','iron_shovel')).toBe(150);// wrong tool
    expect(ticks('obsidian','diamond_pickaxe')).toBe(188);// 9.4 s
    expect(ticks('obsidian','iron_pickaxe')).toBe(834);// matching tool, too low a tier: ÷ 6, × 5
    expect(ticks('diamond_ore','stone_pickaxe')).toBe(75);// too low a tier
    expect(ticks('diamond_ore','iron_pickaxe')).toBe(15);
  });
  it('shears cut leaves instantly and wool fast; swords cut leaves and gourds 1.5× faster; hoes mine leaves',()=>{
    expect(ticks('oak_leaves','shears')).toBe(0);
    expect(ticks('white_wool','shears')).toBe(5);
    expect(ticks('white_wool',null)).toBe(24);
    expect(ticks('oak_leaves',null)).toBe(6);
    expect(ticks('oak_leaves','iron_sword')).toBe(4);
    expect(ticks('melon','iron_sword')).toBe(20);
    expect(ticks('oak_leaves','diamond_hoe')).toBe(0);
    expect(ticks('moss_block','wooden_hoe')).toBe(2);
  });
  it('× 5 off the ground and × 5 with the head under water',()=>{
    expect(ticks('dirt',null,{onGround:false,underwater:false})).toBe(75);
    expect(ticks('dirt',null,{onGround:true,underwater:true})).toBe(75);
    expect(ticks('dirt',null,{onGround:false,underwater:true})).toBe(375);
  });
  it('instant blocks, unbreakable bedrock',()=>{
    expect(ticks('poppy',null)).toBe(0);expect(ticks('torch',null)).toBe(0);
    expect(ticks('bedrock','diamond_pickaxe')).toBe(Infinity);
    expect(destroyProgress(blockId('bedrock'),null,ground)).toBe(0);
  });
});

describe('mining in the service',()=>{
  it('selection box follows OUTLINE_BOX of the target state',()=>{
    const h=createHarness();h.game.world.set(0,60,-2,blockId('stone_slab'));
    h.aimFace(0,60,-2,0,1,0);h.step();
    expect(h.interaction.target).toMatchObject({x:0,y:60,z:-2,ny:1});
    const b=OUTLINE_BOX[blockId('stone_slab')];
    expect(h.log.selection).toEqual({minX:0,minY:60,minZ:-2,maxX:1,maxY:60+b[4],maxZ:-1});
  });
  it('rays pass over the empty half of a slab and through plants outside their outline',()=>{
    const h=createHarness(),w=h.game.world;w.set(0,61,-2,blockId('stone_slab'));w.set(0,61,-4,B.stone);
    h.lookAt(.5,61.75,-3.5);h.step();
    expect(h.interaction.target).toMatchObject({x:0,y:61,z:-4,nz:1});
    w.set(0,61,-3,B.torch);h.step();
    expect(h.interaction.target).toMatchObject({x:0,y:61,z:-4,nz:1});
  });
  it('holding attack breaks dirt after 15 ticks with cracks, hit sounds, particles, drops and an event',()=>{
    const h=createHarness();h.game.world.set(0,60,-2,B.dirt);h.aimFace(0,60,-2,0,0,1);
    const broken:unknown[]=[];h.game.events.on('blockBroken',e=>broken.push(e));
    h.press('attack');h.down('attack');h.step(14);
    expect(h.game.world.get(0,60,-2)).toBe(B.dirt);
    expect(h.interaction.breaking?.progress).toBeCloseTo(14/15);
    expect(h.log.breaking).toMatchObject({pos:{x:0,y:60,z:-2},stage:9});
    expect(h.sounds().filter(s=>s==='hit:gravel')).toHaveLength(4);
    h.step();
    expect(h.game.world.get(0,60,-2)).toBe(AIR);
    expect(broken).toEqual([{x:0,y:60,z:-2,id:B.dirt,byPlayer:true}]);
    expect(h.ents.drops.map(d=>d.stack)).toEqual([stack('dirt')]);
    expect(h.sounds()).toContain('break:gravel');
    expect(h.log.particles.some(p=>p.kind==='block'&&p.options?.block===B.dirt)).toBe(true);
    expect(h.game.stats.mined).toBe(1);expect(h.surv.exhaustion).toBeCloseTo(.005);
    expect(h.log.breaking.pos).toBeNull();
  });
  it('waits 5 ticks before starting the next block and resets when the target changes',()=>{
    const h=createHarness();h.hold('golden_pickaxe');
    h.game.world.set(0,60,-2,B.stone);h.game.world.set(0,61,-2,B.stone);
    h.aimFace(0,60,-2,0,0,1);h.press('attack');h.down('attack');h.step(4);
    expect(h.game.world.get(0,60,-2)).toBe(AIR);expect(h.inv.damaged).toBe(1);
    // 5 ticks of delay, a start tick, then 4 ticks of progress.
    h.aimFace(0,61,-2,0,0,1);h.step(9);
    expect(h.game.world.get(0,61,-2)).toBe(B.stone);
    h.step();expect(h.game.world.get(0,61,-2)).toBe(AIR);
  });
  it('releasing attack loses the progress',()=>{
    const h=createHarness();h.game.world.set(0,60,-2,B.dirt);h.aimFace(0,60,-2,0,0,1);
    h.press('attack');h.down('attack');h.step(10);h.down('attack',false);h.step();
    expect(h.interaction.breaking).toBeNull();
    h.press('attack');h.down('attack');h.step(10);
    expect(h.game.world.get(0,60,-2)).toBe(B.dirt);
  });
  it('a press shorter than a tick still breaks an instant block',()=>{
    const h=createHarness();h.game.world.set(0,60,-2,blockId('poppy'));h.aimFace(0,60,-2,0,1,0);
    h.press('attack');h.step();
    expect(h.game.world.get(0,60,-2)).toBe(AIR);expect(h.ents.drops[0].stack).toEqual(stack('poppy'));
  });
  it('stone by hand drops nothing; ore xp needs the right pickaxe',()=>{
    const h=createHarness();h.game.world.set(0,60,-2,blockId('cobblestone'));h.aimFace(0,60,-2,0,0,1);
    h.press('attack');h.down('attack');h.step(200);h.down('attack',false);
    expect(h.game.world.get(0,60,-2)).toBe(AIR);expect(h.ents.drops).toEqual([]);
    h.game.world.set(0,60,-2,blockId('diamond_ore'));h.hold('iron_pickaxe');
    // The 5-tick delay after the last mined block still runs out first, then 15 ticks of mining.
    h.press('attack');h.down('attack');h.step(19);expect(h.ents.drops).toEqual([]);h.step();h.down('attack',false);
    expect(h.ents.drops.map(d=>d.stack)).toEqual([stack('diamond')]);
    expect(h.ents.xp[0]).toBeGreaterThanOrEqual(3);
  });
  it('creative breaks on click, repeats every 200 ms while held, drops nothing; swords cannot break',()=>{
    const h=createHarness({mode:'creative'});
    for(let y=60;y<64;y++)h.game.world.set(0,y,-2,B.stone);
    h.aimFace(0,60,-2,0,0,1);h.press('attack');h.down('attack');h.step();
    expect(h.game.world.get(0,60,-2)).toBe(AIR);
    h.aimFace(0,61,-2,0,0,1);h.step(3);expect(h.game.world.get(0,61,-2)).toBe(B.stone);
    h.step();expect(h.game.world.get(0,61,-2)).toBe(AIR);
    expect(h.ents.drops).toEqual([]);expect(h.game.stats.mined).toBe(2);
    h.down('attack',false);h.step();h.hold('diamond_sword');h.aimFace(0,62,-2,0,0,1);h.click('attack');h.step(10);
    expect(h.game.world.get(0,62,-2)).toBe(B.stone);
  });
  it('breaking ice over a solid block leaves water in survival',()=>{
    const h=createHarness();h.game.world.set(0,60,-2,B.ice);h.aimFace(0,60,-2,0,1,0);
    h.press('attack');h.down('attack');h.step(40);
    expect(h.game.world.get(0,60,-2)).toBe(B.water);expect(h.ents.drops).toEqual([]);
  });
  it('breaking either door half removes both and drops one door; beds likewise',()=>{
    const h=createHarness();const w=h.game.world;
    w.set(0,60,-2,blockId('oak_door_lower_closed_south'));w.set(0,61,-2,blockId('oak_door_upper_closed_south'));
    h.hold('iron_axe');h.aimFace(0,61,-2,0,0,1);h.press('attack');h.down('attack');h.step(20);
    expect(w.get(0,60,-2)).toBe(AIR);expect(w.get(0,61,-2)).toBe(AIR);
    expect(h.ents.drops.map(d=>d.stack)).toEqual([stack('oak_door')]);
    // The 5-tick delay after a mined block only counts down while a block is targeted.
    w.set(0,60,-2,blockId('bed_foot_south'));w.set(0,60,-3,blockId('bed_head_south'));
    h.aimFace(0,60,-2,0,1,0);h.step(12);
    expect(w.get(0,60,-3)).toBe(AIR);expect(h.ents.drops.map(d=>d.stack)).toEqual([stack('oak_door'),stack('red_bed')]);
  });
  it('punching a block under fire puts the fire out',()=>{
    const h=createHarness();h.game.world.set(0,60,-2,blockId('fire'));h.aimFace(0,59,-2,0,1,0);
    h.click('attack');
    expect(h.game.world.get(0,60,-2)).toBe(AIR);expect(h.game.world.get(0,59,-2)).toBe(B.stone);expect(h.sounds()).toContain('fizz');
  });
  it('after a swing at air, holding attack mines again once the 10-tick miss lock runs out (vanilla missTime)',()=>{
    const h=createHarness();h.game.world.set(0,60,-2,B.dirt);
    h.lookAt(.5,90,-2);h.press('attack');h.down('attack');h.step();
    expect(h.interaction.target).toBeNull();
    h.aimFace(0,60,-2,0,0,1);
    // 9 more locked ticks, a start tick, then 15 ticks of progress.
    h.step(9);expect(h.interaction.breaking).toBeNull();
    h.step(15);expect(h.game.world.get(0,60,-2)).toBe(B.dirt);
    h.step();expect(h.game.world.get(0,60,-2)).toBe(AIR);
  });
  it('a click during the miss lock is ignored, releasing attack lifts the lock',()=>{
    const h=createHarness();h.game.world.set(0,60,-2,blockId('poppy'));
    // A tick that sees attack released lifts the lock (vanilla continueAttack(false)).
    h.lookAt(.5,90,-2);h.click('attack');h.step();
    h.aimFace(0,60,-2,0,1,0);h.press('attack');h.step();
    expect(h.game.world.get(0,60,-2)).toBe(AIR);
    h.game.world.set(0,60,-2,blockId('poppy'));
    h.lookAt(.5,90,-2);h.press('attack');h.down('attack');h.step();
    h.aimFace(0,60,-2,0,1,0);h.press('attack');h.step();
    expect(h.game.world.get(0,60,-2)).toBe(blockId('poppy'));
  });
  it('changing the held item mid-mine restarts the block with the new tool (vanilla sameDestroyTarget)',()=>{
    const h=createHarness();h.hold('wooden_pickaxe');h.game.world.set(0,60,-2,B.stone);h.aimFace(0,60,-2,0,0,1);
    h.press('attack');h.down('attack');h.step(5);
    expect(h.interaction.breaking?.progress).toBeGreaterThan(.2);
    h.hold('stone_pickaxe');h.step();
    expect(h.interaction.breaking).toMatchObject({x:0,y:60,z:-2,progress:0});
    // Stone pickaxe on stone: 12 ticks of progress after the restart tick.
    h.step(11);expect(h.game.world.get(0,60,-2)).toBe(B.stone);
    h.step();expect(h.game.world.get(0,60,-2)).toBe(AIR);
    expect(h.ents.drops.map(d=>d.stack)).toEqual([stack('cobblestone')]);
  });
  it('the arm swings and the face cracks on every mining tick, including the delay and creative repeat ticks',()=>{
    const h=createHarness({mode:'creative'});const w=h.game.world;w.set(0,60,-2,B.stone);h.aimFace(0,60,-2,0,0,1);
    h.press('attack');h.down('attack');
    for(let i=0;i<20;i++){const before=h.log.swings;h.step();expect(h.log.swings,`tick ${i}`).toBeGreaterThan(before);if(w.get(0,60,-2)===AIR)w.set(0,60,-2,B.stone);}
    expect(h.game.stats.mined).toBe(5);
    const s=createHarness();s.hold('golden_pickaxe');s.game.world.set(0,60,-2,B.stone);s.game.world.set(0,60,-3,B.stone);s.aimFace(0,60,-2,0,0,1);
    s.press('attack');s.down('attack');s.step(4);expect(s.game.world.get(0,60,-2)).toBe(AIR);
    // The 5 delay ticks after the break, aimed at the next block.
    s.aimFace(0,60,-3,0,0,1);
    for(let i=0;i<5;i++){const swings=s.log.swings,cracks=s.log.particles.length;s.step();
      expect(s.log.swings).toBeGreaterThan(swings);expect(s.log.particles.slice(cracks).some(p=>p.kind==='block'&&p.options?.count===1)).toBe(true);}
    expect(s.interaction.breaking).toBeNull();
  });
  it('mining stops when a screen opens',()=>{
    const h=createHarness();h.game.world.set(0,60,-2,B.dirt);h.aimFace(0,60,-2,0,0,1);
    h.press('attack');h.down('attack');h.step(5);h.game.setState('screen');h.step();
    expect(h.interaction.breaking).toBeNull();expect(h.log.breaking.pos).toBeNull();
  });
});
