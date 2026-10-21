// Chunk mesher (Meshing area). Turns a chunk plus its 3×3 neighbourhood and the padded light volume into the shared
// MeshPart vertex layout (engine/contracts.ts):
//  - cubes are greedy-merged where light, AO and tint are uniform, with vanilla smooth lighting (per-vertex sky and
//    block light averaged over the four light cells in front of the vertex, opaque cells skipped) and vanilla AO;
//  - every other registry shape is modelled after the vanilla block models in render/shapes*.ts;
//  - biome tints are blended over 3×3 columns, using the neighbour chunks' biomes at the borders;
//  - culling: opaque neighbours and `cullSame` families hide faces, partial shapes never hide a neighbour's face
//    (only identical partial faces facing each other, like snow beside snow, are both dropped), liquids never draw
//    against liquids.
import * as blocks from '../data/blocks';
import * as biomes from '../data/biomes';
import * as constants from '../engine/constants';
import type {BlockId,ChunkData,ChunkMesh,Mesher} from '../engine/contracts';
import type {LayerBuffer} from './mesher-builder';
import * as builder from './mesher-builder';
import * as tables from './mesher-tables';
import * as shapesModule from './shapes';
// Module-local aliases: hot loops read plain constants rather than live import bindings.
const {AIR,B,LAYER:BLOCK_LAYER,OPAQUE,FACE_TILE}=blocks;
const {biomeDef}=biomes;
const {CS,CH,LAYER,CHUNK_VOLUME,PAD_X,PAD_LAYER,PAD_Y,padIndex}=constants;
const {MeshBuilder}=builder;
const {AO_OFF,AVG,CORNER,CU,CULL_SAME,CV,EMISSIVE,FAMILY_ID,FLAG_EMISSIVE,FLAG_SWAY,FLIP_ORDER,GRASS_ID,GRASS_OVERLAY_TILE,GRASS_SIDE_TILE,N_AXIS,N_SIGN,PAD_NB,SHADE,SHAPE,SH_AIR,SH_CUBE,SIDE_FACE,SNOWY_DIRT,SNOWY_SIDE_TILE,SNOW_COVER,SWAY,TINT_KIND,U_AXIS,V_AXIS,V_FLIP}=tables;
const {emitShape}=shapesModule;

export {plantOffset} from './shapes';
const PL=PAD_LAYER,PX=PAD_X;
const b=new MeshBuilder();

// ---- Volume and tints ------------------------------------------------------------------------------
/** Missing neighbours are solid stone so nothing is drawn toward unloaded chunks. */
const SOLID_CHUNK:ChunkData={blocks:new Uint8Array(CHUNK_VOLUME).fill(B.stone),biomes:new Uint8Array(LAYER)};
const PY_TOP=PAD_Y-1;
/** Copies the centre chunk and a one-voxel rim of its neighbours into the padded volume (stone below y=0, air above
 *  the top). Returns the highest non-air y of the centre chunk (-1 when empty). */
function fillBlocks(n:readonly (ChunkData|null)[],pad:Uint8Array):number{
  const c=(n[4]??SOLID_CHUNK).blocks,w=(n[3]??SOLID_CHUNK).blocks,e=(n[5]??SOLID_CHUNK).blocks;
  const north=(n[1]??SOLID_CHUNK).blocks,south=(n[7]??SOLID_CHUNK).blocks,nw=(n[0]??SOLID_CHUNK).blocks,ne=(n[2]??SOLID_CHUNK).blocks;
  const sw=(n[6]??SOLID_CHUNK).blocks,se=(n[8]??SOLID_CHUNK).blocks,L=CS-1;
  pad.fill(B.stone,0,PL);pad.fill(AIR,PY_TOP*PL);
  for(let y=0;y<CH;y++){
    const py=(y+1)*PL,src=y*LAYER;
    for(let z=0;z<CS;z++){
      const row=py+(z+1)*PX,s=src+z*CS;
      for(let x=0;x<CS;x++)pad[row+1+x]=c[s+x];
      pad[row]=w[s+L];pad[row+CS+1]=e[s];
    }
    const top=py,bottom=py+(CS+1)*PX,last=src+L*CS;
    for(let x=0;x<CS;x++){pad[top+1+x]=north[last+x];pad[bottom+1+x]=south[src+x];}
    pad[top]=nw[last+L];pad[top+CS+1]=ne[last];pad[bottom]=sw[src+L];pad[bottom+CS+1]=se[src];
  }
  for(let y=CH-1;y>=0;y--){const s=y*LAYER;for(let i=0;i<LAYER;i++)if(c[s+i]!==AIR)return y;}
  return -1;
}
// Biome colours per biome id, and the padded 18×18 biome map of the current chunk.
const GRASS_RGB=new Int32Array(256),FOLIAGE_RGB=new Int32Array(256),WATER_RGB=new Int32Array(256);
for(let i=0;i<256;i++){const d=biomeDef(i);GRASS_RGB[i]=d.grass;FOLIAGE_RGB[i]=d.foliage;WATER_RGB[i]=d.water;}
const KIND_RGB=[GRASS_RGB,FOLIAGE_RGB,WATER_RGB];
const padBiome=new Uint8Array(PX*PX);
// Open-addressing colour → palette index table, cleared per chunk by generation stamp.
const HASH_SIZE=4096,hashKey=new Int32Array(HASH_SIZE),hashValue=new Uint16Array(HASH_SIZE),hashStamp=new Uint32Array(HASH_SIZE);
let stamp=0;
function paletteIndex(rgb:number):number{
  let h=Math.imul(rgb,0x9e3779b1)>>>20;
  for(;;h=(h+1)&(HASH_SIZE-1)){
    if(hashStamp[h]!==stamp){hashStamp[h]=stamp;hashKey[h]=rgb;const i=b.paletteSize++;b.palette[i]=rgb;hashValue[h]=i;return i;}
    if(hashKey[h]===rgb)return hashValue[h];
  }
}
/** Blends grass, foliage and water colours over the 3×3 columns around each column of the centre chunk. */
function prepareTints(n:readonly (ChunkData|null)[]){
  const centre=(n[4]??SOLID_CHUNK).biomes;
  for(let pz=0;pz<PX;pz++)for(let px=0;px<PX;px++){
    const x=px-1,z=pz-1,cx=x<0?0:x>=CS?2:1,cz=z<0?0:z>=CS?2:1,chunk=n[cz*3+cx];
    padBiome[px+pz*PX]=chunk?chunk.biomes[((x+CS)%CS)+((z+CS)%CS)*CS]:centre[Math.min(CS-1,Math.max(0,x))+Math.min(CS-1,Math.max(0,z))*CS];
  }
  stamp=(stamp+1)>>>0;if(stamp===0){hashStamp.fill(0);stamp=1;}
  b.paletteSize=1;b.palette[0]=0xffffff;
  for(let k=0;k<3;k++){
    const table=KIND_RGB[k];
    for(let z=0;z<CS;z++)for(let x=0;x<CS;x++){
      let r=0,g=0,bl=0;
      for(let dz=0;dz<3;dz++)for(let dx=0;dx<3;dx++){const c=table[padBiome[(x+dx)+(z+dz)*PX]];r+=c>>16;g+=(c>>8)&255;bl+=c&255;}
      b.tintIndex[k*LAYER+x+z*CS]=paletteIndex(Math.round(r/9)<<16|Math.round(g/9)<<8|Math.round(bl/9));
    }
  }
}

// ---- Cubes -------------------------------------------------------------------------------------------
// Greedy key: tile 8 | light 8 | ao 2 | layer 2 | emissive 1 | palette 10 bits; never 0 because layer ≥ 1.
const cornerLight=new Uint8Array(4),cornerAO=new Uint8Array(4);
/** All six faces of the cube at padded index p (chunk cell x,y,z; voxel index i). Uniform faces are keyed for greedy
 *  merging; others (light or AO varying across the face, swaying leaves, meshBlock) are written at once. */
function cube(p:number,i:number,x:number,y:number,z:number,id:number){
  const Bk=b.blocks,L=b.light,iso=b.iso,col=x+z*CS,layer=BLOCK_LAYER[id],emissive=EMISSIVE[id],sway=SWAY[id]?FLAG_SWAY:0;
  const mergeable=!iso&&!sway,cullSame=CULL_SAME[id],fam=FAMILY_ID[id],snowyDirt=SNOWY_DIRT[id];
  const snowy=snowyDirt&&!iso&&SNOW_COVER[Bk[p+PL]];
  for(let f=0;f<6;f++){
    const q=p+PAD_NB[f],n=Bk[q];
    if(!iso&&(OPAQUE[n]||(cullSame&&FAMILY_ID[n]===fam)))continue;
    let tile=FACE_TILE[id*6+f],kind=TINT_KIND[id*6+f];
    if(snowyDirt&&SIDE_FACE[f]){if(snowy)tile=SNOWY_SIDE_TILE;else if(id===GRASS_ID)kind=1;}
    const tint=kind?b.tintIndex[(kind-1)*LAYER+col]:0;
    let uniform=true;
    if(iso){for(let c=0;c<4;c++){cornerLight[c]=0xf0;cornerAO[c]=3;}}
    else{
      const cl=L[q],s0=cl>>4,b0=cl&15;
      for(let c=0;c<4;c++){
        const o=(f*4+c)*3,a=q+AO_OFF[o],bb=q+AO_OFF[o+1],oa=OPAQUE[Bk[a]],ob=OPAQUE[Bk[bb]];
        let s=s0,bl=b0,cnt=1,occ=0;
        if(!oa){const l=L[a];s+=l>>4;bl+=l&15;cnt++;}
        if(!ob){const l=L[bb];s+=l>>4;bl+=l&15;cnt++;}
        if(!(oa&&ob)){const d=q+AO_OFF[o+2],od=OPAQUE[Bk[d]];if(!od){const l=L[d];s+=l>>4;bl+=l&15;cnt++;}occ=3-oa-ob-od;}
        cornerLight[c]=emissive?0xff:AVG[cnt*64+s]<<4|AVG[cnt*64+bl];cornerAO[c]=occ;
        if(c&&(cornerLight[c]!==cornerLight[0]||occ!==cornerAO[0]))uniform=false;
      }
    }
    if(mergeable&&uniform){
      b.keys[f*CHUNK_VOLUME+i]=(tile|cornerLight[0]<<8|cornerAO[0]<<16|layer<<18|emissive<<20|tint<<21)>>>0;
      if(y<b.keyMinY)b.keyMinY=y;if(y>b.keyMaxY)b.keyMaxY=y;
      continue;
    }
    origin[0]=x;origin[1]=y;origin[2]=z;origin[N_AXIS[f]]+=N_SIGN[f]>0?1:0;extent[0]=extent[1]=extent[2]=1;
    rect(f,layer,tile,tint,(sway|(emissive?FLAG_EMISSIVE:0)),cornerLight,cornerAO);
  }
}
const origin=new Int32Array(3),extent=new Int32Array(3);
/** Writes a face rectangle: `origin` = minimum corner in blocks (on the face plane), `extent` = size along each axis.
 *  Light and AO per corner c0..c3. Grass block sides add the tinted overlay quad in the cutout layer. */
function rect(f:number,layer:number,tile:number,tint:number,flags:number,light:Uint8Array,ao:Uint8Array){
  const overlay=tile===GRASS_SIDE_TILE&&GRASS_OVERLAY_TILE>=0,rgb=overlay?0xffffff:b.palette[tint];
  // Join the brighter diagonal (AO first, then light) against AO anisotropy.
  const b0=ao[0]*64+(light[0]>>4)+(light[0]&15),b1=ao[1]*64+(light[1]>>4)+(light[1]&15);
  const b2=ao[2]*64+(light[2]>>4)+(light[2]&15),b3=ao[3]*64+(light[3]>>4)+(light[3]&15),flip=b0+b3>b1+b2;
  write(b.layers[layer-1],f,tile,rgb,flags,light,ao,flip);
  if(overlay)write(b.layers[1],f,GRASS_OVERLAY_TILE,b.palette[tint],flags,light,ao,flip);
}
function write(buf:LayerBuffer,f:number,tile:number,rgb:number,flags:number,light:Uint8Array,ao:Uint8Array,flip:boolean){
  if(!buf.reserve())return;
  const P=buf.position,U=buf.uvt,T=buf.tint,r=(rgb>>>16)&255,g=(rgb>>>8)&255,bl=rgb&255,na=N_AXIS[f];
  const eu=extent[U_AXIS[f]]*16,ev=extent[V_AXIS[f]]*16,vflip=V_FLIP[f],w=flags<<8;
  // Unit-cube corner offsets along the two tangent axes, scaled by the extent; the normal axis stays on the plane.
  const ex=na===0?0:extent[0],ey=na===1?0:extent[1],ez=na===2?0:extent[2];
  let o=buf.quads*16;
  for(let k=0;k<4;k++){
    const c=flip?FLIP_ORDER[k]:k,co=(f*4+c)*3;
    P[o]=(origin[0]+CORNER[co]*ex)*16;P[o+1]=(origin[1]+CORNER[co+1]*ey)*16;P[o+2]=(origin[2]+CORNER[co+2]*ez)*16;P[o+3]=light[c]|w;
    U[o]=CU[c]*eu;U[o+1]=(vflip?1-CV[c]:CV[c])*ev;U[o+2]=tile;U[o+3]=SHADE[f*4+ao[c]];
    T[o]=r;T[o+1]=g;T[o+2]=bl;T[o+3]=255;o+=4;
  }
  const y0=origin[1]*16,y1=(origin[1]+ey)*16;
  if(y0<b.minPy)b.minPy=y0;if(y1>b.maxPy)b.maxPy=y1;
  buf.quads++;
}
const SIZE=[CS,CH,CS],STRIDE=[1,LAYER,CS];
/** Plane axes (a, b) merged for faces along each normal axis. */
const PLANE_A=[2,0,0],PLANE_B=[1,2,1];
const uniformLight=new Uint8Array(4),uniformAO=new Uint8Array(4);
/** Greedy merging of the keyed faces, per direction and slice. */
function greedy(){
  if(b.keyMaxY<b.keyMinY)return;
  const keys=b.keys,y0=b.keyMinY,y1=b.keyMaxY+1;
  for(let f=0;f<6;f++){
    const d=N_AXIS[f],a=PLANE_A[d],bAxis=PLANE_B[d],base=f*CHUNK_VOLUME,sa=STRIDE[a],sb=STRIDE[bAxis],sd=STRIDE[d],wa=SIZE[a];
    const s0=d===1?y0:0,s1=d===1?y1:SIZE[d],j0=bAxis===1?y0:0,j1=bAxis===1?y1:SIZE[bAxis];
    for(let s=s0;s<s1;s++){
      const slice=base+s*sd;
      for(let j=j0;j<j1;j++)for(let i=0;i<wa;i++){
        const at=slice+i*sa+j*sb,key=keys[at];if(!key)continue;
        let w=1,h=1;
        while(i+w<wa&&keys[at+w*sa]===key)w++;
        grow:while(j+h<j1){const row=at+h*sb;for(let k=0;k<w;k++)if(keys[row+k*sa]!==key)break grow;h++;}
        for(let jj=0;jj<h;jj++){const row=at+jj*sb;for(let k=0;k<w;k++)keys[row+k*sa]=0;}
        origin[d]=s+(N_SIGN[f]>0?1:0);origin[a]=i;origin[bAxis]=j;extent[d]=1;extent[a]=w;extent[bAxis]=h;
        const light=(key>>>8)&255,ao=(key>>>16)&3;
        for(let c=0;c<4;c++){uniformLight[c]=light;uniformAO[c]=ao;}
        rect(f,(key>>>18)&3,key&255,(key>>>21)&1023,(key>>>20)&1?FLAG_EMISSIVE:0,uniformLight,uniformAO);
        i+=w-1;
      }
    }
  }
}

// ---- Public API ------------------------------------------------------------------------------------
/** Meshes the centre chunk of a 3×3 neighbourhood (order as LightEngine.computePadded) with the padded light volume
 *  computed for the same neighbourhood. Copies its outputs; scratch buffers are reused between calls. */
export function meshChunk(neighbours:readonly (ChunkData|null)[],light:Uint8Array):ChunkMesh{
  const pad=b.chunkBlocks;
  b.begin(pad,light,false);
  const top=fillBlocks(neighbours,pad);
  prepareTints(neighbours);
  const centre=neighbours[4] as (ChunkData&{cx?:unknown;cz?:unknown})|null;
  b.wx=typeof centre?.cx==='number'?centre.cx*CS:0;b.wz=typeof centre?.cz==='number'?centre.cz*CS:0;
  for(let y=0;y<=top;y++)for(let z=0;z<CS;z++){
    let p=padIndex(0,y,z),i=z*CS+y*LAYER;
    for(let x=0;x<CS;x++,p++,i++){
      const id=pad[p];if(id===AIR)continue;
      const shape=SHAPE[id];
      if(shape===SH_CUBE){
        if(OPAQUE[id]&&OPAQUE[pad[p+1]]&&OPAQUE[pad[p-1]]&&OPAQUE[pad[p+PL]]&&OPAQUE[pad[p-PL]]&&OPAQUE[pad[p+PX]]&&OPAQUE[pad[p-PX]])continue;
        cube(p,i,x,y,z,id);
      }else if(shape!==SH_AIR)emitShape(b,shape,p,x,y,z,id);
    }
  }
  greedy();
  return b.finish();
}
const ISO_CELL=padIndex(0,0,0);
/** One block on its own at positions 0..16: every face, full light (0xf0), no AO, no random offsets, and `tint`
 *  (0xRRGGBB) on the faces the registry tints (grass top and side overlay, leaves, water...), white without it. */
export function meshBlock(id:BlockId,tint?:number):ChunkMesh{
  const pad=b.isoBlocks;
  b.begin(pad,b.isoLight,true);
  b.paletteSize=2;b.palette[0]=0xffffff;b.palette[1]=tint===undefined?0xffffff:tint&0xffffff;b.tintIndex.fill(1);
  const shape=id>=0&&id<256?SHAPE[id]:SH_AIR;
  if(shape!==SH_AIR){
    pad[ISO_CELL]=id;
    if(shape===SH_CUBE)cube(ISO_CELL,0,0,0,0,id);else emitShape(b,shape,ISO_CELL,0,0,0,id);
    pad[ISO_CELL]=AIR;
  }
  return b.finish();
}
export function createMesher():Mesher{return{meshChunk,meshBlock};}
