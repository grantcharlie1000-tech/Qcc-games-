// Bedrock-style touch controls in the touch layer (z-index 15, bottom corners): a movement stick (pushed fully
// it sprints), jump (double tap toggles creative flight; hold to fly up), a sneak toggle that becomes a hold-to-
// descend button while flying, drop (hold for the whole stack) and inventory, plus a progress ring under the finger
// while a still press on the world turns into mining or attacking. Look-dragging and tapping happen on the canvas
// (input.ts); the HUD's hotbar handles slot taps.
import type {Game} from '../engine/contracts';
import type {ControlState} from './controls-core';

/** Milliseconds the drop button must be held to drop the whole stack. */
export const DROP_STACK_MS=500;
const icon=(path:string)=>`<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${path}"/></svg>`;
const ICONS={
  jump:icon('M5 15.5 12 8.5l7 7'),
  sneak:icon('M5 8.5l7 7 7-7'),
  drop:icon('M12 3.5v11m-5-5 5 5 5-5M5 20h14'),
  inventory:icon('M6 12h.01M12 12h.01M18 12h.01')
};

export interface TouchRing{x:number;y:number;progress:number}
export interface TouchControls{
  readonly element:HTMLElement;
  setVisible(visible:boolean):void;
  /** Per frame: follows the flight state and draws the hold ring (client coordinates) or hides it. */
  update(ring:TouchRing|null):void;
  /** Lets go of the stick and every button (pause, screens, blur). */
  reset():void;
  dispose():void;
}

export function createTouchControls(game:Game,controls:ControlState,signal:AbortSignal):TouchControls{
  const layer=document.createElement('div');
  layer.className='bc-touch';layer.hidden=true;
  layer.innerHTML=`<div class="bc-stick" role="presentation"><span class="bc-stick-knob"></span></div>
<div class="bc-touch-pad">
<button type="button" class="bc-touch-btn bc-drop" aria-label="Drop item (hold to drop the stack)">${ICONS.drop}</button>
<button type="button" class="bc-touch-btn bc-inv" aria-label="Inventory">${ICONS.inventory}</button>
<button type="button" class="bc-touch-btn bc-sneak" aria-label="Sneak" aria-pressed="false">${ICONS.sneak}</button>
<button type="button" class="bc-touch-btn bc-jump" aria-label="Jump (double tap to fly in Creative)">${ICONS.jump}</button>
</div><div class="bc-hold-ring" aria-hidden="true" hidden></div>`;
  game.root.append(layer);
  const $=<T extends HTMLElement>(s:string)=>layer.querySelector<T>(s)!;
  const stick=$('.bc-stick'),knob=$('.bc-stick-knob'),jump=$('.bc-jump'),sneak=$('.bc-sneak'),drop=$('.bc-drop'),inv=$('.bc-inv'),ring=$('.bc-hold-ring');
  const on=(el:EventTarget,type:string,fn:(e:PointerEvent)=>void)=>el.addEventListener(type,e=>fn(e as PointerEvent),{signal});
  const capture=(el:HTMLElement,e:PointerEvent)=>{try{el.setPointerCapture(e.pointerId);}catch{/* pointer already gone */}};
  layer.addEventListener('contextmenu',e=>e.preventDefault(),{signal});

  // ---- Movement stick ----------------------------------------------------------------------------
  let stickId:number|null=null;
  function moveStick(e:PointerEvent){
    const box=stick.getBoundingClientRect(),r=box.width/2;if(r<=0)return;
    let dx=(e.clientX-box.left-r)/r,dy=(e.clientY-box.top-r)/r;const len=Math.hypot(dx,dy);if(len>1){dx/=len;dy/=len;}
    controls.setStick(dx,-dy);knob.style.transform=`translate(${(dx*r*.55).toFixed(1)}px,${(dy*r*.55).toFixed(1)}px)`;
    stick.classList.toggle('bc-sprinting',Math.hypot(dx,dy)>=.95);
  }
  function endStick(){stickId=null;controls.setStick(0,0);knob.style.transform='';stick.classList.remove('bc-sprinting');}
  on(stick,'pointerdown',e=>{if(stickId!==null)return;e.preventDefault();stickId=e.pointerId;capture(stick,e);moveStick(e);});
  on(stick,'pointermove',e=>{if(e.pointerId===stickId)moveStick(e);});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])on(stick,type,e=>{if(e.pointerId===stickId)endStick();});

  // ---- Jump: held while the finger stays down (two quick taps toggle flight in creative) ---------------
  let jumpId:number|null=null;
  on(jump,'pointerdown',e=>{e.preventDefault();if(jumpId!==null)return;jumpId=e.pointerId;capture(jump,e);controls.press('jump','touch:jump');jump.classList.add('bc-active');});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])on(jump,type,e=>{
    if(e.pointerId!==jumpId)return;jumpId=null;controls.release('jump','touch:jump');jump.classList.remove('bc-active');
  });

  // ---- Sneak: a toggle on foot, a hold-to-descend button while flying ------------------------------
  let sneakOn=false,descendId:number|null=null,flying=false;
  function setSneak(v:boolean){
    sneakOn=v;sneak.setAttribute('aria-pressed',String(v));sneak.classList.toggle('bc-active',v);
    if(v)controls.press('sneak','touch:sneak');else controls.release('sneak','touch:sneak');
  }
  on(sneak,'pointerdown',e=>{
    e.preventDefault();
    if(game.player.state.flying){if(descendId!==null)return;descendId=e.pointerId;capture(sneak,e);controls.press('sneak','touch:descend');sneak.classList.add('bc-active');}
    else setSneak(!sneakOn);
  });
  for(const type of ['pointerup','pointercancel','lostpointercapture'])on(sneak,type,e=>{
    if(e.pointerId!==descendId)return;descendId=null;controls.release('sneak','touch:descend');sneak.classList.toggle('bc-active',sneakOn);
  });
  // Keyboard or switch activation (a click without a pointer press) toggles sneaking too.
  sneak.addEventListener('click',e=>{if(e.detail===0&&!game.player.state.flying)setSneak(!sneakOn);},{signal});

  // ---- Drop: tap drops one item, holding drops the stack ---------------------------------------------
  let dropTimer=0,dropId:number|null=null,dropFired=false;
  on(drop,'pointerdown',e=>{
    e.preventDefault();if(dropId!==null)return;dropId=e.pointerId;dropFired=false;capture(drop,e);drop.classList.add('bc-active');
    dropTimer=window.setTimeout(()=>{dropFired=true;controls.tap('dropStack');},DROP_STACK_MS);
  });
  for(const type of ['pointerup','pointercancel','lostpointercapture'])on(drop,type,e=>{
    if(e.pointerId!==dropId)return;dropId=null;clearTimeout(dropTimer);drop.classList.remove('bc-active');
    if(type==='pointerup'&&!dropFired)controls.tap('drop');
  });
  drop.addEventListener('click',e=>{if(e.detail===0)controls.tap('drop');},{signal});

  // ---- Inventory ----------------------------------------------------------------------------------------
  inv.addEventListener('click',()=>controls.tap('inventory'),{signal});

  const touch:TouchControls={
    element:layer,
    setVisible(visible){if(layer.hidden===!visible)return;layer.hidden=!visible;if(!visible)touch.reset();},
    update(r){
      const fly=game.player.state.flying;
      if(fly!==flying){
        flying=fly;if(fly&&sneakOn)setSneak(false);
        sneak.setAttribute('aria-label',fly?'Fly down':'Sneak');sneak.classList.toggle('bc-flying',fly);
        if(fly)sneak.removeAttribute('aria-pressed');else sneak.setAttribute('aria-pressed',String(sneakOn));
      }
      if(!r||layer.hidden){if(!ring.hidden)ring.hidden=true;return;}
      const box=game.root.getBoundingClientRect();
      ring.hidden=false;ring.style.transform=`translate(${(r.x-box.left).toFixed(1)}px,${(r.y-box.top).toFixed(1)}px)`;
      ring.style.setProperty('--p',Math.max(0,Math.min(1,r.progress)).toFixed(3));
    },
    reset(){
      if(stickId!==null)endStick();
      if(jumpId!==null){jumpId=null;jump.classList.remove('bc-active');}
      if(descendId!==null)descendId=null;
      if(dropId!==null){dropId=null;clearTimeout(dropTimer);drop.classList.remove('bc-active');}
      // The controls themselves are cleared by the caller; keep the toggle's look in step.
      sneakOn=false;if(!flying)sneak.setAttribute('aria-pressed','false');sneak.classList.remove('bc-active');
      controls.releaseAll('touch:');ring.hidden=true;
    },
    dispose(){clearTimeout(dropTimer);layer.remove();}
  };
  return touch;
}
