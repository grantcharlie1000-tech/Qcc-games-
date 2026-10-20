// STUB block entities (owned by the crafting & smelting agent: chest storage, furnace smelting
// ticks, lit-state block swaps, lifecycle from blockChanged, contents dropped on removal, persistence).
// This version: creates empty entities on demand.
import {blockDef} from '../data/blocks';
import type {BlockEntity,BlockEntityService,Game} from '../engine/contracts';

const key=(x:number,y:number,z:number)=>`${x},${y},${z}`;
export function createBlockEntities(game:Game):BlockEntityService{
  const map=new Map<string,BlockEntity>();
  return{
    get(x,y,z){
      const k=key(x,y,z),existing=map.get(k);if(existing)return existing;
      const id=game.world.get(x,y,z),kind=id>=0?blockDef(id).blockEntity:undefined;if(!kind)return undefined;
      const e:BlockEntity=kind==='chest'?{kind,items:new Array(27).fill(null)}:{kind,input:null,fuel:null,output:null,burn:0,burnTotal:0,cook:0,xp:0};
      map.set(k,e);return e;
    },
    reset(){map.clear();}
  };
}
