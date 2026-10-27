import type { GameModule } from '../../core/types';
import { advance, createTower, drop, restoreTower } from './model';
import { renderTower } from './renderer';
import './style.css';

const game:GameModule={
  id:'tower',title:'Stack',cover:'game-art/tower/cover.svg',
  rules:'Independent browser adaptation. Click or tap the tower, use Drop block, or press Space/Enter to place the sliding slab. Only the overlap with the previous slab survives: the overhang falls away. A complete miss ends your tower. Near-perfect alignment snaps into place and preserves the full size. Consecutive perfects earn a bonus of up to five points per slab. Travel alternates across the two axes and gradually gets faster. Build as high as you can! Pause freezes the action; restart begins a fresh tower.',
  mount(container,context){
    container.innerHTML=`<div class="tower-game" data-phase="sliding"><div class="tower-viewport"><canvas class="tower-canvas" tabindex="0" role="button" aria-label="Stack playfield. Tap or press Space to drop the moving block."></canvas><div class="tower-stats"><span>Floors<strong class="tower-height">0</strong></span><span>Perfect streak<strong class="tower-combo">0</strong></span></div><div class="tower-feedback" aria-hidden="true"></div><div class="tower-end" hidden><div class="tower-end-card"><h2>One more floor?</h2><p class="tower-result"></p><button class="game-button tower-again">Build again</button></div></div></div><div class="tower-footer"><button class="tower-drop">Drop block</button><span class="tower-key">SPACE / ENTER<br>or tap the tower</span></div><p class="tower-note">Keep the overlap. Find your rhythm.</p></div>`;
    const root=container.querySelector<HTMLElement>('.tower-game')!,canvas=container.querySelector<HTMLCanvasElement>('canvas')!,dropButton=container.querySelector<HTMLButtonElement>('.tower-drop')!,again=container.querySelector<HTMLButtonElement>('.tower-again')!,end=container.querySelector<HTMLElement>('.tower-end')!,feedback=container.querySelector<HTMLElement>('.tower-feedback')!;
    container.querySelector<HTMLElement>('.tower-viewport')!.style.backgroundImage=`url("${import.meta.env.BASE_URL}game-art/tower/skyline.svg")`;
    let state=createTower(),paused=false,disposed=false,raf:number|null=null,lastTick=performance.now(),feedbackText='';
    function reduced(){return context.settings.reducedMotion;}
    function draw(){renderTower(canvas,state,reduced(),paused);const fresh=state.last&&state.time-state.last.time<.9;feedback.textContent=fresh&&state.last!.kind==='perfect'?`PERFECT${state.combo>1?' ×'+state.combo:''}`:'';}
    function update(){
      root.dataset.phase=state.phase;
      root.querySelector('.tower-height')!.textContent=String(state.blocks.length-1);root.querySelector('.tower-combo')!.textContent=String(state.combo);
      dropButton.disabled=paused||state.phase!=='sliding';end.hidden=state.phase!=='over';
      if(!end.hidden)root.querySelector('.tower-result')!.textContent=`${state.blocks.length-1} floors · ${state.score} points. Your best perfect streak: ${state.bestCombo}.`;
      context.setScore(state.score);context.setLevel(`${state.blocks.length-1} floors`);
      feedbackText=state.phase==='over'?'No overlap! Your tower is complete.':state.last?.kind==='perfect'?`Perfect${state.combo>1?' ×'+state.combo:''}! Full size preserved.`:state.last?.kind==='cut'?'Overhang trimmed. Keep building!':'Tap when the slab lines up with the tower.';
      context.setStatus(feedbackText);canvas.setAttribute('aria-label',`Stack playfield, ${state.blocks.length-1} floors. ${state.phase==='over'?'Run finished.':'Tap or press Space to drop the moving block.'}`);draw();
    }
    function tick(now:number){if(!paused&&!disposed)state=advance(state,Math.max(0,(now-lastTick)/1000));lastTick=now;}
    function frame(now:number){raf=null;if(paused||disposed)return;const previous=state.phase;tick(now);if(previous!==state.phase)update();else draw();schedule();}
    function schedule(){if(!paused&&!disposed&&raf===null&&(state.phase!=='over'||(state.last&&state.time-state.last.time<1.3)))raf=requestAnimationFrame(frame);}
    function stop(){if(raf!==null)cancelAnimationFrame(raf);raf=null;}
    function blocked(target:EventTarget|null){return !!document.querySelector('dialog[open]')||(target instanceof Element&&!!target.closest('input,textarea,select,[contenteditable]'));}
    function place(){
      if(paused||disposed||state.phase!=='sliding'||blocked(null))return;
      tick(performance.now());state=drop(state);update();context.sound(state.phase==='over'?'lose':state.last?.kind==='perfect'?'success':'tap');context.announce(feedbackText);context.save(state);schedule();
    }
    function pointer(event:PointerEvent){if(event.isPrimary&&event.button===0&&!blocked(event.target)){event.preventDefault();canvas.focus({preventScroll:true});place();}}
    function key(event:KeyboardEvent){
      if((event.code!=='Space'&&event.code!=='Enter')||event.repeat||blocked(event.target))return;
      // Native buttons own their keyboard activation; the stage/canvas uses this action binding.
      if(event.target instanceof Element&&event.target.closest('button,a'))return;
      event.preventDefault();place();
    }
    function restart(){if(disposed)return;state=createTower();lastTick=performance.now();update();context.save(state);schedule();}
    function resize(){if(disposed)return;const rect=canvas.getBoundingClientRect(),ratio=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.max(1,Math.round(rect.width*ratio));canvas.height=Math.max(1,Math.round(rect.height*ratio));draw();}
    const observer=new ResizeObserver(resize);observer.observe(canvas);
    canvas.addEventListener('pointerdown',pointer);document.addEventListener('keydown',key);dropButton.addEventListener('click',place);again.addEventListener('click',restart);
    update();resize();schedule();
    return {
      pause(){if(disposed||paused)return;tick(performance.now());paused=true;stop();update();},
      resume(){if(disposed||!paused)return;paused=false;lastTick=performance.now();update();schedule();},
      restart,
      serialize(){if(!paused&&!disposed){const phase=state.phase;tick(performance.now());if(state.phase!==phase)update();}return JSON.parse(JSON.stringify(state)) as unknown;},
      restore(data){const restored=restoreTower(data);if(!restored||disposed)return;state=restored;lastTick=performance.now();update();schedule();},
      dispose(){if(disposed)return;disposed=true;stop();observer.disconnect();canvas.removeEventListener('pointerdown',pointer);document.removeEventListener('keydown',key);dropButton.removeEventListener('click',place);again.removeEventListener('click',restart);container.replaceChildren();}
    };
  }
};
export default game;
