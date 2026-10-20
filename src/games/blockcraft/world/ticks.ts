// STUB block ticks (owned by the world simulation agent: random ticks for crops, saplings,
// grass spread, leaf decay, farmland; scheduled ticks for fluids and falling blocks;
// explosions). This version does nothing.
import type {BlockTickService,Game} from '../engine/contracts';

/** Registers the world simulation's entity kinds ('primed_tnt', 'falling_block'); called by engine/game.ts before init(). */
export function registerWorldEntities(_game:Game):void{}
export function createBlockTicks(_game:Game):BlockTickService{
  return{schedule(){},explode(){}};
}
