// Biome registry. Terrain generation (world/terrain.ts) assigns one biome id per column; the
// mesher blends grass / foliage / water tints from it and mobs use the spawn lists.
import type {WoodType} from './blocks';

export type BiomeId=number;
export interface BiomeDef{
  readonly id:BiomeId;readonly name:string;readonly displayName:string;
  /** Climate used for placement and snow: temperature < 0.15 freezes water and snows. */
  readonly temperature:number;readonly downfall:number;
  /** Tints as 0xRRGGBB, multiplied over the grey grass/foliage/water tiles. */
  readonly grass:number;readonly foliage:number;readonly water:number;
  /** Surface layers: top block, the few blocks under it, and the floor under water. */
  readonly top:string;readonly filler:string;readonly underwater:string;
  /** Trees per 16×16 chunk on average and the weighted wood types used. */
  readonly treeDensity:number;readonly trees:readonly (readonly [WoodType|'big_oak'|'mega_spruce'|'jungle_bush',number])[];
  /** Ground cover per column chance: short grass, ferns, flowers, dead bushes, cacti, sugar cane... */
  readonly vegetation:readonly (readonly [string,number])[];
  /** Passive mob kinds that may spawn here, weighted. */
  readonly animals:readonly (readonly [string,number])[];
  /** Sky colour near the horizon at noon. */
  readonly sky:number;
  /** Snow cover and frozen water at sea level. Invariant: snowy === coldAt(biome, SEA_LEVEL). */
  readonly snowy:boolean;
  /** What falls in rain weather: snow where coldAt(biome, y) holds, none in dry biomes. */
  readonly precipitation:'rain'|'none';
}

const list:Omit<BiomeDef,'id'|'precipitation'>[]=[
  {name:'ocean',displayName:'Ocean',temperature:.5,downfall:.5,grass:0x8eb971,foliage:0x71a74d,water:0x3f76e4,top:'sand',filler:'sand',underwater:'gravel',treeDensity:0,trees:[],vegetation:[],animals:[],sky:0x7ba4ff,snowy:false},
  {name:'deep_ocean',displayName:'Deep Ocean',temperature:.5,downfall:.5,grass:0x8eb971,foliage:0x71a74d,water:0x3d57d6,top:'gravel',filler:'gravel',underwater:'gravel',treeDensity:0,trees:[],vegetation:[],animals:[],sky:0x7ba4ff,snowy:false},
  {name:'beach',displayName:'Beach',temperature:.8,downfall:.4,grass:0x91bd59,foliage:0x77ab2f,water:0x3f76e4,top:'sand',filler:'sand',underwater:'sand',treeDensity:0,trees:[],vegetation:[['sugar_cane',.01]],animals:[],sky:0x78a7ff,snowy:false},
  {name:'plains',displayName:'Plains',temperature:.8,downfall:.4,grass:0x91bd59,foliage:0x77ab2f,water:0x3f76e4,top:'grass_block',filler:'dirt',underwater:'dirt',treeDensity:.15,trees:[['oak',1]],
    vegetation:[['short_grass',.22],['dandelion',.012],['poppy',.01],['oxeye_daisy',.006],['cornflower',.006]],animals:[['cow',10],['pig',10],['sheep',12],['chicken',10],['rabbit',2]],sky:0x78a7ff,snowy:false},
  {name:'sunflower_plains',displayName:'Flower Plains',temperature:.8,downfall:.4,grass:0x91bd59,foliage:0x77ab2f,water:0x3f76e4,top:'grass_block',filler:'dirt',underwater:'dirt',treeDensity:.1,trees:[['oak',1]],
    vegetation:[['short_grass',.15],['dandelion',.04],['poppy',.04],['allium',.02],['oxeye_daisy',.03],['cornflower',.03],['blue_orchid',.01]],animals:[['cow',8],['sheep',12],['pig',8],['chicken',8],['rabbit',4]],sky:0x78a7ff,snowy:false},
  {name:'forest',displayName:'Forest',temperature:.7,downfall:.8,grass:0x79c05a,foliage:0x59ae30,water:0x3f76e4,top:'grass_block',filler:'dirt',underwater:'dirt',treeDensity:6,trees:[['oak',4],['birch',1],['big_oak',.3]],
    vegetation:[['short_grass',.12],['poppy',.004],['dandelion',.004],['brown_mushroom',.002],['red_mushroom',.001]],animals:[['pig',8],['chicken',6],['cow',4],['sheep',4],['wolf',5]],sky:0x79a6ff,snowy:false},
  {name:'birch_forest',displayName:'Birch Forest',temperature:.6,downfall:.6,grass:0x88bb67,foliage:0x6ba941,water:0x3f76e4,top:'grass_block',filler:'dirt',underwater:'dirt',treeDensity:6,trees:[['birch',1]],
    vegetation:[['short_grass',.14],['allium',.004],['oxeye_daisy',.004]],animals:[['pig',6],['chicken',6],['sheep',6],['cow',6],['rabbit',2]],sky:0x7aa5ff,snowy:false},
  {name:'dark_forest',displayName:'Dark Forest',temperature:.7,downfall:.8,grass:0x507a32,foliage:0x59ae30,water:0x3f76e4,top:'grass_block',filler:'dirt',underwater:'dirt',treeDensity:12,trees:[['dark_oak',3],['oak',1]],
    vegetation:[['short_grass',.06],['brown_mushroom',.01],['red_mushroom',.008]],animals:[['chicken',4]],sky:0x79a6ff,snowy:false},
  {name:'taiga',displayName:'Taiga',temperature:.25,downfall:.8,grass:0x86b783,foliage:0x68a464,water:0x3d57d6,top:'grass_block',filler:'dirt',underwater:'gravel',treeDensity:7,trees:[['spruce',1],['mega_spruce',.15]],
    vegetation:[['fern',.12],['short_grass',.06],['brown_mushroom',.002]],animals:[['sheep',8],['pig',6],['chicken',6],['cow',6],['wolf',8],['rabbit',4]],sky:0x7da3ff,snowy:false},
  {name:'snowy_taiga',displayName:'Snowy Taiga',temperature:-.5,downfall:.4,grass:0x80b497,foliage:0x60a17b,water:0x3d57d6,top:'grass_block',filler:'dirt',underwater:'gravel',treeDensity:5,trees:[['spruce',1]],
    vegetation:[['fern',.08]],animals:[['sheep',6],['chicken',4],['wolf',8],['rabbit',6]],sky:0x839eff,snowy:true},
  {name:'snowy_plains',displayName:'Snowy Plains',temperature:0,downfall:.5,grass:0x80b497,foliage:0x60a17b,water:0x3d57d6,top:'grass_block',filler:'dirt',underwater:'gravel',treeDensity:.08,trees:[['spruce',1]],
    vegetation:[['short_grass',.02]],animals:[['sheep',4],['rabbit',10]],sky:0x7fa1ff,snowy:true},
  {name:'desert',displayName:'Desert',temperature:2,downfall:0,grass:0xbfb755,foliage:0xaea42a,water:0x32a598,top:'sand',filler:'sand',underwater:'sand',treeDensity:0,trees:[],
    vegetation:[['dead_bush',.008],['cactus',.006]],animals:[['rabbit',4]],sky:0x6eb1ff,snowy:false},
  {name:'savanna',displayName:'Savanna',temperature:1.2,downfall:0,grass:0xbfb755,foliage:0xaea42a,water:0x2c8b9c,top:'grass_block',filler:'dirt',underwater:'dirt',treeDensity:.8,trees:[['acacia',1],['oak',.2]],
    vegetation:[['short_grass',.3]],animals:[['cow',8],['sheep',8],['chicken',6]],sky:0x6eb1ff,snowy:false},
  {name:'jungle',displayName:'Jungle',temperature:.95,downfall:.9,grass:0x59c93c,foliage:0x30bb0b,water:0x14a2c5,top:'grass_block',filler:'dirt',underwater:'dirt',treeDensity:14,trees:[['jungle',2],['jungle_bush',3],['oak',.5]],
    vegetation:[['short_grass',.25],['fern',.1],['melon',.004]],animals:[['chicken',8],['pig',4]],sky:0x77a8ff,snowy:false},
  {name:'swamp',displayName:'Swamp',temperature:.8,downfall:.9,grass:0x6a7039,foliage:0x6a7039,water:0x617b64,top:'grass_block',filler:'dirt',underwater:'clay',treeDensity:2,trees:[['oak',1]],
    vegetation:[['short_grass',.1],['blue_orchid',.006],['lily_pad',.02],['brown_mushroom',.004],['sugar_cane',.02]],animals:[['chicken',4]],sky:0x78a7ff,snowy:false},
  {name:'mountains',displayName:'Windswept Hills',temperature:.2,downfall:.3,grass:0x8ab689,foliage:0x6da36b,water:0x3f76e4,top:'grass_block',filler:'dirt',underwater:'gravel',treeDensity:.6,trees:[['spruce',1],['oak',1]],
    vegetation:[['short_grass',.08]],animals:[['sheep',10],['cow',4]],sky:0x7da2ff,snowy:false},
  {name:'snowy_peaks',displayName:'Snowy Peaks',temperature:-.7,downfall:.9,grass:0x80b497,foliage:0x60a17b,water:0x3d57d6,top:'snow_block',filler:'stone',underwater:'stone',treeDensity:0,trees:[],vegetation:[],animals:[],sky:0x839eff,snowy:true},
  {name:'stony_shore',displayName:'Stony Shore',temperature:.2,downfall:.3,grass:0x8ab689,foliage:0x6da36b,water:0x3f76e4,top:'stone',filler:'stone',underwater:'gravel',treeDensity:0,trees:[],vegetation:[],animals:[],sky:0x7da2ff,snowy:false},
  {name:'badlands',displayName:'Badlands',temperature:2,downfall:0,grass:0x90814d,foliage:0x9e814d,water:0x3f76e4,top:'red_sand',filler:'red_sandstone',underwater:'red_sand',treeDensity:0,trees:[],
    vegetation:[['dead_bush',.01],['cactus',.003]],animals:[],sky:0x6eb1ff,snowy:false},
  {name:'mushroom_fields',displayName:'Mushroom Fields',temperature:.9,downfall:1,grass:0x55c93f,foliage:0x2bbb0f,water:0x3f76e4,top:'mycelium',filler:'dirt',underwater:'dirt',treeDensity:0,trees:[],
    vegetation:[['brown_mushroom',.03],['red_mushroom',.03]],animals:[['cow',8]],sky:0x77a8ff,snowy:false},
  {name:'river',displayName:'River',temperature:.5,downfall:.5,grass:0x8eb971,foliage:0x71a74d,water:0x3f76e4,top:'sand',filler:'sand',underwater:'sand',treeDensity:0,trees:[],vegetation:[['sugar_cane',.02]],animals:[],sky:0x7ba4ff,snowy:false},
  {name:'cherry_grove',displayName:'Cherry Grove',temperature:.5,downfall:.8,grass:0xb6db61,foliage:0xb6db61,water:0x5db7ef,top:'grass_block',filler:'dirt',underwater:'dirt',treeDensity:3,trees:[['cherry',1]],
    vegetation:[['short_grass',.2],['allium',.01],['oxeye_daisy',.01]],animals:[['pig',6],['rabbit',6],['sheep',6]],sky:0x7ba4ff,snowy:false},
  {name:'frozen_river',displayName:'Frozen River',temperature:0,downfall:.5,grass:0x80b497,foliage:0x60a17b,water:0x3938c9,top:'sand',filler:'sand',underwater:'gravel',treeDensity:0,trees:[],vegetation:[],animals:[],sky:0x7fa1ff,snowy:true}
];
const DRY=new Set(['desert','savanna','badlands']);
export const BIOMES:BiomeDef[]=list.map((b,id)=>({...b,id,precipitation:DRY.has(b.name)?'none':'rain'}));
/** Below this temperature precipitation falls as snow and water freezes. */
export const FREEZE_TEMPERATURE=.15;
/** Height-adjusted cold check shared by terrain (snow layers, ice) and weather (snow vs rain). */
export function coldAt(b:BiomeDef,y:number):boolean{return b.temperature-Math.max(0,y-90)*.004<FREEZE_TEMPERATURE;}
export const BIOME_BY_NAME=new Map(BIOMES.map(b=>[b.name,b]));
export function biomeId(name:string):BiomeId{const b=BIOME_BY_NAME.get(name);if(!b)throw new Error(`Unknown biome ${name}`);return b.id;}
export const biomeDef=(id:BiomeId):BiomeDef=>BIOMES[id]??BIOMES[0];
