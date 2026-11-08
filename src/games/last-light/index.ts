import type {GameModule,GameContext,GameInstance} from '../../core/types';
import {LEVELS,LEVEL_COUNT,WORLDS} from './levels';
import {createRun,step,nextStage,respawn,serialize,restore,formatTime,STEP,type Input} from './model';
import {Scene} from './render';
import {LanternMusic} from './music';
import {christmas} from '../../festive/festive';
import {mountCompactHud} from '../../ui/game-controls-adapter';
import './style.css';

type Overlay='intro'|'continue'|'clear'|'complete'|'menu'|'help'|'confirm'|null;
function mount(container:HTMLElement,context:GameContext):GameInstance {
 const root=document.createElement('section');root.className='ll-game';root.setAttribute('aria-label','Last Light platformer');
 root.innerHTML=`<canvas class="ll-canvas" tabindex="0" role="application" aria-label="Last Light. Arrow keys or A D to run, Space to jump, Shift or X to dash, R to return to checkpoint." aria-describedby="ll-help"></canvas>
 <div class="ll-top"><div class="ll-location"><span class="ll-world"></span><strong class="ll-stage"></strong></div><div class="ll-stats"><span title="Sparks collected">✦ <b class="ll-sparks">0</b></span><span title="Deaths">↻ <b class="ll-deaths">0</b></span><span class="ll-time" aria-label="Run time">0:00</span></div></div>
 <div class="ll-progress" aria-hidden="true"><i></i></div><p class="ll-notice" role="status"></p>
 <div class="ll-touch" role="group" aria-label="Game controls"><div><button data-action="left" aria-label="Move left">←</button><button data-action="right" aria-label="Move right">→</button></div><div><button data-action="dash" aria-label="Dash">⇢<small>DASH</small></button><button data-action="jump" aria-label="Jump">↑<small>JUMP</small></button></div></div>
 <div class="ll-overlay"><div class="ll-card"></div></div><p id="ll-help" class="sr-only">Carry the lantern to each beacon in order. Jump over gaps and spikes. Hold jump for height. Dash once in the air; landing refills it. Jump while touching a wall to wall jump. Flags save your place. Collect keys to open gates. P pauses. R returns to the checkpoint and counts a death.</p>`;
 container.append(root);
 const q=<T extends Element>(selector:string)=>root.querySelector<T>(selector)!;
 const canvas=q<HTMLCanvasElement>('.ll-canvas'),card=q<HTMLElement>('.ll-card'),layer=q<HTMLElement>('.ll-overlay');
 const music=new LanternMusic();
 const scene=new Scene(canvas),hud=mountCompactHud(container),abort=new AbortController(),{signal}=abort;
 let run=createRun(),overlay:Overlay='intro',paused=false,disposed=false,frame=0,last=0,acc=0,noticeUntil=0,previousHud='',previousSecond=-1;
 const keys=new Set<string>(),touches=new Map<number,string>();
 let jumpQueued=false,dashQueued=false;
 const reduced=()=>context.settings.reducedMotion||matchMedia('(prefers-reduced-motion: reduce)').matches;
 const resetInput=()=>{keys.clear();touches.clear();jumpQueued=false;dashQueued=false;root.querySelectorAll('[data-held]').forEach(b=>b.removeAttribute('data-held'));run.previousJump=false;run.previousDash=false;};
 const input=():Input=>{
  const actions=new Set(touches.values()),left=actions.has('left')||keys.has('ArrowLeft')||keys.has('KeyA'),right=actions.has('right')||keys.has('ArrowRight')||keys.has('KeyD');
  return {move:Number(right)-Number(left),jump:jumpQueued||actions.has('jump')||['Space','ArrowUp','KeyW'].some(k=>keys.has(k)),dash:dashQueued||actions.has('dash')||['ShiftLeft','ShiftRight','KeyX'].some(k=>keys.has(k))};
 };
 const active=()=>!paused&&!overlay&&!disposed&&!document.hidden;
 function stop(){if(frame)cancelAnimationFrame(frame);frame=0;last=0;acc=0;resetInput();}
 function schedule(){if(!frame&&active())frame=requestAnimationFrame(loop);}
 function save(){context.save(serialize(run));}
 function notice(message:string){q<HTMLElement>('.ll-notice').textContent=message;noticeUntil=run.clock+5;context.announce(message);}
 function paint(){
  if(disposed)return;scene.draw(run,reduced());music.sync(active(),context.settings.sound&&!christmas());
  root.dataset.phase=run.phase;root.dataset.stage=String(run.stage+1);root.dataset.overlay=overlay??'none';root.dataset.paused=String(paused);
  if(import.meta.env.DEV){root.dataset.x=run.x.toFixed(2);root.dataset.y=run.y.toFixed(2);root.dataset.ground=String(run.ground);root.dataset.dash=String(run.dashReady);root.dataset.elapsed=String(Math.floor(run.time));}
  const level=LEVELS[run.stage],theme=WORLDS[level.world];root.style.setProperty('--ll-accent',theme.accent);
  const text=`${run.stage+1} / ${LEVEL_COUNT} · ${run.sparks} ✦`;
  if(text!==previousHud){previousHud=text;hud.set(text,`Stage ${run.stage+1} of ${LEVEL_COUNT}, ${run.sparks} sparks`);}
  q<HTMLElement>('.ll-world').textContent=`${String(level.world+1).padStart(2,'0')} / ${theme.name}`;
  q<HTMLElement>('.ll-stage').textContent=`${String(run.stage+1).padStart(2,'0')} — ${level.name}`;
  q<HTMLElement>('.ll-sparks').textContent=String(run.sparks);q<HTMLElement>('.ll-deaths').textContent=String(run.deaths);
  const second=Math.floor(run.time/1000);if(second!==previousSecond){previousSecond=second;q<HTMLElement>('.ll-time').textContent=formatTime(run.time);}
  q<HTMLElement>('.ll-progress i').style.width=`${100*(run.cleared/LEVEL_COUNT)}%`;
  if(noticeUntil&&run.clock>noticeUntil){q<HTMLElement>('.ll-notice').textContent='';noticeUntil=0;}
 }
 function show(next:Overlay){
  overlay=next;stop();layer.hidden=!next;canvas.tabIndex=next?-1:0;
  if(!next){card.replaceChildren();paint();schedule();canvas.focus({preventScroll:true});return;}
  const level=LEVELS[run.stage];
  const button=(action:string,label:string,secondary=false)=>`<button class="ll-button${secondary?' ll-secondary':''}" data-do="${action}">${label}</button>`;
  const eyebrow=(text:string)=>`<p class="ll-eyebrow">${text}</p>`;
  let html='';
  if(next==='intro')html=`${eyebrow('QCC ORIGINAL · A PIXEL PLATFORMER')}<h1><span class="sr-only">Last Light</span><img src="${import.meta.env.BASE_URL}game-art/last-light/title.svg" alt="" width="190" height="130"><i aria-hidden="true">✦</i></h1><p class="ll-story">The city has gone quiet.<br>One little light is still awake.</p><p class="ll-description">Carry it through 40 stages.<br>Five worlds. One way forward.</p>${button('play','Carry the light →')}${button('help','How to play',true)}<p class="ll-footnote">RUN · JUMP · DASH · TRY AGAIN</p>`;
  if(next==='continue')html=`${eyebrow('YOUR LIGHT IS STILL HERE')}<h2>Welcome back.</h2><p>Stage ${run.stage+1} · ${level.name}<br>${run.cleared} stages cleared · ${run.sparks} sparks · ${formatTime(run.time)}</p>${button('play','Continue the journey →')}${button('help','Controls',true)}${button('confirm','Start a new run',true)}`;
  if(next==='clear'||next==='complete')html=`${eyebrow(next==='complete'?'40 / 40 · THE CITY WAKES':'BEACON '+String(run.stage+1).padStart(2,'0')+' LIT')}<h2>${next==='complete'?'You brought<br>back the dawn.':'A little brighter.'}</h2><p>${level.name}</p><div class="ll-results"><span>SPARKS<strong>${run.sparks} ✦</strong></span><span>TIME<strong>${formatTime(run.time)}</strong></span><span>DEATHS<strong>${run.deaths}</strong></span></div><p class="ll-result-score">${run.best.toLocaleString()} points</p>${next==='clear'?button('next','Next stage →'):button('confirm','Start another journey →')}${button('rankings','View leaderboard',true)}<p class="ll-footnote">Ranks by stages, then sparks, speed & fewer deaths.<br>Log in through the QCC menu to share your best.</p>`;
  if(next==='menu')html=`${eyebrow('TAKE A BREATHER')}<h2>The light can wait.</h2><p>Stage ${run.stage+1} · ${level.name}</p>${button('play','Back to the journey →')}${button('help','How to play',true)}${button('rankings','Leaderboard',true)}${button('confirm','Start a new run',true)}`;
  if(next==='help')html=`${eyebrow('SMALL COURIER. BIG JOURNEY.')}<h2>Find your footing.</h2><dl class="ll-controls-list"><dt>← → / A D</dt><dd>Run</dd><dt>Space / ↑ / W</dt><dd>Jump · hold to go higher</dd><dt>Shift / X</dt><dd>Dash · land to recharge</dd><dt>Jump at a wall</dt><dd>Kick away from it</dd><dt>R</dt><dd>Retry checkpoint (+1 death)</dd><dt>P</dt><dd>Pause / resume</dd></dl><p class="ll-small">Flags save your place. Gold keys open gates. Blue crystals refill your dash. Cracked floors fall, springs bounce, belts push, ice slides. Wait for lasers to go dark.</p><p class="ll-small">On touch screens, hold the arrow and jump or dash buttons together.</p>${button('back','Got it →')}`;
  if(next==='confirm')html=`${eyebrow('A FRESH START')}<h2>Begin again?</h2><p>This starts at stage 1 and replaces your current journey. Your leaderboard best stays saved.</p>${button('fresh','Start new run')}${button('back','Keep this journey',true)}`;
  card.innerHTML=html;paint();queueMicrotask(()=>{if(!disposed&&overlay===next)card.querySelector<HTMLButtonElement>('button')?.focus({preventScroll:true});});
 }
 function report(){context.setLevel(`Stage ${run.stage+1} / ${LEVEL_COUNT}`);context.setScore(run.best);}
 function loop(now:number){
  frame=0;if(!active())return;
  const interval=last?Math.max(0,(now-last)/1000):0,simulated=Math.min(interval,.1);
  // Cap physics catch-up, but count all active time so a slow device cannot improve a ranking.
  run.time+=(interval-simulated)*1000;run.stageTime+=(interval-simulated)*1000;acc+=simulated;last=now;
  const controls=input();
  while(acc>=STEP&&active()){
   acc-=STEP;const events=step(run,controls);scene.step(run,events,STEP);jumpQueued=false;dashQueued=false;
   if(events.jump||events.dash)context.sound('tap');
   if(events.pickup)context.sound('tap');
   if(events.checkpoint){notice('Checkpoint lit. Your light is safe here.');save();context.sound('success');}
   if(events.death){notice('A small setback. Try again.');context.sound('lose');save();}
   if(events.clear){context.sound('success');report();save();context.setStatus(run.phase==='complete'?'Run finished. The dawn is back.':'Beacon lit. Next stage ready.');show(run.phase==='complete'?'complete':'clear');}
  }
  paint();schedule();
 }
 function play(){
  if(run.phase==='cleared'){show('clear');return;}if(run.phase==='complete'){show('complete');return;}
  show(null);notice(run.stage===0&&matchMedia('(any-pointer: coarse)').matches?'Hold ← or → to run. ↑ jumps; ⇢ dashes. Carry the light to the beacon.':LEVELS[run.stage].hint);context.setStatus('Carry the light to the beacon.');report();
 }
 function retry(){if(run.phase!=='playing')return;respawn(run);resetInput();notice('Back to the checkpoint. Keep the light moving.');save();paint();}
 let returnTo:Overlay='intro';
 card.addEventListener('click',event=>{
  const action=(event.target as Element).closest<HTMLElement>('[data-do]')?.dataset.do;if(!action||paused)return;
  if(action==='play')play();
  else if(action==='next'){if(nextStage(run)){save();report();play();}}
  else if(action==='help'||action==='confirm'){returnTo=overlay;show(action==='help'?'help':'confirm');}
  else if(action==='back')show(returnTo);
  else if(action==='fresh'){music.reset();run=createRun();previousSecond=-1;save();report();play();}
  else if(action==='rankings')context.openRankings?.('last-light');
 },{signal});
 window.addEventListener('keydown',event=>{
  const target=event.target as HTMLElement;
  if(disposed||target.closest('dialog,input,textarea,select,[contenteditable=true]')||!container.contains(target))return;
  if(event.code==='KeyP'&&!event.repeat){event.preventDefault();if(paused)context.setPaused?.(false);else if(overlay==='menu')play();else if(!overlay)show('menu');return;}
  if(!active())return;
  if(['ArrowLeft','ArrowRight','KeyA','KeyD','Space','ArrowUp','KeyW','ShiftLeft','ShiftRight','KeyX'].includes(event.code)){event.preventDefault();keys.add(event.code);if(!event.repeat){if(['Space','ArrowUp','KeyW'].includes(event.code))jumpQueued=true;if(['ShiftLeft','ShiftRight','KeyX'].includes(event.code))dashQueued=true;}}
  if(event.code==='KeyR'&&!event.repeat){event.preventDefault();retry();}
 },{signal});
 window.addEventListener('keyup',event=>{keys.delete(event.code);},{signal});
 for(const button of root.querySelectorAll<HTMLButtonElement>('[data-action]')){
  button.addEventListener('pointerdown',event=>{if(!active()||event.button!==0)return;event.preventDefault();button.setPointerCapture(event.pointerId);touches.set(event.pointerId,button.dataset.action!);if(button.dataset.action==='jump')jumpQueued=true;if(button.dataset.action==='dash')dashQueued=true;button.dataset.held='true';},{signal});
  const release=(event:PointerEvent)=>{touches.delete(event.pointerId);if(![...touches.values()].includes(button.dataset.action!))button.removeAttribute('data-held');};
  button.addEventListener('pointerup',release,{signal});button.addEventListener('pointercancel',release,{signal});button.addEventListener('lostpointercapture',release,{signal});
 }
 window.addEventListener('blur',()=>{resetInput();if(!overlay){show('menu');save();}},{signal});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){resetInput();if(!overlay)show('menu');save();}},{signal});
 root.addEventListener('pointerdown',()=>music.unlock(),{signal});
 root.addEventListener('keydown',()=>music.unlock(),{signal});
 const resize=new ResizeObserver(()=>{const rect=root.getBoundingClientRect();if(rect.width&&rect.height){scene.resize(rect.width,rect.height);paint();}});resize.observe(root);
 report();show('intro');
 const instance:GameInstance={
  openMenu(){if(!overlay){show('menu');save();}else show(run.phase==='cleared'?'clear':run.phase==='complete'?'complete':'menu');},
  dismissMenu(){if(overlay==='menu'){play();return true;}if(overlay==='help'||overlay==='confirm'){show(returnTo);return true;}return false;},
  pause(){paused=true;stop();save();paint();},resume(){paused=false;paint();schedule();},
  restart(){if(run.phase!=='playing'||overlay==='intro'||overlay==='continue')return false;retry();if(overlay)show(null);return false;},
  serialize:()=>serialize(run),
  restore(value){const restored=restore(value);if(!restored)return;music.reset();run=restored;previousSecond=-1;report();show(run.phase==='complete'?'complete':run.phase==='cleared'?'clear':'continue');},
  dispose(){disposed=true;stop();music.dispose();abort.abort();resize.disconnect();hud.dispose();root.remove();},
 };
 return instance;
}
const game:GameModule={id:'last-light',title:'Last Light',cover:'game-art/last-light/cover.svg',rules:'An original pixel-art platformer: carry a lantern through 40 linear stages across five worlds. A/D or arrow keys run. Space, W or Up jumps; hold for height. Shift or X dashes once until landing, and blue crystals refill it. Jump against a wall to wall jump. R returns to your checkpoint (+1 death), P pauses. Touch controls support moving, jumping and dashing together. Flags save your place; collect keys to open gates. Watch moving platforms, cracked floors, springs, belts, ice, saws and pulsing lasers. Progress saves automatically. Leaderboards rank cleared stages first, then collected sparks, time and deaths. Log in to share your best.',mount};
export default game;
