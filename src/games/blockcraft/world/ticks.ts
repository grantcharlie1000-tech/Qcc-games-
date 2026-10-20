// STUB block ticks (owned by the world simulation agent: random ticks for crops, saplings,
// grass spread, leaf decay, farmland; scheduled ticks for fluids and falling blocks;
// explosions). This version does nothing.
import type {BlockTickService,Game} from '../engine/contracts';

export function createBlockTicks(_game:Game):BlockTickService{
  return{schedule(){},explode(){}};
}
