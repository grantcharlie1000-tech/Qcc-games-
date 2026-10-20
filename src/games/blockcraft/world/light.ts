// STUB light engine (owned by the lighting agent, who replaces it with flood-fill sky and block
// light). This version: sky light 15 above each column's highest opaque block, 0 below; block
// light only in the emitting voxel itself.
import {OPAQUE,LIGHT_EMISSION} from '../data/blocks';
import {CS,CH,LAYER,PAD_X,PAD_LAYER,PAD_Y} from '../engine/constants';
import type {ChunkData,LightEngine} from '../engine/contracts';

export function createLightEngine():LightEngine{
  return{
    computePadded(neighbours:readonly (ChunkData|null)[],out:Uint8Array){
      out.fill(0);
      for(let pz=0;pz<PAD_X;pz++)for(let px=0;px<PAD_X;px++){
        const x=px-1,z=pz-1,n=neighbours[(z<0?0:z>=CS?2:1)*3+(x<0?0:x>=CS?2:1)];
        const lx=(x+CS)%CS,lz=(z+CS)%CS,column=px+pz*PAD_X;
        out[column+(PAD_Y-1)*PAD_LAYER]=0xf0;
        if(!n)continue;
        let sky=15;
        for(let y=CH-1;y>=0;y--){
          const id=n.blocks[lx+lz*CS+y*LAYER];
          if(OPAQUE[id])sky=0;
          out[column+(y+1)*PAD_LAYER]=(sky<<4)|LIGHT_EMISSION[id];
        }
      }
    }
  };
}
