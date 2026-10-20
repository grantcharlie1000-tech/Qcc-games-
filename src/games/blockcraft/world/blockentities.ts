// STUB block entities (owned by the crafting & smelting agent: chest storage, furnace smelting
// ticks, lit-state block swaps, persistence).
import type {BlockEntity,BlockEntityService,Game,ItemStack} from '../engine/contracts';

const key=(x:number,y:number,z:number)=>`${x},${y},${z}`;
export function createBlockEntities(_game:Game):BlockEntityService{
  const map=new Map<string,BlockEntity>();
  return{
    get:(x,y,z)=>map.get(key(x,y,z)),
    create(x,y,z,kind){
      const e:BlockEntity=kind==='chest'?{kind,items:new Array(27).fill(null)}:{kind,input:null,fuel:null,output:null,burn:0,burnTotal:0,cook:0,xp:0};
      map.set(key(x,y,z),e);return e;
    },
    remove(x,y,z){const e=map.get(key(x,y,z));map.delete(key(x,y,z));if(!e)return[];
      return (e.kind==='chest'?e.items:[e.input,e.fuel,e.output]).filter((s):s is ItemStack=>!!s);},
    reset(){map.clear();}
  };
}
