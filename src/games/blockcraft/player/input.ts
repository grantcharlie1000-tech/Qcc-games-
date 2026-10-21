// Input service. Every device feeds one ControlState (controls-core.ts): the keyboard with Java Edition defaults
// (controls-bindings.ts), the mouse with pointer lock (or drag-to-look when the lock is unavailable), the wheel,
// Bedrock-style touch controls (controls-touch.ts, with look-drag, tap to use and hold to mine on the canvas) and
// the Gamepad API (controls-gamepad.ts). It handles the hotbar keys, the wheel and the F1/F3 root flags itself;
// every other action has one consumer that reads pressed()/down(). It never binds Escape and never takes keys
// from text fields or open dialogs.
import './touch.css';
import {ROOT_FLAGS} from '../engine/constants';
import type {Game,InputService} from '../engine/contracts';
import {BINDINGS,MOUSE_ACTIONS} from './controls-bindings';
import {ControlState,type InputPhase} from './controls-core';
import {LookGesture,type PointerKind} from './controls-gesture';
import {PAD,PadMapper,readPad,type PadFrame} from './controls-gamepad';
import {createTouchControls,type TouchControls,type TouchRing} from './controls-touch';

/** Radians per mouse pixel at sensitivity 1: Java Edition's default 0.15° per pixel. */
export const MOUSE_RADIANS_PER_PX=.15*Math.PI/180;
/** Radians per touch pixel at sensitivity 1 (a 360 px drag turns about 120°). */
export const TOUCH_RADIANS_PER_PX=.0058;
/** Larger pointer-lock jumps are browser glitches (the first event after locking can carry a huge delta). */
const MAX_MOUSE_JUMP=400;
const TEXT_ENTRY='input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="combobox"],[role="searchbox"]';

export function createInput(game:Game):InputService{
  const canvas=game.canvas,controls=new ControlState(),gesture=new LookGesture(),pad=new PadMapper();
  const padFrame:PadFrame={connected:false,moveX:0,moveY:0,lookX:0,lookY:0,buttons:[]};
  const abort=new AbortController(),signal=abort.signal;
  const coarse=typeof matchMedia==='function'&&matchMedia('(pointer: coarse)').matches;
  let touchMode=coarse,lockFailures=0,padsKnown=0,padMenuA=false,padMenuStart=false,padStarting=false,menuFrame=0,lastPoll=0;
  let gestureKind:PointerKind='touch',touchUI:TouchControls|null=null,offState:(()=>void)|null=null;
  const ring:TouchRing={x:0,y:0,progress:0};

  const phase=():InputPhase=>game.state==='playing'?'playing':game.state==='screen'?'screen':'other';
  const locked=()=>document.pointerLockElement===canvas;
  const lockUsable=()=>typeof canvas.requestPointerLock==='function'&&lockFailures<2;
  /** Keys typed into text fields, open dialogs or other page controls (outside the game) are never taken. */
  function ownsKey(e:KeyboardEvent){
    const t=e.target;
    if(t instanceof HTMLElement&&(t.isContentEditable||t.closest(TEXT_ENTRY)))return false;
    if(document.querySelector('dialog[open]'))return false;
    if(t instanceof Element&&t!==document.body&&t!==document.documentElement&&!game.root.contains(t)&&!locked())return false;
    return true;
  }
  function toggleFlag(flag:keyof typeof ROOT_FLAGS){
    const d=game.root.dataset,key=ROOT_FLAGS[flag];d[key]=d[key]==='true'?'':'true';
  }
  function setTouchMode(v:boolean){
    if(touchMode===v)return;touchMode=v;
    if(!v)controls.setStick(0,0);
    refreshTouch();
  }
  function refreshTouch(){touchUI?.setVisible(touchMode&&game.state==='playing');}
  function selectBy(step:number){game.inventory.select(((game.inventory.selected+step)%9+9)%9);}
  function endGesture(e:PointerEvent,cancel:boolean){
    const r=gesture.end(e.pointerId,performance.now(),cancel);
    if(r.release)controls.release(r.release,'gesture');
    if(r.tap&&phase()==='playing')controls.tap(r.tap);
  }
  function pollPad(dt:number){
    const list=typeof navigator.getGamepads==='function'?navigator.getGamepads():[];
    let found:Gamepad|null=null;
    for(const g of list){if(!g||!g.connected)continue;if(!found||g.mapping==='standard'&&found.mapping!=='standard')found=g;}
    readPad(found,padFrame);
    const ph=phase(),out=pad.apply(padFrame,controls,ph,dt,game.settings.sensitivity);
    if(out.hotbar)selectBy(out.hotbar);
    if(out.dyaw||out.dpitch)game.player.rotate(out.dyaw,out.dpitch);
    // Menus: A or Start plays from the start and pause menus and respawns from the death screen.
    const a=!!padFrame.buttons[PAD.A],start=!!padFrame.buttons[PAD.START];
    if(ph==='other'&&(a&&!padMenuA||start&&!padMenuStart)){
      padStarting=true;
      try{if(game.state==='dead')game.respawn();else if(game.state==='ready'||game.state==='paused')game.play();}finally{padStarting=false;}
    }
    padMenuA=a;padMenuStart=start;lastPoll=performance.now();
  }
  /** The engine stops drawing frames on its menus, so a connected gamepad is polled here meanwhile (A / Start). */
  function menuPoll(){
    menuFrame=0;
    if(signal.aborted||!padsKnown||game.state==='playing'||game.state==='screen'||game.state==='lost')return;
    if(performance.now()-lastPoll>30)pollPad(1/60);
    menuFrame=requestAnimationFrame(menuPoll);
  }
  function watchMenus(){if(!menuFrame&&padsKnown)menuFrame=requestAnimationFrame(menuPoll);}

  const service:InputService={
    get captured(){return locked();},
    get touch(){return touchMode;},
    down:a=>controls.down(a),
    pressed:a=>controls.pressed(a),
    move:()=>controls.move(),
    capture(){
      if(touchMode||padStarting||locked()||typeof canvas.requestPointerLock!=='function')return;
      try{const r=canvas.requestPointerLock() as unknown;if(r instanceof Promise)r.catch(()=>{/* pointerlockerror counts it */});}
      catch{lockFailures++;}
    },
    release(){if(locked())document.exitPointerLock();},
    clear(){
      controls.clear();
      if(gesture.active){const id=gesture.pointerId;gesture.reset();try{if(canvas.hasPointerCapture?.(id))canvas.releasePointerCapture(id);}catch{/* gone */}}
      touchUI?.reset();
    },
    bindings:()=>BINDINGS,
    init(){
      const root=game.root.dataset;root[ROOT_FLAGS.hudHidden]='';root[ROOT_FLAGS.debug]='';
      touchUI=createTouchControls(game,controls,signal);
      offState=game.events.on('stateChanged',()=>{refreshTouch();watchMenus();});

      // ---- Keyboard --------------------------------------------------------------------------------
      window.addEventListener('keydown',e=>{
        if(!ownsKey(e))return;
        const out=controls.keyDown(e,phase(),performance.now());
        if(!out.handled)return;
        e.preventDefault();
        if(out.hotbar!==undefined)game.inventory.select(out.hotbar);
        if(out.flag)toggleFlag(out.flag);
      },{signal});
      window.addEventListener('keyup',e=>{if(controls.keyUp(e.code)&&phase()==='playing'&&ownsKey(e))e.preventDefault();},{signal});
      window.addEventListener('blur',()=>service.clear(),{signal});
      document.addEventListener('visibilitychange',()=>{if(document.hidden)service.clear();},{signal});

      // ---- Mouse with pointer lock -------------------------------------------------------------------
      document.addEventListener('pointerlockchange',()=>{if(locked())lockFailures=0;else controls.releaseAll('mouse:');},{signal});
      document.addEventListener('pointerlockerror',()=>{lockFailures++;},{signal});
      canvas.addEventListener('mousedown',e=>{
        if(!locked()||phase()!=='playing')return;
        const action=MOUSE_ACTIONS[e.button];if(!action)return;
        e.preventDefault();controls.press(action,'mouse:'+e.button);
      },{signal});
      document.addEventListener('mouseup',e=>{const action=MOUSE_ACTIONS[e.button];if(action)controls.release(action,'mouse:'+e.button);},{signal});
      document.addEventListener('mousemove',e=>{
        if(!locked()||phase()!=='playing')return;
        const dx=e.movementX||0,dy=e.movementY||0;if(Math.abs(dx)>MAX_MOUSE_JUMP||Math.abs(dy)>MAX_MOUSE_JUMP)return;
        const k=MOUSE_RADIANS_PER_PX*game.settings.sensitivity;game.player.rotate(-dx*k,-dy*k);
      },{signal});
      canvas.addEventListener('contextmenu',e=>e.preventDefault(),{signal});
      canvas.addEventListener('wheel',e=>{
        if(phase()!=='playing')return;e.preventDefault();
        const step=controls.wheel(e.deltaY,e.deltaMode,performance.now());if(step)selectBy(step);
      },{signal,passive:false});

      // ---- Pointers without the lock: touch look/tap/hold, or mouse drag-to-look ----------------------
      canvas.addEventListener('pointerdown',e=>{
        if(phase()!=='playing')return;
        const kind:PointerKind=e.pointerType==='mouse'?'mouse':'touch';
        if(kind==='mouse'){
          setTouchMode(false);
          if(locked())return;
          if(lockUsable()){service.capture();return;}
        }else setTouchMode(true);
        if(gesture.active)return;
        e.preventDefault();canvas.focus({preventScroll:true});
        gestureKind=kind;gesture.begin(e.pointerId,e.clientX,e.clientY,performance.now(),kind,e.button);
        try{canvas.setPointerCapture(e.pointerId);}catch{/* the pointer is already gone */}
      },{signal});
      canvas.addEventListener('pointermove',e=>{
        const d=gesture.move(e.pointerId,e.clientX,e.clientY);if(!d||phase()!=='playing')return;
        const k=(gestureKind==='touch'?TOUCH_RADIANS_PER_PX:MOUSE_RADIANS_PER_PX)*game.settings.sensitivity;
        game.player.rotate(-d.dx*k,-d.dy*k);
      },{signal});
      canvas.addEventListener('pointerup',e=>endGesture(e,false),{signal});
      canvas.addEventListener('pointercancel',e=>endGesture(e,true),{signal});
      canvas.addEventListener('lostpointercapture',e=>endGesture(e,true),{signal});

      // ---- Gamepads ----------------------------------------------------------------------------------
      window.addEventListener('gamepadconnected',()=>{padsKnown++;watchMenus();},{signal});
      window.addEventListener('gamepaddisconnected',()=>{
        padsKnown=Math.max(0,padsKnown-1);
        if(!padsKnown){controls.releaseAll('pad:');controls.setPadMove(0,0);pad.reset();padMenuA=padMenuStart=false;}
      },{signal});
      refreshTouch();
    },
    frame(dt){
      const now=performance.now(),playing=phase()==='playing';
      const hold=gesture.update(now);if(hold&&playing)controls.press(hold,'gesture');
      if(padsKnown>0)pollPad(dt);
      if(!touchUI)return;
      let shown:TouchRing|null=null;
      if(playing&&gesture.active&&gestureKind==='touch'){
        const pos=gesture.position;ring.x=pos.x;ring.y=pos.y;
        if(gesture.state==='pending'){ring.progress=gesture.progress(now);shown=ring;}
        else if(gesture.state==='hold'){const b=game.interaction.breaking;if(b){ring.progress=b.progress;shown=ring;}}
      }
      touchUI.update(shown);
    },
    dispose(){service.clear();abort.abort();cancelAnimationFrame(menuFrame);menuFrame=0;offState?.();offState=null;touchUI?.dispose();touchUI=null;service.release();}
  };
  return service;
}
