// STUB advancements (owned by the advancements agent: modern-style advancement tree unlocked from
// game events, toasts, an advancements screen and statistics, persistence). Records grants only.
import type {AdvancementsService,AdvancementView,Game} from '../engine/contracts';

export function createAdvancements(_game:Game):AdvancementsService{
  const done=new Set<string>();
  return{
    list:():AdvancementView[]=>[],
    has:id=>done.has(id),
    grant(id){done.add(id);},
    mountScreen(container){container.textContent='Advancements';return()=>{container.textContent='';};},
    reset(){done.clear();}
  };
}
