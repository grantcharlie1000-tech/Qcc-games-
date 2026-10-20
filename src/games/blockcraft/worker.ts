import {TerrainGenerator} from './terrain';

// Terrain generation is the heaviest pure step, so it runs off the main thread.
// Each result buffer is transferred back without copying.
let generator:TerrainGenerator|undefined;
self.onmessage=(event:MessageEvent<{seed:number;cx:number;cz:number;job:number}>)=>{
  const {seed,cx,cz,job}=event.data;
  if(!generator||generator.seed!==seed>>>0)generator=new TerrainGenerator(seed);
  const data=generator.generate(cx,cz);
  (self as unknown as {postMessage(message:unknown,transfer:Transferable[]):void}).postMessage({seed,cx,cz,job,data},[data.buffer]);
};
