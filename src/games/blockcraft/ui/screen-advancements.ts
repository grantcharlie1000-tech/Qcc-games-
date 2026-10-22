// Advancements screen: the body (tree, progress and statistics) is built by the advancements
// service's mountScreen; ui only frames it, opens it (L or the pause menu) and unmounts it on close.
import type {Game} from '../engine/contracts';
import type {ScreenBuild} from './screen-common';

export function buildAdvancements(game:Game):ScreenBuild{
  return{id:'advancements',title:'Advancements',kind:'advancements',html:'<div class="bc-adv-body" data-mount></div>',
    mount:body=>{try{return game.advancements.mountScreen(body);}catch{body.textContent='Advancements are unavailable.';return()=>{body.textContent='';};}}};
}
