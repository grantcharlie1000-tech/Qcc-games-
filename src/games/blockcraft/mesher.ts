import {AIR,WATER,BEDROCK,STONE,OPAQUE,FACE_TILES} from './blocks';
import {CS,CH,LAYER,CHUNK_VOLUME} from './terrain';

// Module-local aliases keep the hot loops free of import indirection.
const OP=OPAQUE,FT=FACE_TILES;
// Padded copy of a chunk and a one-voxel border from its eight neighbours.
// Every neighbour lookup becomes a constant offset: no bounds checks, no map lookups.
const PX=CS+2,PY=CH+2,PL=PX*PX;
const padded=new Uint8Array(PL*PY);
const skyTop=new Int16Array(PL);
const S=[1,PL,PX]; // padded strides for x, y, z
const V=[1,LAYER,CS]; // chunk-index strides for x, y, z
const SIZE=[CS,CH,CS];

interface FaceDef{dir:number[];corners:number[][];uv:number[][]}
// Corner order is a strip: triangles (0,1,2) and (2,1,3). Face order +x,-x,+y,-y,+z,-z.
const FACES:FaceDef[]=[
  {dir:[1,0,0],corners:[[1,1,1],[1,0,1],[1,1,0],[1,0,0]],uv:[[0,1],[0,0],[1,1],[1,0]]},
  {dir:[-1,0,0],corners:[[0,1,0],[0,0,0],[0,1,1],[0,0,1]],uv:[[0,1],[0,0],[1,1],[1,0]]},
  {dir:[0,1,0],corners:[[0,1,1],[1,1,1],[0,1,0],[1,1,0]],uv:[[1,1],[0,1],[1,0],[0,0]]},
  {dir:[0,-1,0],corners:[[1,0,1],[0,0,1],[1,0,0],[0,0,0]],uv:[[1,0],[0,0],[1,1],[0,1]]},
  {dir:[0,0,1],corners:[[0,0,1],[1,0,1],[0,1,1],[1,1,1]],uv:[[0,0],[1,0],[0,1],[1,1]]},
  {dir:[0,0,-1],corners:[[1,0,0],[0,0,0],[1,1,0],[0,1,0]],uv:[[0,0],[1,0],[0,1],[1,1]]}
];
const FACE_SHADE=[.8,.8,1,.55,.9,.9];
const AO_CURVE=[.5,.68,.84,1];
// Per face: neighbour offset, the axis it faces, the two in-plane sweep axes and which
// in-plane axes carry the texture's u and v, plus three padded AO samples per corner.
const NEIGHBOUR=new Int32Array(6),AXIS=new Uint8Array(6),AXIS_A=new Uint8Array(6),AXIS_B=new Uint8Array(6),TEX_U=new Uint8Array(6),TEX_V=new Uint8Array(6);
const AO_OFFSETS=new Int32Array(6*4*3),CORNERS=new Uint8Array(6*4*3),UVS=new Uint8Array(6*4*2);
FACES.forEach((face,f)=>{
  const d=face.dir,axis=d.findIndex(v=>v!==0);NEIGHBOUR[f]=d[0]*S[0]+d[1]*S[1]+d[2]*S[2];AXIS[f]=axis;
  const tangents=[0,1,2].filter(a=>a!==axis);
  // Greedy slices: y faces sweep x then z; side faces sweep their horizontal axis then y.
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
// Rotating the strip by one corner moves the triangle split to the other diagonal.
const ORDER_DEFAULT=[0,1,2,3],ORDER_FLIPPED=[1,3,0,2];

/** Tile bit 7 marks a corner lowered by 1/8 block (water surfaces). */
export const LOWERED=128;
export const MAX_QUADS=CS*CS*CH*3;
/** One shared quad index pattern covers every chunk mesh. */
export function quadIndices(quads=MAX_QUADS):Uint32Array{
  const index=new Uint32Array(quads*6);
  for(let q=0,v=0,i=0;q<quads;q++,v+=4){index[i++]=v;index[i++]=v+1;index[i++]=v+2;index[i++]=v+2;index[i++]=v+1;index[i++]=v+3;}
  return index;
}

/** Vertex layout: position (3 bytes) and info: u, v in blocks, tile, shade (4 bytes). */
export interface MeshPart{position:Uint8Array;info:Uint8Array;quads:number}
export interface ChunkMesh{solid:MeshPart;water:MeshPart;minY:number;maxY:number}
class Buffers{quads=0;position=new Uint8Array(MAX_QUADS*12);info=new Uint8Array(MAX_QUADS*16);}
const solidScratch=new Buffers(),waterScratch=new Buffers();

// Face keys for every voxel and direction. A key packs tile+1 (bits 0-4), lit (5),
// four 2-bit AO values (6-13), water (14) and a lowered water surface (15).
const keys=new Int32Array(6*CHUNK_VOLUME);
const UNIFORM_AO=0xff<<6,LIT=1<<5,IS_WATER=1<<14,SURFACE=1<<15;
const ao=new Uint8Array(4);

/** Neighbours ordered [-x-z, 0-z, +x-z, -x0, center, +x0, -x+z, 0+z, +x+z]; null reads as stone. */
export function meshChunk(neighbours:(Uint8Array|null)[]):ChunkMesh{
  fillPadded(neighbours);
  // keys is all zero here: greedy() clears every key it consumes.
  let minY=CH,maxY=0;
  for(let y=0;y<CH;y++)for(let z=0;z<CS;z++){
    let p=1+(z+1)*PX+(y+1)*PL,i=z*CS+y*LAYER;
    for(let x=0;x<CS;x++,p++,i++){
      const id=padded[p];if(id===AIR)continue;
      // Fast reject for buried blocks, which are most of every chunk.
      if(id!==WATER&&OP[padded[p+1]]&&OP[padded[p-1]]&&OP[padded[p+PL]]&&OP[padded[p-PL]]&&OP[padded[p+PX]]&&OP[padded[p-PX]])continue;
      const tiles=FT[id];let any=false;
      for(let f=0;f<6;f++){
        const out=p+NEIGHBOUR[f],n=padded[out];
        if(id===WATER){
          if(n!==AIR)continue;
          keys[f*CHUNK_VOLUME+i]=(tiles[f]+1)|LIT|UNIFORM_AO|IS_WATER|(f!==3&&padded[p+PL]!==WATER?SURFACE:0);
        }else{
          if(OP[n])continue;
          // Simple column sky light: faces under any opaque overhang are in shade.
          let key=(tiles[f]+1)|(((out/PL)|0)>skyTop[out%PL]?LIT:0);
          for(let c=0;c<4;c++){
            const o=(f*4+c)*3,s1=OP[padded[out+AO_OFFSETS[o]]],s2=OP[padded[out+AO_OFFSETS[o+1]]],corner=OP[padded[out+AO_OFFSETS[o+2]]];
            key|=(s1&&s2?0:3-s1-s2-corner)<<(6+c*2);
          }
          keys[f*CHUNK_VOLUME+i]=key;
        }
        any=true;
      }
      if(any){if(y<minY)minY=y;if(y+1>maxY)maxY=y+1;}
    }
  }
  solidScratch.quads=0;waterScratch.quads=0;
  if(maxY>minY)for(let f=0;f<6;f++)greedy(f,minY,maxY);
  return{solid:copy(solidScratch),water:copy(waterScratch),minY,maxY};
}

const origin=[0,0,0],extent=[1,1,1];
/** Merges equal, evenly lit faces of one direction into the fewest rectangles. */
function greedy(f:number,minY:number,maxY:number){
  const d=AXIS[f],a=AXIS_A[f],b=AXIS_B[f],base=f*CHUNK_VOLUME,sa=V[a],sb=V[b],sd=V[d],wa=SIZE[a];
  // Only the occupied height range is scanned.
  const s0=d===1?minY:0,s1=d===1?maxY:SIZE[d],j0=b===1?minY:0,hb=b===1?maxY:SIZE[b];
  for(let s=s0;s<s1;s++){
    const slice=base+s*sd;
    for(let j=j0;j<hb;j++)for(let i=0;i<wa;i++){
      const at=slice+i*sa+j*sb,key=keys[at];if(!key)continue;
      let w=1,h=1;
      // Faces with a lighting gradient stay single so their AO remains exact.
      if((key&UNIFORM_AO)===UNIFORM_AO){
        while(i+w<wa&&keys[at+w*sa]===key)w++;
        grow:while(j+h<hb){
          const row=at+h*sb;
          for(let k=0;k<w;k++)if(keys[row+k*sa]!==key)break grow;
          h++;
        }
      }
      for(let jj=0;jj<h;jj++){const row=at+jj*sb;for(let k=0;k<w;k++)keys[row+k*sa]=0;}
      origin[d]=s;origin[a]=i;origin[b]=j;extent[d]=1;extent[a]=w;extent[b]=h;
      emit(key&IS_WATER?waterScratch:solidScratch,f,key);
    }
  }
}
function emit(buffer:Buffers,f:number,key:number){
  const tile=(key&31)-1,surface=key&SURFACE,base=FACE_SHADE[f]*(key&LIT?1:.62);
  for(let c=0;c<4;c++)ao[c]=(key>>(6+c*2))&3;
  const order=Math.abs(ao[0]-ao[3])>Math.abs(ao[1]-ao[2])?ORDER_FLIPPED:ORDER_DEFAULT;
  let v=buffer.quads*4;
  for(const c of order){
    const o=(f*4+c)*3,pv=v*3,iv=v*4,u=(f*4+c)*2;
    buffer.position[pv]=origin[0]+CORNERS[o]*extent[0];
    buffer.position[pv+1]=origin[1]+CORNERS[o+1]*extent[1];
    buffer.position[pv+2]=origin[2]+CORNERS[o+2]*extent[2];
    buffer.info[iv]=UVS[u]*extent[TEX_U[f]];buffer.info[iv+1]=UVS[u+1]*extent[TEX_V[f]];
    buffer.info[iv+2]=tile|(surface&&CORNERS[o+1]?LOWERED:0);
    buffer.info[iv+3]=Math.round(255*base*AO_CURVE[ao[c]]);
    v++;
  }
  buffer.quads++;
}
function copy(b:Buffers):MeshPart{return{position:b.position.slice(0,b.quads*12),info:b.info.slice(0,b.quads*16),quads:b.quads};}

const STONE_CHUNK=new Uint8Array(CHUNK_VOLUME).fill(STONE);
function fillPadded(n:(Uint8Array|null)[]){
  // Bottom border is bedrock, top border is air.
  padded.fill(BEDROCK,0,PL);padded.fill(AIR,(PY-1)*PL);
  const c=n[4]??STONE_CHUNK,w=n[3]??STONE_CHUNK,e=n[5]??STONE_CHUNK,north=n[1]??STONE_CHUNK,south=n[7]??STONE_CHUNK;
  const nw=n[0]??STONE_CHUNK,ne=n[2]??STONE_CHUNK,sw=n[6]??STONE_CHUNK,se=n[8]??STONE_CHUNK,L=CS-1;
  for(let y=0;y<CH;y++){
    const py=(y+1)*PL,src=y*LAYER;
    // Interior rows are straight copies; only the one-voxel rim is gathered.
    for(let z=0;z<CS;z++){
      const row=py+(z+1)*PX,s=src+z*CS;
      padded.set(c.subarray(s,s+CS),row+1);
      padded[row]=w[s+L];padded[row+CS+1]=e[s];
    }
    const top=py,bottom=py+(CS+1)*PX,lastRow=src+L*CS;
    padded.set(north.subarray(lastRow,lastRow+CS),top+1);padded.set(south.subarray(src,src+CS),bottom+1);
    padded[top]=nw[lastRow+L];padded[top+CS+1]=ne[lastRow];padded[bottom]=sw[src+L];padded[bottom+CS+1]=se[src];
  }
  for(let c=0;c<PL;c++){
    let top=0;
    for(let py=PY-2;py>0;py--)if(OP[padded[c+py*PL]]){top=py;break;}
    skyTop[c]=top;
  }
}
