// STUB input (owned by the player & controls agent). Keyboard, mouse with pointer lock (or drag to
// look), wheel/digit hotbar and a touch stick, look-drag, tap/hold and jump button.
import './touch.css';
import type {Game,InputAction,InputBinding,InputService} from '../engine/contracts';

const KEYS:Record<string,InputAction>={KeyW:'forward',ArrowUp:'forward',KeyS:'back',ArrowDown:'back',KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right',
  Space:'jump',ShiftLeft:'sneak',ShiftRight:'sneak',KeyR:'sprint',KeyQ:'drop',KeyF:'swapHands',KeyE:'inventory',KeyL:'advancements'};
const LABELS:Record<InputAction,string>={forward:'Walk forward',back:'Walk backward',left:'Strafe left',right:'Strafe right',jump:'Jump / swim up',
  sneak:'Sneak',sprint:'Sprint',attack:'Attack / mine',use:'Use item / place block',pick:'Pick block',drop:'Drop item',dropStack:'Drop stack',
  swapHands:'Swap item with offhand',inventory:'Inventory',advancements:'Advancements'};
const BINDINGS:InputBinding[]=(Object.keys(LABELS) as InputAction[]).map(action=>({action,label:LABELS[action],
  keys:[...Object.entries(KEYS).filter(([,a])=>a===action).map(([k])=>k),...(action==='attack'?['Mouse0']:action==='use'?['Mouse2']:action==='pick'?['Mouse1']:[])]}));

export function createInput(game:Game):InputService{
  const canvas=game.canvas,abort=new AbortController(),signal=abort.signal;
  const touch=matchMedia('(pointer: coarse)').matches;
  const held=new Set<InputAction>(),edges=new Set<InputAction>();
  let captured=false,stick={x:0,y:0},lastForward=0;
  const running=()=>game.state==='playing';
  function press(action:InputAction){if(!held.has(action))edges.add(action);held.add(action);}
  function release(action:InputAction){held.delete(action);}
  const typing=(e:Event)=>e.target instanceof HTMLElement&&e.target.matches('input,textarea,select,[contenteditable=true]');
  window.addEventListener('keydown',e=>{
    if(typing(e)||document.querySelector('dialog[open]')||e.ctrlKey||e.metaKey||e.altKey)return;
    if(game.state!=='playing'&&game.state!=='screen')return;
    if(/^Digit[1-9]$/.test(e.code)&&game.state==='playing'){game.inventory.select(Number(e.code.slice(5))-1);e.preventDefault();return;}
    const action=KEYS[e.code];if(!action)return;
    if(game.state==='screen'&&action!=='inventory')return;
    e.preventDefault();if(e.repeat&&held.has(action))return;
    // Double-tap forward to sprint.
    if(action==='forward'&&!e.repeat){const now=performance.now();if(now-lastForward<300)press('sprint');lastForward=now;}
    press(action);
  },{signal});
  window.addEventListener('keyup',e=>{const action=KEYS[e.code];if(action){release(action);if(action==='forward')release('sprint');}},{signal});
  window.addEventListener('blur',()=>service.clear(),{signal});
  document.addEventListener('pointerlockchange',()=>{captured=document.pointerLockElement===canvas;game.events.emit('stateChanged',{from:game.state,to:game.state});},{signal});
  document.addEventListener('mousemove',e=>{if(captured&&running())game.player.rotate(-e.movementX*.0022*game.settings.sensitivity,-e.movementY*.0022*game.settings.sensitivity);},{signal});
  canvas.addEventListener('contextmenu',e=>e.preventDefault(),{signal});
  // Without pointer lock (or on touch): drag looks, a short tap attacks, a hold uses.
  let drag:{id:number;x:number;y:number;sx:number;sy:number;t:number;moved:boolean;button:number;timer:number}|null=null;
  canvas.addEventListener('pointerdown',e=>{
    if(!running())return;e.preventDefault();canvas.focus({preventScroll:true});
    if(captured){press(e.button===0?'attack':e.button===2?'use':'pick');return;}
    if(drag)return;
    drag={id:e.pointerId,x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY,t:performance.now(),moved:false,button:e.button,timer:0};
    canvas.setPointerCapture(e.pointerId);
    if(e.pointerType!=='mouse'){const d=drag;d.timer=window.setTimeout(()=>{if(drag===d&&!d.moved)press('attack');},300);}
    else if(!touch)service.capture();
  },{signal});
  canvas.addEventListener('pointermove',e=>{
    if(!drag||drag.id!==e.pointerId||!running())return;
    const k=(e.pointerType==='mouse'?.005:.006)*game.settings.sensitivity;game.player.rotate(-(e.clientX-drag.x)*k,-(e.clientY-drag.y)*k);drag.x=e.clientX;drag.y=e.clientY;
    if(!drag.moved&&Math.hypot(e.clientX-drag.sx,e.clientY-drag.sy)>8){drag.moved=true;clearTimeout(drag.timer);}
  },{signal});
  function endDrag(e:PointerEvent,cancel:boolean){
    if(!drag||drag.id!==e.pointerId)return;const d=drag;drag=null;clearTimeout(d.timer);
    if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
    if(held.has('attack')){release('attack');return;}
    if(!cancel&&!d.moved&&performance.now()-d.t<300&&running()){
      // Tap: attack/mine once with a mouse click, place/use with a touch tap (Bedrock style).
      const action:InputAction=e.pointerType==='mouse'?(d.button===2?'use':'attack'):'use';
      press(action);setTimeout(()=>release(action),60);
    }
  }
  canvas.addEventListener('pointerup',e=>endDrag(e,false),{signal});
  canvas.addEventListener('pointercancel',e=>endDrag(e,true),{signal});
  document.addEventListener('mouseup',e=>{if(captured)release(e.button===0?'attack':e.button===2?'use':'pick');},{signal});
  canvas.addEventListener('wheel',e=>{if(!running())return;e.preventDefault();game.inventory.select((game.inventory.selected+(e.deltaY>0?1:-1)+9)%9);},{signal,passive:false});
  // Touch stick and jump button live in the HUD layer; they report through these hooks.
  const touchLayer=document.createElement('div');touchLayer.className='bc-touch';touchLayer.hidden=true;
  touchLayer.innerHTML='<div class="bc-stick" aria-label="Movement stick"><span></span></div><button type="button" class="bc-jump" aria-label="Jump">▲</button><button type="button" class="bc-sneak" aria-label="Sneak">▼</button><button type="button" class="bc-inv" aria-label="Inventory">⋯</button>';
  game.root.append(touchLayer);
  const stickEl=touchLayer.querySelector<HTMLElement>('.bc-stick')!,knob=stickEl.querySelector<HTMLElement>('span')!;
  let stickId:number|null=null;
  stickEl.addEventListener('pointerdown',e=>{if(!running()||stickId!==null)return;e.preventDefault();stickId=e.pointerId;stickEl.setPointerCapture(e.pointerId);moveStick(e);},{signal});
  stickEl.addEventListener('pointermove',e=>{if(e.pointerId===stickId)moveStick(e);},{signal});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])stickEl.addEventListener(type,e=>{if((e as PointerEvent).pointerId!==stickId)return;stickId=null;stick={x:0,y:0};knob.style.transform='';release('sprint');},{signal});
  function moveStick(e:PointerEvent){
    const box=stickEl.getBoundingClientRect(),r=box.width/2;
    let dx=(e.clientX-box.left-r)/r,dy=(e.clientY-box.top-r)/r;const len=Math.hypot(dx,dy);if(len>1){dx/=len;dy/=len;}
    stick={x:dx,y:-dy};knob.style.transform=`translate(${dx*r*.5}px,${dy*r*.5}px)`;
    if(len>.95)press('sprint');else release('sprint');
  }
  const hold=(selector:string,action:InputAction)=>{
    const el=touchLayer.querySelector<HTMLElement>(selector)!;
    el.addEventListener('pointerdown',e=>{e.preventDefault();press(action);},{signal});
    for(const type of ['pointerup','pointercancel','pointerleave'])el.addEventListener(type,()=>release(action),{signal});
  };
  hold('.bc-jump','jump');hold('.bc-sneak','sneak');
  touchLayer.querySelector('.bc-inv')!.addEventListener('click',()=>press('inventory'),{signal});
  game.events.on('stateChanged',()=>{touchLayer.hidden=!(touch&&(game.state==='playing'));});

  const service:InputService={
    get captured(){return captured;},touch,
    down:a=>held.has(a),
    pressed(a){const had=edges.has(a);edges.delete(a);return had;},
    move(){
      const f=(+held.has('forward'))-(+held.has('back'))+stick.y,s=(+held.has('right'))-(+held.has('left'))+stick.x;
      return{forward:Math.max(-1,Math.min(1,f)),strafe:Math.max(-1,Math.min(1,s))};
    },
    capture(){
      if(touch||captured)return;
      try{const r=canvas.requestPointerLock() as unknown;if(r instanceof Promise)r.catch(()=>{});}catch{/* drag-to-look remains */}
    },
    release(){if(document.pointerLockElement===canvas)document.exitPointerLock();},
    bindings:()=>BINDINGS,
    clear(){held.clear();edges.clear();stick={x:0,y:0};knob.style.transform='';if(drag){clearTimeout(drag.timer);drag=null;}},
    dispose(){service.clear();abort.abort();touchLayer.remove();service.release();}
  };
  return service;
}
