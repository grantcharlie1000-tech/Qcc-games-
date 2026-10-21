import {test} from 'vitest';
import {AIR,B} from '../../../src/games/blockcraft/data/blocks';
import {CH,CS,LAYER,PAD_VOLUME} from '../../../src/games/blockcraft/engine/constants';
import type {ChunkData} from '../../../src/games/blockcraft/engine/contracts';
import {createLightEngine} from '../../../src/games/blockcraft/world/light';
import {createTerrain} from '../../../src/games/blockcraft/world/terrain';
import {Simplex} from '../../../src/games/blockcraft/world/noise';

function hoodsFor(seed:number,carve:number){
  const t=createTerrain(seed),noise=new Simplex(seed+5),grid=new Map<string,ChunkData>();
  let air=0,total=0;
  for(let cz=-2;cz<=2;cz++)for(let cx=-2;cx<=2;cx++){
    const c=t.generate(cx,cz);
    if(carve>0)for(let z=0;z<CS;z++)for(let x=0;x<CS;x++)for(let y=1;y<CH;y++){
      const i=x+z*CS+y*LAYER,wx=cx*CS+x,wz=cz*CS+z;
      if(c.blocks[i]===AIR||c.blocks[i]===B.water)continue;
      total++;
      const n=noise.noise3(wx/24,y/12,wz/24),s=Math.abs(noise.noise3(wx/40+50,y/20,wz/40));
      if(n>carve||s<.04){c.blocks[i]=y<10?B.lava:AIR;air++;}
    }
    grid.set(`${cx},${cz}`,c);
  }
  console.log('carved',(air/Math.max(1,total)*100).toFixed(1),'%');
  const hoods:(ChunkData|null)[][]=[];
  for(let cz=-1;cz<=1;cz++)for(let cx=-1;cx<=1;cx++)hoods.push([-1,0,1].flatMap(dz=>[-1,0,1].map(dx=>grid.get(`${cx+dx},${cz+dz}`)!)));
  return hoods;
}
function bench(label:string,hoods:(ChunkData|null)[][]){
  const e=createLightEngine(),out=new Uint8Array(PAD_VOLUME);
  let peak=0;
  for(let k=0;k<5;k++)for(const n of hoods){e.computePadded(n,out);peak=Math.max(peak,e.queuePeak);}
  const cap=e.queueCapacity;
  const rounds:number[]=[];
  const g=(globalThis as any).gc as undefined|(()=>void);
  g?.();const h0=process.memoryUsage().heapUsed;
  for(let r=0;r<7;r++){const t0=performance.now();for(const n of hoods)e.computePadded(n,out);rounds.push((performance.now()-t0)/hoods.length);}
  const h1=process.memoryUsage().heapUsed;
  console.log(label,rounds.map(r=>r.toFixed(2)).join(' '),'peak',peak,'cap',cap,e.queueCapacity,'heap delta',h1-h0);
}
test('stress',()=>{
  bench('stub',hoodsFor(1234,0));
  bench('stub 42',hoodsFor(42,0));
  bench('caves .5',hoodsFor(77,.5));
  bench('caves .35',hoodsFor(77,.35));
});
