import {test} from 'vitest';
import {CH,PAD_VOLUME,PAD_X,PAD_LAYER,CS} from '../../../src/games/blockcraft/engine/constants';

const R=48,RL=R*R,VOLUME=RL*131;
const cell=new Uint8Array(VOLUME),sky=new Uint8Array(VOLUME),block=new Uint8Array(VOLUME);
let lo=0;
function writeA(out:Uint8Array,writeLo:number,writeHi:number){
  for(let y=writeLo;y<=writeHi;y++){
    const layer=(y-lo+1)*RL;
    for(let pz=0;pz<PAD_X;pz++){
      let i=layer+(CS-1)+(pz+CS-1)*R,o=pz*PAD_X+(y+1)*PAD_LAYER;
      for(let px=0;px<PAD_X;px++,i++,o++)out[o]=cell[i]>=0xf0?0:sky[i]<<4|block[i];
    }
  }
}
function writeB(out:Uint8Array,writeLo:number,writeHi:number){
  for(let y=writeLo;y<=writeHi;y++){
    const layer=(y-lo+1)*RL;
    for(let pz=0;pz<PAD_X;pz++){
      const i0=layer+(CS-1)+(pz+CS-1)*R,o0=pz*PAD_X+(y+1)*PAD_LAYER;
      for(let px=0;px<PAD_X;px++){const i=i0+px;const c=cell[i];out[o0+px]=c>=0xf0?0:(sky[i]<<4)|block[i];}
    }
  }
}
function bench(label:string,f:(o:Uint8Array,a:number,b:number)=>void){
  const out=new Uint8Array(PAD_VOLUME);
  for(let k=0;k<50;k++)f(out,-1,CH);
  const t0=performance.now();for(let k=0;k<200;k++)f(out,-1,CH);
  console.log(label,((performance.now()-t0)/200).toFixed(4),'ms');
}
test('bench write',()=>{
  for(let i=0;i<VOLUME;i++){cell[i]=(i*7)&255;sky[i]=i&15;block[i]=(i>>3)&15;}
  bench('A',writeA);bench('B',writeB);bench('A',writeA);bench('B',writeB);
});
