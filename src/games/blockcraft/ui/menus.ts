// Overlay menus owned by the HUD (layer z-index 30): the start menu, the game menu (pause), the death screen and
// the lost-graphics screen. World options go through game.updateSettings; the Advancements button opens the
// ui's advancements screen; the controls panel lists game.input.bindings(). Copy differs for touch.
import type {Game,GameSettings} from '../engine/contracts';
import {VIEW_DISTANCES} from '../engine/contracts';
import {controlRows,nextDifficulty,optionLabel,sensitivityFromSlider,sensitivityToSlider,OPTION_HINTS,TOUCH_ROWS,type OptionKey} from './menus-options';

export type MenuKind='start'|'resume'|'dead'|'lost';
type Panel='main'|'options'|'controls';
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

const DESKTOP_COPY='Click Play, then move the mouse to look around. W A S D move, Space jumps, Shift sneaks, Ctrl sprints. Left click mines or attacks, right click places or uses, E opens the inventory.';
const TOUCH_COPY='Tap Play. Drag anywhere to look, use the stick to move, hold to mine and tap to place or use.';
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
  el.setAttribute('role','dialog');el.setAttribute('aria-labelledby','bc-menu-title');
  const sliders=SLIDERS.map(s=>`<label class="bc-slider"><span class="bc-slider-label" data-label="${s.key}"></span>
    <input type="range" data-slider="${s.key}" min="${s.min}" max="${s.max}" step="${s.step}"></label>`).join('');
  const toggles=TOGGLES.map(k=>`<button type="button" class="bc-btn" data-toggle="${k}" aria-pressed="false" title="${OPTION_HINTS[k]??''}"></button>`).join('');
  el.innerHTML=`<div class="bc-menu-panel">
    <h2 class="bc-menu-title" id="bc-menu-title"></h2>
    <p class="bc-menu-message"></p>
    <p class="bc-menu-score"></p>
    <div class="bc-menu-page" data-panel="main">
      <button type="button" class="bc-btn bc-primary" data-act="primary">Play</button>
      <button type="button" class="bc-btn" data-act="mode"></button>
      <div class="bc-btn-row">
        <button type="button" class="bc-btn" data-act="options">Options…</button>
        <button type="button" class="bc-btn" data-act="advancements">Advancements</button>
      </div>
      <button type="button" class="bc-btn" data-act="controls">Controls</button>
    </div>
    <div class="bc-menu-page" data-panel="options" hidden>
      <h3 class="bc-menu-sub">Options</h3>
      <div class="bc-options">
        <button type="button" class="bc-btn" data-act="difficulty"></button>
        ${sliders}
        ${toggles}
      </div>
      <button type="button" class="bc-btn bc-done" data-act="back">Done</button>
    </div>
    <div class="bc-menu-page" data-panel="controls" hidden>
      <h3 class="bc-menu-sub">Controls</h3>
      <dl class="bc-controls"></dl>
      <button type="button" class="bc-btn bc-done" data-act="back">Done</button>
    </div>
    <div class="bc-menu-page" data-panel="dead" hidden>
      <button type="button" class="bc-btn bc-primary" data-act="respawn">Respawn</button>
    </div>
    <p class="bc-loading" role="status"></p>
  </div>`;
  game.root.append(el);
  const q=<T extends HTMLElement>(s:string)=>el.querySelector<T>(s)!;
  const title=q('.bc-menu-title'),message=q('.bc-menu-message'),score=q('.bc-menu-score'),loading=q('.bc-loading');
  const primary=q<HTMLButtonElement>('[data-act=primary]'),mode=q<HTMLButtonElement>('[data-act=mode]'),difficulty=q<HTMLButtonElement>('[data-act=difficulty]');
  const respawn=q<HTMLButtonElement>('[data-act=respawn]'),controls=q('.bc-controls');
  const pages=[...el.querySelectorAll<HTMLElement>('.bc-menu-page')];
  let kind:MenuKind|null=null,panel:Panel='main',deathMessage='',respawnTimer=0,advPoll=0,controlsTouch:boolean|null=null;

  function setPanel(p:Panel|'dead',focus=true){
    if(p!=='dead')panel=p;
    for(const page of pages)page.hidden=page.dataset.panel!==p;
    if(p==='controls')buildControls();
    if(focus)(pages.find(page=>!page.hidden)?.querySelector<HTMLElement>('button:not(:disabled),input'))?.focus({preventScroll:true});
  }
  function buildControls(){
    const touch=game.input.touch;if(controlsTouch===touch&&controls.childElementCount)return;controlsTouch=touch;
    const rows=touch?TOUCH_ROWS:controlRows(game.input.bindings());
    controls.replaceChildren(...rows.flatMap(r=>{const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=r.label;dd.textContent=r.keys;return[dt,dd];}));
  }
  function refresh(){
    const s=game.settings;
    mode.textContent=optionLabel('mode',s);
    difficulty.textContent=optionLabel('difficulty',s);
    for(const sl of SLIDERS){
      const input=q<HTMLInputElement>(`[data-slider=${sl.key}]`),label=optionLabel(sl.key,s);
      q(`[data-label=${sl.key}]`).textContent=label;input.setAttribute('aria-valuetext',label);
      const v=String(sl.get(game));if(input.value!==v&&document.activeElement!==input)input.value=v;
    }
    for(const k of TOGGLES){const b=q<HTMLButtonElement>(`[data-toggle=${k}]`);b.textContent=optionLabel(k,s);b.setAttribute('aria-pressed',String(!!s[k]));}
    const waiting=game.state==='loading'||game.spawning;
    primary.disabled=waiting;
    loading.textContent=kind==='start'||kind==='resume'?waiting?'Generating terrain…':'':'';
    if(kind==='start'||kind==='resume')message.textContent=game.input.touch?TOUCH_COPY:DESKTOP_COPY;
    if(panel==='controls'&&!el.hidden)buildControls();
  }
  function show(next:MenuKind|null){
    clearTimeout(respawnTimer);stopAdvancementsWatch();
    kind=next;el.hidden=!next;el.dataset.kind=next??'';
    if(!next)return;
    const focusInside=!document.activeElement||document.activeElement===document.body||game.root.contains(document.activeElement);
    score.textContent='';score.hidden=true;message.hidden=false;
    if(next==='start'||next==='resume'){
      title.textContent=next==='start'?'Blockcraft':'Game Menu';
      primary.textContent=next==='start'?'Play':'Resume';
      setPanel('main',false);refresh();
      if(focusInside&&!primary.disabled)primary.focus({preventScroll:true});
    }else if(next==='dead'){
      title.textContent='You died!';message.textContent=deathMessage;
      score.hidden=false;score.innerHTML='Score: <span class="bc-score-value"></span>';
      score.querySelector('span')!.textContent=String(game.stats.mined);
      setPanel('dead',false);loading.textContent='';
      respawn.disabled=true;
      respawnTimer=window.setTimeout(()=>{respawn.disabled=false;if(focusInside)respawn.focus({preventScroll:true});},RESPAWN_DELAY_MS);
    }else{
      title.textContent='Graphics interrupted';
      message.textContent='The browser lost the 3D graphics context. Your world is saved: leave Blockcraft and open it again to keep playing.';
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

  el.addEventListener('click',e=>{
    const t=(e.target as HTMLElement).closest<HTMLButtonElement>('button');if(!t||t.disabled)return;
    const act=t.dataset.act,toggle=t.dataset.toggle as OptionKey|undefined;
    if(toggle){game.updateSettings({[toggle]:!game.settings[toggle]});return;}
    switch(act){
      case 'primary':game.play();break;
      case 'respawn':game.respawn();break;
      case 'mode':game.updateSettings({mode:game.settings.mode==='survival'?'creative':'survival'});break;
      case 'difficulty':game.updateSettings({difficulty:nextDifficulty(game.settings.difficulty)});break;
      case 'options':setPanel('options');break;
      case 'controls':setPanel('controls');break;
      case 'back':{const from=panel;setPanel('main',false);q(`[data-act=${from}]`).focus({preventScroll:true});break;}
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
    setDeathMessage(m){deathMessage=m;if(kind==='dead')message.textContent=m;},
    dispose(){clearTimeout(respawnTimer);stopAdvancementsWatch();abort.abort();el.remove();}
  };
}
