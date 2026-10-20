// STUB screens (owned by the inventory & screens agent: inventory with armour and 2×2 crafting,
// creative item picker, crafting table, furnace and chest screens, cursor stack, clicks,
// shift-click, touch). This version: a minimal inventory list that closes with E or the button.
import './screens.css';
import {iconUrl} from '../art/items';
import {itemDef} from '../data/items';
import type {Game,ScreenId,UIService,Vec3} from '../engine/contracts';

export function createUI(game:Game):UIService{
  const layer=document.createElement('div');layer.className='bc-screen';layer.hidden=true;game.root.append(layer);
  let screen:ScreenId|null=null,toastTimer=0;
  const toast=document.createElement('div');toast.className='bc-toast';toast.setAttribute('role','status');game.root.append(toast);
  function render(){
    const slots=game.inventory.slots.map((s,i)=>`<button type="button" class="bc-inv-slot" data-i="${i}" aria-label="${s?`${itemDef(s.id)?.displayName} ×${s.count}`:'Empty'}">${s?`<img alt="" src="${iconUrl(s.id)}"><small>${s.count>1?s.count:''}</small>`:''}</button>`).join('');
    layer.innerHTML=`<div class="bc-panel" role="dialog" aria-label="${screen}"><h2>${screen==='creative'?'Creative':'Inventory'}</h2><div class="bc-grid">${slots}</div><button type="button" class="game-button bc-close">Done</button></div>`;
    layer.querySelector('.bc-close')!.addEventListener('click',()=>service.close());
  }
  const service:UIService={
    get screen(){return screen;},
    open(id:ScreenId,_at?:Vec3){screen=id;render();layer.hidden=false;game.screenChanged(true);},
    close(){if(!screen)return;screen=null;layer.hidden=true;layer.innerHTML='';game.screenChanged(false);},
    toast(message){toast.textContent=message;toast.classList.add('show');clearTimeout(toastTimer);toastTimer=window.setTimeout(()=>toast.classList.remove('show'),2000);},
    frame(){
      // The 'inventory' action (E) opens the inventory while playing and closes any open screen.
      if(!game.input.pressed('inventory'))return;
      if(screen)service.close();
      else if(game.state==='playing')service.open(game.settings.mode==='creative'?'creative':'inventory');
    },
    reset(){service.close();},
    dispose(){clearTimeout(toastTimer);layer.remove();toast.remove();}
  };
  return service;
}
