import {describe,expect,test,beforeEach} from 'vitest';
import {createFakeGame,type FakeGame} from './helpers/fake-game';
import {createAdvancements,type AdvancementsController} from '../../../src/games/blockcraft/ui/advancements';
import {ADVANCEMENTS,ADVANCEMENT_BY_ID,ADVANCEMENT_TABS,BALANCED_DIET_FOODS,HUNTED_MOBS,BREEDABLE_ANIMALS,treeOrder,layoutTab,visibleIds}
  from '../../../src/games/blockcraft/ui/advancements-data';
import {ToastQueue,TOAST_LIFE_MS,TOAST_SLIDE_MS,type ToastView} from '../../../src/games/blockcraft/ui/advancements-toasts';
import {formatDistance,formatTime,statRows} from '../../../src/games/blockcraft/ui/advancements-stats';
import {ITEMS} from '../../../src/games/blockcraft/data/items';
import {blockId,TILE_NAMES} from '../../../src/games/blockcraft/data/blocks';
import type {DamageSource,Entity,EntityCategory,ItemStack} from '../../../src/games/blockcraft/engine/contracts';

let nextId=1;
function mob(kind:string,category:EntityCategory='hostile'):Entity{
  return{id:nextId++,kind,category,x:0,y:64,z:0,vx:0,vy:0,vz:0,yaw:0,pitch:0,headYaw:0,moveX:0,moveZ:0,jump:false,width:.6,height:1.8,
    onGround:true,inWater:false,inLava:false,collidedH:false,collidedV:false,health:0,maxHealth:20,age:0,hurtTime:0,deathTime:1,removed:false,
    fire:0,baby:false,data:{}};
}
const melee:DamageSource={kind:'player',byPlayer:true};
const fall:DamageSource={kind:'fall'};

let game:FakeGame,adv:AdvancementsController;
function setup(){
  game=createFakeGame();adv=createAdvancements(game);game.advancements=adv;adv.init?.();
}
const tick=(n=1)=>game.runTicks(n,[adv]);
function give(id:string,slot=0){game.inventory.setSlot(slot,{id,count:1});tick();}

describe('advancement tree',()=>{
  const required:[string,string][]=[
    ['minecraft','Minecraft'],['stone_age','Stone Age'],['getting_an_upgrade','Getting an Upgrade'],['acquire_hardware','Acquire Hardware'],
    ['suit_up','Suit Up'],['hot_stuff','Hot Stuff'],['isnt_it_iron_pick',"Isn't It Iron Pick"],['diamonds','Diamonds!'],
    ['cover_me_with_diamonds','Cover Me with Diamonds'],['monster_hunter','Monster Hunter'],['sweet_dreams','Sweet Dreams'],
    ['the_parrots_and_the_bats','The Parrots and the Bats'],['a_seedy_place','A Seedy Place'],['bake_bread','Bake Bread'],['hot_topic','Hot Topic'],
    ['getting_wood','Getting Wood'],['benchmarking','Benchmarking'],['time_to_mine','Time to Mine!'],['time_to_strike','Time to Strike!'],
    ['best_friends_forever','Best Friends Forever'],['the_end','The End?'],['sticky_situation','Sticky Situation'],['oh_shiny','Oh Shiny'],
    ['into_the_deep','Into the Deep'],['a_balanced_diet','A Balanced Diet'],['monsters_hunted','Monsters Hunted']];
  test('every advancement of the brief exists with its vanilla title',()=>{
    for(const [id,title] of required)expect(ADVANCEMENT_BY_ID.get(id)?.title,id).toBe(title);
  });
  test('ids are unique, parents exist in the same tab, each tab has one root and there are no cycles',()=>{
    expect(new Set(ADVANCEMENTS.map(a=>a.id)).size).toBe(ADVANCEMENTS.length);
    for(const tab of ADVANCEMENT_TABS){
      const roots=ADVANCEMENTS.filter(a=>a.tab===tab.id&&!a.parent);
      expect(roots.map(r=>r.id)).toEqual([tab.root]);
      expect(TILE_NAMES).toContain(tab.background);expect(ITEMS.has(tab.icon)).toBe(true);
    }
    for(const a of ADVANCEMENTS){
      if(a.parent){const p=ADVANCEMENT_BY_ID.get(a.parent);expect(p,a.id).toBeDefined();expect(p!.tab).toBe(a.tab);}
      const seen=new Set<string>();let at:string|null=a.id;
      while(at){expect(seen.has(at)).toBe(false);seen.add(at);at=ADVANCEMENT_BY_ID.get(at)!.parent;}
      expect(ITEMS.has(a.icon),`${a.id} icon ${a.icon}`).toBe(true);
      expect(a.description.length).toBeGreaterThan(5);
    }
  });
  test('vanilla parents for the story line',()=>{
    const parent=(id:string)=>ADVANCEMENT_BY_ID.get(id)!.parent;
    expect(parent('minecraft')).toBeNull();
    expect(parent('stone_age')).toBe('minecraft');expect(parent('getting_an_upgrade')).toBe('stone_age');
    expect(parent('acquire_hardware')).toBe('getting_an_upgrade');expect(parent('isnt_it_iron_pick')).toBe('acquire_hardware');
    expect(parent('diamonds')).toBe('isnt_it_iron_pick');expect(parent('cover_me_with_diamonds')).toBe('diamonds');
    expect(parent('monsters_hunted')).toBe('monster_hunter');expect(parent('a_balanced_diet')).toBe('a_seedy_place');
  });
  test('counted goals: ten foods out of the edible items, one of every hostile mob',()=>{
    expect(ADVANCEMENT_BY_ID.get('a_balanced_diet')!.count).toEqual({event:'eat',keys:BALANCED_DIET_FOODS,required:10});
    expect(BALANCED_DIET_FOODS).toContain('rotten_flesh');expect(BALANCED_DIET_FOODS).not.toContain('milk_bucket');
    for(const f of BALANCED_DIET_FOODS)expect(ITEMS.get(f)?.food,f).toBeDefined();
    expect([...HUNTED_MOBS].sort()).toEqual(['creeper','drowned','enderman','husk','skeleton','slime','spider','stray','zombie']);
    expect(ADVANCEMENT_BY_ID.get('monsters_hunted')!.count?.required).toBe(HUNTED_MOBS.length);
    expect(ADVANCEMENT_BY_ID.get('monsters_hunted')!.frame).toBe('challenge');
    expect(BREEDABLE_ANIMALS).toEqual(['cow','pig','sheep','chicken','rabbit','wolf']);
  });
  test('tree layout: preorder, children right of their parent, no two nodes share a cell',()=>{
    for(const tab of ADVANCEMENT_TABS){
      const order=treeOrder(tab.id);expect(order[0].id).toBe(tab.root);
      const cells=layoutTab(tab.id),seen=new Set<string>();
      expect(cells.length).toBe(order.length);
      for(const c of cells){
        const key=`${c.x},${c.y}`;expect(seen.has(key),key).toBe(false);seen.add(key);
        const parent=c.def.parent?cells.find(p=>p.def.id===c.def.parent)!:null;
        if(parent)expect(c.x).toBe(parent.x+1);else expect(c.x).toBe(0);
      }
    }
  });
});

describe('visibility (vanilla AdvancementVisibilityEvaluator)',()=>{
  beforeEach(setup);
  const visible=()=>visibleIds(id=>adv.has(id));
  test('a fresh world shows nothing',()=>{
    expect(visible().size).toBe(0);
    for(const tab of ADVANCEMENT_TABS)expect(layoutTab(tab.id,visible())).toEqual([]);
  });
  test('an earned advancement reveals its children and grandchildren, not further',()=>{
    adv.grant('minecraft');
    expect([...visible()].sort()).toEqual(['benchmarking','getting_an_upgrade','getting_wood','into_the_deep','minecraft','stone_age']);
    adv.grant('husbandry');// Husbandry is two levels deep: all of it shows
    expect(ADVANCEMENTS.filter(a=>a.tab==='husbandry').every(a=>visible().has(a.id))).toBe(true);
  });
  test('an earned advancement reveals its ancestors, but not their other children',()=>{
    adv.grant('diamonds');
    expect([...visible()].sort()).toEqual(['acquire_hardware','cover_me_with_diamonds','diamonds','getting_an_upgrade','isnt_it_iron_pick',
      'minecraft','stone_age']);
    expect(visible().has('suit_up')).toBe(false);expect(visible().has('adventure')).toBe(false);
  });
  test('the visible part of a tab lays out as a tree of its own, rooted at the tab root',()=>{
    adv.grant('minecraft');adv.grant('husbandry');
    const v=visible(),cells=layoutTab('minecraft',v);
    expect(cells.map(c=>c.def.id).sort()).toEqual([...v].filter(id=>ADVANCEMENT_BY_ID.get(id)!.tab==='minecraft').sort());
    expect(cells.map(c=>c.def.id)).not.toContain('acquire_hardware');expect(cells.map(c=>c.def.id)).toContain('into_the_deep');
    expect(cells[0].def.id).toBe('minecraft');
    for(const c of cells){
      const parent=c.def.parent?cells.find(p=>p.def.id===c.def.parent):undefined;
      if(c.def.parent)expect(parent,c.def.id).toBeDefined();
      if(parent)expect(c.x).toBe(parent.x+1);
    }
    expect(Math.max(...cells.map(c=>c.y))+1).toBe(cells.filter(c=>!cells.some(k=>k.def.parent===c.def.id)).length);
  });
});

describe('unlocks from the inventory (polled every tick)',()=>{
  beforeEach(setup);
  const cases:[string,string][]=[
    ['crafting_table','minecraft'],['oak_log','getting_wood'],['cherry_log','getting_wood'],['cobblestone','stone_age'],['cobbled_deepslate','stone_age'],
    ['stone_pickaxe','getting_an_upgrade'],['iron_ingot','acquire_hardware'],['lava_bucket','hot_stuff'],['obsidian','ice_bucket_challenge'],
    ['iron_pickaxe','isnt_it_iron_pick'],['diamond','diamonds'],['diamond_boots','cover_me_with_diamonds'],['leather_helmet','suit_up'],
    ['ender_pearl','the_end'],['slime_ball','sticky_situation'],['raw_copper','oh_shiny'],['copper_ingot','oh_shiny']];
  for(const [item,id] of cases)test(`${item} grants ${id}`,()=>{
    expect(adv.has(id)).toBe(false);give(item,7);expect(adv.has(id)).toBe(true);
  });
  test('worn armour and the offhand count too',()=>{
    (game.inventory.armor as (ItemStack|null)[])[1]={id:'iron_chestplate',count:1};tick();
    expect(adv.has('suit_up')).toBe(true);expect(adv.has('cover_me_with_diamonds')).toBe(false);
    (game.inventory as {offhand:ItemStack|null}).offhand={id:'diamond',count:3};tick();expect(adv.has('diamonds')).toBe(true);
  });
  test('unrelated items grant nothing and children never grant parents',()=>{
    give('dirt');give('diamond',1);
    expect(adv.list().filter(a=>a.done).map(a=>a.id)).toEqual(['diamonds']);
  });
});

describe('unlocks from game events',()=>{
  beforeEach(setup);
  const crafted=(id:string,station:'inventory'|'crafting_table'|'furnace'='crafting_table')=>game.events.emit('itemCrafted',{stack:{id,count:1},station});
  test('crafting: benchmarking, time to mine, time to strike, hot topic, bake bread',()=>{
    crafted('crafting_table','inventory');expect(adv.has('benchmarking')).toBe(true);
    crafted('stone_pickaxe');expect(adv.has('time_to_mine')).toBe(true);
    crafted('wooden_sword');expect(adv.has('time_to_strike')).toBe(true);
    crafted('furnace');expect(adv.has('hot_topic')).toBe(true);
    expect(adv.has('bake_bread')).toBe(false);crafted('bread');expect(adv.has('bake_bread')).toBe(true);
    crafted('iron_ingot','furnace');expect(adv.has('acquire_hardware')).toBe(false);// smelting alone is not holding it
  });
  test('Into the Deep: the player mines any deepslate block',()=>{
    game.events.emit('blockBroken',{x:0,y:5,z:0,id:blockId('stone'),byPlayer:true});expect(adv.has('into_the_deep')).toBe(false);
    game.events.emit('blockBroken',{x:0,y:5,z:0,id:blockId('deepslate'),byPlayer:false});expect(adv.has('into_the_deep')).toBe(false);
    game.events.emit('blockBroken',{x:0,y:5,z:0,id:blockId('deepslate_iron_ore'),byPlayer:true});expect(adv.has('into_the_deep')).toBe(true);
  });
  test('A Seedy Place: planting wheat seeds, not carrots',()=>{
    game.events.emit('blockPlaced',{x:0,y:61,z:0,id:blockId('carrots_0')});expect(adv.has('a_seedy_place')).toBe(false);
    game.events.emit('blockPlaced',{x:0,y:61,z:0,id:blockId('wheat_0')});expect(adv.has('a_seedy_place')).toBe(true);
  });
  test('sleeping, breeding, taming and eating',()=>{
    game.events.emit('playerSlept',{});expect(adv.has('sweet_dreams')).toBe(true);
    game.events.emit('animalBred',{kind:'pig',x:0,y:64,z:0});expect(adv.has('the_parrots_and_the_bats')).toBe(true);
    game.events.emit('entityTamed',{entity:mob('wolf','passive')});expect(adv.has('best_friends_forever')).toBe(true);
    expect(adv.has('husbandry')).toBe(false);game.events.emit('itemConsumed',{stack:{id:'milk_bucket',count:1}});expect(adv.has('husbandry')).toBe(true);
  });
  test('Monster Hunter needs a hostile mob killed by the player',()=>{
    game.events.emit('entityDied',{entity:mob('zombie'),source:fall});expect(adv.has('monster_hunter')).toBe(false);
    game.events.emit('entityDied',{entity:mob('cow','passive'),source:melee});
    expect(adv.has('monster_hunter')).toBe(false);expect(adv.has('adventure')).toBe(true);
    game.events.emit('entityDied',{entity:mob('creeper'),source:melee});expect(adv.has('monster_hunter')).toBe(true);
  });
  test('a kill shortly after a player hit counts as the player\'s kill (vanilla 100 ticks)',()=>{
    const spider=mob('spider');
    game.events.emit('entityDamaged',{entity:spider,amount:4,source:melee});tick(40);
    game.events.emit('entityDied',{entity:spider,source:fall});expect(adv.has('monster_hunter')).toBe(true);
    const late=mob('skeleton');game.events.emit('entityDamaged',{entity:late,amount:4,source:melee});tick(101);
    game.events.emit('entityDied',{entity:late,source:fall});expect(adv.progress('monsters_hunted')).toEqual([1,9]);
  });
  test('Take Aim: a player arrow hits something',()=>{
    game.events.emit('entityDamaged',{entity:mob('pig','passive'),amount:6,source:{kind:'projectile',byPlayer:true,projectile:mob('arrow','projectile')}});
    expect(adv.has('take_aim')).toBe(true);
  });
  test('Adventure root: killed by a mob',()=>{
    game.events.emit('playerDamaged',{amount:4,source:{kind:'mob',attacker:mob('zombie')}});
    game.events.emit('playerDied',{message:'Player was slain by Zombie'});
    expect(adv.has('adventure')).toBe(true);
  });
  test('Monsters Hunted tracks one of every hostile kind with progress',()=>{
    for(const kind of ['zombie','zombie','husk','skeleton'])game.events.emit('entityDied',{entity:mob(kind),source:melee});
    expect(adv.progress('monsters_hunted')).toEqual([3,9]);
    expect(adv.list().find(a=>a.id==='monsters_hunted')?.progress).toEqual([3,9]);
    for(const kind of HUNTED_MOBS)game.events.emit('entityDied',{entity:mob(kind),source:melee});
    expect(adv.has('monsters_hunted')).toBe(true);expect(adv.progress('monsters_hunted')).toEqual([9,9]);
  });
  test('A Balanced Diet: ten different foods, duplicates and milk do not count',()=>{
    const eat=(id:string)=>game.events.emit('itemConsumed',{stack:{id,count:1}});
    eat('apple');eat('apple');eat('milk_bucket');eat('bread');
    expect(adv.progress('a_balanced_diet')).toEqual([2,10]);
    for(const f of ['beef','cooked_beef','porkchop','carrot','potato','cookie','rotten_flesh'])eat(f);
    expect(adv.has('a_balanced_diet')).toBe(false);
    eat('spider_eye');expect(adv.has('a_balanced_diet')).toBe(true);
  });
  test('Two by Two: breed every animal kind',()=>{
    for(const kind of BREEDABLE_ANIMALS.slice(0,-1))game.events.emit('animalBred',{kind,x:0,y:0,z:0});
    expect(adv.has('two_by_two')).toBe(false);expect(adv.progress('two_by_two')).toEqual([5,6]);
    game.events.emit('animalBred',{kind:'wolf',x:0,y:0,z:0});expect(adv.has('two_by_two')).toBe(true);
  });
  test('challenges reward 100 experience',()=>{
    let xp=0;game.survival.addXp=p=>{xp+=p;};
    for(const kind of HUNTED_MOBS)game.events.emit('entityDied',{entity:mob(kind),source:melee});
    expect(xp).toBe(100);
  });
  test('grant() and has() ignore unknown ids; granting twice is harmless',()=>{
    adv.grant('nope');expect(adv.has('nope')).toBe(false);expect(adv.toasts.waiting).toHaveLength(0);
    adv.grant('diamonds');adv.grant('diamonds');expect(adv.list().filter(a=>a.done)).toHaveLength(1);
    let xp=0;game.survival.addXp=p=>{xp+=p;};adv.grant('two_by_two');adv.grant('two_by_two');expect(xp).toBe(100);
    expect(adv.toasts.waiting.map(d=>d.id)).toEqual(['diamonds','two_by_two']);
  });
  test('holding an item for many ticks toasts once',()=>{
    give('diamond');tick(40);
    expect(adv.toasts.waiting.map(d=>d.id)).toEqual(['diamonds']);
  });
  test('dispose unsubscribes from events and the inventory',()=>{
    adv.dispose?.();game.events.emit('playerSlept',{});expect(adv.has('sweet_dreams')).toBe(false);
  });
});

describe('toasts',()=>{
  beforeEach(setup);
  test('a grant shows one toast with the toast sound, then it leaves after its lifetime',()=>{
    give('crafting_table');
    expect(adv.toasts.waiting.map(d=>d.id)).toEqual(['minecraft']);
    expect(game.sounds.played.filter(s=>s.name==='toast')).toHaveLength(0);
    adv.frame?.(.016);
    expect(adv.toasts.visible.map(t=>t.def.id)).toEqual(['minecraft']);
    expect(game.sounds.played.filter(s=>s.name==='toast')).toHaveLength(1);
    const gone=TOAST_SLIDE_MS+TOAST_LIFE_MS+TOAST_SLIDE_MS;// vanilla: 0.6 s in, 5 s fully shown, 0.6 s out
    for(let t=0;t<(gone-200)/100;t++)adv.frame?.(.1);
    expect(adv.toasts.visible).toHaveLength(1);
    for(let t=0;t<3;t++)adv.frame?.(.1);
    expect(adv.toasts.visible).toHaveLength(0);
    expect(game.sounds.played.filter(s=>s.name==='toast')).toHaveLength(1);
  });
  test('the queue keeps slots stable and fills free slots in order',()=>{
    const shown:string[][]=[],view:ToastView={capacity:()=>2,show(){},place(){},hide(){}};
    const q=new ToastQueue(defs=>shown.push(defs.map(d=>d.id)));
    for(const id of ['minecraft','stone_age','diamonds'])q.push(ADVANCEMENT_BY_ID.get(id)!);
    q.update(16,view,false);
    expect(shown).toEqual([['minecraft','stone_age']]);expect(q.visible.map(t=>t.slot)).toEqual([0,1]);
    q.update(TOAST_SLIDE_MS+TOAST_LIFE_MS+TOAST_SLIDE_MS,view,false);
    q.update(16,view,false);
    expect(shown[1]).toEqual(['diamonds']);expect(q.visible[0].slot).toBe(0);
  });
  test('vanilla timing: the 5 s display starts once the 600 ms slide-in ends, then a 600 ms slide-out',()=>{
    expect([TOAST_SLIDE_MS,TOAST_LIFE_MS]).toEqual([600,5000]);
    const slides:number[]=[],view:ToastView={capacity:()=>5,show(){},place(_t,s){slides.push(s);},hide(){}};
    const q=new ToastQueue(()=>{});q.push(ADVANCEMENT_BY_ID.get('minecraft')!);
    q.update(0,view,false);q.update(5590,view,false);expect(slides.at(-1)).toBe(1);
    q.update(310,view,false);expect(slides.at(-1)).toBeGreaterThan(0);expect(slides.at(-1)).toBeLessThan(1);expect(q.visible).toHaveLength(1);
    q.update(299,view,false);expect(q.visible).toHaveLength(1);
    q.update(1,view,false);expect(q.visible).toHaveLength(0);
    const r=new ToastQueue(()=>{});r.push(ADVANCEMENT_BY_ID.get('minecraft')!);
    r.update(0,view,true);r.update(5599,view,true);expect(r.visible).toHaveLength(1);
    r.update(1,view,true);expect(r.visible).toHaveLength(0);// reduced motion: in place for the same 5.6 s
  });
  test('the layout height is read only when a toast waits for a slot',()=>{
    let reads=0;const view:ToastView={capacity:()=>{reads++;return 5;},show(){},place(){},hide(){}};
    const q=new ToastQueue(()=>{});q.push(ADVANCEMENT_BY_ID.get('minecraft')!);
    q.update(16,view,false);expect(reads).toBe(1);expect(q.visible).toHaveLength(1);
    for(let i=0;i<50;i++)q.update(16,view,false);
    expect(reads).toBe(1);
    q.push(ADVANCEMENT_BY_ID.get('stone_age')!);q.update(16,view,false);expect(reads).toBe(2);expect(q.visible).toHaveLength(2);
  });
  test('slide in and out eases over 600 ms, or not at all with reduced motion',()=>{
    const slides:number[]=[],view:ToastView={capacity:()=>5,show(){},place(_t,s){slides.push(s);},hide(){}};
    const q=new ToastQueue(()=>{});q.push(ADVANCEMENT_BY_ID.get('minecraft')!);
    q.update(0,view,false);q.update(300,view,false);q.update(300,view,false);
    expect(slides[0]).toBe(0);expect(slides[1]).toBeGreaterThan(.5);expect(slides[1]).toBeLessThan(1);expect(slides[2]).toBe(1);
    const rm:number[]=[],still:ToastView={...view,place(_t,s){rm.push(s);}};
    const r=new ToastQueue(()=>{});r.push(ADVANCEMENT_BY_ID.get('minecraft')!);
    r.update(0,still,true);r.update(TOAST_LIFE_MS-100,still,true);
    expect(rm.every(s=>s===1)).toBe(true);
  });
  test('restored advancements and reset do not toast',()=>{
    give('crafting_table');const saved=adv.serialize?.();
    const other=createAdvancements(game);other.init?.();other.reset?.();other.restore?.(saved);
    expect(other.has('minecraft')).toBe(true);expect(other.toasts.waiting).toHaveLength(0);
    adv.reset?.();expect(adv.toasts.waiting).toHaveLength(0);expect(adv.has('minecraft')).toBe(false);
    other.dispose?.();
  });
});

describe('statistics',()=>{
  beforeEach(setup);
  test('counters from events',()=>{
    game.events.emit('blockBroken',{x:0,y:0,z:0,id:blockId('stone'),byPlayer:true});
    game.events.emit('blockBroken',{x:0,y:0,z:0,id:blockId('oak_log'),byPlayer:true});
    game.events.emit('blockBroken',{x:0,y:0,z:0,id:blockId('stone'),byPlayer:false});
    game.events.emit('blockPlaced',{x:0,y:0,z:0,id:blockId('cobblestone')});
    game.events.emit('itemCrafted',{stack:{id:'oak_planks',count:4},station:'inventory'});
    game.events.emit('itemCrafted',{stack:{id:'stick',count:4},station:'inventory'});
    game.events.emit('entityDied',{entity:mob('zombie'),source:melee});
    game.events.emit('entityDied',{entity:mob('item','item'),source:melee});
    game.events.emit('playerDied',{message:'x'});
    game.events.emit('entityDamaged',{entity:mob('cow','passive'),amount:2.5,source:melee});
    game.events.emit('playerDamaged',{amount:3,source:fall});
    const s=adv.statistics();
    expect([s.mined,s.placed,s.crafted,s.kills,s.deaths]).toEqual([2,1,8,1,1]);
    expect(s.minedBy).toEqual({stone:1,oak_log:1});expect(s.craftedBy).toEqual({oak_planks:4,stick:4});expect(s.killedBy).toEqual({zombie:1});
    expect(s.damageDealt).toBe(25);expect(s.damageTaken).toBe(30);
  });
  test('distance walked, sprinted, crouched, swum, flown and fallen from player movement',()=>{
    const p=game.player.state;p.onGround=true;tick();
    p.x+=3;tick();expect(adv.statistics().walk).toBe(300);
    p.sprinting=true;p.z+=4;tick();expect(adv.statistics().sprint).toBe(400);p.sprinting=false;
    p.sneaking=true;p.x+=.5;tick();expect(adv.statistics().crouch).toBe(50);p.sneaking=false;
    p.onGround=false;p.inWater=p.headInWater=p.swimming=true;p.x+=1;p.y-=1;tick();expect(adv.statistics().swim).toBe(141);
    p.inWater=p.headInWater=p.swimming=false;
    p.flying=true;p.x+=2;p.y+=5;tick();expect(adv.statistics().fly).toBe(200);p.flying=false;
    p.fallDistance=4.5;p.y-=4.5;tick();p.onGround=true;p.fallDistance=0;tick();expect(adv.statistics().fall).toBe(450);
    p.x+=500;tick();expect(adv.statistics().walk).toBe(300);// teleports are not walking
  });
  test('vanilla movement branches: wading and walking under water, ladders, slow airborne drift',()=>{
    const p=game.player.state;p.onGround=true;tick();
    p.inWater=true;p.x+=3;p.y+=.2;tick();
    let s=adv.statistics();expect([s.walk,s.swim,s.walkOnWater,s.walkUnderWater]).toEqual([0,0,300,0]);
    p.headInWater=true;p.x+=1;p.y-=1;tick();
    s=adv.statistics();expect([s.walk,s.swim,s.walkOnWater,s.walkUnderWater]).toEqual([0,0,300,141]);
    p.inWater=p.headInWater=false;p.onLadder=true;p.x+=.5;tick();p.y+=2;tick();p.y-=1;tick();
    s=adv.statistics();expect([s.climb,s.walk,s.fly]).toEqual([200,0,0]);p.onLadder=false;
    p.onGround=false;for(let i=0;i<20;i++){p.x+=.1;tick();}
    expect(adv.statistics().fly).toBe(0);// vanilla counts airborne travel only above 25 cm a tick
    p.flying=true;for(let i=0;i<20;i++){p.x+=.1;tick();}expect(adv.statistics().fly).toBe(0);
    p.x+=.3;tick();expect(adv.statistics().fly).toBe(30);
    const labels=statRows(adv.statistics()).map(r=>r.label);
    expect(labels).toContain('Distance Walked on Water');expect(labels).toContain('Distance Walked under Water');
  });
  test('falls do not count for players who can fly (creative)',()=>{
    const p=game.player.state;game.settings.mode='creative';p.onGround=false;tick();
    p.fallDistance=6;p.y-=6;tick();p.onGround=true;p.fallDistance=0;tick();expect(adv.statistics().fall).toBe(0);
    game.settings.mode='survival';p.onGround=false;tick();p.fallDistance=3;p.y-=3;tick();p.onGround=true;p.fallDistance=0;tick();
    expect(adv.statistics().fall).toBe(300);
  });
  test('Damage Dealt counts the player\'s melee hits on mobs, up to the health the mob had',()=>{
    const tnt:DamageSource={kind:'explosion',byPlayer:true};
    const arrow:DamageSource={kind:'projectile',byPlayer:true,projectile:mob('arrow','projectile')};
    game.events.emit('entityDamaged',{entity:mob('item','item'),amount:57,source:tnt});
    game.events.emit('entityDamaged',{entity:mob('xp_orb','xp'),amount:57,source:tnt});
    game.events.emit('entityDamaged',{entity:mob('item','item'),amount:2,source:arrow});
    expect(adv.statistics().damageDealt).toBe(0);expect(adv.has('take_aim')).toBe(false);
    game.events.emit('entityDamaged',{entity:{...mob('pig','passive'),health:4},amount:6,source:arrow});
    expect(adv.statistics().damageDealt).toBe(0);expect(adv.has('take_aim')).toBe(true);
    game.events.emit('entityDamaged',{entity:{...mob('zombie'),health:-3},amount:7,source:melee});// 4 health left before the hit
    expect(adv.statistics().damageDealt).toBe(40);
    const creeper=mob('creeper');game.events.emit('entityDamaged',{entity:creeper,amount:57,source:tnt});
    game.events.emit('entityDied',{entity:creeper,source:fall});// TNT the player lit still credits the kill
    expect(adv.statistics().kills).toBe(1);expect(adv.statistics().damageDealt).toBe(40);
  });
  test('days survived include slept nights; time since last death counts only played ticks; a death resets both',()=>{
    tick(14000);expect(adv.statistics().daysSurvived).toBe(0);
    game.events.emit('timeSkipped',{from:13000,to:0});
    expect(adv.statistics().daysSurvived).toBe(1);expect(adv.statistics().sinceDeath).toBe(14000);
    game.events.emit('playerDied',{message:'x'});
    expect(adv.statistics().daysSurvived).toBe(0);expect(adv.statistics().sinceDeath).toBe(0);
    expect(adv.statistics().playTime).toBe(14000);
  });
  test('formatting like the vanilla statistics screen',()=>{
    expect(formatDistance(30)).toBe('30 cm');expect(formatDistance(1234)).toBe('12.34 m');expect(formatDistance(123456)).toBe('1.23 km');
    expect(formatTime(20*30)).toBe('30.0 s');expect(formatTime(20*60*5)).toBe('5.00 min');expect(formatTime(20*3600*2)).toBe('2.00 h');
    const rows=statRows(adv.statistics());
    for(const label of ['Blocks Mined','Blocks Placed','Mobs Killed','Deaths','Distance Walked','Days Survived','Items Crafted'])
      expect(rows.map(r=>r.label)).toContain(label);
  });
});

describe('persistence',()=>{
  beforeEach(setup);
  test('serialize and restore round-trip advancements, progress and statistics',()=>{
    give('crafting_table');give('diamond',2);
    game.events.emit('itemConsumed',{stack:{id:'apple',count:1}});
    game.events.emit('entityDied',{entity:mob('zombie'),source:melee});
    game.events.emit('blockBroken',{x:0,y:0,z:0,id:blockId('stone'),byPlayer:true});
    game.player.state.onGround=true;tick();game.player.state.x+=2;tick();
    const data=JSON.parse(JSON.stringify(adv.serialize?.()));
    const copy=createAdvancements(game);copy.reset?.();copy.restore?.(data);
    expect(copy.list()).toEqual(adv.list());
    expect(copy.statistics()).toEqual(adv.statistics());
    copy.dispose?.();
  });
  test('restore ignores invalid data and never throws',()=>{
    for(const bad of [null,undefined,42,'x',[],{v:99},{done:'x'},{done:{diamonds:-1,nope:1,stone_age:'x'}},
      {progress:{a_balanced_diet:['apple','apple','stone',7],nope:['x'],monsters_hunted:'zombie'}},
      {stats:{walk:-5,mined:1.5,kills:'3',deaths:2,playTime:Infinity},minedBy:{stone:2,nope:3,dirt:-1},craftedBy:{stick:'2',fake_item:1},killedBy:{zombie:1,dragon:4}}]){
      adv.reset?.();expect(()=>adv.restore?.(bad)).not.toThrow();
    }
    const s=adv.statistics();
    expect(s.walk).toBe(0);expect(s.mined).toBe(0);expect(s.kills).toBe(0);expect(s.deaths).toBe(2);expect(s.playTime).toBe(0);
    expect(s.minedBy).toEqual({stone:2});expect(s.craftedBy).toEqual({});expect(s.killedBy).toEqual({zombie:1});
    adv.reset?.();adv.restore?.({done:{diamonds:3,nope:1,stone_age:'x'},progress:{a_balanced_diet:['apple','apple','stone',7]}});
    expect(adv.list().filter(a=>a.done).map(a=>a.id)).toEqual(['diamonds']);
    expect(adv.progress('a_balanced_diet')).toEqual([1,10]);
  });
  test('a restored counted goal that is already complete is granted silently',()=>{
    let xp=0;game.survival.addXp=p=>{xp+=p;};
    adv.reset?.();adv.restore?.({v:1,progress:{monsters_hunted:[...HUNTED_MOBS]}});
    expect(adv.has('monsters_hunted')).toBe(true);expect(adv.toasts.waiting).toHaveLength(0);expect(xp).toBe(0);
  });
  test('a save without the survived counter keeps its days survived',()=>{
    adv.reset?.();adv.restore?.({v:1,stats:{sinceDeath:30000}});
    expect(adv.statistics().daysSurvived).toBe(1);expect(adv.statistics().sinceDeath).toBe(30000);
    adv.reset?.();adv.restore?.({v:1,stats:{sinceDeath:30000,survived:50000}});expect(adv.statistics().daysSurvived).toBe(2);
  });
  test('reset clears everything',()=>{
    give('diamond');game.events.emit('playerDied',{message:'x'});
    adv.reset?.();
    expect(adv.list().some(a=>a.done)).toBe(false);expect(adv.statistics().deaths).toBe(0);
  });
});
