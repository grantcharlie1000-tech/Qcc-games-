import type {GameModule} from '../../core/types';
import {createState,enqueue,start as startRun,restoreState,type Direction} from './model';
import {drawGarden} from './art';
import {advancePresentation,createPresentation,restorePresentation,savePresentation} from './presentation';
import {bindGamePauseSheet,createGameSheet} from '../../ui/game-sheet';
import './style.css';
const module:GameModule={
 id:'snake',title:'Snake',cover:'game-art/snake/cover.svg',
 rules:'Guide the snake with arrow keys, WASD or swipes. It moves smoothly at one square every 0.16 seconds. Turns queue for the center of the next square, with at most two saved turns and no reversal. Once a leg starts, a later turn cannot redirect it, even to avoid a wall. Touch apples for 10 points each and grow one segment. Your tail stays in place briefly as you grow. Touching a wall or your body ends the run. A moving tail is safe only if it clears before your head touches it; growth keeps it in place longer. Earn all 256 segments to win. Pause freezes travel, effects and controls. Older grid saves wait for you to choose Play; your progress is kept and turns use the new timing.',
 mount(container,context){
  container.innerHTML=`<div class="snake-game"><div class="snake-garden"><canvas class="snake-canvas" width="480" height="480" tabindex="0" role="img" aria-label="Snake garden. Use arrow keys, WASD or swipe to steer."></canvas></div></div>`;
  const root=container.querySelector<HTMLElement>('.snake-game')!;
  const canvas=root.querySelector<HTMLCanvasElement>('canvas')!;
  const controls={touch:'Swipe to steer.',keyboard:'Arrow keys or WASD to steer.'};
  const sheet=createGameSheet(root.querySelector<HTMLElement>('.snake-garden')!,{title:'Snake',controls,buttonClass:'snake-start',onPlay:play});
  const pauseSheet=bindGamePauseSheet(container,{title:'Snake',controls});
  const available=container.parentElement!;
  const motionQuery=matchMedia('(prefers-reduced-motion: reduce)');
  let state=createState(),view=createPresentation(),paused=false,disposed=false,frame:number|null=null,last:number|null=null,best=context.highScore;
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
   const size=Math.max(1,Math.min(728,available.clientWidth,available.clientHeight));
   root.style.setProperty('--snake-board-size',`${size}px`);
   dirty=true;render();
  }
  const observer=new ResizeObserver(resize);observer.observe(available);
  function update(){
   best=Math.max(best,state.score);
   context.setScore(state.score);context.setLevel(`Length ${state.segments}`);
   const finished=state.phase==='lost'||state.phase==='won';
   if(state.phase==='running'&&!state.migration?.held)sheet.hide();
   else sheet.show(finished?'game-over':'start',{...(finished?{score:state.score.toLocaleString()}:{}),best:best.toLocaleString()});
   sheet.button.disabled=paused;
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
  function play(){
   if(paused)return;if(state.phase==='lost'||state.phase==='won')reset();
   startRun(state);last=performance.now();context.sound('tap');update();render();canvas.focus({preventScroll:true});
  }
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
    if(valid){state=valid;view=restorePresentation(state,(data as {presentation?:unknown}).presentation,(data as {version?:unknown}).version===1);last=state.phase==='running'&&!state.migration?.held?performance.now():null;gesture=null;update();render();}
   },
   dispose(){disposed=true;events.abort();observer.disconnect();sheet.dispose();pauseSheet.dispose();if(frame!==null)cancelAnimationFrame(frame);container.replaceChildren();}
  };
 }
};
export default module;
