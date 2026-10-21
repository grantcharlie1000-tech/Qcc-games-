import {describe,expect,test} from 'vitest';
import {BLOCKS,OPAQUE,LAYER as BLOCK_LAYER,blockId,blockDef,doorPanelBox,stairsBoxes,tileIndex,TILE_NAMES,type Shape} from '../../../src/games/blockcraft/data/blocks';
import {biomeDef,biomeId} from '../../../src/games/blockcraft/data/biomes';
import {CS,CH,CHUNK_VOLUME,LAYER,PAD_VOLUME,MAX_PART_QUADS,padIndex,voxelIndex} from '../../../src/games/blockcraft/engine/constants';
import {createTerrain} from '../../../src/games/blockcraft/world/terrain';
import {createLightEngine} from '../../../src/games/blockcraft/world/light';
import {createMesher,meshChunk,meshBlock,plantOffset} from '../../../src/games/blockcraft/render/mesher';
import type {ChunkData,ChunkMesh,MeshPart} from '../../../src/games/blockcraft/engine/contracts';

// ---- Helpers -----------------------------------------------------------------------------------------
interface Vert{x:number;y:number;z:number;light:number;flags:number;u:number;v:number;tile:number;shade:number;rgb:number}
type Quad=Vert[];
function quads(part:MeshPart):Quad[]{
  const out:Quad[]=[];
  for(let q=0;q<part.quads;q++){
    const vs:Vert[]=[];
    for(let k=0;k<4;k++){
      const o=(q*4+k)*4,p=part.position,u=part.uvt,t=part.tint;
      vs.push({x:p[o],y:p[o+1],z:p[o+2],light:p[o+3]&255,flags:p[o+3]>>8,u:u[o],v:u[o+1],tile:u[o+2],shade:u[o+3],rgb:t[o]<<16|t[o+1]<<8|t[o+2]});
    }
    out.push(vs);
  }
  return out;
}
const all=(m:ChunkMesh)=>[...quads(m.opaque),...quads(m.cutout),...quads(m.translucent)];
/** Geometric normal of the first triangle (0,1,2): counter-clockwise from the front points toward the viewer. */
function normal(q:Quad){
  const a=q[0],b=q[1],c=q[2],ux=b.x-a.x,uy=b.y-a.y,uz=b.z-a.z,vx=c.x-a.x,vy=c.y-a.y,vz=c.z-a.z;
  return [uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx];
}
const centroid=(q:Quad)=>[0,1,2].map(i=>q.reduce((s,v)=>s+[v.x,v.y,v.z][i],0)/4);
/** Face index (+x,-x,+y,-y,+z,-z) of an axis-aligned quad from its winding. */
function faceOf(q:Quad){
  const n=normal(q),a=n.map(Math.abs),i=a.indexOf(Math.max(...a));
  return [0,2,4][i]+(n[i]>0?0:1);
}
const id=(name:string)=>blockId(name);
const empty=():ChunkData=>({blocks:new Uint8Array(CHUNK_VOLUME),biomes:new Uint8Array(LAYER)});
type Put=(x:number,y:number,z:number,block:number|string)=>void;
/** A 3×3 neighbourhood of empty chunks; put() takes coordinates relative to the centre chunk (-16..31). */
function hood(build:(put:Put,chunks:ChunkData[])=>void=()=>{}):ChunkData[]{
  const chunks=Array.from({length:9},empty);
  const put:Put=(x,y,z,block)=>{
    const cx=Math.floor(x/CS)+1,cz=Math.floor(z/CS)+1;
    chunks[cz*3+cx].blocks[voxelIndex(((x%CS)+CS)%CS,y,((z%CS)+CS)%CS)]=typeof block==='string'?id(block):block;
  };
  build(put,chunks);
  return chunks;
}
const fullLight=()=>new Uint8Array(PAD_VOLUME).fill(0xf0);
const engineLight=(n:readonly (ChunkData|null)[])=>{const l=new Uint8Array(PAD_VOLUME);createLightEngine().computePadded(n,l);return l;};
/** Mesh one block alone at cell (8,10,8) of an empty world in full light. */
const alone=(name:string)=>meshChunk(hood(put=>put(8,10,8,name)),fullLight());
const bounds=(qs:Quad[])=>{
  const vs=qs.flat();
  return {minX:Math.min(...vs.map(v=>v.x)),maxX:Math.max(...vs.map(v=>v.x)),minY:Math.min(...vs.map(v=>v.y)),maxY:Math.max(...vs.map(v=>v.y)),
    minZ:Math.min(...vs.map(v=>v.z)),maxZ:Math.max(...vs.map(v=>v.z))};
};
/** Pixel bounds of a block-local box at cell (8,10,8). */
const cellBox=(box:readonly number[])=>({minX:128+box[0]*16,minY:160+box[1]*16,minZ:128+box[2]*16,maxX:128+box[3]*16,maxY:160+box[4]*16,maxZ:128+box[5]*16});
const inside=(p:number[],boxes:readonly number[],cell=[8,10,8])=>{
  for(let i=0;i<boxes.length;i+=6){
    const ok=[0,1,2].every(a=>p[a]>(cell[a]+boxes[i+a])*16&&p[a]<(cell[a]+boxes[i+3+a])*16);
    if(ok)return true;
  }
  return false;
};
/** Every quad faces outward: just in front of it is outside the solid, just behind it is inside. */
function expectOutward(qs:Quad[],boxes:readonly number[],cell=[8,10,8]){
  for(const q of qs){
    // Sample at the first triangle's centroid (never on an internal box boundary).
    const n=normal(q),len=Math.hypot(...n),unit=n.map(v=>v/len),c=[0,1,2].map(i=>(q[0][axes[i]]+q[1][axes[i]]+q[2][axes[i]])/3);
    expect(inside(c.map((v,i)=>v+unit[i]*.25),boxes,cell)).toBe(false);
    expect(inside(c.map((v,i)=>v-unit[i]*.25),boxes,cell)).toBe(true);
  }
}
const axes=['x','y','z'] as const;
const SHADE_VANILLA=[.6,.6,1,.5,.8,.8].map(s=>Math.round(255*s));

// ---- Layout ------------------------------------------------------------------------------------------
describe('mesh layout',()=>{
  test('generated terrain follows the MeshPart layout and stays in bounds',()=>{
    const t=createTerrain(11),n:ChunkData[]=[];
    for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)n.push(t.generate(dx,dz));
    const mesh=createMesher().meshChunk(n,engineLight(n));
    expect(mesh.opaque.quads).toBeGreaterThan(50);
    for(const part of [mesh.opaque,mesh.cutout,mesh.translucent]){
      expect(part.position.length).toBe(part.quads*16);expect(part.uvt.length).toBe(part.quads*16);expect(part.tint.length).toBe(part.quads*16);
      expect(part.quads).toBeLessThanOrEqual(MAX_PART_QUADS);
      for(const v of quads(part).flat()){
        expect(v.x).toBeLessThanOrEqual(CS*16+4);expect(v.z).toBeLessThanOrEqual(CS*16+4);expect(v.y).toBeLessThanOrEqual((CH+2)*16);
        expect(v.flags&~7).toBe(0);expect(v.tile).toBeLessThan(TILE_NAMES.length);
      }
      for(let i=3;i<part.tint.length;i+=4)expect(part.tint[i]).toBe(255);
    }
    expect(mesh.minY).toBeLessThan(mesh.maxY);expect(mesh.maxY).toBeLessThanOrEqual(CH+2);
  });
  test('outputs are copies and meshing is deterministic with reused scratch',()=>{
    const n=hood(put=>{for(let x=0;x<16;x++)for(let z=0;z<16;z++)put(x,5,z,'grass_block');put(3,6,3,'short_grass');put(4,6,4,'water');});
    const l=fullLight(),a=meshChunk(n,l);
    meshChunk(hood(put=>put(1,1,1,'stone')),l);
    const b=meshChunk(n,l);
    expect(b.opaque.position).toEqual(a.opaque.position);expect(b.cutout.uvt).toEqual(a.cutout.uvt);expect(b.translucent.tint).toEqual(a.translucent.tint);
    a.opaque.position.fill(0);expect(meshChunk(n,l).opaque.position).toEqual(b.opaque.position);
  });
  test('an empty chunk has no quads and a zero height range',()=>{
    const m=meshChunk(hood(),fullLight());
    expect(m.opaque.quads+m.cutout.quads+m.translucent.quads).toBe(0);expect([m.minY,m.maxY]).toEqual([0,0]);
  });
  test('buffers grow for dense chunks and never exceed MAX_PART_QUADS',()=>{
    const n=hood(put=>{for(let y=0;y<40;y++)for(let z=0;z<16;z++)for(let x=0;x<16;x++)if((x+y+z)%2===0)put(x,y,z,'stone');});
    const m=meshChunk(n,fullLight());
    // A 3D checkerboard: every stone shows all six faces except where y=0 rests on the stone floor below the world.
    expect(m.opaque.quads).toBe(40*128*6-128);
    expect(m.opaque.position.length).toBe(m.opaque.quads*16);
  });
  test('a part stops at exactly MAX_PART_QUADS with whole quads, and the next chunk starts fresh',()=>{
    // A chunk full of fire: six unculled quads per cell (196 608) overflows the cutout part.
    const n=hood((_,chunks)=>chunks[4].blocks.fill(id('fire')));
    const m=meshChunk(n,fullLight()),c=m.cutout,fire=quads(meshBlock(id('fire')).cutout)[0][0].tile;
    expect(CHUNK_VOLUME*6).toBeGreaterThan(MAX_PART_QUADS);
    expect(c.quads).toBe(MAX_PART_QUADS);
    expect(c.position.length).toBe(c.quads*16);expect(c.uvt.length).toBe(c.quads*16);expect(c.tint.length).toBe(c.quads*16);
    const last=(c.quads-1)*16;
    for(let k=0;k<4;k++){expect(c.uvt[last+k*4+2]).toBe(fire);expect(c.tint[last+k*4+3]).toBe(255);}
    expect(m.opaque.quads+m.translucent.quads).toBe(0);
    expect(quads(alone('stone').opaque)).toHaveLength(6);expect(alone('stone').cutout.quads).toBe(0);
  });
});

// ---- Cubes, greedy merging and culling --------------------------------------------------------------
describe('cubes',()=>{
  test('a lone cube has six outward faces with vanilla directional shade and the tile UV convention',()=>{
    const qs=quads(alone('stone').opaque);
    expect(qs).toHaveLength(6);
    expectOutward(qs,[0,0,0,1,1,1]);
    for(const q of qs){
      const f=faceOf(q);
      for(const v of q){
        expect(v.shade).toBe(SHADE_VANILLA[f]);expect(v.light).toBe(0xf0);expect(v.tile).toBe(tileIndex('stone'));
        const lx=v.x-128,ly=v.y-160,lz=v.z-128;
        // Side faces: v up; top and bottom: u along +x, v along -z.
        const expected=[[16-lz,ly],[lz,ly],[lx,16-lz],[lx,16-lz],[lx,ly],[16-lx,ly]][f];
        expect([v.u,v.v]).toEqual(expected);
      }
    }
  });
  test('greedy merging joins uniform faces and tiles the UVs',()=>{
    const m=meshChunk(hood(put=>{for(let x=2;x<6;x++)for(let z=2;z<6;z++)put(x,10,z,'stone');}),fullLight());
    const qs=quads(m.opaque);
    expect(qs).toHaveLength(6);
    const top=qs.find(q=>faceOf(q)===2)!;
    expect(Math.max(...top.map(v=>v.u))).toBe(64);expect(Math.max(...top.map(v=>v.v))).toBe(64);
  });
  test('vertical faces merge along both axes with tiled UVs',()=>{
    const m=meshChunk(hood(put=>{for(let x=2;x<6;x++)for(let y=10;y<13;y++)put(x,y,8,'stone');}),fullLight());
    const qs=quads(m.opaque);
    expect(qs).toHaveLength(6);
    for(const f of [4,5]){
      const q=qs.find(q=>faceOf(q)===f)!;
      expect(Math.max(...q.map(v=>v.u))).toBe(64);expect(Math.max(...q.map(v=>v.v))).toBe(48);
      expect(bounds([q])).toMatchObject({minX:32,maxX:96,minY:160,maxY:208});
    }
  });
  test('side faces get AO from the floor they stand on',()=>{
    const m=meshChunk(hood(put=>{for(let x=0;x<16;x++)for(let z=0;z<16;z++)put(x,10,z,'stone');put(8,11,8,'stone');}),fullLight());
    const side=quads(m.opaque).find(q=>faceOf(q)===0&&q.every(v=>v.x===144&&v.y>=176))!;
    // Bottom vertices: the floor is both the side cell below and the diagonal corner cell → two occluders (0.6).
    for(const v of side)expect(v.shade).toBe(Math.round(255*.6*(v.y===176?.6:1)));
  });
  test('opaque neighbours hide faces, cullSame families hide shared faces',()=>{
    const pair=(a:string,b:string)=>meshChunk(hood(put=>{put(8,10,8,a);put(9,10,8,b);}),fullLight());
    expect(quads(pair('stone','stone').opaque)).toHaveLength(6);
    const glass=pair('glass','glass');expect(quads(glass.cutout)).toHaveLength(6);
    const mixed=pair('stone','glass');
    expect(quads(mixed.opaque)).toHaveLength(6);expect(quads(mixed.cutout)).toHaveLength(5);
    // Persistent and natural leaves share a family; different woods do not.
    expect(quads(pair('oak_leaves','oak_leaves_persistent').opaque)).toHaveLength(10);
    expect(quads(pair('oak_leaves','birch_leaves').opaque)).toHaveLength(12);
  });
  test('partial shapes never hide a neighbour face; identical partial faces hide each other',()=>{
    const m=meshChunk(hood(put=>{put(8,10,8,'stone');put(8,11,8,'stone_slab');put(9,10,8,'stone_slab');put(8,10,9,'oak_stairs_north');put(7,10,8,'snow');}),fullLight());
    const stone=quads(m.opaque).filter(q=>q.every(v=>v.tile===tileIndex('stone')&&v.x>=128&&v.x<=144&&v.y>=160&&v.y<=176&&v.z>=128&&v.z<=144));
    expect(new Set(stone.map(faceOf)).size).toBe(6);
    const snowRow=(n:number,other?:string)=>meshChunk(hood(put=>{for(let x=0;x<n;x++)put(4+x,10,8,'snow');if(other)put(4+n,10,8,other);}),fullLight());
    const sides=(m:ChunkMesh)=>all(m).filter(q=>q.every(v=>v.tile===tileIndex('snow'))&&[0,1].includes(faceOf(q))).length;
    expect(sides(snowRow(1))).toBe(2);expect(sides(snowRow(3))).toBe(2);
    expect(sides(snowRow(1,'stone_slab'))).toBe(2);
  });
  test('missing neighbours hide border faces',()=>{
    const n:(ChunkData|null)[]=hood(put=>put(0,10,0,'stone'));n[3]=null;
    const faces=quads(meshChunk(n,fullLight()).opaque).map(faceOf);
    expect(faces).not.toContain(1);expect(faces).toContain(0);
  });
});

// ---- Smooth light and AO ----------------------------------------------------------------------------
describe('smooth lighting',()=>{
  const floor=(extra:(put:Put)=>void=()=>{})=>hood(put=>{for(let x=-16;x<32;x++)for(let z=-16;z<32;z++)put(x,10,z,'stone');extra(put);});
  test('vertex light averages the four cells in front of it, skipping opaque cells',()=>{
    const n=floor(put=>put(9,11,8,'stone')),l=new Uint8Array(PAD_VOLUME);
    l[padIndex(8,11,8)]=14;l[padIndex(7,11,8)]=2;l[padIndex(8,11,9)]=6;
    const top=quads(meshChunk(n,l).opaque).filter(q=>faceOf(q)===2&&q.every(v=>v.y===176));
    const corner=(x:number,z:number)=>top.flatMap(q=>q).find(v=>v.x===x*16&&v.z===z*16)!;
    // Vertex (8,9): cells (7,8),(8,8),(7,9),(8,9) → 2,14,0,6 → 22/4 → 6 (rounded half up).
    expect(corner(8,9).light&15).toBe(6);
    // Vertex (9,9): cells (8,8)=14,(9,8)=opaque skipped,(8,9)=6,(9,9)=0 → 20/3 → 7.
    expect(corner(9,9).light&15).toBe(7);
    // A face with varying light is not merged: the block (8,10,8) top is its own quad.
    expect(top.filter(q=>q.every(v=>v.x>=128&&v.x<=144&&v.z>=128&&v.z<=144))).toHaveLength(1);
  });
  test('sky and block light are averaged separately',()=>{
    const n=floor(),l=new Uint8Array(PAD_VOLUME);
    for(let x=-1;x<17;x++)for(let z=-1;z<17;z++)l[padIndex(x,11,z)]=x<8?0xf0:0x0c;
    const top=quads(meshChunk(n,l).opaque).filter(q=>faceOf(q)===2);
    const v=top.flat().find(v=>v.x===128&&v.z===64)!;
    expect(v.light).toBe((Math.floor((2*30+4)/8)<<4)|Math.floor((2*24+4)/8));
  });
  test('ambient occlusion darkens vertices beside opaque blocks like vanilla (0.2 per occluder)',()=>{
    const n=floor(put=>{put(9,11,8,'stone');put(8,11,9,'stone');put(7,11,7,'stone');});
    const top=quads(meshChunk(n,fullLight()).opaque).filter(q=>faceOf(q)===2&&q.every(v=>v.y===176&&v.x>=128&&v.x<=144&&v.z>=128&&v.z<=144));
    expect(top).toHaveLength(1);
    const at=(x:number,z:number)=>top[0].find(v=>v.x===x&&v.z===z)!.shade;
    expect(at(144,144)).toBe(Math.round(255*.4));   // both sides opaque
    expect(at(144,128)).toBe(Math.round(255*.8));   // one side (9,8)
    expect(at(128,144)).toBe(Math.round(255*.8));   // one side (8,9)
    expect(at(128,128)).toBe(Math.round(255*.8));   // diagonal corner (7,7)
  });
  test('the quad is split along its brighter diagonal',()=>{
    const n=floor(put=>put(7,11,7,'stone'));
    const q=quads(meshChunk(n,fullLight()).opaque).find(q=>faceOf(q)===2&&q.some(v=>v.x===128&&v.z===128&&v.shade<255)&&q.every(v=>v.x>=128&&v.z>=128&&v.x<=144&&v.z<=144))!;
    // Triangles (0,1,2),(2,1,3): the shared edge 1–2 must not touch the dark corner.
    expect(q[1].shade).toBe(255);expect(q[2].shade).toBe(255);
  });
  test('emissive cubes get full light; light-emitting cubes have no AO (vanilla)',()=>{
    const q=quads(alone('glowstone').opaque);
    for(const v of q.flat()){expect(v.flags&4).toBe(4);expect(v.light).toBe(0xff);}
    // Glowstone set into a stone ceiling with a stone block diagonally below: the bottom face stays evenly shaded.
    const ceiling=meshChunk(hood(put=>{for(let x=6;x<11;x++)for(let z=6;z<11;z++)put(x,12,z,x===8&&z===8?'glowstone':'stone');put(9,11,9,'stone');}),fullLight());
    const bottom=quads(ceiling.opaque).filter(q=>faceOf(q)===3&&q.every(v=>v.tile===tileIndex('glowstone')));
    expect(bottom).toHaveLength(1);for(const v of bottom[0])expect(v.shade).toBe(SHADE_VANILLA[3]);
    // A lit furnace on a stone floor has no corner shadows; an unlit one keeps its AO.
    const sideShades=(name:string)=>{
      const m=meshChunk(hood(put=>{for(let x=6;x<11;x++)for(let z=6;z<11;z++)put(x,9,z,'stone');put(8,10,8,name);}),fullLight());
      return quads(m.opaque).filter(q=>faceOf(q)===0&&q.every(v=>v.x===144&&v.y>=160)).flat().map(v=>v.shade);
    };
    expect(new Set(sideShades('furnace_lit_north'))).toEqual(new Set([SHADE_VANILLA[0]]));
    expect(new Set(sideShades('furnace_north'))).toEqual(new Set([SHADE_VANILLA[0],Math.round(255*.6*.6)]));
  });
});

// ---- Tints --------------------------------------------------------------------------------------------
describe('biome tints',()=>{
  const plains=biomeId('plains'),swamp=biomeId('swamp');
  const blend=(a:number,b:number,nb:number)=>{
    const ch=(c:number,s:number)=>(c>>s)&255,mix=(s:number)=>Math.round((ch(a,s)*(9-nb)+ch(b,s)*nb)/9);
    return mix(16)<<16|mix(8)<<8|mix(0);
  };
  const grassTop=(m:ChunkMesh,x:number,z:number)=>quads(m.opaque).find(q=>faceOf(q)===2&&q.some(v=>v.x===x*16&&v.z===z*16)&&q.every(v=>v.x>=x*16&&v.x<=x*16+16&&v.z>=z*16&&v.z<=z*16+16))!;
  test('grass tops blend over 3×3 columns, using neighbour chunk biomes at the border',()=>{
    const n=hood((put,chunks)=>{
      for(const c of chunks)c.biomes.fill(plains);
      chunks[3].biomes.fill(swamp);chunks[4].biomes[8+8*16]=swamp;
      for(const [x,z] of [[0,4],[7,8],[3,3]])put(x,10,z,'grass_block');
    });
    const m=meshChunk(n,fullLight()),P=biomeDef(plains).grass,S=biomeDef(swamp).grass;
    expect(grassTop(m,3,3)[0].rgb).toBe(P);
    expect(grassTop(m,7,8)[0].rgb).toBe(blend(P,S,1));
    expect(grassTop(m,0,4)[0].rgb).toBe(blend(P,S,3));
  });
  test('grass sides are untinted with a tinted overlay in the cutout layer; snow turns them snowy',()=>{
    const n=hood((put,chunks)=>{for(const c of chunks)c.biomes.fill(plains);put(4,10,4,'grass_block');put(8,10,8,'grass_block');put(8,11,8,'snow');});
    const m=meshChunk(n,fullLight()),G=biomeDef(plains).grass;
    const sides=quads(m.opaque).filter(q=>q.every(v=>v.tile===tileIndex('grass_block_side')));
    expect(sides).toHaveLength(4);for(const v of sides.flat())expect(v.rgb).toBe(0xffffff);
    const overlay=quads(m.cutout).filter(q=>q.every(v=>v.tile===tileIndex('grass_block_side_overlay')));
    expect(overlay).toHaveLength(4);for(const v of overlay.flat())expect(v.rgb).toBe(G);
    // Same geometry as the side it covers.
    expect(overlay.map(q=>q.map(v=>[v.x,v.y,v.z]).sort()).sort()).toEqual(sides.map(q=>q.map(v=>[v.x,v.y,v.z]).sort()).sort());
    expect(quads(m.opaque).filter(q=>q.every(v=>v.tile===tileIndex('grass_block_snow')))).toHaveLength(4);
  });
  test('leaves use foliage, water uses the water colour, untinted blocks stay white',()=>{
    const n=hood((put,chunks)=>{for(const c of chunks)c.biomes.fill(swamp);put(2,10,2,'oak_leaves');put(6,10,6,'water');put(10,10,10,'stone');});
    const m=meshChunk(n,fullLight()),B=biomeDef(swamp);
    expect(quads(m.opaque).filter(q=>q[0].tile===tileIndex('oak_leaves')).every(q=>q.every(v=>v.rgb===B.foliage))).toBe(true);
    expect(quads(m.translucent).every(q=>q.every(v=>v.rgb===B.water))).toBe(true);
    expect(quads(m.opaque).filter(q=>q[0].tile===tileIndex('stone')).every(q=>q.every(v=>v.rgb===0xffffff))).toBe(true);
  });
});

// ---- Flags -----------------------------------------------------------------------------------------
describe('vertex flags',()=>{
  test('sway on leaves (every vertex) and on plants and crops (top vertices only)',()=>{
    for(const v of quads(alone('oak_leaves').opaque).flat())expect(v.flags&1).toBe(1);
    for(const name of ['short_grass','poppy','wheat_7','oak_sapling']){
      for(const v of quads(alone(name).cutout).flat())expect(v.flags&1).toBe(v.y>Math.min(...quads(alone(name).cutout).flat().map(w=>w.y))?1:0);
    }
    for(const v of quads(alone('stone').opaque).flat())expect(v.flags).toBe(0);
  });
  test('sugar cane sways only at the top of its stack, so the segments stay joined',()=>{
    const lone=quads(alone('sugar_cane').cutout).flat();
    for(const v of lone)expect(v.flags&1).toBe(v.y===176?1:0);
    const cane=lone[0].tile;
    const stack=quads(meshChunk(hood(put=>{put(8,9,8,'grass_block');put(8,10,8,'sugar_cane');put(8,11,8,'sugar_cane');put(8,12,8,'sugar_cane');}),fullLight()).cutout).flat().filter(v=>v.tile===cane);
    expect(stack).toHaveLength(3*2*4);
    for(const v of stack)expect(v.flags&1).toBe(v.y===208?1:0);
  });
  test('emissive on lava, fire, lantern, torches and glowstone only',()=>{
    for(const name of ['lava','fire','lantern','torch','wall_torch_north','glowstone']){
      const vs=all(alone(name)).flat();expect(vs.length).toBeGreaterThan(0);
      for(const v of vs)expect(v.flags&4).toBe(4);
    }
    for(const name of ['water','furnace_lit_north','stone','short_grass'])for(const v of all(alone(name)).flat())expect(v.flags&4).toBe(0);
  });
  test('every block draws in its registry layer',()=>{
    for(const b of BLOCKS){
      if(b.shape==='air')continue;
      const m=meshBlock(b.id),layers=[m.opaque,m.cutout,m.translucent].map(p=>p.quads);
      const own=BLOCK_LAYER[b.id]-1;
      expect(layers[own]).toBeGreaterThan(0);
      // Only the grass block adds a second layer (its cutout side overlay).
      layers.forEach((q,i)=>{if(i!==own&&!(b.name==='grass_block'&&i===1))expect(q).toBe(0);});
    }
  });
});

// ---- Liquids ---------------------------------------------------------------------------------------
describe('liquids',()=>{
  const pool=(fill:(put:Put)=>void)=>hood(put=>{for(let x=0;x<16;x++)for(let z=0;z<16;z++){put(x,9,z,'stone');put(x,10,z,'stone');}fill(put);});
  const tops=(m:ChunkMesh,part:'translucent'|'opaque'='translucent')=>quads(m[part]).filter(q=>q.every(v=>v.flags&2));
  test('an enclosed source pool sits at 14/16 with the still tile and the surface flag on tops only',()=>{
    const m=meshChunk(pool(put=>{for(let x=4;x<7;x++)for(let z=4;z<7;z++)put(x,10,z,'water');}),fullLight());
    const t=tops(m);expect(t).toHaveLength(9);
    for(const v of t.flat()){expect(v.y).toBe(160+14);expect(v.tile).toBe(tileIndex('water_still'));}
    expect(quads(m.translucent).filter(q=>!q.every(v=>v.flags&2))).toHaveLength(0);
  });
  test('corner heights follow vanilla averaging with neighbours',()=>{
    // A lone source in the open: (8/9·10)/(10+1+1) ≈ 0.741 → 12 px at every corner.
    expect(new Set(tops(alone('water')).flat().map(v=>v.y-160))).toEqual(new Set([12]));
    // A flowing level enclosed by stone keeps its own height (8-L)/9.
    const m=meshChunk(pool(put=>put(8,10,8,'water_3')),fullLight());
    expect(new Set(tops(m).flat().map(v=>v.y-160))).toEqual(new Set([Math.round(5/9*16)]));
    // Same liquid above: full height and no top face; the sides of the lower cell reach its top.
    const col=meshChunk(hood(put=>{put(8,9,8,'stone');put(8,10,8,'water_falling');put(8,11,8,'water_falling');put(8,12,8,'stone');}),fullLight());
    expect(tops(col).every(q=>q.every(v=>v.y>176))).toBe(true);
    const lowerSides=quads(col.translucent).filter(q=>![2,3].includes(faceOf(q))&&q.every(v=>v.y<=176));
    expect(lowerSides).toHaveLength(4);for(const q of lowerSides)expect(Math.max(...q.map(v=>v.y))).toBe(176);
  });
  test('a source next to a lower level slopes toward it and uses the turned flowing tile',()=>{
    const m=meshChunk(pool(put=>{put(7,10,8,'water');put(8,10,8,'water_1');put(9,10,8,'water_2');}),fullLight());
    const q=tops(m).find(q=>q.every(v=>v.x>=128&&v.x<=144))!;
    expect(q[0].tile).toBe(tileIndex('water_flow'));
    // Flow toward +x: the tile's downward direction (decreasing v) points east.
    const west=q.filter(v=>v.x===128).map(v=>v.v),east=q.filter(v=>v.x===144).map(v=>v.v);
    expect(Math.max(...east)).toBeLessThan(Math.min(...west));
    const h=(x:number)=>Math.max(...q.filter(v=>v.x===x).map(v=>v.y));
    expect(h(128)).toBeGreaterThan(h(144));
  });
  test('liquids draw toward air, non-liquid transparent blocks and other liquids, never against the same liquid or ice',()=>{
    const faces=(other:string)=>quads(meshChunk(hood(put=>{put(8,10,8,'water');put(9,10,8,other);put(8,9,8,'stone');}),fullLight()).translucent).filter(q=>faceOf(q)===0&&q.every(v=>v.x===144)).length;
    expect(faces('water')).toBe(0);expect(faces('water_3')).toBe(0);expect(faces('stone')).toBe(0);expect(faces('ice')).toBe(0);
    expect(faces('glass')).toBe(1);expect(faces('oak_leaves')).toBe(1);expect(faces('stone_slab')).toBe(1);
    // Water beside lava (vanilla isNeighborSameFluid compares fluid types): both draw the shared face, so no hole opens.
    expect(faces('lava')).toBe(1);
    const beside=meshChunk(hood(put=>{put(8,10,8,'water');put(9,10,8,'lava');put(8,9,8,'stone');put(9,9,8,'stone');}),fullLight());
    expect(quads(beside.opaque).filter(q=>faceOf(q)===1&&q.every(v=>v.x===144))).toHaveLength(1);
    // Water under lava: the water top and the lava bottom are both drawn.
    const stacked=meshChunk(hood(put=>{put(8,9,8,'stone');put(8,10,8,'water');put(8,11,8,'lava');}),fullLight());
    expect(quads(stacked.translucent).filter(q=>q.every(v=>v.flags&2))).toHaveLength(1);
    expect(quads(stacked.opaque).filter(q=>faceOf(q)===3&&q.every(v=>v.y===176))).toHaveLength(1);
    // Solid ground below hides the bottom face; air below shows it.
    expect(quads(meshChunk(hood(put=>{put(8,10,8,'water');put(8,9,8,'stone');}),fullLight()).translucent).filter(q=>faceOf(q)===3)).toHaveLength(0);
    expect(quads(alone('water').translucent).filter(q=>faceOf(q)===3)).toHaveLength(1);
    // Water on ice: no bottom face in the plane of the ice top (only the ice face is drawn there).
    const onIce=quads(meshChunk(hood(put=>{put(8,10,8,'ice');put(8,11,8,'water');}),fullLight()).translucent).filter(q=>q.every(v=>v.y===176));
    expect(onIce).toHaveLength(1);expect(onIce[0][0].tile).toBe(tileIndex('ice'));
    // Water filled to the top under ice: no surface in the plane of the ice bottom.
    const underIce=quads(meshChunk(hood(put=>{
      for(let x=7;x<10;x++)for(let z=7;z<10;z++)put(x,9,z,'stone');
      put(8,10,8,'water');put(8,11,8,'ice');
      for(const [x,z] of [[7,8],[9,8],[8,7],[8,9]]){put(x,10,z,'water');put(x,11,z,'water');}
    }),fullLight()).translucent).filter(q=>q.every(v=>v.y===176&&v.x>=128&&v.x<=144&&v.z>=128&&v.z<=144));
    expect(underIce).toHaveLength(1);expect(underIce[0][0].tile).toBe(tileIndex('ice'));
  });
  test('the top still shows under an opaque block when it sits below it; lava is opaque and emissive',()=>{
    const m=meshChunk(hood(put=>{put(8,10,8,'water');put(8,11,8,'stone');}),fullLight());
    expect(tops(m)).toHaveLength(1);
    const lava=alone('lava');expect(lava.opaque.quads).toBe(6);expect(tops(lava,'opaque')).toHaveLength(1);
    expect(quads(lava.opaque)[0][0].tile).toBe(tileIndex('lava_still'));
  });
});

// ---- Shapes --------------------------------------------------------------------------------------------
describe('block shapes',()=>{
  test('every registry shape is meshed',()=>{
    const shapes=new Set<Shape>();
    for(const b of BLOCKS){if(b.shape==='air')continue;const m=meshBlock(b.id);expect(m.opaque.quads+m.cutout.quads+m.translucent.quads).toBeGreaterThan(0);shapes.add(b.shape);}
    expect([...shapes].sort()).toEqual(['bed','cactus','crop','cross','cube','door','farmland','fire','flat','ladder','lantern','liquid','slab','snow_layer','stairs','torch'].sort());
  });
  test('cross: two diagonal planes with the vanilla random offset for flowers',()=>{
    const qs=quads(alone('dead_bush').cutout);
    expect(qs).toHaveLength(2);
    expect(bounds(qs)).toEqual({minX:129,maxX:143,minY:160,maxY:176,minZ:129,maxZ:143});
    const off=plantOffset(id('poppy'),8,8,{x:0,y:0,z:0}),f=bounds(quads(alone('poppy').cutout));
    expect([f.minX,f.minZ,f.minY]).toEqual([129+off.x,129+off.z,160+off.y]);
    expect(Math.abs(off.x)).toBeLessThanOrEqual(4);expect(Math.abs(off.z)).toBeLessThanOrEqual(4);
    const offsets=new Set<string>();for(let x=0;x<40;x++){const o=plantOffset(id('short_grass'),x,x*7,{x:0,y:0,z:0});offsets.add(`${o.x},${o.y},${o.z}`);expect(o.y).toBeLessThanOrEqual(0);expect(o.y).toBeGreaterThanOrEqual(-3);}
    expect(offsets.size).toBeGreaterThan(10);
    expect(plantOffset(id('oak_sapling'),3,4,{x:9,y:9,z:9})).toEqual({x:0,y:0,z:0});
  });
  test('cross: offset plants on the west and north chunk edges keep straight 14 px diagonals that match plantOffset',()=>{
    const plants=[[0,0,'poppy'],[0,8,'short_grass'],[8,0,'fern']] as const;
    let edgeClamped=0;
    for(let cz=-4;cz<4;cz++)for(let cx=-4;cx<4;cx++){
      const n=hood(put=>{for(const [x,z,name] of plants)put(x,10,z,name);});
      Object.assign(n[4],{cx,cz});
      const qs=quads(meshChunk(n,fullLight()).cutout);
      for(const [lx,lz,name] of plants){
        const off=plantOffset(id(name),cx*16+lx,cz*16+lz,{x:0,y:0,z:0});
        if(lx===0){expect(off.x).toBeGreaterThanOrEqual(-1);if(off.x===-1)edgeClamped++;}
        if(lz===0){expect(off.z).toBeGreaterThanOrEqual(-1);if(off.z===-1)edgeClamped++;}
        const own=qs.filter(q=>q.every(v=>Math.abs(v.x-lx*16-8)<=12&&Math.abs(v.z-lz*16-8)<=12));
        expect(own).toHaveLength(2);
        for(const q of own){
          const lo=q.filter(v=>v.y===q[1].y);expect(lo).toHaveLength(2);
          expect(Math.abs(lo[0].x-lo[1].x)).toBe(14);expect(Math.abs(lo[0].z-lo[1].z)).toBe(14);
          expect(Math.max(...q.map(v=>v.y))-Math.min(...q.map(v=>v.y))).toBe(16);
        }
        expect(bounds(own)).toMatchObject({minX:lx*16+1+off.x,minZ:lz*16+1+off.z,minY:160+off.y});
      }
    }
    expect(edgeClamped).toBeGreaterThan(5);
    // Away from the edges the full ±4 px range remains.
    const inner=new Set<number>();for(let x=0;x<200;x++)inner.add(plantOffset(id('poppy'),x*16+5,x*16+5,{x:0,y:0,z:0}).x);
    expect(inner.has(-4)).toBe(true);expect(inner.has(4)).toBe(true);
  });
  test('crop: four planes in a # pattern sunk 1 px into the farmland',()=>{
    const qs=quads(alone('wheat_3').cutout);
    expect(qs).toHaveLength(4);
    const xs=qs.filter(q=>q.every(v=>v.x===q[0].x)).map(q=>q[0].x-128).sort((a,b)=>a-b),zs=qs.filter(q=>q.every(v=>v.z===q[0].z)).map(q=>q[0].z-128).sort((a,b)=>a-b);
    expect(xs).toEqual([4,12]);expect(zs).toEqual([4,12]);
    expect(bounds(qs).minY).toBe(159);expect(bounds(qs).maxY).toBe(175);
  });
  test('torch: a 2×10 px stick with flame-top UVs; the bottom is culled on its support',()=>{
    const qs=quads(meshChunk(hood(put=>{put(8,9,8,'stone');put(8,10,8,'torch');}),fullLight()).cutout);
    expect(qs).toHaveLength(5);
    expect(bounds(qs)).toEqual({minX:135,maxX:137,minY:160,maxY:170,minZ:135,maxZ:137});
    const top=qs.find(q=>faceOf(q)===2)!;
    expect(top.map(v=>v.u).sort()).toEqual([7,7,9,9]);expect(top.map(v=>v.v).sort()).toEqual([10,10,8,8].sort());
    for(const q of qs.filter(q=>![2,3].includes(faceOf(q))))expect(q.map(v=>v.v).sort((a,b)=>a-b)).toEqual([0,0,10,10]);
  });
  test('wall torch: base against the wall 3 px up, leaning 4 px toward facing',()=>{
    const vs=quads(alone('wall_torch_east').cutout).flat(),low=vs.filter(v=>v.y===163),high=vs.filter(v=>v.y===173);
    expect(low.length).toBeGreaterThan(0);expect(high.length).toBeGreaterThan(0);
    expect(Math.min(...low.map(v=>v.x))).toBe(128);expect(Math.max(...low.map(v=>v.x))).toBe(130);
    expect(Math.min(...high.map(v=>v.x))).toBe(132);expect(Math.max(...high.map(v=>v.x))).toBe(134);
    const north=quads(alone('wall_torch_north').cutout).flat();
    expect(Math.max(...north.filter(v=>v.y===163).map(v=>v.z))).toBe(144);expect(Math.min(...north.filter(v=>v.y===173).map(v=>v.z))).toBe(138);
  });
  test('slabs, snow layers, farmland and beds have their vanilla heights',()=>{
    const h=(name:string)=>{const b=bounds(all(alone(name)));return [b.minY-160,b.maxY-160];};
    expect(h('stone_slab')).toEqual([0,8]);expect(h('stone_slab_top')).toEqual([8,16]);expect(h('snow')).toEqual([0,2]);
    expect(h('farmland')).toEqual([0,15]);expect(h('bed_foot_south')).toEqual([0,9]);
    expectOutward(quads(alone('stone_slab').cutout),[0,0,0,1,.5,1]);
    // Slab sides show the matching half of the tile (v = y).
    const side=quads(alone('stone_slab_top').cutout).find(q=>faceOf(q)===4)!;
    expect(side.map(v=>v.v).sort((a,b)=>a-b)).toEqual([8,8,16,16]);
  });
  test('cactus: full top and bottom, sides inset 1 px',()=>{
    const qs=quads(alone('cactus').cutout);
    expect(qs).toHaveLength(6);
    const plane=(f:number)=>{const q=qs.find(q=>faceOf(q)===f)!;return f<2?q[0].x-128:q[0].z-128;};
    expect([plane(0),plane(1),plane(4),plane(5)]).toEqual([15,1,15,1]);
    const stack=meshChunk(hood(put=>{put(8,10,8,'cactus');put(8,11,8,'cactus');}),fullLight());
    expect(quads(stack.cutout).filter(q=>[2,3].includes(faceOf(q)))).toHaveLength(2);
  });
  test('ladder: one quad 1 px in front of the wall it hangs on',()=>{
    const qs=quads(alone('ladder_north').cutout);
    expect(qs).toHaveLength(1);
    expect(qs[0].every(v=>v.z===128+15)).toBe(true);expect(faceOf(qs[0])).toBe(5);
    expect(quads(alone('ladder_east').cutout)[0].every(v=>v.x===129)).toBe(true);
  });
  test('door: the 3/16 panel by facing and open state; halves skip the shared face',()=>{
    for(const name of ['oak_door_lower_closed_north','oak_door_upper_open_east','oak_door_lower_open_south','oak_door_upper_closed_west']){
      const d=blockDef(id(name)),qs=quads(alone(name).cutout),box=doorPanelBox(d.facing!,d.door!.open);
      expect(bounds(qs)).toEqual(cellBox(box));
      expect(qs).toHaveLength(5);
      expect(qs.map(faceOf)).not.toContain(d.door!.half==='lower'?2:3);
      expectOutward(qs,box);
    }
    // The face away from the front is mirrored so the panel lines up through the door.
    const qs=quads(alone('oak_door_lower_closed_north').cutout),front=qs.find(q=>faceOf(q)===5)!,back=qs.find(q=>faceOf(q)===4)!;
    const uAt=(q:Quad,x:number)=>q.find(v=>v.x===x)!.u;
    expect(uAt(front,128)).toBe(uAt(back,128));
  });
  test('bed: 9 px box whose top tile points its row 0 to the head',()=>{
    for(const facing of ['south','north','east','west'] as const){
      const qs=quads(alone(`bed_foot_${facing}`).cutout),top=qs.find(q=>faceOf(q)===2)!;
      expect(top.every(v=>v.y===169)).toBe(true);
      const head={south:[0,-1],north:[0,1],east:[-1,0],west:[1,0]}[facing];
      // The vertex furthest toward the head has the largest v (row 0 is the top of the tile).
      const score=(v:Vert)=>(v.x-136)*head[0]+(v.z-136)*head[1];
      const sorted=[...top].sort((a,b)=>score(b)-score(a));
      expect(sorted[0].v%16===0?16:sorted[0].v%16).toBe(16);expect(sorted[3].v%16).toBe(0);
    }
    const pair=meshChunk(hood(put=>{put(8,10,8,'bed_foot_south');put(8,10,7,'bed_head_south');}),fullLight());
    expect(quads(pair.cutout)).toHaveLength(10);
  });
  test('flat: a lily pad 1 px above the cell floor',()=>{
    const qs=quads(alone('lily_pad').cutout);
    expect(qs).toHaveLength(1);expect(qs[0].every(v=>v.y===161)).toBe(true);
  });
  test('stairs: bottom slab plus the upper back half, outward faces only, culled by neighbours',()=>{
    for(const facing of ['north','south','east','west'] as const){
      const boxes=stairsBoxes(facing),qs=quads(alone(`oak_stairs_${facing}`).opaque);
      expect(qs).toHaveLength(10);
      expectOutward(qs,boxes);
      expect(bounds(qs)).toEqual(cellBox([0,0,0,1,1,1]));
      // No overlapping or hidden quads: the area is the outer surface (bottom 1, back 1, two risers and two treads
      // of 0.5, two L-shaped sides of 0.75 = 5.5 blocks²).
      const area=qs.reduce((s,q)=>{const n=normal(q);return s+Math.hypot(...n);},0)/256;
      expect(area).toBeCloseTo(5.5,5);
    }
    // Two stairs side by side hide their touching L-shaped sides; an opaque floor hides the bottom.
    const row=meshChunk(hood(put=>{put(8,9,8,'stone');put(9,9,8,'stone');put(8,10,8,'oak_stairs_north');put(9,10,8,'oak_stairs_north');}),fullLight());
    expect(quads(row.opaque).filter(q=>q[0].tile===tileIndex('oak_planks'))).toHaveLength(2*10-2*2-2);
  });
  test('lantern: 6×7 px body, 4×2 px cap and a crossed handle, emissive',()=>{
    const qs=quads(meshChunk(hood(put=>{put(8,9,8,'stone');put(8,10,8,'lantern');}),fullLight()).cutout);
    expect(qs).toHaveLength(5+5+2);
    const body=qs.filter(q=>q.every(v=>v.y<=167)),cap=qs.filter(q=>q.every(v=>v.y>=167&&v.y<=169)&&q.some(v=>v.y===169));
    expect(bounds(body)).toEqual({minX:133,maxX:139,minY:160,maxY:167,minZ:133,maxZ:139});
    expect(bounds(cap)).toEqual({minX:134,maxX:138,minY:167,maxY:169,minZ:134,maxZ:138});
    expect(bounds(qs).maxY).toBe(171);
    for(const v of qs.flat())expect(v.flags&4).toBe(4);
  });
  test('fire: four planes leaning in from the block sides plus two crossed planes',()=>{
    const qs=quads(alone('fire').cutout);
    expect(qs).toHaveLength(6);
    const sides=qs.slice(0,4);
    for(const q of sides){
      const low=q.filter(v=>v.y===160),high=q.filter(v=>v.y===160+22);
      expect(low).toHaveLength(2);expect(high).toHaveLength(2);
      const edge=(v:Vert)=>Math.min(v.x-128,144-v.x,v.z-128,144-v.z);
      expect(low.every(v=>edge(v)===0)).toBe(true);
      // Inward lean: the top edge is 4 px from the side (corners may sit on the perpendicular edges).
      const lean=high.map(v=>{const d=[v.x-128,144-v.x,v.z-128,144-v.z];return d;});
      expect(lean.every(d=>d.includes(4))).toBe(true);
    }
    expect(alone('fire').maxY).toBe(12);
  });
});

// ---- meshBlock ------------------------------------------------------------------------------------
describe('meshBlock',()=>{
  test('every face visible, full light, no AO, positions 0..16',()=>{
    const m=meshBlock(id('stone')),qs=quads(m.opaque);
    expect(qs).toHaveLength(6);
    for(const q of qs)for(const v of q){
      expect(v.light).toBe(0xf0);expect(v.shade).toBe(SHADE_VANILLA[faceOf(q)]);
      for(const c of [v.x,v.y,v.z]){expect(c).toBeGreaterThanOrEqual(0);expect(c).toBeLessThanOrEqual(16);}
    }
    expect([m.minY,m.maxY]).toEqual([0,1]);
    expectOutward(qs,[0,0,0,1,1,1],[0,0,0]);
  });
  test('tint only when given, on the faces the registry tints',()=>{
    const plain=meshBlock(id('grass_block'));
    expect(quads(plain.opaque).flat().every(v=>v.rgb===0xffffff)).toBe(true);
    const tinted=meshBlock(id('grass_block'),0x55aa33);
    const top=quads(tinted.opaque).find(q=>faceOf(q)===2)!;expect(top[0].rgb).toBe(0x55aa33);
    expect(quads(tinted.opaque).filter(q=>[0,1,4,5].includes(faceOf(q))).every(q=>q[0].rgb===0xffffff)).toBe(true);
    expect(quads(tinted.cutout)).toHaveLength(4);expect(quads(tinted.cutout)[0][0].rgb).toBe(0x55aa33);
    expect(quads(meshBlock(id('stone'),0xff0000).opaque)[0][0].rgb).toBe(0xffffff);
  });
  test('partial blocks and plants mesh at the origin without offsets',()=>{
    expect(bounds(quads(meshBlock(id('stone_slab')).cutout))).toEqual({minX:0,maxX:16,minY:0,maxY:8,minZ:0,maxZ:16});
    expect(bounds(quads(meshBlock(id('poppy')).cutout))).toEqual({minX:1,maxX:15,minY:0,maxY:16,minZ:1,maxZ:15});
    expect(quads(meshBlock(id('torch')).cutout)).toHaveLength(6);
    expect(meshBlock(id('air')).opaque.quads).toBe(0);
    for(const v of all(meshBlock(id('wheat_7'))).flat())expect(v.y).toBeGreaterThanOrEqual(0);
  });
  test('held and dropped blocks never sway',()=>{
    for(const name of ['oak_leaves','oak_sapling','short_grass','poppy','wheat_7','sugar_cane']){
      const vs=all(meshBlock(id(name))).flat();
      expect(vs.length).toBeGreaterThan(0);
      for(const v of vs)expect(v.flags&1).toBe(0);
    }
  });
});

// ---- Border continuity and performance -------------------------------------------------------------
describe('chunk borders',()=>{
  test('vertices on a shared border get the same light and AO from both chunks, and tints follow one world-space blend',()=>{
    // Generated terrain with a varied world-space biome pattern, so the tint blend changes across the border.
    // Real terrain varies by seed: use the first seed whose border chunks have grass tops on both border lines.
    const grassId=id('grass_block');
    const hasGrassOnBorders=(seed:number)=>{
      const tt=createTerrain(seed);
      return [-1,0,1].every(cx=>{const c=tt.generate(cx,0);let n=0;for(let z=0;z<CS;z++)for(const x of [0,CS-1]){let y=127;while(y>0&&c.blocks[x+z*CS+y*LAYER]===0)y--;if(c.blocks[x+z*CS+y*LAYER]===grassId)n++;}return n>=8;});
    };
    let seed=5;while(seed<60&&!hasGrassOnBorders(seed))seed++;
    const t=createTerrain(seed),cache=new Map<string,ChunkData>(),pattern=['plains','swamp','jungle','desert'].map(biomeId);
    const biomeAt=(wx:number,wz:number)=>pattern[(Math.floor(wx/3)*5+Math.floor(wz/2)*3)&3];
    const gen=(x:number,z:number)=>{
      const k=`${x},${z}`;
      if(!cache.has(k)){const c=t.generate(x,z);for(let lz=0;lz<CS;lz++)for(let lx=0;lx<CS;lx++)c.biomes[lx+lz*CS]=biomeAt(x*CS+lx,z*CS+lz);cache.set(k,c);}
      return cache.get(k)!;
    };
    const hoodAt=(cx:number,cz:number)=>{const n:ChunkData[]=[];for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)n.push(gen(cx+dx,cz+dz));return n;};
    const meshAt=(cx:number)=>{const n=hoodAt(cx,0);return meshChunk(n,engineLight(n));};
    // Two borders: chunk -1 | 0 and chunk 0 | 1.
    const meshes=[-1,0,1].map(meshAt);let shared=0,checked=0;const sharedFaces=new Set<string>(),colours=new Set<number>();
    // Light and AO: every cube face direction with vertices on the border line (tops, bottoms and the z-facing sides).
    // Smooth light is per face (vanilla): two faces meeting at a corner where an opaque block sits in one of the four cells in
    // front of the vertex use different front cells and may differ. Only vertices with four open cells are compared.
    const opaqueAt=(wx:number,y:number,wz:number)=>{
      const cx=Math.floor(wx/CS),cz=Math.floor(wz/CS);if(y<0||y>=CH)return y<0;
      return OPAQUE[gen(cx,cz).blocks[(wx-cx*CS)+(wz-cz*CS)*CS+y*LAYER]]===1;
    };
    const openAround=(f:number,wx:number,v:Vert)=>{
      const bx=wx,by=v.y/16,bz=v.z/16;
      const cells:[number,number,number][]=[];
      for(const a of [-1,0])for(const b of [-1,0]){
        if(f===2)cells.push([bx+a,by,bz+b]);else if(f===3)cells.push([bx+a,by-1,bz+b]);
        else if(f===4)cells.push([bx+a,by+b,bz]);else cells.push([bx+a,by+b,bz-1]);
      }
      return cells.every(([x,y,z])=>!opaqueAt(x,y,z));
    };
    const border=(m:ChunkMesh,x:number,wx:number)=>{
      const map=new Map<string,Set<string>>();
      for(const q of quads(m.opaque)){
        const f=faceOf(q);if(f<2)continue;
        // Emissive vertices (lava, fire) carry full light by design, so they are not comparable with a neighbouring face.
        for(const v of q)if(v.x===x&&!(v.flags&4)&&openAround(f,wx,v)){const k=`${f},${v.y},${v.z}`;const s=map.get(k)??new Set();s.add(`${v.light},${v.shade}`);map.set(k,s);}
      }
      return map;
    };
    // Tint: each grass top on either side of a border carries the 3×3 world-space blend of every column it covers.
    const G=(wx:number,wz:number)=>{
      let r=0,g=0,bl=0;
      for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){const c=biomeDef(biomeAt(wx+dx,wz+dz)).grass;r+=c>>16;g+=(c>>8)&255;bl+=c&255;}
      return Math.round(r/9)<<16|Math.round(g/9)<<8|Math.round(bl/9);
    };
    const grassTop=quads(meshBlock(id('grass_block')).opaque).find(q=>faceOf(q)===2)![0].tile;
    const tints=(m:ChunkMesh,x:number,cx:number)=>{
      for(const q of quads(m.opaque)){
        if(faceOf(q)!==2||q[0].tile!==grassTop||!q.some(v=>v.x===x))continue;
        const bb=bounds([q]);
        for(let lx=bb.minX/16;lx<bb.maxX/16;lx++)for(let lz=bb.minZ/16;lz<bb.maxZ/16;lz++){
          for(const v of q)expect(v.rgb).toBe(G(cx*CS+lx,lz));
          colours.add(q[0].rgb);checked++;
        }
      }
    };
    for(let i=0;i<2;i++){
      const ma=border(meshes[i],256,i*CS),mb=border(meshes[i+1],0,i*CS);
      for(const [k,s] of ma){const o=mb.get(k);if(!o)continue;shared++;sharedFaces.add(k.split(',')[0]);expect([...o].sort()).toEqual([...s].sort());}
      tints(meshes[i],256,i-1);tints(meshes[i+1],0,i);
    }
    expect(shared).toBeGreaterThan(4);expect(sharedFaces.has('2')).toBe(true);expect([...sharedFaces].some(f=>f==='4'||f==='5')).toBe(true);
    expect(checked).toBeGreaterThan(16);expect(colours.size).toBeGreaterThan(2);
  });
});
describe('performance',()=>{
  test('meshes generated terrain in ≤ 2 ms per chunk on average',()=>{
    const t=createTerrain(1234),cache=new Map<string,ChunkData>();
    const gen=(x:number,z:number)=>{const k=`${x},${z}`;if(!cache.has(k))cache.set(k,t.generate(x,z));return cache.get(k)!;};
    const jobs:[ChunkData[],Uint8Array][]=[];
    for(let cz=0;cz<4;cz++)for(let cx=0;cx<4;cx++){const n:ChunkData[]=[];for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)n.push(gen(cx+dx,cz+dz));jobs.push([n,engineLight(n)]);}
    for(let r=0;r<3;r++)for(const [n,l] of jobs)meshChunk(n,l);
    let best=Infinity;
    // Best of several rounds: the machine is shared, the minimum is the mesher's own cost.
    for(let r=0;r<5;r++){const s=performance.now();for(const [n,l] of jobs)meshChunk(n,l);best=Math.min(best,(performance.now()-s)/jobs.length);}
    expect(best).toBeLessThanOrEqual(2);
  });
});
