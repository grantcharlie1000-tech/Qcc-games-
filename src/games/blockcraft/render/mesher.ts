// STUB mesher (owned by the meshing agent, who adds every block shape, smooth lighting and
// fluid surfaces). This version: greedy-meshed cubes for all non-air blocks in their render
// layer, flat per-face light from the light volume, ambient occlusion and biome tints.
import {AIR,OPAQUE,FACE_TILE,LAYER as BLOCK_LAYER,BLOCKS,LIQUID} from '../data/blocks';
import {biomeDef} from '../data/biomes';
import {CS,CH,LAYER,CHUNK_VOLUME,PAD_X,PAD_LAYER,PAD_Y,PAD_VOLUME,MAX_PART_QUADS,voxelIndex} from '../engine/constants';
import type {ChunkData,ChunkMesh,MeshPart,Mesher} from '../engine/contracts';

const OP=OPAQUE,PX=PAD_X,PL=PAD_LAYER,PY=PAD_Y;
const padded=new Uint8Array(PAD_VOLUME),padBiome=new Uint8Array(PX*PX);
const S=[1,PL,PX],V=[1,LAYER,CS],SIZE=[CS,CH,CS];
interface FaceDef{dir:number[];corners:number[][];uv:number[][]}
const FACES:FaceDef[]=[
  {dir:[1,0,0],corners:[[1,1,1],[1,0,1],[1,1,0],[1,0,0]],uv:[[0,1],[0,0],[1,1],[1,0]]},
  {dir:[-1,0,0],corners:[[0,1,0],[0,0,0],[0,1,1],[0,0,1]],uv:[[0,1],[0,0],[1,1],[1,0]]},
  {dir:[0,1,0],corners:[[0,1,1],[1,1,1],[0,1,0],[1,1,0]],uv:[[1,1],[0,1],[1,0],[0,0]]},
  {dir:[0,-1,0],corners:[[1,0,1],[0,0,1],[1,0,0],[0,0,0]],uv:[[1,0],[0,0],[1,1],[0,1]]},
  {dir:[0,0,1],corners:[[0,0,1],[1,0,1],[0,1,1],[1,1,1]],uv:[[0,0],[1,0],[0,1],[1,1]]},
  {dir:[0,0,-1],corners:[[1,0,0],[0,0,0],[1,1,0],[0,1,0]],uv:[[0,0],[1,0],[0,1],[1,1]]}
];
const FACE_SHADE=[.8,.8,1,.55,.9,.9],AO_CURVE=[.5,.68,.84,1];
const NEIGHBOUR=new Int32Array(6),AXIS=new Uint8Array(6),AXIS_A=new Uint8Array(6),AXIS_B=new Uint8Array(6),TEX_U=new Uint8Array(6),TEX_V=new Uint8Array(6);
const AO_OFFSETS=new Int32Array(6*4*3),CORNERS=new Uint8Array(6*4*3),UVS=new Uint8Array(6*4*2);
FACES.forEach((face,f)=>{
  const d=face.dir,axis=d.findIndex(v=>v!==0);NEIGHBOUR[f]=d[0]*S[0]+d[1]*S[1]+d[2]*S[2];AXIS[f]=axis;
  const tangents=[0,1,2].filter(a=>a!==axis);
  AXIS_A[f]=axis===1?0:tangents.find(a=>a!==1)!;AXIS_B[f]=axis===1?2:1;
  const follows=(t:number,k:0|1)=>face.corners.every((c,i)=>face.uv[i][k]===c[t])||face.corners.every((c,i)=>face.uv[i][k]===1-c[t]);
  TEX_U[f]=tangents.find(t=>follows(t,0))!;TEX_V[f]=tangents.find(t=>follows(t,1))!;
  face.corners.forEach((corner,c)=>{
    const a=tangents[0],b=tangents[1],sa=(corner[a]?1:-1)*S[a],sb=(corner[b]?1:-1)*S[b],o=(f*4+c)*3;
    AO_OFFSETS[o]=sa;AO_OFFSETS[o+1]=sb;AO_OFFSETS[o+2]=sa+sb;
    CORNERS[o]=corner[0];CORNERS[o+1]=corner[1];CORNERS[o+2]=corner[2];
    UVS[(f*4+c)*2]=face.uv[c][0];UVS[(f*4+c)*2+1]=face.uv[c][1];
  });
});
const ORDER_DEFAULT=[0,1,2,3],ORDER_FLIPPED=[1,3,0,2];
const TINT_KIND=new Uint8Array(256*6);
for(const b of BLOCKS)for(let f=0;f<6;f++)TINT_KIND[b.id*6+f]=b.tintFaces[f]?{none:0,grass:1,foliage:2,water:3}[b.tint]:0;
const CULL_SAME=new Uint8Array(256),FAMILY_ID=new Uint16Array(256);
{const fam=new Map<string,number>();for(const b of BLOCKS){CULL_SAME[b.id]=+b.cullSame;if(!fam.has(b.family))fam.set(b.family,fam.size);FAMILY_ID[b.id]=fam.get(b.family)!;}}

const MAX_QUADS=MAX_PART_QUADS;
class Buffers{quads=0;position=new Uint16Array(MAX_QUADS*16);uvt=new Uint16Array(MAX_QUADS*16);tint=new Uint8Array(MAX_QUADS*16);}
const layers=[new Buffers(),new Buffers(),new Buffers()];
// Face key: tile (bits 0-7), light (8-15), AO 4×2 bits (16-23), layer 1..3 (24-25), biome (26-31).
const keys=new Int32Array(6*CHUNK_VOLUME);
const UNIFORM_AO=0xff<<16,ao=new Uint8Array(4);

function visible(id:number,n:number){
  if(n===AIR)return true;
  if(OP[n])return false;
  if(CULL_SAME[id]&&FAMILY_ID[id]===FAMILY_ID[n])return false;
  // Liquids are drawn against air and non-liquid transparent blocks only.
  if(LIQUID[id]&&LIQUID[n])return false;
  return true;
}
export function meshChunk(neighbours:readonly (ChunkData|null)[],light:Uint8Array):ChunkMesh{
  fillPadded(neighbours);
  let minY=CH,maxY=0;
  for(let y=0;y<CH;y++)for(let z=0;z<CS;z++){
    let p=1+(z+1)*PX+(y+1)*PL,i=z*CS+y*LAYER;
    for(let x=0;x<CS;x++,p++,i++){
      const id=padded[p];if(id===AIR)continue;
      if(OP[id]&&OP[padded[p+1]]&&OP[padded[p-1]]&&OP[padded[p+PL]]&&OP[padded[p-PL]]&&OP[padded[p+PX]]&&OP[padded[p-PX]])continue;
      const layer=BLOCK_LAYER[id];if(!layer)continue;
      const biome=padBiome[(x+1)+(z+1)*PX];let any=false;
      for(let f=0;f<6;f++){
        const out=p+NEIGHBOUR[f],n=padded[out];
        if(!visible(id,n))continue;
        let key=FACE_TILE[id*6+f]|(light[out]<<8)|(layer<<24)|(biome<<26);
        if(OP[id])for(let c=0;c<4;c++){
          const o=(f*4+c)*3,s1=OP[padded[out+AO_OFFSETS[o]]],s2=OP[padded[out+AO_OFFSETS[o+1]]],corner=OP[padded[out+AO_OFFSETS[o+2]]];
          key|=(s1&&s2?0:3-s1-s2-corner)<<(16+c*2);
        }else key|=UNIFORM_AO;
        keys[f*CHUNK_VOLUME+i]=key;any=true;
      }
      if(any){if(y<minY)minY=y;if(y+1>maxY)maxY=y+1;}
    }
  }
  for(const b of layers)b.quads=0;
  if(maxY>minY)for(let f=0;f<6;f++)greedy(f,minY,maxY);
  return{opaque:copy(layers[0]),cutout:copy(layers[1]),translucent:copy(layers[2]),minY:Math.min(minY,maxY),maxY};
}
const origin=[0,0,0],extent=[1,1,1];
function greedy(f:number,minY:number,maxY:number){
  const d=AXIS[f],a=AXIS_A[f],b=AXIS_B[f],base=f*CHUNK_VOLUME,sa=V[a],sb=V[b],sd=V[d],wa=SIZE[a];
  const s0=d===1?minY:0,s1=d===1?maxY:SIZE[d],j0=b===1?minY:0,hb=b===1?maxY:SIZE[b];
  for(let s=s0;s<s1;s++){
    const slice=base+s*sd;
    for(let j=j0;j<hb;j++)for(let i=0;i<wa;i++){
      const at=slice+i*sa+j*sb,key=keys[at];if(!key)continue;
      let w=1,h=1;
      if((key&UNIFORM_AO)===UNIFORM_AO){
        while(i+w<wa&&keys[at+w*sa]===key)w++;
        grow:while(j+h<hb){const row=at+h*sb;for(let k=0;k<w;k++)if(keys[row+k*sa]!==key)break grow;h++;}
      }
      for(let jj=0;jj<h;jj++){const row=at+jj*sb;for(let k=0;k<w;k++)keys[row+k*sa]=0;}
      origin[d]=s;origin[a]=i;origin[b]=j;extent[d]=1;extent[a]=w;extent[b]=h;
      emit(f,key);
    }
  }
}
function emit(f:number,key:number){
  const tile=key&255,light=(key>>>8)&255,layer=(key>>>24)&3,biome=(key>>>26)&63,buffer=layers[layer-1];
  for(let c=0;c<4;c++)ao[c]=(key>>>(16+c*2))&3;
  // Liquid tops sit 2/16 below the block top.
  const liquidTop=layer===3&&f!==3?2:0;
  const order=Math.abs(ao[0]-ao[3])>Math.abs(ao[1]-ao[2])?ORDER_FLIPPED:ORDER_DEFAULT;
  const kind=tintKindForKey(key,f),b=biomeDef(biome),rgb=kind===1?b.grass:kind===2?b.foliage:kind===3?b.water:0xffffff;
  let v=buffer.quads*4;
  for(const c of order){
    const o=(f*4+c)*3,p=v*4,u=(f*4+c)*2;
    buffer.position[p]=(origin[0]+CORNERS[o]*extent[0])*16;
    buffer.position[p+1]=(origin[1]+CORNERS[o+1]*extent[1])*16-(CORNERS[o+1]?liquidTop:0);
    buffer.position[p+2]=(origin[2]+CORNERS[o+2]*extent[2])*16;
    buffer.position[p+3]=light;
    buffer.uvt[p]=UVS[u]*extent[TEX_U[f]]*16;buffer.uvt[p+1]=UVS[u+1]*extent[TEX_V[f]]*16;
    buffer.uvt[p+2]=tile;buffer.uvt[p+3]=Math.round(255*FACE_SHADE[f]*AO_CURVE[ao[c]]);
    buffer.tint[p]=rgb>>16;buffer.tint[p+1]=(rgb>>8)&255;buffer.tint[p+2]=rgb&255;buffer.tint[p+3]=255;
    v++;
  }
  buffer.quads++;
}
// The tint kind depends on the block; recover it from the tile and face via a reverse table.
const TILE_TINT=new Map<number,number>();
for(const b of BLOCKS)for(let f=0;f<6;f++){const k=TINT_KIND[b.id*6+f];if(k)TILE_TINT.set(FACE_TILE[b.id*6+f]|(f<<8),k);}
function tintKindForKey(key:number,f:number){return TILE_TINT.get((key&255)|(f<<8))??0;}
function copy(b:Buffers):MeshPart{return{position:b.position.slice(0,b.quads*16),uvt:b.uvt.slice(0,b.quads*16),tint:b.tint.slice(0,b.quads*16),quads:b.quads};}

const STONE_CHUNK:ChunkData={blocks:new Uint8Array(CHUNK_VOLUME).fill(OP.indexOf(1)),biomes:new Uint8Array(LAYER)};
function fillPadded(n:readonly (ChunkData|null)[]){
  const pick=(i:number)=>n[i]??STONE_CHUNK;
  const c=pick(4).blocks,w=pick(3).blocks,e=pick(5).blocks,north=pick(1).blocks,south=pick(7).blocks;
  const nw=pick(0).blocks,ne=pick(2).blocks,sw=pick(6).blocks,se=pick(8).blocks,L=CS-1;
  padded.fill(1,0,PL);padded.fill(AIR,(PY-1)*PL);
  for(let y=0;y<CH;y++){
    const py=(y+1)*PL,src=y*LAYER;
    for(let z=0;z<CS;z++){const row=py+(z+1)*PX,s=src+z*CS;padded.set(c.subarray(s,s+CS),row+1);padded[row]=w[s+L];padded[row+CS+1]=e[s];}
    const top=py,bottom=py+(CS+1)*PX,lastRow=src+L*CS;
    padded.set(north.subarray(lastRow,lastRow+CS),top+1);padded.set(south.subarray(src,src+CS),bottom+1);
    padded[top]=nw[lastRow+L];padded[top+CS+1]=ne[lastRow];padded[bottom]=sw[src+L];padded[bottom+CS+1]=se[src];
  }
  const cb=pick(4).biomes;for(let pz=0;pz<PX;pz++)for(let px=0;px<PX;px++)padBiome[px+pz*PX]=cb[Math.min(CS-1,Math.max(0,px-1))+Math.min(CS-1,Math.max(0,pz-1))*CS];
}
/** A lone block: meshed at (1,1,1) of an empty chunk in full light, then moved to the origin. */
function meshBlock(id:number):ChunkMesh{
  const chunk={blocks:new Uint8Array(CHUNK_VOLUME),biomes:new Uint8Array(LAYER)};chunk.blocks[voxelIndex(1,1,1)]=id;
  const mesh=meshChunk([null,null,null,null,chunk,null,null,null,null],new Uint8Array(PAD_VOLUME).fill(0xf0));
  for(const part of [mesh.opaque,mesh.cutout,mesh.translucent])for(let v=0;v<part.quads*4;v++){part.position[v*4]-=16;part.position[v*4+1]-=16;part.position[v*4+2]-=16;}
  mesh.minY=0;mesh.maxY=1;
  return mesh;
}
export function createMesher():Mesher{return{meshChunk,meshBlock};}
