// Overlay menus owned by the HUD (layer z-index 30): the start menu, the game menu (pause), the death screen, the
// lost-graphics screen and the new-world confirmation for the shell's Restart. World options go through
// game.updateSettings; the Advancements button opens the ui's advancements screen. The common lifecycle sheet
// presents the current input's concise controls and primary action.
import {bindGamePauseSheet,createGameSheet} from '../../../ui/game-sheet';
import type {Game,GameSettings} from '../engine/contracts';
import {VIEW_DISTANCES} from '../engine/contracts';
import {deathScore,nextDifficulty,optionLabel,sensitivityFromSlider,sensitivityToSlider,OPTION_HINTS,type OptionKey} from './menus-options';

export type MenuKind='start'|'resume'|'dead'|'lost'|'restart';
type Panel='main'|'options';
export interface Menus{
  show(kind:MenuKind|null):void;
  readonly kind:MenuKind|null;
  /** Re-read settings, state and input mode (labels, disabled buttons, copy). */
  refresh():void;
  setDeathMessage(message:string):void;
  dispose():void;
}
/** Vanilla keeps the death screen's buttons disabled for 20 ticks. */
export const RESPAWN_DELAY_MS=1000;

const CONTROLS={touch:'Stick moves · Drag looks',keyboard:'WASD moves · Mouse looks'};
const TOGGLES:readonly OptionKey[]=['keepInventory','daylightCycle','weatherCycle','mobSpawning'];
interface Slider{key:OptionKey;min:number;max:number;step:number;get(g:Game):number;set(v:number):Partial<GameSettings>}
const SLIDERS:readonly Slider[]=[
  {key:'view',min:0,max:VIEW_DISTANCES.length-1,step:1,get:g=>g.settings.view,set:v=>({view:Math.round(v)})},
  {key:'fov',min:50,max:110,step:1,get:g=>g.settings.fov,set:v=>({fov:v})},
  {key:'sensitivity',min:10,max:400,step:5,get:g=>sensitivityToSlider(g.settings.sensitivity),set:v=>({sensitivity:sensitivityFromSlider(v)})},
  {key:'volume',min:0,max:100,step:1,get:g=>Math.round(g.settings.volume*100),set:v=>({volume:Math.round(v)/100})}
];

export function createMenus(game:Game):Menus{
  const abort=new AbortController(),signal=abort.signal;
  const el=document.createElement('div');el.className='bc-menu';el.hidden=true;
  // The lifecycle region and the real modal panel provide their own names.
  const sliders=SLIDERS.map(s=>`<label class="bc-slider"><span class="bc-slider-label" data-label="${s.key}"></span>
    <input type="range" data-slider="${s.key}" min="${s.min}" max="${s.max}" step="${s.step}"></label>`).join('');
  const toggles=TOGGLES.map(k=>`<button type="button" class="bc-btn" data-toggle="${k}" aria-pressed="false" title="${OPTION_HINTS[k]??''}"></button>`).join('');
  el.innerHTML=`<div class="bc-menu-panel">
    <h2 class="bc-menu-title" id="bc-menu-title"></h2>
    <p class="bc-menu-message"></p>
    <div class="bc-menu-page" data-panel="main">
      <button type="button" class="bc-btn" data-act="mode"></button>
      <div class="bc-btn-row">
        <button type="button" class="bc-btn" data-act="options">Options…</button>
        <button type="button" class="bc-btn" data-act="advancements">Advancements</button>
      </div>
      <button type="button" class="bc-btn" data-act="online" aria-haspopup="dialog">Multiplayer</button>
    </div>
    <div class="bc-menu-page" data-panel="options" hidden>
      <div class="bc-options">
        <button type="button" class="bc-btn" data-act="difficulty"></button>
        ${sliders}
        ${toggles}
      </div>
      <button type="button" class="bc-btn bc-done" data-act="back">Done</button>
    </div>
    <div class="bc-menu-page" data-panel="restart" hidden>
      <button type="button" class="bc-btn" data-act="new-world">Create New World</button>
      <button type="button" class="bc-btn" data-act="cancel">Cancel</button>
    </div>
    <p class="bc-loading" role="status"></p>
  </div>`;
  game.root.append(el);
  const q=<T extends HTMLElement>(s:string)=>el.querySelector<T>(s)!;
  const title=q('.bc-menu-title'),message=q('.bc-menu-message'),loading=q('.bc-loading');
  const auxiliary=q('.bc-menu-panel');
  // Keep the actual modal node's role stable. The shell observes its hidden
  // attribute to restore navigation after Options or a restart confirmation.
  auxiliary.setAttribute('role','dialog');auxiliary.setAttribute('aria-labelledby','bc-menu-title');
  const pauseSheet=bindGamePauseSheet(game.root,{title:'Minecraft',controls:CONTROLS});
  const sheet=createGameSheet(el,{title:'Minecraft',controls:CONTROLS,onPlay(){if(kind==='dead')game.respawn();else game.play();},buttonClass:'bc-primary'});
  const worldOptions=document.createElement('details');worldOptions.className='bc-world-config';
  const summary=document.createElement('summary');summary.textContent='World options';worldOptions.append(summary,q('[data-panel=main]'));
  sheet.element.querySelector('.game-sheet-panel')!.insertBefore(worldOptions,sheet.button);
  sheet.element.querySelector('.game-sheet-panel')!.append(loading);
  const primary=sheet.button,mode=q<HTMLButtonElement>('[data-act=mode]'),difficulty=q<HTMLButtonElement>('[data-act=difficulty]');
  const respawn=sheet.button;
  const pages=[...el.querySelectorAll<HTMLElement>('.bc-menu-page')];
  let kind:MenuKind|null=null,panel:Panel='main',deathMessage='',respawnTimer=0,advPoll=0;
  /** The menu the new-world confirmation covers (Cancel goes back to it). */
  let beforeRestart:MenuKind|null=null;

  function setPanel(p:Panel|'dead'|'restart',focus=true){
    if(p!=='dead'&&p!=='restart')panel=p;
    const lifecycle=p==='main'||p==='dead';
    el.dataset.shared=String(lifecycle);auxiliary.hidden=lifecycle;
    if(lifecycle){
      for(const page of pages)page.hidden=page.dataset.panel!=='main';
      worldOptions.hidden=p==='dead';
      if(game.shellPaused)sheet.hide();
      else sheet.show(p==='dead'?'game-over':kind==='resume'?'paused':'start',p==='dead'?{score:deathScore(game)}:{});
    }else{
      sheet.hide();
      for(const page of pages)page.hidden=page.dataset.panel!==p;
      message.hidden=p==='options';
      if(p==='options')title.textContent='World options';
    }
    if(focus)(lifecycle?primary:pages.find(page=>!page.hidden)?.querySelector<HTMLElement>('button:not(:disabled),input'))?.focus({preventScroll:true});
  }
  function refresh(){
    const s=game.settings;
    mode.textContent=optionLabel('mode',s);
    difficulty.textContent=optionLabel('difficulty',s);
    // Online guests play by the host's world rules.
    const guest=game.net?.role==='guest';
    for(const b of [mode,difficulty,...TOGGLES.map(k=>q<HTMLButtonElement>(`[data-toggle=${k}]`))]){b.disabled=guest;b.title=guest?'Set by the host':b.dataset.toggle?OPTION_HINTS[b.dataset.toggle as OptionKey]??'':'';}
    q('[data-act=online]').textContent=game.net&&game.net.role!=='offline'?'Online room':'Multiplayer';
    for(const sl of SLIDERS){
      const input=q<HTMLInputElement>(`[data-slider=${sl.key}]`),label=optionLabel(sl.key,s);
      q(`[data-label=${sl.key}]`).textContent=label;input.setAttribute('aria-valuetext',label);
      const v=String(sl.get(game));if(input.value!==v&&document.activeElement!==input)input.value=v;
    }
    for(const k of TOGGLES){const b=q<HTMLButtonElement>(`[data-toggle=${k}]`);b.textContent=optionLabel(k,s);b.setAttribute('aria-pressed',String(!!s[k]));}
    const waiting=game.state==='loading'||game.spawning;
    primary.disabled=waiting;
    loading.textContent=kind==='start'||kind==='resume'?waiting?'Generating terrain…':'':'';
    if(kind==='dead')primary.disabled=!!respawnTimer;
  }
  function show(next:MenuKind|null){
    // The new-world question stays until it is answered: a world that finishes loading (or a death screen restored)
    // behind it only changes the menu Cancel goes back to. null, 'lost' and the answers (Create, Cancel) replace it.
    if(kind==='restart'&&!el.hidden&&(next==='start'||next==='resume'||next==='dead')){beforeRestart=next;return;}
    clearTimeout(respawnTimer);respawnTimer=0;stopAdvancementsWatch();
    // (While the advancements screen shows over a menu, the menu is hidden but still its kind.)
    if(next==='restart'&&kind!=='restart')beforeRestart=kind;
    kind=next;el.hidden=!next;el.dataset.kind=next??'';
    if(!next){sheet.hide();return;}
    const focusInside=!document.activeElement||document.activeElement===document.body||game.root.contains(document.activeElement);
    sheet.element.removeAttribute('aria-description');message.hidden=false;
    if(next==='start'||next==='resume'){
      setPanel('main',false);refresh();
      if(focusInside&&!primary.disabled)primary.focus({preventScroll:true});
    }else if(next==='dead'){
      sheet.element.setAttribute('aria-description',deathMessage);
      setPanel('dead',false);loading.textContent='';
      respawn.disabled=true;
      respawnTimer=window.setTimeout(()=>{respawnTimer=0;respawn.disabled=false;if(focusInside)respawn.focus({preventScroll:true});},RESPAWN_DELAY_MS);
    }else if(next==='restart'){
      // Vanilla asks the same before a world is deleted. The question answers the shell's Restart button, so it takes the
      // focus from there; Cancel has it, so Enter or Space never deletes the world by accident.
      title.textContent='Create a new world?';message.textContent='This world will be lost forever! (A long time!)';
      setPanel('restart',false);loading.textContent='';
      q<HTMLButtonElement>('[data-act=cancel]').focus({preventScroll:true});
    }else{
      sheet.hide();el.dataset.shared='false';auxiliary.hidden=false;
      title.textContent='Graphics interrupted';
      message.textContent='The browser lost the 3D graphics context. Your world is saved: leave Minecraft and open it again to keep playing.';
      for(const page of pages)page.hidden=true;loading.textContent='';
    }
  }
  /** With a ui that cannot open screens from a menu, show the advancements screen over the paused world and bring the
   *  menu back when it closes. */
  function watchAdvancements(previous:MenuKind){
    el.hidden=true;
    advPoll=window.setInterval(()=>{if(game.ui.screen!=='advancements'){stopAdvancementsWatch();if(kind===previous&&game.state!=='playing'&&game.state!=='screen')show(previous);}},250);
  }
  function stopAdvancementsWatch(){if(advPoll){clearInterval(advPoll);advPoll=0;}}

  const stopShellWatch=game.events.on('shellPaused',()=>{if(!el.hidden&&el.dataset.shared==='true')setPanel(kind==='dead'?'dead':'main',false);});

  el.addEventListener('click',e=>{
    const t=(e.target as HTMLElement).closest<HTMLButtonElement>('button');if(!t||t.disabled)return;
    const act=t.dataset.act,toggle=t.dataset.toggle as OptionKey|undefined;
    if(toggle){game.updateSettings({[toggle]:!game.settings[toggle]});return;}
    switch(act){
      case 'primary':game.play();break;
      case 'respawn':game.respawn();break;
      case 'new-world':game.newWorld();break;
      case 'cancel':{const back=beforeRestart??(game.state==='dead'?'dead':'resume');kind=null;show(back);break;}
      case 'mode':game.updateSettings({mode:game.settings.mode==='survival'?'creative':'survival'});break;
      case 'difficulty':game.updateSettings({difficulty:nextDifficulty(game.settings.difficulty)});break;
      case 'options':setPanel('options');break;
      case 'online':game.net?.openPanel();break;
      case 'back':{const from=panel;setPanel('main',false);worldOptions.open=true;q(`[data-act=${from}]`).focus({preventScroll:true});break;}
      case 'advancements':{
        const previous=kind;game.ui.open('advancements');
        if(previous&&game.ui.screen==='advancements'&&game.state!=='screen'&&kind===previous)watchAdvancements(previous);
        break;
      }
    }
  },{signal});
  el.addEventListener('input',e=>{
    const input=e.target as HTMLInputElement,sl=SLIDERS.find(s=>s.key===input.dataset.slider);
    if(sl)game.updateSettings(sl.set(Number(input.value)));
  },{signal});
  // Clicks and drags on the menu must not reach the world below.
  el.addEventListener('pointerdown',e=>e.stopPropagation(),{signal});

  return{
    show,refresh,
    get kind(){return el.hidden?null:kind;},
    setDeathMessage(m){deathMessage=m;if(kind==='dead')sheet.element.setAttribute('aria-description',m);},
    dispose(){clearTimeout(respawnTimer);stopAdvancementsWatch();abort.abort();stopShellWatch();sheet.dispose();pauseSheet.dispose();el.remove();}
  };
}
