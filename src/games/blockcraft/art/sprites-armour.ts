// Armour: helmet, chestplate, leggings and boots, each one silhouette painted in the four materials.
// Leather is the undyed vanilla leather colour (#A06540); iron, gold and diamond use the tool tier colours.
import {type Sprite,sprite,ramp,edgesOf} from './sprites-core';
import {TIER_COLOURS} from './sprites-tools';

/** Vanilla's default (undyed) leather armour colour. */
export const LEATHER=0xa06540;
const leather=ramp(LEATHER,{outline:.4,dark:.74,light:.22,highlight:.42});
const MATERIALS:Record<string,{O:number;D:number;M:number;L:number;H:number}>={
  leather:{O:leather.o,D:leather.d,M:leather.m,L:leather.l,H:leather.h},
  golden:TIER_COLOURS.golden,iron:TIER_COLOURS.iron,diamond:TIER_COLOURS.diamond
};
const PIECES:Record<string,string[]>={
  // A rounded cap 12 wide and 4 rows deep, then cheek guards either side of the face opening.
  helmet:[
    '................',
    '................',
    '................',
    '...HLLLLLLLLM...',
    '..HLLLLLLLLLMD..',
    '..LMMMMMMMMMMD..',
    '..LMMMMMMMMMDD..',
    '..LMD......LMD..',
    '..LMD......LMD..',
    '..DDD......DDD..',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................'],
  chestplate:[
    '................',
    '................',
    '..HLLL....LLLM..',
    '..LMMML..LMMMD..',
    '..LMMMMMMMMMMD..',
    '..LMHMMMMMMMMD..',
    '..LM.LMMMMD.MD..',
    '..DD.LMMMMD.DD..',
    '.....LMMMMD.....',
    '.....LMMMMD.....',
    '.....LMMMMD.....',
    '.....LMMMMD.....',
    '.....DDDDDD.....',
    '................',
    '................',
    '................'],
  leggings:[
    '................',
    '................',
    '..HLLLLLLLLLLM..',
    '..LMMMMMMMMMMD..',
    '..LMMMMMMMMMMD..',
    '..LMMD....LMMD..',
    '..LMMD....LMMD..',
    '..LMMD....LMMD..',
    '..LMMD....LMMD..',
    '..LMMD....LMMD..',
    '..LMMD....LMMD..',
    '..LMMD....LMMD..',
    '..DDDD....DDDD..',
    '................',
    '................',
    '................'],
  boots:[
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '...HLM....LLM...',
    '...LMD....LMD...',
    '...LMD....LMD...',
    '...LMD....LMD...',
    '.LLMMD....LMMLL.',
    '.DDDDD....DDDDD.',
    '................',
    '................',
    '................',
    '................']
};
export const ARMOUR_SPRITES:Record<string,Sprite>={};
for(const [material,colours] of Object.entries(MATERIALS))for(const [piece,rows] of Object.entries(PIECES))
  ARMOUR_SPRITES[`${material}_${piece}`]=sprite(rows,colours,edgesOf('HLMD','O'));
