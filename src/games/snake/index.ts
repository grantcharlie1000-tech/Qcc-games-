import type {GameModule} from '../../core/types';
import {createState,enqueue,start as startRun,restoreState,type Direction} from './model';
import {drawGarden} from './art';
import {advancePresentation,createPresentation,restorePresentation,savePresentation} from './presentation';
import './style.css';
const module:GameModule={
 id:'snake',title:'Snake',cover:'game-art/snake/cover.svg',
 rules:'Guide the snake with arrows, WASD, swipes or the direction buttons. It moves smoothly at one square every 0.16 seconds. Turns queue for the center of the next square, with at most two saved turns and no reversal. Once a leg starts, a later turn cannot redirect it, even to avoid a wall. Touch apples for 10 points each and grow one segment. Your tail stays in place briefly as you grow. Touching a wall or your body ends the run. A moving tail is safe only if it clears before your head touches it; growth keeps it in place longer. Earn all 256 segments to win. Pause freezes travel, effects and controls. Older grid saves wait for Continue saved run; your progress is kept and turns use the new timing.',
 mount(container,context){
  container.innerHTML=`<div class="snake-game"><div class="snake-garden"><canvas class="snake-canvas" width="480" height="480" tabindex="0" role="img" aria-label="Snake garden. Use arrow keys, WASD or swipe to steer."></canvas><div class="snake-card"><strong>Apple appetite</strong><p>A little snake. A big garden.<br>How long can you grow?</p><button class="game-button snake-start">Start slithering</button></div></div><div class="snake-controls"><div class="snake-instructions"><span>Arrows / WASD</span><span>Swipe to steer</span></div><div class="snake-pad" role="group" aria-label="Snake directions"><button data-direction="up" aria-label="Turn up">↑</button><button data-direction="left" aria-label="Turn left">←</button><button data-direction="down" aria-label="Turn down">↓</button><button data-direction="right" aria-label="Turn right">→</button></div><p class="snake-note">10 points per apple · Stay inside the garden</p></div></div>`;
  const root=container.querySelector<HTMLElement>('.snake-game')!;
  const controls=root.querySelector<HTMLElement>('.snake-controls')!;
  const canvas=root.querySelector<HTMLCanvasElement>('canvas')!;
  const card=root.querySelector<HTMLElement>('.snake-card')!,heading=card.querySelector('strong')!,message=card.querySelector('p')!,start=card.querySelector<HTMLButtonElement>('button')!;
  const buttons=Array.from(root.querySelectorAll<HTMLButtonElement>('[data-direction]'));
  const available=container.parentElement!;
  const motionQuery=matchMedia('(prefers-reduced-motion: reduce)');
  let state=createState(),view=createPresentation(),paused=false,disposed=false,frame:number|null=null,last:number|null=null;
  let lastReduced=false,lastDpr=window.devicePixelRatio||1,dirty=true;
  const events=new AbortController();
  let gesture:{x:number;y:number;id:number}|null=null;
  const reduced=()=>context.settings.reducedMotion||motionQuery.matches;
  function render(){
   const reduce=reduced();lastReduced=reduce;lastDpr=window.devicePixelRatio||1;dirty=false;
   root.dataset.reducedMotion=String(reduce);
   drawGarden(canvas,state,view,reduce);
   const h=state.body[0],format=(n:number)=>Number(n.toFixed(3));
   canvas.setAttribute('aria-label',`Snake garden. Head column ${format(h.x+1)}, row ${format(h.y+1)}. Length ${state.segments}. ${state.food?`Apple column ${state.food.x+1}, row ${state.food.y+1}.`:''} Turns apply at the next square’s center. Use arrows, WASD or swipe.`);
  }
  function resize(){
   if(disposed)return;
   const width=available.clientWidth,height=available.clientHeight;
   // Measure the below-board layout before comparing the two arrangements.
   root.classList.remove('snake-sideways');
   const below=Math.min(728,width,height-controls.offsetHeight-10);
   const beside=Math.min(728,width-204,height-5);
   const sideways=width>=500&&beside>below+24;
   root.classList.toggle('snake-sideways',sideways);
   const size=Math.max(1,sideways?beside:below);
   root.style.setProperty('--snake-board-size',`${size}px`);
   dirty=true;render();
  }
  const observer=new ResizeObserver(resize);observer.observe(available);observer.observe(controls);
  function update(){
   context.setScore(state.score);context.setLevel(`Length ${state.segments}`);
   const finished=state.phase==='lost'||state.phase==='won';
   card.hidden=state.phase==='running'&&!state.migration?.held;
   if(state.migration?.held){
    heading.textContent='Welcome back';message.textContent='Your grid save is safe. Continue from this square with the new turn timing.';start.textContent='Continue saved run';
   }else if(state.phase==='ready'){
    heading.textContent='Apple appetite';message.innerHTML='A little snake. A big garden.<br>How long can you grow?';start.textContent='Start slithering';
   }else if(finished){
    heading.textContent=state.phase==='won'?'Garden complete!':'One more apple?';
    message.textContent=`${state.score} points · ${state.segments} segments. ${state.phase==='won'?'You earned all 256 segments!':'Give that hungry snake another go.'}`;
    start.textContent='Play again';
   }
   buttons.forEach(b=>b.disabled=paused||finished);start.disabled=paused;
   context.setStatus(paused?'Paused':finished?(state.phase==='won'?'All 256 segments earned. You win!':'Run ended. Play again to grow a new snake.'):'Turns wait for the next square’s center. Eat apples; avoid contact with walls and your body.');
   dirty=true;
  }
  function snapshot(){return JSON.parse(JSON.stringify({...state,presentation:savePresentation(view)})) as unknown;}
  function serialize(){advanceTo(performance.now());if(dirty&&!disposed)render();return snapshot();}
  function persist(){context.save(snapshot());}
  function reset(){state=createState();view=createPresentation();last=null;gesture=null;update();persist();}
  function action(d:Direction){
   if(paused||disposed)return;advanceTo(performance.now());
   if(state.phase==='lost'||state.phase==='won'){render();return;}
   if(state.phase==='ready'||state.migration?.held){if(!startRun(state,d))return;last=performance.now();}
   else enqueue(state,d);update();render();
  }
  const keys:Record<string,Direction>={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',w:'up',a:'left',s:'down',d:'right'};
  window.addEventListener('keydown',event=>{
   if(paused||event.repeat||event.ctrlKey||event.altKey||event.metaKey||document.querySelector('dialog[open]')||(event.target instanceof HTMLElement&&event.target.closest('input,textarea,select,[contenteditable=true]')))return;
   const d=keys[event.key]??keys[event.key.toLowerCase()];if(d){event.preventDefault();action(d);}
  },{signal:events.signal});
  buttons.forEach(button=>{
   button.addEventListener('pointerdown',event=>{if(event.isPrimary&&event.button===0){event.preventDefault();action(button.dataset.direction as Direction);}},{signal:events.signal});
   button.addEventListener('click',event=>{if(event.detail===0)action(button.dataset.direction as Direction);},{signal:events.signal});
  });
  start.addEventListener('click',()=>{
   if(paused)return;if(state.phase==='lost'||state.phase==='won')reset();
   startRun(state);last=performance.now();context.sound('tap');update();render();canvas.focus({preventScroll:true});
  },{signal:events.signal});
  canvas.addEventListener('pointerdown',event=>{
   if(paused||!event.isPrimary)return;
   gesture={x:event.clientX,y:event.clientY,id:event.pointerId};canvas.setPointerCapture(event.pointerId);canvas.focus({preventScroll:true});
  },{signal:events.signal});
  canvas.addEventListener('pointerup',event=>{
   if(!gesture||gesture.id!==event.pointerId)return;
   const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;gesture=null;
   if(Math.max(Math.abs(dx),Math.abs(dy))<18)return;
   action(Math.abs(dx)>Math.abs(dy)?dx>0?'right':'left':dy>0?'down':'up');
  },{signal:events.signal});
  const cancelGesture=()=>{gesture=null;};
  canvas.addEventListener('pointercancel',cancelGesture,{signal:events.signal});
  canvas.addEventListener('lostpointercapture',cancelGesture,{signal:events.signal});
  motionQuery.addEventListener('change',()=>{dirty=true;},{signal:events.signal});
  function advanceTo(now:number){
   if(disposed||paused||state.phase!=='running'||state.migration?.held)return;
   now=Math.max(now,last??now);
   const score=state.score,phase=state.phase,ticks=state.ticks;
   if(last!==null)advancePresentation(state,view,Math.max(0,now-last));
   last=now;
   if(state.ticks!==ticks||state.score!==score||state.phase!==phase){
    if(state.score!==score){context.sound('success');context.announce(`Apple! ${state.score} points.`);}
    if(state.phase!==phase){context.sound(state.phase==='won'?'success':'lose');context.announce(state.phase==='won'?'You earned all 256 segments!':`Run ended. ${state.score} points.`);persist();}
    update();
   }
   dirty=true;
  }
  function loop(now:number){
   if(disposed)return;
   advanceTo(now);
   if(dirty||lastReduced!==reduced()||lastDpr!==(window.devicePixelRatio||1))render();
   frame=requestAnimationFrame(loop);
  }
  update();resize();render();frame=requestAnimationFrame(loop);
  return {
   pause(){advanceTo(performance.now());paused=true;last=null;gesture=null;update();render();},
   resume(){paused=false;last=state.phase==='running'&&!state.migration?.held?performance.now():null;update();},restart(){reset();},serialize,
   restore(data){
    const valid=restoreState(data);
    if(valid){state=valid;view=restorePresentation(state,(data as {presentation?:unknown}).presentation);last=state.phase==='running'&&!state.migration?.held?performance.now():null;gesture=null;update();render();}
   },
   dispose(){disposed=true;events.abort();observer.disconnect();if(frame!==null)cancelAnimationFrame(frame);container.replaceChildren();}
  };
 }
};
export default module;
