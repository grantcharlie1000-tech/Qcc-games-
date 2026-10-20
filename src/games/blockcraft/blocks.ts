// Block registry. Ids are bytes stored directly in each chunk's Uint8Array.
export const AIR=0,GRASS=1,DIRT=2,STONE=3,COBBLE=4,SAND=5,LOG=6,LEAVES=7,PLANKS=8,COAL=9,IRON=10,SNOW=11,WATER=12,BRICK=13,BEDROCK=14;
export const BLOCK_COUNT=15;
export const BLOCK_NAMES=['Air','Grass','Dirt','Stone','Cobblestone','Sand','Log','Leaves','Planks','Coal ore','Iron ore','Snow','Water','Brick','Bedrock'];

// Atlas tiles: 8 columns × 4 rows of 16px pixel art, painted procedurally in atlas.ts.
export const T={grassTop:0,grassSide:1,dirt:2,stone:3,cobble:4,sand:5,logSide:6,logTop:7,leaves:8,planks:9,coal:10,iron:11,snow:12,snowSide:13,water:14,brick:15,bedrock:16} as const;
export const ATLAS_COLUMNS=8,ATLAS_ROWS=4,TILE=16;

// Face order everywhere: +x, -x, +y, -y, +z, -z.
const all=(t:number)=>[t,t,t,t,t,t];
export const FACE_TILES:number[][]=[
  all(0),
  [T.grassSide,T.grassSide,T.grassTop,T.dirt,T.grassSide,T.grassSide],
  all(T.dirt),all(T.stone),all(T.cobble),all(T.sand),
  [T.logSide,T.logSide,T.logTop,T.logTop,T.logSide,T.logSide],
  all(T.leaves),all(T.planks),all(T.coal),all(T.iron),
  [T.snowSide,T.snowSide,T.snow,T.dirt,T.snowSide,T.snowSide],
  all(T.water),all(T.brick),all(T.bedrock)
];
/** Blocks the player collides with. */
export const SOLID=new Uint8Array(256);
/** Blocks that completely hide the face of a neighbour. */
export const OPAQUE=new Uint8Array(256);
for(let id=1;id<BLOCK_COUNT;id++){SOLID[id]=1;OPAQUE[id]=1;}
SOLID[WATER]=0;OPAQUE[WATER]=0;
/** Bedrock and water cannot be mined. */
export const BREAKABLE=(id:number)=>id!==AIR&&id!==WATER&&id!==BEDROCK;
export const HOTBAR=[GRASS,DIRT,STONE,COBBLE,PLANKS,LOG,LEAVES,SAND,BRICK];
