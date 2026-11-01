/** Action input over the approved outline control geometry. */
export function bindTouch(root:HTMLElement,input:any,_onScores:()=>void,_onMenu:()=>void,signal:AbortSignal){
 const look=document.createElement('div');look.className='sr-look-zone';root.prepend(look);
 const stick=root.querySelector<HTMLButtonElement>('.move-zone')!,thumb=stick.querySelector<SVGElement>('.stick-thumb')!;
 const held=new Map<number,()=>void>();
 const hold=(element:HTMLElement,down:()=>void,up:()=>void,drag?:(event:PointerEvent)=>void)=>{
  element.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();input.requestLock();element.setPointerCapture(e.pointerId);held.set(e.pointerId,up);element.classList.add('is-active');down();},{signal});
  element.addEventListener('pointermove',e=>{if(held.has(e.pointerId))drag?.(e);},{signal});
  const end=(e:PointerEvent)=>{held.get(e.pointerId)?.();held.delete(e.pointerId);element.classList.remove('is-active');};for(const name of ['pointerup','pointercancel','lostpointercapture'])element.addEventListener(name,end as EventListener,{signal});
 };
 let origin={x:0,y:0},last={x:0,y:0};
 stick.addEventListener('pointerdown',e=>{origin={x:e.clientX,y:e.clientY};},{signal});
 hold(stick,()=>{},()=>{input.setMoveVector(0,0);thumb.style.transform='';},e=>{const dx=(e.clientX-origin.x)/45,dy=(origin.y-e.clientY)/45,n=Math.max(1,Math.hypot(dx,dy));input.setMoveVector(dx/n,dy/n);thumb.style.transform=`translate(${dx/n*25}px,${-dy/n*25}px)`;});
 const drag=(e:PointerEvent)=>{input.addVirtualLook(e.clientX-last.x,e.clientY-last.y);last={x:e.clientX,y:e.clientY};};
 look.addEventListener('pointerdown',e=>last={x:e.clientX,y:e.clientY},{signal});hold(look,()=>{},()=>{},drag);
 const fire=root.querySelector<HTMLButtonElement>('[data-action=fire]')!;fire.addEventListener('pointerdown',e=>last={x:e.clientX,y:e.clientY},{signal});hold(fire,()=>input.setVirtualButton(0,true),()=>input.setVirtualButton(0,false),drag);
 const aim=root.querySelector<HTMLButtonElement>('[data-action=aim]')!;aim.addEventListener('click',()=>{const on=aim.getAttribute('aria-pressed')!=='true';aim.setAttribute('aria-pressed',String(on));input.setVirtualButton(2,on);},{signal});
 for(const action of ['reload','crouch','jump'])root.querySelector(`[data-action=${action}]`)!.addEventListener('click',()=>input.pulseVirtualAction(action),{signal});
 const release=()=>{for(const up of held.values())up();held.clear();input.releaseVirtualControls();stick.classList.remove('is-active');aim.setAttribute('aria-pressed','false');};window.addEventListener('blur',release,{signal});signal.addEventListener('abort',release,{once:true});
}
