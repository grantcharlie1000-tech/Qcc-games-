// Terrain decoration: trees (generation across chunk borders and growTree), vegetation and structures.
import {describe,expect,test} from 'vitest';
import {createTerrain,TerrainGenerator} from '../../../src/games/blockcraft/world/terrain';
import {planTree,TREE_REACH} from '../../../src/games/blockcraft/world/terrain-trees';
import {mulberry32} from '../../../src/games/blockcraft/world/noise';
import {BIOMES,biomeDef,biomeId} from '../../../src/games/blockcraft/data/biomes';
import {AIR,B,blockDef,blockId,isWater,SOLID} from '../../../src/games/blockcraft/data/blocks';
import {CS,CH,LAYER,SEA_LEVEL,LEAF_DECAY_DISTANCE} from '../../../src/games/blockcraft/engine/constants';
import {canSurvive} from '../../../src/games/blockcraft/engine/support';
import {VoxelWorld} from '../../../src/games/blockcraft/world/world';
import {EventBus} from '../../../src/games/blockcraft/engine/events';
import type {GameEvents,TreeKind} from '../../../src/games/blockcraft/engine/contracts';

const id=(name:string)=>blockId(name);
const family=(b:number)=>b<0?'':blockDef(b).family;
const isLog=(b:number)=>family(b).endsWith('_log');
const isLeaves=(b:number)=>family(b).endsWith('_leaves');
const T=createTerrain(1234) as TerrainGenerator;

/** Chunks whose centre column lies in a biome, found on a coarse grid around the origin. */
function chunksIn(name:string,limit:number,t=T):[number,number][]{
  const b=biomeId(name),out:[number,number][]=[];
  for(let r=0;r<200&&out.length<limit;r++)for(let i=-r;i<=r&&out.length<limit;i++)for(const [cx,cz] of [[i,-r],[i,r],[-r,i],[r,i]]){
    if(Math.max(Math.abs(cx),Math.abs(cz))!==r||out.some(([a,c])=>a===cx*2&&c===cz*2))continue;
    if(t.biomeAt(cx*2*CS+8,cz*2*CS+8)===b&&out.length<limit)out.push([cx*2,cz*2]);
  }
  return out;
}
function region(t:TerrainGenerator,cx:number,cz:number,r=1){
  const w=new VoxelWorld();
  for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++)w.insert(cx+dx,cz+dz,t.generate(cx+dx,cz+dz));
  return w;
}
const TREE_BIOMES=['forest','birch_forest','dark_forest','taiga','snowy_taiga','jungle','savanna','cherry_grove','plains','swamp','mountains'];

describe('generated trees',()=>{
  test('every tree kind of every biome is generated',()=>{
    const kinds=new Set<string>();
    for(const b of BIOMES)for(const [cx,cz] of b.trees.length?chunksIn(b.name,6):[])
      for(let z=0;z<CS;z++)for(let x=0;x<CS;x++){const tree=T.treeAt(cx*CS+x,cz*CS+z);if(tree)kinds.add(tree.kind);}
    for(const kind of ['oak','big_oak','birch','spruce','mega_spruce','jungle','jungle_bush','acacia','dark_oak','cherry'])expect(kinds.has(kind),kind).toBe(true);
  });
  test('trees are complete across chunk borders: every planned log and leaf exists in the world',()=>{
    let trees=0,crossing=0;
    for(const name of TREE_BIOMES)for(const [cx,cz] of chunksIn(name,2)){
      const w=region(T,cx,cz,1);
      for(let z=cz*CS-TREE_REACH;z<(cz+1)*CS+TREE_REACH;z++)for(let x=cx*CS-TREE_REACH;x<(cx+1)*CS+TREE_REACH;x++){
        const tree=T.treeAt(x,z);if(!tree)continue;trees++;
        const logs:number[][]=[],leaves:number[][]=[];
        planTree(tree.kind,tree.x,tree.y,tree.z,mulberry32(tree.seed),{log:(a,b,c)=>logs.push([a,b,c]),leaf:(a,b,c)=>leaves.push([a,b,c])},tree.wide);
        const chunksTouched=new Set([...logs,...leaves].map(([a,,c])=>Math.floor(a/CS)+','+Math.floor(c/CS)));if(chunksTouched.size>1)crossing++;
        for(const [a,b,c] of [...logs,...leaves])expect(Math.max(Math.abs(a-tree.x),Math.abs(c-tree.z))).toBeLessThanOrEqual(TREE_REACH);
        for(const [a,b,c] of logs)if(b<CH)expect(isLog(w.get(a,b,c)),`log of ${tree.kind} at ${a},${b},${c}: ${blockDef(w.get(a,b,c)).name}`).toBe(true);
        for(const [a,b,c] of leaves)if(b<CH)expect(w.get(a,b,c),`leaf of ${tree.kind} at ${a},${b},${c}`).not.toBe(AIR);
      }
    }
    expect(trees).toBeGreaterThan(100);expect(crossing).toBeGreaterThan(20);
  });
  test('no floating trees: every log and leaf connects to a grounded trunk; leaves stay within decay distance',()=>{
    for(const name of TREE_BIOMES)for(const [cx,cz] of chunksIn(name,2)){
      const w=region(T,cx,cz,1),x0=(cx-1)*CS,z0=(cz-1)*CS,N=CS*3,idx=(x:number,y:number,z:number)=>(x-x0)+(z-z0)*N+y*N*N;
      const reached=new Uint8Array(N*N*CH),queue:number[]=[],dist=new Int16Array(N*N*CH).fill(-1),dq:number[]=[];
      for(let z=z0;z<z0+N;z++)for(let x=x0;x<x0+N;x++)for(let y=1;y<CH;y++){
        const b=w.get(x,y,z);if(!isLog(b))continue;
        dist[idx(x,y,z)]=0;dq.push(x,y,z);
        const below=w.get(x,y-1,z);if(SOLID[below]&&!isLog(below)&&!isLeaves(below)){reached[idx(x,y,z)]=1;queue.push(x,y,z);}
      }
      for(let q=0;q<queue.length;q+=3){const x=queue[q],y=queue[q+1],z=queue[q+2];
        for(let dz=-1;dz<=1;dz++)for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
          const a=x+dx,b=y+dy,c=z+dz;if(a<x0||c<z0||a>=x0+N||c>=z0+N||b<0||b>=CH||reached[idx(a,b,c)])continue;
          const id2=w.get(a,b,c);if(!isLog(id2)&&!isLeaves(id2))continue;reached[idx(a,b,c)]=1;queue.push(a,b,c);}
      }
      for(let q=0;q<dq.length;q+=3){const x=dq[q],y=dq[q+1],z=dq[q+2],d=dist[idx(x,y,z)];
        for(const [dx,dy,dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]){
          const a=x+dx,b=y+dy,c=z+dz;if(a<x0||c<z0||a>=x0+N||c>=z0+N||b<0||b>=CH||dist[idx(a,b,c)]>=0)continue;
          if(!isLeaves(w.get(a,b,c)))continue;dist[idx(a,b,c)]=d+1;dq.push(a,b,c);}
      }
      for(let z=cz*CS;z<cz*CS+CS;z++)for(let x=cx*CS;x<cx*CS+CS;x++)for(let y=1;y<CH;y++){
        const b=w.get(x,y,z);if(!isLog(b)&&!isLeaves(b))continue;
        expect(reached[idx(x,y,z)],`floating ${blockDef(b).name} at ${x},${y},${z} (${name})`).toBe(1);
        if(isLeaves(b)){const d=dist[idx(x,y,z)];expect(d>=1&&d<=LEAF_DECAY_DISTANCE,`leaf ${x},${y},${z} distance ${d}`).toBe(true);}
      }
    }
  });
  test('trees grow on soil above sea level, with dirt under the trunk; podzol around mega spruce',()=>{
    let podzol=0,mega=0;
    for(const name of ['taiga','forest','jungle','dark_forest','savanna'])for(const [cx,cz] of chunksIn(name,3)){
      const c=T.generate(cx,cz);
      for(let z=0;z<CS;z++)for(let x=0;x<CS;x++){
        const tree=T.treeAt(cx*CS+x,cz*CS+z);if(!tree)continue;
        expect(tree.y).toBeGreaterThan(SEA_LEVEL);
        const below=c.blocks[x+z*CS+(tree.y-1)*LAYER];expect(['dirt','podzol','coarse_dirt']).toContain(blockDef(below).name);
        if(tree.kind==='mega_spruce'){mega++;for(let dz=-4;dz<=5;dz++)for(let dx=-4;dx<=5;dx++){const a=x+dx,b=z+dz;if(a<0||b<0||a>=CS||b>=CS)continue;
          for(let y=tree.y-4;y<tree.y+3;y++)if(c.blocks[a+b*CS+y*LAYER]===id('podzol'))podzol++;}}
      }
    }
    expect(mega).toBeGreaterThan(0);expect(podzol).toBeGreaterThan(mega*4);
  });
});

describe('vegetation',()=>{
  const decorated=['plains','sunflower_plains','forest','dark_forest','taiga','snowy_taiga','desert','badlands','swamp','jungle','mushroom_fields','river','beach','savanna','cherry_grove'];
  test('every plant and snow layer can survive where it was generated',()=>{
    for(const name of decorated)for(const [cx,cz] of chunksIn(name,2)){
      const w=region(T,cx,cz,1);
      for(let z=cz*CS;z<cz*CS+CS;z++)for(let x=cx*CS;x<cx*CS+CS;x++)for(let y=1;y<CH;y++){
        const b=w.get(x,y,z);if(b<=0||!blockDef(b).support)continue;
        expect(canSurvive(w,b,x,y,z),`${blockDef(b).name} at ${x},${y},${z} in ${name}`).toBe(true);
      }
    }
  });
  test('biome vegetation appears: grass, ferns, flowers, dead bushes, cacti, sugar cane, melons, lily pads, mushrooms and pumpkins',()=>{
    const seen=new Set<string>();
    for(const name of decorated)for(const [cx,cz] of chunksIn(name,name==='swamp'||name==='jungle'||name==='desert'?8:3)){
      const c=T.generate(cx,cz);for(const b of c.blocks)seen.add(blockDef(b).family);
    }
    for(const [cx,cz] of [...chunksIn('plains',40),...chunksIn('forest',30)]){if(seen.has('pumpkin'))break;for(const b of T.generate(cx,cz).blocks)seen.add(blockDef(b).family);}
    for(const name of ['short_grass','fern','dandelion','poppy','allium','oxeye_daisy','dead_bush','cactus','sugar_cane','melon','lily_pad','brown_mushroom','red_mushroom','pumpkin'])
      expect(seen.has(name),name).toBe(true);
  });
  test('cacti are 1-3 tall with no solid neighbours; sugar cane is 1-3 tall beside water; lily pads float on swamp water',()=>{
    let cacti=0,cane=0,lily=0;
    for(const name of ['desert','badlands','river','beach','swamp'])for(const [cx,cz] of chunksIn(name,8)){
      const w=region(T,cx,cz,1);
      for(let z=cz*CS;z<cz*CS+CS;z++)for(let x=cx*CS;x<cx*CS+CS;x++)for(let y=1;y<CH-1;y++){
        const b=w.get(x,y,z),below=w.get(x,y-1,z);
        if(family(b)==='cactus'&&family(below)!=='cactus'){cacti++;let h=0;while(family(w.get(x,y+h,z))==='cactus')h++;expect(h).toBeGreaterThanOrEqual(1);expect(h).toBeLessThanOrEqual(3);
          for(let k=0;k<h;k++)for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]])expect(SOLID[w.get(x+dx,y+k,z+dz)]).toBe(0);}
        if(family(b)==='sugar_cane'&&family(below)!=='sugar_cane'){cane++;let h=0;while(family(w.get(x,y+h,z))==='sugar_cane')h++;expect(h).toBeGreaterThanOrEqual(1);expect(h).toBeLessThanOrEqual(3);
          expect([[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dz])=>isWater(w.get(x+dx,y-1,z+dz)))).toBe(true);}
        if(b===id('lily_pad')){lily++;expect(below).toBe(B.water);expect(biomeDef(w.biomeAt(x,z)).name).toBe('swamp');}
      }
    }
    expect(cacti).toBeGreaterThan(3);expect(cane).toBeGreaterThan(3);expect(lily).toBeGreaterThan(3);
  });
});

describe('growTree',()=>{
  function garden(){
    const events=new EventBus<GameEvents>(),causes=new Set<string>(),world=new VoxelWorld(events);
    events.on('blockChanged',e=>causes.add(e.cause));
    for(let cz=-2;cz<=2;cz++)for(let cx=-2;cx<=2;cx++){
      const blocks=new Uint8Array(CS*CS*CH);blocks.fill(B.dirt,0,63*LAYER);blocks.fill(B.grass,63*LAYER,64*LAYER);world.insert(cx,cz,{blocks,biomes:new Uint8Array(LAYER)});
    }
    return{world,causes};
  }
  const woods:Record<TreeKind,string>={oak:'oak',big_oak:'oak',birch:'birch',spruce:'spruce',mega_spruce:'spruce',jungle:'jungle',jungle_bush:'jungle',
    acacia:'acacia',dark_oak:'dark_oak',cherry:'cherry'};
  test('grows every sapling kind with its own wood and leaves, writing with cause growth',()=>{
    for(const kind of Object.keys(woods) as TreeKind[]){
      const {world,causes}=garden(),rng=mulberry32(5);
      world.set(0,64,0,id(`${woods[kind]}_sapling`),'player');causes.clear();
      expect(T.growTree(world,0,64,0,kind,rng),kind).toBe(true);
      expect(world.get(0,64,0),kind).toBe(id(`${woods[kind]}_log`));
      let leaves=0,logs=0;
      for(let y=64;y<CH;y++)for(let z=-9;z<=9;z++)for(let x=-9;x<=9;x++){const b=world.get(x,y,z);if(isLeaves(b))leaves++;if(isLog(b))logs++;}
      expect(leaves,kind).toBeGreaterThan(8);expect(logs,kind).toBeGreaterThanOrEqual(1);
      expect([...causes]).toEqual(['growth']);
      expect(world.get(0,63,0)).toBe(B.dirt);
    }
  });
  test('refuses without room and leaves the world unchanged',()=>{
    for(const kind of Object.keys(woods) as TreeKind[]){
      const {world}=garden();world.set(0,64,0,id(`${woods[kind]}_sapling`),'player');
      for(let z=-2;z<=2;z++)for(let x=-2;x<=2;x++)world.set(x,66,z,B.stone,'player');
      const before=world.editCount;
      expect(T.growTree(world,0,64,0,kind,mulberry32(9)),kind).toBe(false);
      expect(world.editCount).toBe(before);expect(world.get(0,64,0)).toBe(id(`${woods[kind]}_sapling`));
      // Not enough height under the build limit.
      const top=garden().world;top.set(0,CH-1,0,id(`${woods[kind]}_sapling`),'player');
      expect(T.growTree(top,0,CH-1,0,kind,mulberry32(9)),kind+' at the build limit').toBe(false);
    }
  });
  test('2x2 dark oak and spruce saplings grow giant trees; a single one falls back to a single trunk',()=>{
    for(const [kind,wood] of [['dark_oak','dark_oak'],['mega_spruce','spruce'],['spruce','spruce'],['jungle','jungle']] as const){
      const {world}=garden();for(const [x,z] of [[0,0],[1,0],[0,1],[1,1]])world.set(x,64,z,id(`${wood}_sapling`),'player');
      expect(T.growTree(world,1,64,1,kind,mulberry32(3)),kind).toBe(true);
      for(const [x,z] of [[0,0],[1,0],[0,1],[1,1]])expect(world.get(x,64,z),`${kind} trunk ${x},${z}`).toBe(id(`${wood}_log`));
      const single=garden().world;single.set(0,64,0,id(`${wood}_sapling`),'player');
      expect(T.growTree(single,0,64,0,kind,mulberry32(3))).toBe(true);
      expect(single.get(0,64,0)).toBe(id(`${wood}_log`));expect(isLog(single.get(1,64,0))||isLog(single.get(0,64,1))).toBe(false);
    }
  });
});

describe('structures',()=>{
  test('desert wells and ruined portals are placed whole on the surface',()=>{
    const found=new Map<string,number>();
    for(let i=0;i<4000&&found.size<2;i++){
      const cx=(i%80)-40,cz=Math.floor(i/80)-25,s=T.structureIn(cx,cz);if(!s||found.has(s.kind))continue;
      const c=T.generate(cx,cz),get=(x:number,y:number,z:number)=>c.blocks[(x-cx*CS)+(z-cz*CS)*CS+y*LAYER];
      if(s.kind==='desert_well'){
        expect(biomeDef(T.biomeAt(s.x,s.z)).name).toBe('desert');
        expect(get(s.x,s.y,s.z)).toBe(B.water);for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]])expect(get(s.x+dx,s.y,s.z+dz)).toBe(B.water);
        expect(get(s.x,s.y-1,s.z)).toBe(id('sandstone'));expect(get(s.x,s.y+4,s.z)).toBe(id('sandstone'));
        for(const [dx,dz] of [[1,1],[-1,1],[1,-1],[-1,-1]])for(let y=1;y<=3;y++)expect(get(s.x+dx,s.y+y,s.z+dz)).toBe(id('sandstone'));
      }else{
        let obsidian=0;for(let y=s.y-2;y<s.y+8;y++)for(let z=cz*CS;z<cz*CS+CS;z++)for(let x=cx*CS;x<cx*CS+CS;x++)if(get(x,y,z)===B.obsidian)obsidian++;
        expect(obsidian).toBeGreaterThanOrEqual(4);
      }
      found.set(s.kind,i);
    }
    expect([...found.keys()].sort()).toEqual(['desert_well','ruined_portal']);
  });
});
