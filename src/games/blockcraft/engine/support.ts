// Shared "can this block stay here" rules for placement (interaction), pop-off (ticks) and
// decoration (terrain). Pure and worker-safe: imports only data/.
import {BLOCK_BY_NAME,FACING_VECTOR,OPAQUE,SOLID,blockDef,isWater,AIR,type BlockId} from '../data/blocks';
import type {BlockSource} from './contracts';

const SOIL=new Set(['grass_block','dirt','coarse_dirt','podzol','mycelium','farmland']);
const SAND=new Set(['sand','red_sand']);
const family=(id:number)=>id<0?'':blockDef(id).family;

/** True when block `id` may exist at (x,y,z) given its neighbours. Unloaded neighbours (-1) count as supporting. */
export function canSurvive(world:BlockSource,id:BlockId,x:number,y:number,z:number):boolean{
  const d=blockDef(id);if(!d.support)return true;
  const below=world.get(x,y-1,z);if(below<0)return true;
  switch(d.support){
    case 'soil':return SOIL.has(family(below));
    case 'soil_or_sand':return SOIL.has(family(below))||SAND.has(family(below));
    case 'farmland':return family(below)==='farmland';
    case 'opaque_below':return OPAQUE[below]===1||family(below).endsWith('_leaves')&&d.family==='snow';
    case 'sugar_cane':{
      if(family(below)==='sugar_cane')return true;
      if(!SOIL.has(family(below))&&!SAND.has(family(below)))return false;
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const n=world.get(x+dx,y-1,z+dz);if(n<0||isWater(n))return true;}
      return false;
    }
    case 'cactus':{
      if(family(below)!=='cactus'&&!SAND.has(family(below)))return false;
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){const n=world.get(x+dx,y,z+dz);if(n>0&&SOLID[n])return false;}
      return true;
    }
    case 'water':return isWater(below)&&blockDef(below).liquid?.level===0;
    case 'wall':{
      if(!d.facing)return false;const [fx,fz]=FACING_VECTOR[d.facing],n=world.get(x-fx,y,z-fz);
      return n<0||OPAQUE[n]===1;
    }
    case 'door':{
      if(d.door?.half==='upper'){const l=world.get(x,y-1,z);return l<0||family(l)==='oak_door'&&blockDef(l).door?.half==='lower';}
      return SOLID[below]===1&&family(below)!=='oak_door'&&(()=>{const u=world.get(x,y+1,z);return u<0||u===AIR||family(u)==='oak_door';})();
    }
    case 'bed':return SOLID[below]===1;
  }
}
export const isSoil=(id:BlockId)=>SOIL.has(family(id));
export const SAND_ID=BLOCK_BY_NAME.get('sand')!.id;
