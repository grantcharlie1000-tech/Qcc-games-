// Advancement tree (DOM-free data). Three tabs like the Java Edition advancement screen: Minecraft (the story line),
// Adventure and Husbandry. Titles, descriptions, parents, frames and rewards follow Java 1.20/1.21; the legacy
// achievements the brief asks for (Getting Wood, Benchmarking, Time to Mine!, Hot Topic, Bake Bread, Time to Strike!)
// and the adapted goals (The End?, Sticky Situation, Oh Shiny, Into the Deep) sit where they fit the progression.
import {ITEMS,type ItemId} from '../data/items';
import {BLOCKS,WOOD_TYPES} from '../data/blocks';

export type AdvancementTabId='minecraft'|'adventure'|'husbandry';
/** Frame shape: task (square), goal (rounded) or challenge (spiky; "Challenge Complete!"). */
export type AdvancementFrame='task'|'goal'|'challenge';
/** Events a counted goal listens to: foods eaten, mob kinds killed by the player, animal kinds bred. */
export type CountedEvent='eat'|'kill'|'breed';
/** How an advancement is earned. Inventory items are polled every tick (slots, armour and offhand). */
export type Criterion=
  |{kind:'item';items:readonly ItemId[]}
  |{kind:'crafted';items:readonly ItemId[]}
  |{kind:'mined';families:readonly string[]}
  |{kind:'placed';families:readonly string[]}
  |{kind:'event';event:'slept'|'bred'|'tamed'|'consumed'|'arrow_hit'|'kill_any'|'kill_hostile'|'killed_by_mob'}
  |{kind:'counted'};
export interface AdvancementDef{
  readonly id:string;readonly title:string;readonly description:string;readonly icon:ItemId;
  readonly parent:string|null;readonly tab:AdvancementTabId;readonly frame:AdvancementFrame;
  /** Alternative ways to earn it (any one). */
  readonly criteria:readonly Criterion[];
  /** Counted goals: distinct keys collected from an event stream; done at `required`. */
  readonly count?:{readonly event:CountedEvent;readonly keys:readonly string[];readonly required:number};
  /** Experience points rewarded (vanilla challenges give 100). */
  readonly xp?:number;
}
export interface AdvancementTab{readonly id:AdvancementTabId;readonly title:string;readonly root:string;readonly icon:ItemId;
  /** Block tile painted behind the tree. */
  readonly background:string}

const WOOD_LOGS=WOOD_TYPES.map(w=>`${w}_log`);
const ARMOUR=[...ITEMS.values()].filter(d=>d.armor).map(d=>d.id);
const DIAMOND_ARMOUR=[...ITEMS.values()].filter(d=>d.armor?.material==='diamond').map(d=>d.id);
const DEEPSLATE=[...new Set(BLOCKS.map(b=>b.family).filter(f=>f==='deepslate'||f==='cobbled_deepslate'||f.startsWith('deepslate_')))];
/** Every food that counts for A Balanced Diet: edible items, not drinks like milk. */
export const BALANCED_DIET_FOODS:readonly ItemId[]=[...ITEMS.values()].filter(d=>d.food&&!d.food.clearsEffects).map(d=>d.id);
/** One of every hostile monster for Monsters Hunted (the vanilla list, limited to the mobs in this world). */
export const HUNTED_MOBS:readonly string[]=['zombie','husk','drowned','skeleton','stray','creeper','spider','enderman','slime'];
/** Two by Two: every animal that can be bred here. */
export const BREEDABLE_ANIMALS:readonly string[]=['cow','pig','sheep','chicken','rabbit','wolf'];

const item=(...items:ItemId[]):Criterion=>({kind:'item',items});
const crafted=(...items:ItemId[]):Criterion=>({kind:'crafted',items});
const event=(e:Extract<Criterion,{kind:'event'}>['event']):Criterion=>({kind:'event',event:e});
const counted:Criterion={kind:'counted'};
type Def=Omit<AdvancementDef,'frame'>&{frame?:AdvancementFrame};
const def=(d:Def):AdvancementDef=>({frame:'task',...d});

export const ADVANCEMENT_TABS:readonly AdvancementTab[]=[
  {id:'minecraft',title:'Minecraft',root:'minecraft',icon:'grass_block',background:'stone'},
  {id:'adventure',title:'Adventure',root:'adventure',icon:'compass',background:'dirt'},
  {id:'husbandry',title:'Husbandry',root:'husbandry',icon:'wheat',background:'oak_planks'}];

/** The whole tree, each tab in preorder (parents before children). */
export const ADVANCEMENTS:readonly AdvancementDef[]=[
  // ---- Minecraft --------------------------------------------------------------------------------
  def({id:'minecraft',title:'Minecraft',description:'The heart and story of the game',icon:'grass_block',parent:null,tab:'minecraft',
    criteria:[item('crafting_table')]}),
  def({id:'getting_wood',title:'Getting Wood',description:'Attack a tree until a block of wood pops out',icon:'oak_log',parent:'minecraft',tab:'minecraft',
    criteria:[item(...WOOD_LOGS)]}),
  def({id:'benchmarking',title:'Benchmarking',description:'Craft a workbench with four blocks of planks',icon:'crafting_table',parent:'getting_wood',
    tab:'minecraft',criteria:[crafted('crafting_table')]}),
  def({id:'time_to_mine',title:'Time to Mine!',description:'Use planks and sticks to make a pickaxe',icon:'wooden_pickaxe',parent:'benchmarking',
    tab:'minecraft',criteria:[crafted('wooden_pickaxe','stone_pickaxe','iron_pickaxe','golden_pickaxe','diamond_pickaxe')]}),
  def({id:'hot_topic',title:'Hot Topic',description:'Construct a furnace out of eight cobblestone blocks',icon:'furnace',parent:'time_to_mine',
    tab:'minecraft',criteria:[crafted('furnace')]}),
  def({id:'time_to_strike',title:'Time to Strike!',description:'Use planks and sticks to make a sword',icon:'wooden_sword',parent:'benchmarking',
    tab:'minecraft',criteria:[crafted('wooden_sword','stone_sword','iron_sword','golden_sword','diamond_sword')]}),
  def({id:'bake_bread',title:'Bake Bread',description:'Turn wheat into bread',icon:'bread',parent:'benchmarking',tab:'minecraft',
    criteria:[crafted('bread')]}),
  def({id:'stone_age',title:'Stone Age',description:'Mine Stone with your new Pickaxe',icon:'cobblestone',parent:'minecraft',tab:'minecraft',
    criteria:[item('cobblestone','cobbled_deepslate')]}),
  def({id:'getting_an_upgrade',title:'Getting an Upgrade',description:'Construct a better Pickaxe',icon:'stone_pickaxe',parent:'stone_age',
    tab:'minecraft',criteria:[item('stone_pickaxe')]}),
  def({id:'acquire_hardware',title:'Acquire Hardware',description:'Smelt an Iron Ingot',icon:'iron_ingot',parent:'getting_an_upgrade',
    tab:'minecraft',criteria:[item('iron_ingot')]}),
  def({id:'suit_up',title:'Suit Up',description:'Protect yourself with a piece of armor',icon:'iron_chestplate',parent:'acquire_hardware',
    tab:'minecraft',criteria:[item(...ARMOUR)]}),
  def({id:'hot_stuff',title:'Hot Stuff',description:'Fill a Bucket with lava',icon:'lava_bucket',parent:'acquire_hardware',tab:'minecraft',
    criteria:[item('lava_bucket')]}),
  def({id:'ice_bucket_challenge',title:'Ice Bucket Challenge',description:'Obtain a block of Obsidian',icon:'obsidian',parent:'hot_stuff',
    tab:'minecraft',criteria:[item('obsidian')]}),
  def({id:'isnt_it_iron_pick',title:"Isn't It Iron Pick",description:'Upgrade your Pickaxe',icon:'iron_pickaxe',parent:'acquire_hardware',
    tab:'minecraft',criteria:[item('iron_pickaxe')]}),
  def({id:'diamonds',title:'Diamonds!',description:'Acquire diamonds',icon:'diamond',parent:'isnt_it_iron_pick',tab:'minecraft',
    criteria:[item('diamond')]}),
  def({id:'cover_me_with_diamonds',title:'Cover Me with Diamonds',description:'Diamond armor saves lives',icon:'diamond_chestplate',
    parent:'diamonds',tab:'minecraft',criteria:[item(...DIAMOND_ARMOUR)]}),
  def({id:'oh_shiny',title:'Oh Shiny',description:'Get your hands on some copper',icon:'copper_ingot',parent:'getting_an_upgrade',
    tab:'minecraft',criteria:[item('raw_copper','copper_ingot','copper_block')]}),
  def({id:'into_the_deep',title:'Into the Deep',description:'Mine deepslate, far below the stone',icon:'deepslate',parent:'stone_age',
    tab:'minecraft',criteria:[{kind:'mined',families:DEEPSLATE}]}),
  // ---- Adventure --------------------------------------------------------------------------------
  def({id:'adventure',title:'Adventure',description:'Adventure, exploration and combat',icon:'compass',parent:null,tab:'adventure',
    criteria:[event('kill_any'),event('killed_by_mob')]}),
  def({id:'monster_hunter',title:'Monster Hunter',description:'Kill any hostile monster',icon:'iron_sword',parent:'adventure',tab:'adventure',
    criteria:[event('kill_hostile')]}),
  def({id:'monsters_hunted',title:'Monsters Hunted',description:'Kill one of every hostile monster',icon:'diamond_sword',parent:'monster_hunter',
    tab:'adventure',frame:'challenge',xp:100,criteria:[counted],count:{event:'kill',keys:HUNTED_MOBS,required:HUNTED_MOBS.length}}),
  def({id:'take_aim',title:'Take Aim',description:'Shoot something with an Arrow',icon:'bow',parent:'monster_hunter',tab:'adventure',
    criteria:[event('arrow_hit')]}),
  def({id:'the_end',title:'The End?',description:'Pick up an Ender Pearl',icon:'ender_pearl',parent:'monster_hunter',tab:'adventure',
    criteria:[item('ender_pearl')]}),
  def({id:'sticky_situation',title:'Sticky Situation',description:'Collect a Slimeball from a bouncing Slime',icon:'slime_ball',
    parent:'monster_hunter',tab:'adventure',criteria:[item('slime_ball')]}),
  def({id:'sweet_dreams',title:'Sweet Dreams',description:'Sleep in a Bed to change your respawn point',icon:'red_bed',parent:'adventure',
    tab:'adventure',criteria:[event('slept')]}),
  // ---- Husbandry --------------------------------------------------------------------------------
  def({id:'husbandry',title:'Husbandry',description:'The world is full of friends and food',icon:'wheat',parent:null,tab:'husbandry',
    criteria:[event('consumed')]}),
  def({id:'the_parrots_and_the_bats',title:'The Parrots and the Bats',description:'Breed two animals together',icon:'carrot',parent:'husbandry',
    tab:'husbandry',criteria:[event('bred')]}),
  def({id:'two_by_two',title:'Two by Two',description:'Breed all the animals!',icon:'golden_carrot',parent:'the_parrots_and_the_bats',
    tab:'husbandry',frame:'challenge',xp:100,criteria:[counted],count:{event:'breed',keys:BREEDABLE_ANIMALS,required:BREEDABLE_ANIMALS.length}}),
  def({id:'best_friends_forever',title:'Best Friends Forever',description:'Tame an animal',icon:'bone',parent:'husbandry',tab:'husbandry',
    criteria:[event('tamed')]}),
  def({id:'a_seedy_place',title:'A Seedy Place',description:'Plant a seed and watch it grow',icon:'wheat_seeds',parent:'husbandry',tab:'husbandry',
    criteria:[{kind:'placed',families:['wheat']}]}),
  def({id:'a_balanced_diet',title:'A Balanced Diet',description:'Eat ten different foods, even if they are not good for you',icon:'apple',
    parent:'a_seedy_place',tab:'husbandry',frame:'challenge',xp:100,criteria:[counted],count:{event:'eat',keys:BALANCED_DIET_FOODS,required:10}})];

export const ADVANCEMENT_BY_ID:ReadonlyMap<string,AdvancementDef>=new Map(ADVANCEMENTS.map(a=>[a.id,a]));
const CHILDREN=new Map<string,AdvancementDef[]>();
for(const a of ADVANCEMENTS)if(a.parent){const list=CHILDREN.get(a.parent)??[];list.push(a);CHILDREN.set(a.parent,list);}
export const childrenOf=(id:string):readonly AdvancementDef[]=>CHILDREN.get(id)??[];

/** A tab's advancements in preorder (root first, each parent before its children). */
export function treeOrder(tab:AdvancementTabId):AdvancementDef[]{
  const out:AdvancementDef[]=[],root=ADVANCEMENT_TABS.find(t=>t.id===tab)?.root,start=root?ADVANCEMENT_BY_ID.get(root):undefined;
  const walk=(a:AdvancementDef)=>{out.push(a);for(const c of childrenOf(a.id))walk(c);};
  if(start)walk(start);
  return out;
}
export interface TreeCell{def:AdvancementDef;
  /** Column (depth from the root) and row (leaves stack downward; a parent sits midway between its first and last child). */
  x:number;y:number}
/** Tidy-tree layout of a tab, roots on the left like the vanilla screen. Rows are in node units (may be halves). */
export function layoutTab(tab:AdvancementTabId):TreeCell[]{
  const cells:TreeCell[]=[];let row=0;
  const place=(a:AdvancementDef,depth:number):TreeCell=>{
    const cell:TreeCell={def:a,x:depth,y:0};cells.push(cell);
    const kids=childrenOf(a.id).map(c=>place(c,depth+1));
    cell.y=kids.length?(kids[0].y+kids[kids.length-1].y)/2:row++;
    return cell;
  };
  const root=ADVANCEMENT_TABS.find(t=>t.id===tab)?.root,start=root?ADVANCEMENT_BY_ID.get(root):undefined;
  if(start)place(start,0);
  return cells;
}
