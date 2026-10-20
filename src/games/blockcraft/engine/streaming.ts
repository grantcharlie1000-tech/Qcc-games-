// Chunk streaming: terrain generation in Web Workers (main-thread fallback), then light and
// meshing on a per-frame time budget, nearest chunks first.
import {CS,CH,CHUNK_VOLUME,PAD_X,PAD_LAYER,PAD_VOLUME,LAYER,chunkKey,keyX,keyZ} from './constants';
import {VIEW_DISTANCES,type ChunkData,type LightEngine,type Mesher,type RenderService,type TerrainService} from './contracts';
import type {VoxelWorld} from '../world/world';

const MESH_BUDGET_MS=5,GENERATE_BUDGET_MS=6;
/** Chunk offsets sorted nearest-first, computed once for the largest view. */
const OFFSETS=(()=>{
  const r=VIEW_DISTANCES[VIEW_DISTANCES.length-1]+3,list:[number,number,number][]=[];
  for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++)list.push([dx,dz,dx*dx+dz*dz]);
  return list.sort((a,b)=>a[2]-b[2]);
})();
interface WorkerEntry{worker:Worker;jobs:Set<number>}
interface Reply{seed:number;cx:number;cz:number;blocks:Uint8Array;biomes:Uint8Array}

export class ChunkStreamer{
  private workers:WorkerEntry[]=[];
  private pending=new Set<number>();
  private meshed=new Set<number>();
  private lightBuffer=new Uint8Array(PAD_VOLUME);
  private neighbours:(ChunkData|null)[]=new Array(9).fill(null);
  /** True while generation or meshing work remains (keeps the loop running). */
  busy=true;
  disposed=false;
  constructor(private world:VoxelWorld,private terrain:()=>TerrainService,private light:LightEngine,private mesher:Mesher,private render:RenderService,private wake:()=>void){
    try{
      const count=Math.max(1,Math.min(3,(navigator.hardwareConcurrency||2)-1));
      for(let i=0;i<count;i++){
        const worker=new Worker(new URL('../world/worker.ts',import.meta.url),{type:'module'}),entry:WorkerEntry={worker,jobs:new Set()};
        worker.onmessage=(e:MessageEvent<Reply>)=>{entry.jobs.delete(chunkKey(e.data.cx,e.data.cz));this.receive(e.data);this.wake();};
        // A worker that fails (e.g. a blocked script) hands its jobs back; with none left,
        // generation continues on the main thread.
        worker.onerror=()=>{worker.terminate();for(const k of entry.jobs)this.pending.delete(k);this.workers.splice(this.workers.indexOf(entry),1);this.wake();};
        this.workers.push(entry);
      }
    }catch{for(const w of this.workers)w.worker.terminate();this.workers.length=0;}
  }
  get workerCount(){return this.workers.length;}
  get meshedCount(){return this.meshed.size;}
  isMeshed(cx:number,cz:number){return this.meshed.has(chunkKey(cx,cz));}
  private centre={cx:0,cz:0,view:5};
  setCentre(x:number,z:number,view:number){this.centre={cx:Math.floor(x/CS),cz:Math.floor(z/CS),view};}
  private inRange(cx:number,cz:number,extra:number){const c=this.centre,r=c.view+extra;return (cx-c.cx)**2+(cz-c.cz)**2<=r*r;}
  private receive(r:Reply){
    const key=chunkKey(r.cx,r.cz);this.pending.delete(key);
    if(this.disposed||r.seed!==this.terrain().seed||this.world.chunks.has(key)||!this.inRange(r.cx,r.cz,1.5))return;
    this.world.insert(r.cx,r.cz,{blocks:r.blocks,biomes:r.biomes});
  }
  hasNeighbours(cx:number,cz:number){
    for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)if(!this.world.chunks.has(chunkKey(cx+dx,cz+dz)))return false;
    return true;
  }
  /** Light + mesh one chunk now. */
  build(cx:number,cz:number){
    for(let dz=-1,i=0;dz<=1;dz++)for(let dx=-1;dx<=1;dx++,i++)this.neighbours[i]=this.world.chunk(cx+dx,cz+dz)??null;
    this.light.computePadded(this.neighbours,this.lightBuffer);
    const chunk=this.world.chunk(cx,cz)!,mesh=this.mesher.meshChunk(this.neighbours,this.lightBuffer);
    // Keep the chunk's own light for gameplay queries (spawning, crops).
    chunk.light??=new Uint8Array(CHUNK_VOLUME);
    for(let y=0;y<CH;y++)for(let z=0;z<CS;z++){const src=1+(z+1)*PAD_X+(y+1)*PAD_LAYER;chunk.light.set(this.lightBuffer.subarray(src,src+CS),z*CS+y*LAYER);}
    this.render.setChunkMesh(cx,cz,mesh);
    const key=chunkKey(cx,cz);this.meshed.add(key);this.world.dirty.delete(key);this.world.lightDirty.delete(key);
  }
  /** Per frame: unload, request, generate (fallback) and mesh within budget. Returns meshes built. */
  update():number{
    const {cx:pcx,cz:pcz,view:r}=this.centre,rGen=(r+1.5)**2,rMesh=r*r,rDrop=(r+2.5)**2;
    for(const [key,chunk] of this.world.chunks)if((chunk.cx-pcx)**2+(chunk.cz-pcz)**2>rDrop){
      this.render.setChunkMesh(chunk.cx,chunk.cz,null);this.meshed.delete(key);this.world.remove(key);
    }
    const begin=performance.now();let built=0;this.busy=this.pending.size>0;
    // Edited chunks first: immediate feedback for the player's own changes.
    for(const key of this.world.dirty){
      const cx=keyX(key),cz=keyZ(key);
      if(!this.world.chunks.has(key)||!this.meshed.has(key)){this.world.dirty.delete(key);continue;}
      if(built&&performance.now()-begin>MESH_BUDGET_MS){this.busy=true;break;}
      if(this.hasNeighbours(cx,cz)){this.build(cx,cz);built++;}
    }
    // Neighbours whose light may have changed, after the edited chunks.
    for(const key of this.world.lightDirty){
      if(!this.world.chunks.has(key)||!this.meshed.has(key)){this.world.lightDirty.delete(key);continue;}
      if(built&&performance.now()-begin>MESH_BUDGET_MS){this.busy=true;break;}
      const cx=keyX(key),cz=keyZ(key);
      if(this.hasNeighbours(cx,cz)){this.build(cx,cz);built++;}
    }
    for(const [dx,dz,d] of OFFSETS){
      if(d>rGen)break;
      const cx=pcx+dx,cz=pcz+dz,key=chunkKey(cx,cz);
      if(!this.world.chunks.has(key)){
        if(this.pending.has(key))continue;
        if(this.workers.length){
          let best=this.workers[0];for(const w of this.workers)if(w.jobs.size<best.jobs.size)best=w;
          if(best.jobs.size<2){best.jobs.add(key);this.pending.add(key);best.worker.postMessage({seed:this.terrain().seed,cx,cz,job:key});}
        }else if(performance.now()-begin<GENERATE_BUDGET_MS)this.world.insert(cx,cz,this.terrain().generate(cx,cz));
        this.busy=true;continue;
      }
      if(d>rMesh||this.meshed.has(key)||!this.hasNeighbours(cx,cz))continue;
      this.busy=true;
      if(built&&performance.now()-begin>MESH_BUDGET_MS)continue;
      this.build(cx,cz);built++;
    }
    return built;
  }
  /** Drop everything (new world / restore). In-flight worker results are discarded on arrival. */
  clear(){for(const key of this.meshed)this.render.setChunkMesh(keyX(key),keyZ(key),null);this.meshed.clear();this.pending.clear();for(const w of this.workers)w.jobs.clear();this.busy=true;}
  dispose(){this.disposed=true;for(const w of this.workers)w.worker.terminate();this.workers.length=0;}
}
