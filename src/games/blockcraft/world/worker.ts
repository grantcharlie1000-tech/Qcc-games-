import {createTerrain} from './terrain';
import type {TerrainService} from '../engine/contracts';

// Terrain generation is the heaviest pure step, so it runs off the main thread.
// Result buffers are transferred back without copying.
let terrain:TerrainService|undefined;
self.onmessage=(event:MessageEvent<{seed:number;cx:number;cz:number;job:number}>)=>{
  const {seed,cx,cz,job}=event.data;
  if(!terrain||terrain.seed!==seed>>>0)terrain=createTerrain(seed);
  const data=terrain.generate(cx,cz);
  (self as unknown as {postMessage(message:unknown,transfer:Transferable[]):void}).postMessage({seed,cx,cz,job,blocks:data.blocks,biomes:data.biomes},[data.blocks.buffer,data.biomes.buffer]);
};
