// World dimensions and timing shared by every module.
export const CS=16,CH=128,LAYER=CS*CS,CHUNK_VOLUME=LAYER*CH;
/** Water fills open columns up to and including this y. */
export const SEA_LEVEL=62;
/** Local voxel index: y-major layers keep each 16×16 slab contiguous. */
export const voxelIndex=(x:number,y:number,z:number)=>x+z*CS+y*LAYER;
/** Chunk coordinates stay within -CHUNK_LIMIT..CHUNK_LIMIT-1 (±262144 blocks), so a chunk key is a small integer (below
 *  2^30: V8 keeps it unboxed, and Map lookups by key allocate nothing). Keys are runtime-only; saves store coordinates. */
export const CHUNK_LIMIT=0x4000;
/** True when chunk coordinates have a key of their own (keyX/keyZ give them back). */
export const chunkInRange=(cx:number,cz:number)=>cx>=-CHUNK_LIMIT&&cx<CHUNK_LIMIT&&cz>=-CHUNK_LIMIT&&cz<CHUNK_LIMIT;
/** The world border (vanilla WorldBorder): the player stays within ±WORLD_BORDER blocks on x and z, so every chunk in
 *  view, its neighbours and the entities near it keep well inside the chunk key range. */
export const WORLD_BORDER=256000;
export const chunkKey=(cx:number,cz:number)=>((cx+0x4000)&0x7fff)*0x8000+((cz+0x4000)&0x7fff);
export const keyX=(key:number)=>Math.floor(key/0x8000)-0x4000;
export const keyZ=(key:number)=>(key&0x7fff)-0x4000;

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

/** Taxicab steps through leaves (any wood) to the nearest log beyond which non-persistent leaves decay (vanilla distance). */
export const LEAF_DECAY_DISTANCE=6;
/** Upper bound of quads per mesh part; the mesher drops further faces. */
export const MAX_PART_QUADS=1<<17;
/** One shared quad index pattern covers every mesh part: triangles (0,1,2),(2,1,3) per quad. */
export function quadIndices(quads=MAX_PART_QUADS):Uint32Array{
  const index=new Uint32Array(quads*6);
  for(let q=0,v=0,i=0;q<quads;q++,v+=4){index[i++]=v;index[i++]=v+1;index[i++]=v+2;index[i++]=v+2;index[i++]=v+1;index[i++]=v+3;}
  return index;
}
/** `game.root.dataset` flags owned by the input service (F1 hides HUD and hand, F3 debug overlay). Values 'true' or ''. */
export const ROOT_FLAGS={hudHidden:'hudHidden',debug:'debug'} as const;
