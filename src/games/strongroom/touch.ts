/** Baseline twin-stick input. The later touch milestone can extend this action facade. */
export function bindTouch(root:HTMLElement,input:any,onScores:()=>void,onMenu:()=>void,signal:AbortSignal){
 const look=document.createElement('div');look.className='sr-look-zone';root.append(look);
 const stick=document.createElement('button');stick.className='ui-tab arcade-glass glass-control sr-stick';stick.dataset.glass='frost';stick.setAttribute('aria-label','Move');stick.innerHTML='<span>MOVE</span>';root.append(stick);
 const held=new Map<number,()=>void>();
 const hold=(element:HTMLElement,down:()=>void,up:()=>void,drag?:(event:PointerEvent)=>void)=>{
  element.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();input.requestLock();element.setPointerCapture(e.pointerId);held.set(e.pointerId,up);down();},{signal});
  element.addEventListener('pointermove',e=>{if(held.has(e.pointerId))drag?.(e);},{signal});
  const end=(e:PointerEvent)=>{held.get(e.pointerId)?.();held.delete(e.pointerId);};element.addEventListener('pointerup',end,{signal});element.addEventListener('pointercancel',end,{signal});element.addEventListener('lostpointercapture',end,{signal});
 };
 let origin={x:0,y:0};
 stick.addEventListener('pointerdown',e=>{origin={x:e.clientX,y:e.clientY};},{signal});
 hold(stick,()=>{},()=>input.setMoveVector(0,0),e=>{const dx=(e.clientX-origin.x)/45,dy=(origin.y-e.clientY)/45,n=Math.max(1,Math.hypot(dx,dy));input.setMoveVector(dx/n,dy/n);});
 let last={x:0,y:0};
 const drag=(e:PointerEvent)=>{input.addVirtualLook(e.clientX-last.x,e.clientY-last.y);last={x:e.clientX,y:e.clientY};};
 look.addEventListener('pointerdown',e=>last={x:e.clientX,y:e.clientY},{signal});hold(look,()=>{},()=>{},drag);
 for(const [label,action,cls] of [['FIRE','fire','sr-fire'],['Reload','reload','sr-reload'],['Crouch','crouch','sr-crouch'],['Aim','aim','sr-aim'],['Jump','jump','sr-jump'],['Scores','score','sr-scores']] as const){
  const b=document.createElement('button');b.className=`ui-tab arcade-glass glass-control sr-touch-button ${cls}`;b.dataset.glass='frost';b.setAttribute('aria-label',label);b.innerHTML=`<span>${label}</span>`;root.append(b);
  if(action==='fire'){b.addEventListener('pointerdown',e=>last={x:e.clientX,y:e.clientY},{signal});hold(b,()=>input.setVirtualButton(0,true),()=>input.setVirtualButton(0,false),drag);}
  else if(action==='aim'){let on=false;b.addEventListener('click',()=>{on=!on;input.setVirtualButton(2,on);},{signal});}
  else if(action==='score')b.addEventListener('click',onScores,{signal});
  else b.addEventListener('click',()=>input.pulseVirtualAction(action),{signal});
 }
 window.addEventListener('blur',()=>{for(const up of held.values())up();held.clear();input.releaseVirtualControls();},{signal});
}
