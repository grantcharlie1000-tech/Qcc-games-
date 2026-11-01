import type {GameModule} from '../../core/types';
import {createState,restoreState,advance,cells,ghost,move,rotate,softDrop,hardDrop,hold,level,ROWS,type State} from './model';
import {PieceGesture,RepeatInput,type Action} from './input';
import {createRenderer,type ClearEffect} from './renderer';
import {uiIcon} from '../../ui/icons';
import './style.css';

const keys:Record<string,Action>={ArrowLeft:'left',a:'left',ArrowRight:'right',d:'right',ArrowDown:'soft',s:'soft',ArrowUp:'cw',w:'cw',x:'cw',z:'ccw',' ':'hard',c:'hold',Shift:'hold'};
const game:GameModule={
 id:'quadfall',title:'Tetris',cover:'game-art/quadfall/cover.svg',
 rules:'Fit falling pieces together and clear complete horizontal lines. A ghost shows where your piece will land. Clear lines to raise your level. On phones: tap to rotate; drag horizontally to move by whole cells; drag down to soft drop; use a fast downward flick to hard drop; swipe up or tap Hold to hold a piece once per drop. Keyboard: Left/Right or A/D move, Down or S soft drops, Up/X/W rotates clockwise, Z rotates counterclockwise, Space hard drops, and C or Shift holds. Enter or Space starts a game. Escape opens the pause menu.',
 mount(container,context){
  let state=createState(),paused=false,disposed=false,awaitingContinue=false,resultsDismissed=false,last:number|null=null,frame=0,best=context.highScore,dirty=true;
  let effect:ClearEffect|null=null,gesture:{id:number;input:PieceGesture}|null=null;
  const events=new AbortController(),repeat=new RepeatInput(),consumedKeys=new Set<string>();
  container.innerHTML=`<div class="qf-game">
   <div class="qf-previews">
    <button class="qf-hold qf-chip arcade-glass-mini" type="button" aria-label="Hold"><span>Hold</span><canvas aria-label="Held piece"></canvas><span class="qf-empty" aria-hidden="true">—</span></button>
    <div class="qf-next qf-chip arcade-glass-mini"><span>Next</span><canvas aria-label="Next two pieces"></canvas></div>
   </div>
   <div class="qf-board">
    <canvas class="qf-canvas" aria-label="Tetris board" aria-description="Tap to rotate. Drag to move or soft drop. Flick down to hard drop. Swipe up to hold." tabindex="0"></canvas>
    <button class="qf-start arcade-glass-mini" type="button">Tap to play</button>
    <dialog class="qf-over ui-glass-sheet" aria-labelledby="qf-over-title">
     <div class="dialog-head"><h2 id="qf-over-title">Game over</h2><button class="qf-dismiss icon-button" type="button" aria-label="Close results">${uiIcon('close')}</button></div>
     <dl class="qf-result"><div><dt>Score</dt><dd data-result="score">0</dd></div><div><dt>Best</dt><dd data-result="best">0</dd></div></dl>
     <button class="qf-replay game-button" type="button" autofocus>Play again</button>
    </dialog>
   </div>
  </div>`;
  const root=container.querySelector<HTMLElement>('.qf-game')!,canvas=root.querySelector<HTMLCanvasElement>('.qf-canvas')!;
  const start=root.querySelector<HTMLButtonElement>('.qf-start')!,holdChip=root.querySelector<HTMLButtonElement>('.qf-hold')!;
  const over=root.querySelector<HTMLDialogElement>('.qf-over')!,again=over.querySelector<HTMLButtonElement>('.qf-replay')!;
  const empty=root.querySelector<HTMLElement>('.qf-empty')!,resultScore=root.querySelector<HTMLElement>('[data-result=score]')!,resultBest=root.querySelector<HTMLElement>('[data-result=best]')!;
  const renderer=createRenderer(canvas,holdChip.querySelector('canvas')!,root.querySelector('.qf-next canvas')!,context.settings,()=>{dirty=true;});
  let reportedScore=-1,reportedLevel=-1,reportedStatus='';
  const reduced=()=>context.settings.reducedMotion||matchMedia('(prefers-reduced-motion: reduce)').matches;
  function resetInput(){repeat.clear();gesture?.input.cancel();gesture=null;}
  const layout=new ResizeObserver(([entry])=>{
   root.dataset.previewLayout=entry.contentRect.width>=entry.contentRect.height/2+340?'corners':'band';
   resetInput();dirty=true;
  });
  layout.observe(root);
  function playable(){return !paused&&!awaitingContinue&&!effect&&state.phase==='running';}
  function attribute(name:string,value:string){if(root.getAttribute(name)!==value)root.setAttribute(name,value);}
  function update(){
   attribute('data-phase',state.phase);attribute('data-score',String(state.score));attribute('data-lines',String(state.lines));attribute('data-level',String(level(state)));
   attribute('data-active',JSON.stringify(state.active));attribute('data-hold',state.held??'');attribute('data-locks',String(state.locks));attribute('data-ghost',String(ghost(state)));attribute('data-clearing',String(!!effect));
   empty.hidden=!!state.held;holdChip.disabled=!playable()||state.holdUsed;
   best=Math.max(best,state.score);
   if(reportedScore!==state.score){reportedScore=state.score;context.setScore(state.score);}
   if(reportedLevel!==level(state)){reportedLevel=level(state);context.setLevel(`Level ${reportedLevel}`);}
   const status=state.phase==='lost'?'Game over':state.phase==='ready'?'Ready':'Playing';
   if(status!==reportedStatus){reportedStatus=status;context.setStatus(status);}
   start.hidden=state.phase!=='ready'&&!awaitingContinue;start.textContent=awaitingContinue?'Continue':'Tap to play';
   if(state.phase==='lost'){
    resultScore.textContent=String(state.score);resultBest.textContent=String(best);
    if(!over.open&&!resultsDismissed)over.show();
   }else if(over.open)over.close();
   dirty=true;
  }
  function lockedBoard(hard=false){
   const board=state.board.map(row=>[...row]);
   for(const [x,y] of cells({...state.active,y:hard?ghost(state):state.active.y}))if(y>=0&&y<ROWS)board[y][x]=state.active.id;
   return board;
  }
  function afterLock(locks:number,lines:number,phase:State['phase'],board:State['board']|null){
   const locked=state.locks!==locks,ended=state.phase!==phase;
   if(locked||ended){resetInput();context.save(state);context.sound(state.phase==='lost'?'lose':'tap');}
   const count=state.lines-lines;
   if(count&&board){
    context.announce(`${['','Single','Double','Triple','Quad'][count]} clear`);context.sound('success');
    const gentle=reduced();effect={board,rows:board.flatMap((row,y)=>row.every(Boolean)?[y]:[]),remaining:150,duration:150,reduced:gentle};
    if(!gentle&&typeof navigator.vibrate==='function')navigator.vibrate(12);
   }
  }
  function action(a:Action){
   if(!playable()||document.querySelector('dialog[open]'))return;
   const locks=state.locks,lines=state.lines,phase=state.phase,board=a==='hard'?lockedBoard(true):null;
   switch(a){
    case 'left':move(state,-1);break;case 'right':move(state,1);break;
    case 'cw':rotate(state,1);break;case 'ccw':rotate(state,-1);break;
    case 'soft':softDrop(state);break;case 'hard':hardDrop(state);break;
    case 'hold':if(hold(state)){resetInput();context.save(state);}break;
   }
   afterLock(locks,lines,phase,board);update();
  }
  function play(){
   if(paused)return;
   if(state.phase==='lost')state=createState();
   awaitingContinue=false;resultsDismissed=false;state.phase='running';last=null;effect=null;resetInput();
   context.save(state);update();canvas.focus({preventScroll:true});
  }
  start.addEventListener('click',play,{signal:events.signal});again.addEventListener('click',play,{signal:events.signal});
  over.querySelector('.qf-dismiss')!.addEventListener('click',()=>{resultsDismissed=true;over.close();canvas.focus({preventScroll:true});},{signal:events.signal});
  holdChip.addEventListener('click',()=>{action('hold');canvas.focus({preventScroll:true});},{signal:events.signal});
  window.addEventListener('keydown',e=>{
   const key=e.key.length===1?e.key.toLowerCase():e.key;
   // A hard drop can focus replay before keyup. Its held Space still belongs to play.
   if(e.repeat){if(consumedKeys.has(key))e.preventDefault();return;}
   if(paused||e.ctrlKey||e.altKey||e.metaKey||document.querySelector('dialog[open]:not(.qf-over)')||(e.target instanceof HTMLElement&&/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)))return;
   // Native buttons own Enter/Space, including the replay button focused by the sheet.
   if(e.target instanceof HTMLElement&&e.target.closest('button,a')&&(key===' '||key==='Enter'))return;
   if((state.phase!=='running'||awaitingContinue)&&(key===' '||key==='Enter')){e.preventDefault();consumedKeys.add(key);play();return;}
   const a=keys[key];if(!a||!playable())return;e.preventDefault();consumedKeys.add(key);
   if(a==='left'||a==='right'||a==='soft')for(const next of repeat.press(key,a,performance.now()))action(next);
   else action(a);
  },{signal:events.signal});
  window.addEventListener('keyup',e=>{const key=e.key.length===1?e.key.toLowerCase():e.key;repeat.release(key,performance.now());consumedKeys.delete(key);},{signal:events.signal});
  window.addEventListener('blur',()=>{resetInput();consumedKeys.clear();},{signal:events.signal});
  canvas.addEventListener('pointerdown',e=>{
   if(!e.isPrimary||e.button!==0||gesture||!playable()||!renderer.cellSize())return;
   e.preventDefault();canvas.focus({preventScroll:true});
   gesture={id:e.pointerId,input:new PieceGesture(e.clientX,e.clientY,performance.now(),renderer.cellSize())};
   canvas.setPointerCapture(e.pointerId);
  },{signal:events.signal});
  canvas.addEventListener('pointermove',e=>{
   if(!gesture||gesture.id!==e.pointerId)return;e.preventDefault();
   for(const a of gesture.input.move(e.clientX,e.clientY,performance.now())){if(!gesture)break;action(a);}
  },{signal:events.signal});
  canvas.addEventListener('pointerup',e=>{
   if(!gesture||gesture.id!==e.pointerId)return;e.preventDefault();
   const input=gesture.input;gesture=null;
   for(const a of input.finish(e.clientX,e.clientY,performance.now()))action(a);
  },{signal:events.signal});
  for(const event of ['pointercancel','lostpointercapture'] as const)canvas.addEventListener(event,e=>{
   if(gesture?.id===e.pointerId){gesture.input.cancel();gesture=null;}
  },{signal:events.signal});
  function loop(now:number){
   if(disposed)return;
   const dt=last===null?0:Math.min(50,Math.max(0,now-last));last=now;
   if(!paused&&!awaitingContinue&&state.phase==='running'){
    if(effect){
     effect.remaining-=dt;dirty=true;
     if(effect.remaining<=0){effect=null;update();}
    }else{
     const locks=state.locks,lines=state.lines,phase=state.phase,y=state.active.y;
     const board=state.lock+dt>=500?lockedBoard():null;
     advance(state,dt);afterLock(locks,lines,phase,board);
     if(state.active.y!==y||state.locks!==locks||state.phase!==phase)update();
     for(const a of repeat.tick(now))action(a);
    }
   }
   if(dirty){renderer.draw(state,effect);dirty=false;}
   frame=requestAnimationFrame(loop);
  }
  update();frame=requestAnimationFrame(loop);
  return {
   pause(){paused=true;last=null;resetInput();update();},
   resume(){paused=false;last=null;update();},
   restart(){state=createState();awaitingContinue=false;resultsDismissed=false;last=null;effect=null;resetInput();context.save(state);update();},
   serialize(){return structuredClone(state);},
   restore(value){const restored=restoreState(value);if(restored){state=restored;awaitingContinue=state.phase==='running';resultsDismissed=false;last=null;effect=null;resetInput();update();}},
   dispose(){disposed=true;events.abort();layout.disconnect();renderer.dispose();cancelAnimationFrame(frame);if(over.open)over.close();container.replaceChildren();}
  };
 }
};
export default game;
