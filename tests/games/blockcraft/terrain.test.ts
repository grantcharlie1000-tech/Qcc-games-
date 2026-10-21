// Terrain and biomes: determinism, the multi-noise biome map, heights, surface rules, caves,
// bedrock/deepslate layers, ores, spawn point and the per-chunk generation budget.
import {describe,expect,test} from 'vitest';
import {createTerrain,TerrainGenerator} from '../../../src/games/blockcraft/world/terrain';
import {ORE_RULES} from '../../../src/games/blockcraft/world/terrain-ores';
import {CaveField,CAVE_CHEESE,CAVE_SPAGHETTI,CAVE_NOODLE} from '../../../src/games/blockcraft/world/terrain-caves';
import {BIOMES,biomeDef,biomeId} from '../../../src/games/blockcraft/data/biomes';
import {AIR,B,blockDef,blockId,isWater,SOLID} from '../../../src/games/blockcraft/data/blocks';
import {CS,CH,LAYER,SEA_LEVEL} from '../../../src/games/blockcraft/engine/constants';
import {VoxelWorld} from '../../../src/games/blockcraft/world/world';
import type {ChunkData} from '../../../src/games/blockcraft/engine/contracts';

const id=(name:string)=>blockId(name);
const at=(c:ChunkData,x:number,y:number,z:number)=>c.blocks[x+z*CS+y*LAYER];
const family=(b:number)=>blockDef(b).family;
const isLog=(b:number)=>family(b).endsWith('_log');
const isLeaves=(b:number)=>family(b).endsWith('_leaves');
const TERRAIN_SOLIDS=new Set(['stone','granite','diorite','andesite','dirt','coarse_dirt','grass_block','podzol','mycelium','sand','red_sand',
  'sandstone','red_sandstone','gravel','clay','snow_block','deepslate','tuff','bedrock','moss_block'].map(id));
const isOre=(b:number)=>family(b).endsWith('_ore');
const isTerrain=(b:number)=>TERRAIN_SOLIDS.has(b)||isOre(b);
const LIQUID_OF=(b:number)=>!!blockDef(b).liquid;

/** A biome map sampled on a grid: index (i + j*n) for world (x0 + i*step, z0 + j*step). */
function biomeMap(t:TerrainGenerator,half:number,step:number){
  const n=Math.floor(2*half/step)+1,biomes=new Uint8Array(n*n),heights=new Int16Array(n*n);
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){const x=-half+i*step,z=-half+j*step;biomes[i+j*n]=t.biomeAt(x,z);heights[i+j*n]=t.heightAt(x,z);}
  return{n,step,half,biomes,heights,x:(i:number)=>-half+i*step,z:(j:number)=>-half+j*step};
}
const T1=createTerrain(1234) as TerrainGenerator;
let cachedMap:ReturnType<typeof biomeMap>|null=null;
const map=()=>cachedMap??=biomeMap(T1,4096,32);
/** Chunk coordinates of map samples whose biome is `name` (up to `limit`, spread over the map). */
function chunksIn(name:string,limit:number):[number,number][]{
  const m=map(),b=biomeId(name),out:[number,number][]=[],seen=new Set<string>();
  for(let k=0;k<m.biomes.length&&out.length<limit;k++){
    const idx=(k*7919)%m.biomes.length;if(m.biomes[idx]!==b)continue;
    const cx=Math.floor(m.x(idx%m.n)/CS),cz=Math.floor(m.z(Math.floor(idx/m.n))/CS),key=cx+','+cz;
    if(!seen.has(key)){seen.add(key);out.push([cx,cz]);}
  }
  return out;
}
function region(t:TerrainGenerator,cx:number,cz:number,r=1){
  const w=new VoxelWorld();
  for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++)w.insert(cx+dx,cz+dz,t.generate(cx+dx,cz+dz));
  return w;
}

describe('terrain determinism',()=>{
  test('the same seed and chunk always give the same blocks and biomes; seeds differ',()=>{
    const a=createTerrain(77),b=createTerrain(77),c=createTerrain(78);
    for(const [cx,cz] of [[0,0],[-1,-1],[5,-9],[-40,31],[200,-170]]){
      const ca=a.generate(cx,cz),cb=b.generate(cx,cz);
      expect(ca.blocks).toEqual(cb.blocks);expect(ca.biomes).toEqual(cb.biomes);
    }
    // Generating other chunks in between must not change a chunk (no hidden state).
    const first=a.generate(3,3).blocks.slice();a.generate(-8,2);a.generate(100,100);expect(a.generate(3,3).blocks).toEqual(first);
    expect(c.generate(0,0).blocks).not.toEqual(a.generate(0,0).blocks);
  });
  test('biomeAt and heightAt agree with generate',()=>{
    let columns=0,surface=0;
    for(const [cx,cz] of [[0,0],[3,-2],[-7,5],[12,12],[-20,-3],...chunksIn('mountains',2),...chunksIn('river',2),...chunksIn('ocean',2)]){
      const c=T1.generate(cx,cz);
      for(let z=0;z<CS;z++)for(let x=0;x<CS;x++){
        const wx=cx*CS+x,wz=cz*CS+z,h=T1.heightAt(wx,wz);
        expect(c.biomes[x+z*CS]).toBe(T1.biomeAt(wx,wz));
        columns++;if(isTerrain(at(c,x,h,z)))surface++;
        // Nothing above the surface is terrain (only trees, plants, snow, ice, water and small structures).
        for(let y=h+1;y<CH;y++){const b=at(c,x,y,z);if(isTerrain(b)&&b!==id('sandstone')&&b!==id('mossy_cobblestone'))throw new Error(`terrain ${blockDef(b).name} above heightAt at ${wx},${y},${wz} (h=${h})`);}
      }
    }
    // Only occasional cave mouths remove the surface block.
    expect(surface/columns).toBeGreaterThan(.97);
  });
});

describe('border continuity',()=>{
  test('caves, ore veins and blobs continue across chunk borders as they do inside a chunk',()=>{
    // Compare voxel pairs straddling the seam between two chunks (x 15 | 0) with pairs in the middle (x 7 | 8).
    const kind=(b:number)=>b===AIR?0:LIQUID_OF(b)?1:isOre(b)?2:3;
    const tally={seam:{same:0,n:0,ore:0,oreSame:0},mid:{same:0,n:0,ore:0,oreSame:0}};
    const count=(t:typeof tally.seam,a:number,b:number)=>{t.n++;if(kind(a)===kind(b))t.same++;if(isOre(a)){t.ore++;if(b===a)t.oreSame++;}};
    for(let row=0;row<16;row++){
      const cx=row*3-20,cz=(row*7)%19-9,a=T1.generate(cx,cz),b=T1.generate(cx+1,cz);
      for(let z=0;z<CS;z++)for(let y=1;y<64;y++){
        count(tally.seam,at(a,15,y,z),at(b,0,y,z));count(tally.seam,at(b,0,y,z),at(a,15,y,z));
        count(tally.mid,at(a,7,y,z),at(a,8,y,z));count(tally.mid,at(a,8,y,z),at(a,7,y,z));
      }
    }
    const same=(t:typeof tally.seam)=>t.same/t.n,ore=(t:typeof tally.seam)=>t.oreSame/t.ore;
    expect(Math.abs(same(tally.seam)-same(tally.mid))).toBeLessThan(.02);
    expect(tally.seam.ore).toBeGreaterThan(100);
    expect(ore(tally.seam)).toBeGreaterThan(ore(tally.mid)*.75);
  });
});

describe('biome map',()=>{
  test('all 23 biomes appear over a large area',()=>{
    const m=map(),counts=new Array(BIOMES.length).fill(0);for(const b of m.biomes)counts[b]++;
    const missing=BIOMES.filter(b=>!counts[b.id]).map(b=>b.name);
    expect(missing).toEqual([]);expect(BIOMES).toHaveLength(23);
    // Mushroom fields are rare.
    expect(counts[biomeId('mushroom_fields')]/m.biomes.length).toBeLessThan(.01);
    // Oceans cover a good share, land the majority.
    const ocean=(counts[biomeId('ocean')]+counts[biomeId('deep_ocean')])/m.biomes.length;
    expect(ocean).toBeGreaterThan(.15);expect(ocean).toBeLessThan(.5);
  });
  test('climates are believable: deserts and jungles never touch snow; beaches and stony shores line the sea; rivers sit at sea level',()=>{
    const m=map(),{n}=m,name=(k:number)=>biomeDef(m.biomes[k]).name;
    const near=(k:number,r:number,pred:(k2:number)=>boolean)=>{
      const i=k%n,j=Math.floor(k/n);
      for(let dj=-r;dj<=r;dj++)for(let di=-r;di<=r;di++){const i2=i+di,j2=j+dj;if(i2>=0&&j2>=0&&i2<n&&j2<n&&pred(i2+j2*n))return true;}
      return false;
    };
    const snowy=(k:number)=>biomeDef(m.biomes[k]).snowy;
    const water=(k:number)=>m.heights[k]<SEA_LEVEL;
    let beaches=0,beachesByWater=0,shores=0,shoresSteep=0,frozen=0,frozenCold=0,mushroom=0,mushroomIsolated=0;
    for(let k=0;k<m.biomes.length;k++){
      const b=name(k);
      if(b==='desert'||b==='badlands'||b==='jungle'||b==='savanna')expect(near(k,1,snowy),`${b} next to snow at ${m.x(k%n)},${m.z(Math.floor(k/n))}`).toBe(false);
      if(b==='river'||b==='frozen_river')expect(m.heights[k]).toBeLessThanOrEqual(SEA_LEVEL);
      if(b==='frozen_river'){frozen++;if(near(k,2,k2=>snowy(k2)&&!name(k2).includes('river')))frozenCold++;}
      if(b==='beach'){beaches++;if(near(k,1,water))beachesByWater++;}
      if(b==='stony_shore'){shores++;if(near(k,2,water)&&near(k,2,k2=>m.heights[k2]>=72))shoresSteep++;}
      if(b==='mushroom_fields'){mushroom++;
        // Isolated in the ocean: the ring 5 samples (160 blocks) away is mostly ocean.
        const i=k%n,j=Math.floor(k/n);let ocean=0,total=0;
        for(let a=0;a<16;a++){const i2=Math.round(i+5*Math.cos(a/16*Math.PI*2)),j2=Math.round(j+5*Math.sin(a/16*Math.PI*2));
          if(i2<0||j2<0||i2>=n||j2>=n)continue;total++;const nb=name(i2+j2*n);if(nb==='ocean'||nb==='deep_ocean'||nb==='mushroom_fields')ocean++;}
        if(ocean>=total*.75)mushroomIsolated++;}
    }
    expect(beachesByWater/beaches).toBeGreaterThan(.9);
    expect(shoresSteep/shores).toBeGreaterThan(.8);
    expect(frozenCold/frozen).toBeGreaterThan(.8);
    expect(mushroomIsolated/mushroom).toBeGreaterThan(.8);
  });
});

describe('heights',()=>{
  const stats=(name:string)=>{
    const m=map(),b=biomeId(name),hs:number[]=[];for(let k=0;k<m.biomes.length;k++)if(m.biomes[k]===b)hs.push(m.heights[k]);
    hs.sort((a,c)=>a-c);const q=(p:number)=>hs[Math.min(hs.length-1,Math.floor(p*hs.length))];
    return{min:hs[0],max:hs[hs.length-1],q05:q(.05),q50:q(.5),q95:q(.95)};
  };
  test('plains are low and gentle, oceans and deep oceans sit at vanilla-like depths',()=>{
    const plains=stats('plains');expect(plains.q05).toBeGreaterThanOrEqual(62);expect(plains.q95).toBeLessThanOrEqual(74);
    const ocean=stats('ocean');expect(ocean.q05).toBeGreaterThanOrEqual(38);expect(ocean.q95).toBeLessThanOrEqual(57);
    const deep=stats('deep_ocean');expect(deep.q05).toBeGreaterThanOrEqual(26);expect(deep.q95).toBeLessThanOrEqual(40);
    const forest=stats('forest');expect(forest.q95-forest.q05).toBeGreaterThanOrEqual(5);
  });
  test('mountains reach about 120 with snowy peaks above about 100',()=>{
    const m=map();let max=0;for(const h of m.heights)max=Math.max(max,h);
    expect(max).toBeGreaterThanOrEqual(110);expect(max).toBeLessThanOrEqual(CH-6);
    const peaks=stats('snowy_peaks');expect(peaks.q05).toBeGreaterThanOrEqual(95);
    const hills=stats('mountains');expect(hills.q50).toBeGreaterThanOrEqual(76);
    const cherry=stats('cherry_grove');expect(cherry.q50).toBeGreaterThanOrEqual(70);
  });
  test('neighbouring columns change smoothly, also across biome borders',()=>{
    const steep=new Set(['mountains','snowy_peaks','stony_shore','cherry_grove','badlands','mushroom_fields'].map(biomeId));
    let borders=0,cliffs=0;
    for(let k=0;k<4000;k++){
      const x=Math.floor(((k*2654435761)>>>0)/4294967296*6000)-3000,z=Math.floor(((k*40503+17)*2246822519>>>0)/4294967296*6000)-3000;
      for(let s=0;s<16;s++){
        const a=T1.biomeAt(x+s,z),b=T1.biomeAt(x+s+1,z);if(a===b||steep.has(a)||steep.has(b))continue;
        borders++;if(Math.abs(T1.heightAt(x+s,z)-T1.heightAt(x+s+1,z))>2)cliffs++;
      }
    }
    expect(borders).toBeGreaterThan(30);expect(cliffs/borders).toBeLessThan(.02);
  });
});

describe('surface rules',()=>{
  /** Columns of generated chunks in a biome, with their surface height. */
  function* columns(name:string,chunks=4){
    for(const [cx,cz] of chunksIn(name,chunks)){
      const c=T1.generate(cx,cz);
      for(let z=0;z<CS;z++)for(let x=0;x<CS;x++)if(c.biomes[x+z*CS]===biomeId(name))yield{c,x,z,h:T1.heightAt(cx*CS+x,cz*CS+z)};
    }
  }
  const depthOf=(c:ChunkData,x:number,z:number,h:number,block:number)=>{let d=0;while(at(c,x,h-1-d,z)===block)d++;return d;};
  test('grassland: grass over 3-5 dirt over stone',()=>{
    let n=0,ok=0;
    for(const {c,x,z,h} of columns('plains',6)){
      if(h<=SEA_LEVEL||at(c,x,h,z)!==B.grass)continue;n++;
      const d=depthOf(c,x,z,h,B.dirt),below=at(c,x,h-1-d,z);
      if(d>=3&&d<=5&&(below===B.stone||!SOLID[below]||blockDef(below).family!=='dirt'))ok++;
    }
    expect(n).toBeGreaterThan(200);expect(ok/n).toBeGreaterThan(.95);
  });
  test('deserts are sand over sandstone, badlands red sand over red sandstone, beaches sand',()=>{
    let n=0,ok=0;
    for(const {c,x,z,h} of columns('desert')){if(h<=SEA_LEVEL)continue;n++;const d=depthOf(c,x,z,h,B.sand);if(at(c,x,h,z)===B.sand&&d>=2&&at(c,x,h-1-d,z)===id('sandstone'))ok++;}
    expect(n).toBeGreaterThan(100);expect(ok/n).toBeGreaterThan(.9);
    n=0;ok=0;
    for(const {c,x,z,h} of columns('badlands')){if(h<=SEA_LEVEL)continue;n++;if(at(c,x,h,z)===id('red_sand')&&at(c,x,h-1,z)===id('red_sandstone'))ok++;}
    expect(n).toBeGreaterThan(100);expect(ok/n).toBeGreaterThan(.85);
    n=0;ok=0;for(const {c,x,z,h} of columns('beach')){n++;if(at(c,x,h,z)===B.sand)ok++;}
    expect(ok/n).toBeGreaterThan(.95);
  });
  test('underwater floors have gravel or clay patches',()=>{
    const seen=new Set<number>();
    for(const name of ['ocean','river','swamp'])for(const {c,x,z,h} of columns(name,5))if(h<SEA_LEVEL&&isWater(at(c,x,h+1,z)))seen.add(at(c,x,h,z));
    expect(seen.has(B.gravel)).toBe(true);expect(seen.has(id('clay'))).toBe(true);expect(seen.has(B.sand)).toBe(true);
  });
  test('snowy biomes get snow layers on exposed tops and ice on sea-level water',()=>{
    let exposed=0,snowed=0,water=0,ice=0;
    for(const name of ['snowy_plains','snowy_taiga','frozen_river'])for(const {c,x,z} of columns(name,4)){
      let y=CH-1;while(y>0&&at(c,x,y,z)===AIR)y--;const top=at(c,x,y,z);
      if(top===B.snow){snowed++;exposed++;continue;}
      if(top===B.ice){ice++;water++;continue;}
      if(isWater(top)){water++;continue;}
      if(SOLID[top]&&(blockDef(top).opaque||isLeaves(top)))exposed++;
    }
    expect(exposed).toBeGreaterThan(100);expect(snowed/exposed).toBeGreaterThan(.97);
    expect(water).toBeGreaterThan(20);expect(ice/water).toBe(1);
    // Warm water never freezes.
    for(const {c,x,z,h} of columns('ocean',3))if(h<SEA_LEVEL)expect(at(c,x,SEA_LEVEL,z)).not.toBe(B.ice);
  });
  test('snowy peaks are snow blocks with stone on steep faces',()=>{
    const seen=new Map<number,number>();
    for(const {c,x,z,h} of columns('snowy_peaks',6)){const b=at(c,x,h,z);seen.set(b,(seen.get(b)??0)+1);}
    expect(seen.get(B.snowBlock)??0).toBeGreaterThan(50);expect(seen.get(B.stone)??0).toBeGreaterThan(5);
  });
});

describe('caves and layers',()=>{
  const sample=[[0,0],[1,0],[0,1],[-3,4],[9,-6],[17,2],[-12,-12],[30,9],[-25,14],[6,22]] as const;
  test('cheese caverns, spaghetti tunnels and noodle caves all occur',()=>{
    const f=new CaveField(1234),kinds=new Set<number>();
    for(let i=0;i<60000;i++){const x=(i*37)%997-500,y=10+(i*13)%50,z=Math.floor(i/997)*17-500;const k=f.sample(x,y,z);if(k)kinds.add(k);}
    expect([...kinds].sort()).toEqual([CAVE_CHEESE,CAVE_SPAGHETTI,CAVE_NOODLE].sort());
  });
  test('caves hollow out the underground, lava fills cave air below y=10, and some caves open on land',()=>{
    let underground=0,air=0,lavaLow=0,airLow=0,openings=0;
    for(const [cx,cz] of sample){
      const c=T1.generate(cx,cz);
      for(let z=0;z<CS;z++)for(let x=0;x<CS;x++){
        const h=T1.heightAt(cx*CS+x,cz*CS+z);
        if(h>SEA_LEVEL&&at(c,x,h,z)===AIR)openings++;
        for(let y=1;y<Math.min(h-8,CH);y++){const b=at(c,x,y,z);
          if(y<10){if(b===AIR)airLow++;if(b===B.lava)lavaLow++;continue;}
          underground++;if(b===AIR)air++;}
      }
    }
    expect(airLow).toBe(0);expect(lavaLow).toBeGreaterThan(0);
    expect(air/underground).toBeGreaterThan(.03);expect(air/underground).toBeLessThan(.2);
    let anyOpen=openings;for(const [cx,cz] of chunksIn('plains',20))if(anyOpen<1){const c=T1.generate(cx,cz);for(let i=0;i<LAYER;i++){const x=i%CS,z=i>>4;if(at(c,x,T1.heightAt(cx*CS+x,cz*CS+z),z)===AIR)anyOpen++;}}
    expect(anyOpen).toBeGreaterThan(0);
  });
  test('caves never breach ocean or river floors',()=>{
    for(const [cx,cz] of [...chunksIn('ocean',4),...chunksIn('river',6),...chunksIn('beach',3),...chunksIn('deep_ocean',2)]){
      const w=region(T1,cx,cz,1);
      for(let z=0;z<CS;z++)for(let x=0;x<CS;x++)for(let y=1;y<=SEA_LEVEL;y++){
        const wx=cx*CS+x,wz=cz*CS+z;if(!isWater(w.get(wx,y,wz)))continue;
        for(const [dx,dy,dz] of [[1,0,0],[-1,0,0],[0,-1,0],[0,0,1],[0,0,-1]])
          if(w.get(wx+dx,y+dy,wz+dz)===AIR)throw new Error(`water at ${wx},${y},${wz} touches cave air`);
      }
    }
  });
  test('jagged bedrock at y 0-4 and deepslate below y 8 blending into stone by y 16',()=>{
    const count=new Map<string,number>(),inc=(k:string)=>count.set(k,(count.get(k)??0)+1);
    for(const [cx,cz] of sample){
      const c=T1.generate(cx,cz);
      for(let i=0;i<LAYER;i++){
        expect(c.blocks[i]).toBe(B.bedrock);
        for(let y=1;y<24;y++){const b=c.blocks[i+y*LAYER];
          if(b===B.bedrock){expect(y).toBeLessThanOrEqual(4);inc('bedrock'+y);}
          const deep=b===id('deepslate')||b===id('tuff')||family(b).startsWith('deepslate_');
          const stoneLike=b===B.stone||b===id('granite')||b===id('diorite')||b===id('andesite')||(isOre(b)&&!family(b).startsWith('deepslate_'));
          if(deep)inc('deep'+y);if(stoneLike)inc('stone'+y);
          if(y<8)expect(stoneLike,`stone at y=${y}`).toBe(false);
          if(y>=16)expect(deep,`deepslate at y=${y}`).toBe(false);
        }
      }
    }
    for(let y=1;y<=4;y++)expect(count.get('bedrock'+y)??0).toBeGreaterThan(0);
    expect(count.get('bedrock1')!).toBeGreaterThan(count.get('bedrock4')!);
    for(let y=9;y<=14;y++){expect(count.get('deep'+y)??0).toBeGreaterThan(0);expect(count.get('stone'+y)??0).toBeGreaterThan(0);}
    expect(count.get('deep9')!).toBeGreaterThan(count.get('deep14')!);
  });
  test('stone varieties, gravel and dirt blobs underground; tuff in the deepslate; moss and mushrooms on cave floors',()=>{
    const counts=new Map<number,number>(),moss={floor:0},mush={n:0};
    for(const [cx,cz] of [...sample,[40,40],[-40,40],[40,-40],[-40,-40],[60,0],[0,60]]){
      const c=T1.generate(cx,cz);
      for(let z=0;z<CS;z++)for(let x=0;x<CS;x++){
        const h=T1.heightAt(cx*CS+x,cz*CS+z);
        for(let y=1;y<h-6;y++){const b=at(c,x,y,z);counts.set(b,(counts.get(b)??0)+1);
          if(b===id('tuff'))expect(y).toBeLessThanOrEqual(16);
          if(b===id('moss_block')&&at(c,x,y+1,z)!==AIR&&!blockDef(at(c,x,y+1,z)).replaceable&&blockDef(at(c,x,y+1,z)).shape!=='cross')moss.floor++;
          if((b===id('brown_mushroom')||b===id('red_mushroom'))&&y<h-10)mush.n++;}
      }
    }
    for(const name of ['granite','diorite','andesite','gravel','dirt','tuff','moss_block'])expect(counts.get(id(name))??0,name).toBeGreaterThan(50);
    expect(moss.floor).toBe(0);expect(mush.n).toBeGreaterThan(0);
  });
});

describe('ores',()=>{
  const chunks:[number,number][]=[];for(let i=0;i<40;i++)chunks.push([(i*7)%23-11,Math.floor(i/3)*5-30]);
  const ys=new Map<string,number[]>();
  const collect=()=>{if(ys.size)return ys;
    for(const [cx,cz] of chunks){const c=T1.generate(cx,cz);
      for(let i=0;i<c.blocks.length;i++){const b=c.blocks[i];if(!isOre(b))continue;const n=blockDef(b).name.replace('deepslate_','');
        (ys.get(n)??ys.set(n,[]).get(n)!).push(Math.floor(i/LAYER));}}
    return ys;};
  const hist=(name:string,lo:number,hi:number)=>(collect().get(name)??[]).filter(y=>y>=lo&&y<=hi).length;
  test('ore rules match the brief ranges',()=>{
    const range=(name:string)=>ORE_RULES.filter(r=>r.ore===name).reduce((a,r)=>[Math.min(a[0],r.minY),Math.max(a[1],r.maxY)],[999,-999]);
    expect(range('coal')).toEqual([0,127]);expect(range('iron')).toEqual([0,72]);expect(range('copper')).toEqual([0,96]);
    expect(range('gold')).toEqual([0,32]);expect(range('redstone')).toEqual([0,16]);expect(range('lapis')).toEqual([0,32]);
    expect(range('diamond')).toEqual([0,16]);expect(range('emerald')[0]).toBeGreaterThanOrEqual(0);
    // Vanilla vein sizes.
    const size=(name:string)=>Math.max(...ORE_RULES.filter(r=>r.ore===name).map(r=>r.size));
    expect(size('coal')).toBe(17);expect(size('iron')).toBe(9);expect(size('copper')).toBe(10);expect(size('gold')).toBe(9);
    expect(size('redstone')).toBe(8);expect(size('lapis')).toBe(7);expect(size('emerald')).toBe(3);
  });
  test('generated ores stay inside their height ranges',()=>{
    const limits:Record<string,[number,number]>={coal_ore:[0,127],iron_ore:[0,72],copper_ore:[0,96],gold_ore:[0,32],redstone_ore:[0,16],lapis_ore:[0,32],diamond_ore:[0,16]};
    for(const [name,[lo,hi]] of Object.entries(limits)){
      const list=collect().get(name)??[];expect(list.length,name).toBeGreaterThan(10);
      expect(Math.min(...list),name).toBeGreaterThanOrEqual(lo);expect(Math.max(...list),name).toBeLessThanOrEqual(hi);
    }
  });
  test('iron peaks near 16 and 56, lapis is triangular, coal is most common near the surface, diamonds are rare',()=>{
    expect(hist('iron_ore',12,20)).toBeGreaterThan(hist('iron_ore',30,38));expect(hist('iron_ore',52,60)).toBeGreaterThan(hist('iron_ore',30,38));
    expect(hist('lapis_ore',12,20)).toBeGreaterThan(hist('lapis_ore',0,8));expect(hist('lapis_ore',12,20)).toBeGreaterThan(hist('lapis_ore',25,32));
    expect(hist('coal_ore',48,80)).toBeGreaterThan(hist('coal_ore',0,32));
    expect(hist('diamond_ore',0,16)).toBeLessThan(hist('iron_ore',0,16));
  });
  test('ores in deepslate use the deepslate variants',()=>{
    for(const [cx,cz] of chunks.slice(0,10)){const c=T1.generate(cx,cz);
      for(let i=0;i<c.blocks.length;i++){const b=c.blocks[i],y=Math.floor(i/LAYER);if(!isOre(b))continue;
        if(y<8)expect(blockDef(b).name.startsWith('deepslate_'),blockDef(b).name).toBe(true);
        if(y>=16)expect(blockDef(b).name.startsWith('deepslate_'),blockDef(b).name).toBe(false);}}
  });
  test('emeralds only in mountains',()=>{
    let found=0;
    for(const [cx,cz] of [...chunksIn('mountains',14),...chunksIn('snowy_peaks',6),...chunksIn('plains',4),...chunksIn('forest',4)]){
      const c=T1.generate(cx,cz);
      for(let i=0;i<c.blocks.length;i++)if(c.blocks[i]===id('emerald_ore')){found++;const name=biomeDef(c.biomes[i%LAYER]).name;expect(['mountains','snowy_peaks']).toContain(name);}
    }
    expect(found).toBeGreaterThan(0);
  });
});

describe('spawn point',()=>{
  test('dry land near the origin, standing room, no canopy above',()=>{
    for(const seed of [1,42,1234,98765,7,2024]){
      const t=createTerrain(seed),s=t.spawnPoint();
      expect(Math.abs(s.x)).toBeLessThan(320);expect(Math.abs(s.z)).toBeLessThan(320);
      const x=Math.floor(s.x),y=Math.floor(s.y),z=Math.floor(s.z),cx=Math.floor(x/CS),cz=Math.floor(z/CS);
      const w=region(t as TerrainGenerator,cx,cz,1);
      const ground=w.get(x,y-1,z);expect(SOLID[ground],`ground ${blockDef(ground).name}`).toBe(1);
      expect(isLeaves(ground)||isLog(ground)||isWater(ground)||ground===B.ice).toBe(false);
      expect(y).toBeGreaterThan(SEA_LEVEL);
      for(let dy=0;dy<2;dy++){const b=w.get(x,y+dy,z);expect(SOLID[b]).toBe(0);expect(blockDef(b).liquid).toBeUndefined();}
      for(let yy=y;yy<CH;yy++){const b=w.get(x,yy,z);expect(isLeaves(b)||isLog(b),`canopy at ${yy}`).toBe(false);}
      expect(['ocean','deep_ocean','river','frozen_river']).not.toContain(biomeDef(t.biomeAt(x,z)).name);
    }
  });
});

describe('performance',()=>{
  test('generate() averages at most 4 ms per chunk',()=>{
    // Scattered chunks (no shared neighbours, so no warm caches), three rounds of 64 distinct chunks each; the best
    // round's average is the generator's cost without other processes competing for the CPU.
    const t=createTerrain(2024),rounds:number[]=[];
    for(let i=0;i<6;i++)t.generate(-50-i,50+i);
    for(let round=0;round<3;round++){
      const start=performance.now();
      for(let i=0;i<64;i++)t.generate((i%8)*3-12+round*40,Math.floor(i/8)*5-20);
      rounds.push((performance.now()-start)/64);
    }
    console.log(`terrain generate(): ${rounds.map(r=>r.toFixed(2)).join(' / ')} ms per chunk (rounds of 64 chunks)`);
    expect(Math.min(...rounds)).toBeLessThan(4);
  });
});
