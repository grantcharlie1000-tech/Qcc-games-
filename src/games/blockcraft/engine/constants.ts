// World dimensions and timing shared by every module.
export const CS=16,CH=128,LAYER=CS*CS,CHUNK_VOLUME=LAYER*CH;
/** Water fills open columns up to and including this y. */
export const SEA_LEVEL=62;
/** Local voxel index: y-major layers keep each 16×16 slab contiguous. */
export const voxelIndex=(x:number,y:number,z:number)=>x+z*CS+y*LAYER;
export const chunkKey=(cx:number,cz:number)=>((cx+0x8000)&0xffff)*0x10000+((cz+0x8000)&0xffff);
export const keyX=(key:number)=>Math.floor(key/0x10000)-0x8000;
export const keyZ=(key:number)=>(key&0xffff)-0x8000;

// Padded volume: a chunk plus a one-voxel rim from its eight neighbours and one layer above and
// below. Used by light.ts (output) and mesher.ts (input). Index = (x+1) + (z+1)*PAD_X + (y+1)*PAD_LAYER.
export const PAD_X=CS+2,PAD_LAYER=PAD_X*PAD_X,PAD_Y=CH+2,PAD_VOLUME=PAD_LAYER*PAD_Y;
export const padIndex=(x:number,y:number,z:number)=>(x+1)+(z+1)*PAD_X+(y+1)*PAD_LAYER;

/** Game logic ticks per second (mobs, survival, block ticks, furnaces, time). */
export const TPS=20;
/** Ticks in one day; dayTime 0 = sunrise, 6000 = noon, 12000 = sunset, 18000 = midnight. */
export const DAY_TICKS=24000;
/** Player movement / collision simulation rate. */
export const PHYSICS_HZ=60;
