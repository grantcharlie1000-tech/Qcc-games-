// STUB crafting (owned by the crafting & smelting agent: shaped/shapeless recipes in recipes.ts,
// 2×2 and 3×3 matching with mirroring, smelting table and fuel values).
import {itemDef} from '../data/items';
import type {CraftingService,Game} from '../engine/contracts';

export function createCrafting(_game:Game):CraftingService{
  return{
    match:()=>null,
    smelt:()=>null,
    fuelSeconds:id=>itemDef(id)?.fuel??0,
    recipesFor:()=>[]
  };
}
