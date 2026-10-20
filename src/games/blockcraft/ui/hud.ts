// STUB HUD and menus (owned by the HUD & menus agent: hearts, hunger, armour, air, XP bar,
// hotbar with counts and durability, item names, damage flash, death screen, start/pause menu
// with world options). This version: crosshair, hotbar, health readout, debug text and menus.
import './hud.css';
import {iconUrl} from '../art/items';
import {itemDef} from '../data/items';
import {VIEW_DISTANCES,type Game,type HudService} from '../engine/contracts';

export function createHud(game:Game):HudService{
  const abort=new AbortController(),signal=abort.signal;
  const hud=document.createElement('div');hud.className='bc-hud';
  hud.innerHTML=`<div class="bc-crosshair" aria-hidden="true"></div><div class="bc-debug" aria-hidden="true" hidden></div>
  <div class="bc-stats" aria-hidden="true"></div><div class="bc-hotbar" role="toolbar" aria-label="Hotbar"></div>
  <button class="bc-view" type="button" aria-label="Change view distance">View</button>`;
  const menu=document.createElement('div');menu.className='bc-overlay';
  menu.innerHTML=`<p class="bc-eyebrow">BLOCKCRAFT</p><h2 class="bc-heading">Build anything</h2><p class="bc-copy"></p>
  <div class="bc-menu-options"><button type="button" class="game-button secondary bc-mode" aria-label="Game mode">Survival</button></div>
  <button class="game-button bc-start" type="button">Play</button><p class="bc-loading" role="status"></p>`;
  game.root.append(hud,menu);
  const $=<T extends HTMLElement>(root:HTMLElement,s:string)=>root.querySelector<T>(s)!;
  const hotbar=$(hud,'.bc-hotbar'),stats=$(hud,'.bc-stats'),debug=$(hud,'.bc-debug'),view=$<HTMLButtonElement>(hud,'.bc-view');
  const heading=$(menu,'.bc-heading'),copy=$(menu,'.bc-copy'),start=$<HTMLButtonElement>(menu,'.bc-start'),loading=$(menu,'.bc-loading'),mode=$<HTMLButtonElement>(menu,'.bc-mode');
  const desktop='Click to look around with the mouse.<br>W A S D move · Space jump · Shift sneak · double-tap W sprint<br>Left click mine / attack · Right click place / use · E inventory · Q drop';
  const touch='Drag to look · left stick to move · ▲ jump · ▼ sneak<br>Hold to mine · tap to place or use · ⋯ inventory';
  hotbar.innerHTML=Array.from({length:9},(_,i)=>`<button type="button" class="bc-slot" data-slot="${i}" aria-pressed="false"><img alt="" draggable="false"><small></small></button>`).join('');
  const slots=[...hotbar.querySelectorAll<HTMLButtonElement>('.bc-slot')];
  function drawHotbar(){
    slots.forEach((b,i)=>{
      const s=game.inventory.slots[i],img=b.querySelector('img')!,small=b.querySelector('small')!;
      b.setAttribute('aria-pressed',String(i===game.inventory.selected));
      b.setAttribute('aria-label',s?`${itemDef(s.id)?.displayName??s.id} ×${s.count}, slot ${i+1}`:`Empty, slot ${i+1}`);
      if(s){img.src=iconUrl(s.id);img.hidden=false;}else img.hidden=true;
      small.textContent=s&&s.count>1?String(s.count):'';
    });
  }
  game.inventory.onChange(drawHotbar);drawHotbar();
  hotbar.addEventListener('click',e=>{const b=(e.target as HTMLElement).closest<HTMLButtonElement>('.bc-slot');if(b)game.inventory.select(Number(b.dataset.slot));},{signal});
  hotbar.addEventListener('pointerdown',e=>e.stopPropagation(),{signal});
  view.addEventListener('click',()=>{game.setViewDistance((game.settings.view+1)%VIEW_DISTANCES.length);},{signal});
  mode.addEventListener('click',()=>game.setMode(game.settings.mode==='survival'?'creative':'survival'),{signal});
  start.addEventListener('click',()=>{if(game.state==='dead')game.respawn();else game.play();},{signal});
  window.addEventListener('keydown',e=>{if(e.code==='F3'&&(game.state==='playing'||game.state==='screen')){debug.hidden=!debug.hidden;e.preventDefault();}},{signal});
  let last=0;
  const service:HudService={
    showMenu(kind){
      menu.hidden=!kind;if(!kind)return;
      copy.innerHTML=game.input.touch?touch:desktop;start.hidden=false;
      if(kind==='start'){heading.textContent='Build anything';start.textContent='Play';}
      else if(kind==='resume'){heading.textContent='Paused';start.textContent='Resume';}
      else if(kind==='dead'){heading.textContent='You died!';copy.textContent=`Score: ${game.stats.mined}`;start.textContent='Respawn';}
      else{heading.textContent='Graphics interrupted';copy.textContent='Your world is saved. Leave and reopen Blockcraft to restore the graphics.';start.hidden=true;}
      mode.textContent=game.settings.mode==='survival'?'Mode: Survival':'Mode: Creative';
    },
    frame(){
      const now=performance.now();if(now-last<100)return;last=now;
      start.disabled=game.state==='loading';loading.textContent=game.state==='loading'?'Generating terrain…':'';
      view.textContent=`View ${VIEW_DISTANCES[game.settings.view]}`;mode.textContent=game.settings.mode==='survival'?'Mode: Survival':'Mode: Creative';
      stats.textContent=game.settings.mode==='survival'?`Health ${Math.ceil(game.survival.health)} · Food ${game.survival.food}`:'';
      if(!debug.hidden){const p=game.player.state,r=game.render.info();debug.textContent=`${r.drawCalls} draws · ${(r.triangles/1000).toFixed(0)}k tris · ${r.chunks} chunks · ${Math.floor(p.x)} ${Math.floor(p.y)} ${Math.floor(p.z)} · day ${game.time.day} ${game.time.dayTime}`;}
    },
    reset(){drawHotbar();},
    dispose(){abort.abort();hud.remove();menu.remove();}
  };
  game.events.on('modeChanged',()=>{service.showMenu(menu.hidden?null:game.state==='ready'?'start':'resume');});
  return service;
}
