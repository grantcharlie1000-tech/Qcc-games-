import type {GameModule} from '../../core/types';
import {createState,enqueue,start as startRun,restoreState,advance,length,SIZE,type Direction} from './model';
import {drawGarden} from './art';
import {buildSpine,createView,eatDelay,tickView,DEATH_CARD_MS,WIN_CARD_MS,type SnakeView} from './presentation';
import {notifyGlassFrame,registerGlassFrameSource} from '../../ui/glass-frame-source';
import {christmas} from '../../festive/festive';
import './style.css';
import './christmas.css';
const SWIPE_PX=20;
const module:GameModule={
 id:'snake',title:'Snake',cover:'game-art/snake/cover.svg',
 rules:'Steer with the arrow keys, WASD or swipes; the first direction starts the run. The snake moves one square every 0.135 seconds. Up to three turns are buffered, and a turn pressed just after the head passes a square still turns at that square. Eat apples for 10 points; each one adds a segment. Hitting a wall or your own body ends the run, though the snake pauses for one beat against an obstacle so a quick turn can still save it. Your tail moves out of the way as you advance, unless you have just eaten. Fill the whole 16 by 16 garden to win. Pause freezes play and animation.',
 mount(container,context){
  container.innerHTML=`<div class="snake-game"><div class="snake-garden"><canvas class="snake-canvas" width="480" height="480" tabindex="0" role="img" aria-label="Snake garden. Use arrow keys, WASD or swipe to steer."></canvas><div class="snake-card"><strong>Apple appetite</strong><p hidden></p><button class="game-button snake-start">Start slithering</button></div></div></div>`;
  const root=container.querySelector<HTMLElement>('.snake-game')!;
  const canvas=root.querySelector<HTMLCanvasElement>('canvas')!;
  const card=root.querySelector<HTMLElement>('.snake-card')!,heading=card.querySelector('strong')!,message=card.querySelector('p')!,start=card.querySelector<HTMLButtonElement>('button')!;
  const available=container.parentElement!;
  const motionQuery=matchMedia('(prefers-reduced-motion: reduce)');
  let state=createState(),view:SnakeView=createView(),paused=false,disposed=false,frame:number|null=null,last:number|null=null;
  let best=context.highScore,revealed=true;
  const events=new AbortController();
  let gesture:{x:number;y:number;id:number}|null=null;
  const reduced=()=>context.settings.reducedMotion||motionQuery.matches;
  type PaintInputs=readonly [boolean,boolean,boolean,number,number,FontFaceSetLoadStatus|'unavailable'];
  let painted:PaintInputs|null=null;
  function paintInputs():PaintInputs{
   return [reduced(),context.settings.colorBlind,christmas(),canvas.getBoundingClientRect().width,window.devicePixelRatio||1,document.fonts?.status??'unavailable'];
  }
  function render(){
   const reduce=reduced();
   root.dataset.reducedMotion=String(reduce);
   drawGarden(canvas,state,view,reduce);
   painted=paused?paintInputs():null;
   notifyGlassFrame(canvas);
   const h=state.body[0];
   canvas.setAttribute('aria-label',`Snake garden. Head column ${h.x+1}, row ${h.y+1}. Length ${length(state)}. ${state.food?`Apple column ${state.food.x+1}, row ${state.food.y+1}.`:''} Use arrows, WASD or swipe.`);
  }
  const repaintPaused=()=>{if(paused&&!disposed)render();};
  document.fonts?.addEventListener('loadingdone',repaintPaused,{signal:events.signal});
  document.fonts?.addEventListener('loadingerror',repaintPaused,{signal:events.signal});
  canvas.addEventListener('contextrestored',repaintPaused,{signal:events.signal});
  function resize(){
   if(disposed)return;
   const size=Math.max(1,Math.min(728,available.clientWidth,available.clientHeight));
   root.style.setProperty('--snake-board-size',`${size}px`);
   render();
  }
  const observer=new ResizeObserver(resize);observer.observe(available);
  const releaseGlass=registerGlassFrameSource(canvas,()=>{if(!disposed)render();});
  const finished=()=>state.phase==='lost'||state.phase==='won';
  /** Result cards wait for the death/win animation, except under reduced motion. */
  function cardDue(){
   if(!finished())return true;
   if(reduced()||view.endedAt===null)return true;
   return view.clock-view.endedAt>=(state.phase==='won'?WIN_CARD_MS:DEATH_CARD_MS);
  }
  function update(){
   context.setScore(state.score);context.setLevel(`Length ${length(state)}`);
   const done=finished(),wasRevealed=revealed;
   revealed=cardDue();
   message.hidden=!done;
   card.hidden=state.phase==='running'||!revealed;
   if(state.phase==='ready'){heading.textContent='Apple appetite';start.textContent='Start slithering';}
   else if(done){
    heading.textContent=state.phase==='won'?'Garden complete!':'One more apple?';
    message.textContent=`${state.score>best&&state.score>0?'New best! ':''}${state.score} points · length ${length(state)}`;
    start.textContent='Play again';
   }
   start.disabled=paused;
   if(done&&revealed&&!wasRevealed&&!paused&&root.contains(document.activeElement))start.focus({preventScroll:true});
   context.setStatus(paused?'Paused':done?(state.phase==='won'?`All ${SIZE*SIZE} squares filled. You win!`:'Run ended.'):state.phase==='ready'?'Ready':'Playing');
  }
  function snapshot(){const {undo:_undo,...rest}=state;return JSON.parse(JSON.stringify(rest)) as unknown;}
  function serialize(){advanceTo(performance.now());return snapshot();}
  function persist(){context.save(snapshot());}
  function reset(){painted=null;state=createState();const clock=view.clock;view=createView();view.clock=clock;view.foodBorn=clock;best=context.highScore;last=null;gesture=null;revealed=true;update();persist();}
  function begin(d?:Direction):boolean{
   if(!startRun(state,d))return false;
   best=context.highScore;last=performance.now();context.sound('tap');afterModelChange(state.score,'ready');return true;
  }
  function action(d:Direction){
   if(paused||disposed)return;advanceTo(performance.now());
   if(finished())return;
   if(state.phase==='ready'){begin(d);}
   else{const score=state.score,phase=state.phase;enqueue(state,d);afterModelChange(score,phase);}
   update();render();
  }
  const keys:Record<string,Direction>={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',w:'up',a:'left',s:'down',d:'right'};
  window.addEventListener('keydown',event=>{
   if(paused||event.repeat||event.ctrlKey||event.altKey||event.metaKey||document.querySelector('dialog[open]')||(event.target instanceof HTMLElement&&event.target.closest('input,textarea,select,[contenteditable=true]')))return;
   const d=keys[event.key]??keys[event.key.toLowerCase()];if(d){event.preventDefault();action(d);}
  },{signal:events.signal});
  start.addEventListener('click',()=>{
   if(paused)return;if(finished())reset();
   begin();update();render();canvas.focus({preventScroll:true});
  },{signal:events.signal});
  canvas.addEventListener('pointerdown',event=>{
   if(paused||!event.isPrimary)return;
   gesture={x:event.clientX,y:event.clientY,id:event.pointerId};canvas.setPointerCapture(event.pointerId);canvas.focus({preventScroll:true});
  },{signal:events.signal});
  // Swipes turn as soon as the finger has travelled far enough; one drag can make several turns.
  canvas.addEventListener('pointermove',event=>{
   if(!gesture||gesture.id!==event.pointerId)return;
   const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y,ax=Math.abs(dx),ay=Math.abs(dy);
   if(Math.max(ax,ay)<SWIPE_PX||Math.max(ax,ay)<1.3*Math.min(ax,ay))return;
   gesture.x=event.clientX;gesture.y=event.clientY;
   action(ax>ay?dx>0?'right':'left':dy>0?'down':'up');
  },{signal:events.signal});
  const endGesture=()=>{gesture=null;};
  canvas.addEventListener('pointerup',endGesture,{signal:events.signal});
  canvas.addEventListener('pointercancel',endGesture,{signal:events.signal});
  canvas.addEventListener('lostpointercapture',endGesture,{signal:events.signal});
  function afterModelChange(score:number,phase:string){
   if(state.score>score){
    const at=view.clock+(reduced()?0:eatDelay(state));view.eats.push({at,cell:{...state.eaten!}});view.foodBorn=at;
    context.sound('success');context.announce(`Apple! ${state.score} points.`);
   }
   if(state.phase!==phase&&finished()){
    view.endedAt=view.clock;revealed=false;
    context.sound(state.phase==='won'?'success':'lose');
    context.announce(state.phase==='won'?'You filled the garden!':`Run ended. ${state.score} points.`);persist();
   }
   if(state.score!==score||state.phase!==phase)update();
  }
  function advanceTo(now:number){
   if(disposed||paused||state.phase!=='running'){last=null;return;}
   const dt=last===null?0:Math.max(0,now-last);last=Math.max(last??now,now);
   const score=state.score,phase=state.phase;
   advance(state,dt);afterModelChange(score,phase);
  }
  let lastFrame:number|null=null;
  function loop(now:number){
   if(disposed)return;
   if(!paused){
    const dt=lastFrame===null?0:Math.min(100,Math.max(0,now-lastFrame));
    advanceTo(now);
    const spine=buildSpine(state);tickView(view,state,spine.head,spine.tangent,dt,reduced());
    if(!revealed&&cardDue())update();
   }
   lastFrame=paused?null:now;
   const inputs=paused?paintInputs():null;
   if(!paused||painted===null||inputs?.some((value,index)=>value!==painted?.[index]))render();
   frame=requestAnimationFrame(loop);
  }
  update();resize();frame=requestAnimationFrame(loop);
  return {
   pause(){advanceTo(performance.now());paused=true;last=null;gesture=null;update();render();},
   resume(){paused=false;last=state.phase==='running'?performance.now():null;update();},
   restart(){reset();},serialize,
   restore(data){
    const valid=restoreState(data);
    if(valid){state=valid;view=createView(state);revealed=true;last=state.phase==='running'?performance.now():null;gesture=null;best=context.highScore;update();render();}
   },
   dispose(){disposed=true;releaseGlass();events.abort();observer.disconnect();if(frame!==null)cancelAnimationFrame(frame);container.replaceChildren();}
  };
 }
};
export default module;
