import {test} from 'vitest';
import {B} from '../../../src/games/blockcraft/data/blocks';
import {CHUNK_VOLUME,LAYER,PAD_VOLUME} from '../../../src/games/blockcraft/engine/constants';
import type {ChunkData} from '../../../src/games/blockcraft/engine/contracts';
import {createLightEngine} from '../../../src/games/blockcraft/world/light';
import {createTerrain} from '../../../src/games/blockcraft/world/terrain';

function time(label:string,hoods:(ChunkData|null)[][]){
  const e=createLightEngine(),out=new Uint8Array(PAD_VOLUME);
  for(let k=0;k<5;k++)for(const n of hoods)e.computePadded(n,out);
  const rounds:number[]=[];
  for(let r=0;r<7;r++){const t0=performance.now();for(const n of hoods)e.computePadded(n,out);rounds.push((performance.now()-t0)/hoods.length);}
  console.log(label,rounds.map(r=>r.toFixed(2)).join(' '),'best',Math.min(...rounds).toFixed(3));
  const T:number[]=[];(globalThis as any).__lightTimes=T;
  for(let r=0;r<10;r++)for(const n of hoods)e.computePadded(n,out);
  console.log('  phases',T.map(v=>(v/10/hoods.length).toFixed(3)).join(' '));
  (globalThis as any).__lightTimes=undefined;
}
test('bench',()=>{
  const t=createTerrain(1234),grid=new Map<string,ChunkData>();
  for(let cz=-2;cz<=2;cz++)for(let cx=-2;cx<=2;cx++)grid.set(`${cx},${cz}`,t.generate(cx,cz));
  const hoods:(ChunkData|null)[][]=[];
  for(let cz=-1;cz<=1;cz++)for(let cx=-1;cx<=1;cx++)hoods.push([-1,0,1].flatMap(dz=>[-1,0,1].map(dx=>grid.get(`${cx+dx},${cz+dz}`)!)));
  const fill=(id:number,h:number)=>{const b=new Uint8Array(CHUNK_VOLUME);b.fill(id,0,h*LAYER);return{blocks:b,biomes:new Uint8Array(LAYER)};};
  const stone=Array.from({length:9},()=>fill(B.stone,128)),air=Array.from({length:9},()=>fill(B.stone,0)),half=Array.from({length:9},()=>fill(B.stone,64));
  time('terrain',hoods);time('stone',[stone]);time('air',[air]);time('half',[half]);
  for(const seed of [1,2,3,7,42]){
    const tt=createTerrain(seed),g=new Map<string,ChunkData>();
    for(let cz=-1;cz<=1;cz++)for(let cx=-1;cx<=1;cx++)g.set(`${cx},${cz}`,tt.generate(cx+seed*7,cz));
    time('terrain seed '+seed,[[-1,0,1].flatMap(dz=>[-1,0,1].map(dx=>g.get(`${dx},${dz}`)!))]);
  }
});
