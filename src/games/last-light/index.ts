import type {GameModule,GameContext,GameInstance} from '../../core/types';
import {LEVELS,LEVEL_COUNT,WORLDS} from './levels';
import {createRun,step,nextStage,respawn,serialize,restore,formatTime,nearby,STEP,type Input} from './model';
import {CHAPTERS,GOAL_LABELS,ENDINGS,speakerFor,memoryFor} from './story';
import {Scene} from './render';
import {LanternMusic} from './music';
import {christmas} from '../../festive/festive';
import {mountCompactHud} from '../../ui/game-controls-adapter';
import './style.css';
type Overlay='intro'|'continue'|'clear'|'complete'|'choice'|'menu'|'help'|'confirm'|'map'|'journal'|null;
function mount(container:HTMLElement,context:GameContext):GameInstance {
 const root=document.createElement('section');root.className='ll-game';root.setAttribute('aria-label','Last Light platformer');
 root.innerHTML=`<canvas class="ll-canvas" tabindex="0" role="application" aria-label="Last Light. Arrows or A D to run, Space to jump, Shift or X to dash, E to interact, M for map, J for journal." aria-describedby="ll-help"></canvas>
 <div class="ll-hud"><div class="ll-top"><div class="ll-location"><span class="ll-world"></span><strong class="ll-stage"></strong></div><div class="ll-stats"><span title="Memory sparks">✦ <b class="ll-sparks">0</b></span><span title="Setbacks">↻ <b class="ll-deaths">0</b></span><span class="ll-time">0:00</span></div></div>
 <div class="ll-progress" aria-hidden="true"><i></i></div><div class="ll-quest"><span class="ll-objective"></span><span class="ll-task-progress"></span></div>
 <nav class="ll-tools" aria-label="Journey tools"><button data-ui="map">Map <kbd>M</kbd></button><button data-ui="journal">Journal <kbd>J</kbd></button></nav></div>
 <p class="ll-prompt"></p><p class="ll-notice" role="status"></p>
 <aside class="ll-dialogue" hidden aria-label="Conversation"><div><strong class="ll-speaker"></strong><button data-ui="dismiss" aria-label="Dismiss conversation">×</button></div><p></p><small class="ll-dialogue-hint">PAUSED · MOVE TO CONTINUE</small></aside>
 <div class="ll-cinematic" hidden><span></span><p></p><small>SPACE / E TO CONTINUE</small></div>
 <div class="ll-touch" role="group" aria-label="Game controls"><div><button data-action="left" aria-label="Move left">←</button><button data-action="right" aria-label="Move right">→</button></div><div><button data-action="interact" aria-label="Interact">✦<small>HELP</small></button><button data-action="dash" aria-label="Dash">⇢<small>DASH</small></button><button data-action="jump" aria-label="Jump">↑<small>JUMP</small></button></div></div>
 <div class="ll-overlay"><div class="ll-card"></div></div><p id="ll-help" class="sr-only">Find alternate routes and restore the city. E talks to people and activates nearby lamps, wheels and bells. Help people and lead them to safety. Map: M. Journal: J. Hold jump for height. Dash once in the air; landing refills it. Jump while touching a wall to wall jump. Flags save your place. P pauses. R returns to the checkpoint and counts a setback.</p>`;
 container.append(root);
 const q=<T extends Element>(selector:string)=>root.querySelector<T>(selector)!;
 const canvas=q<HTMLCanvasElement>('.ll-canvas'),card=q<HTMLElement>('.ll-card'),layer=q<HTMLElement>('.ll-overlay');
 const music=new LanternMusic(),scene=new Scene(canvas),hud=mountCompactHud(container),abort=new AbortController(),{signal}=abort;
 let run=createRun(),overlay:Overlay='intro',paused=false,disposed=false,frame=0,last=0,acc=0,noticeUntil=0,dialogueUntil=0,dialogueBlocking=false,previousHud='',previousSecond=-1;
 const keys=new Set<string>(),touches=new Map<number,string>();let jumpQueued=false,dashQueued=false,interactQueued=false;
 const touchMode=()=>matchMedia('(any-pointer: coarse)').matches;
 const instructions=(text:string)=>touchMode()?text.replace(/A \/ D runs/g,'Hold ← or → to run').replace(/hold Space to jump/g,'hold JUMP to jump').replace(/\bE\b/g,'HELP').replace(/\bSpace\b/g,'JUMP').replace(/\bShift\b/g,'DASH'):text;
 const reduced=()=>context.settings.reducedMotion||matchMedia('(prefers-reduced-motion: reduce)').matches;
 const resetInput=()=>{keys.clear();touches.clear();jumpQueued=false;dashQueued=false;interactQueued=false;root.querySelectorAll('[data-held]').forEach(b=>b.removeAttribute('data-held'));run.previousJump=false;run.previousDash=false;run.previousInteract=false;};
 const input=():Input=>{
  const actions=new Set(touches.values()),left=actions.has('left')||keys.has('ArrowLeft')||keys.has('KeyA'),right=actions.has('right')||keys.has('ArrowRight')||keys.has('KeyD');
  return {move:Number(right)-Number(left),jump:jumpQueued||actions.has('jump')||['Space','ArrowUp','KeyW'].some(k=>keys.has(k)),dash:dashQueued||actions.has('dash')||['ShiftLeft','ShiftRight','KeyX'].some(k=>keys.has(k)),interact:interactQueued||actions.has('interact')||keys.has('KeyE')};
 };
 const active=()=>!paused&&!overlay&&!disposed&&!document.hidden;
 function stop(){if(frame)cancelAnimationFrame(frame);frame=0;last=0;acc=0;resetInput();}
 function schedule(){if(!frame&&active())frame=requestAnimationFrame(loop);}
 function save(){context.save(serialize(run));}
 function notice(message:string){q<HTMLElement>('.ll-notice').textContent=instructions(message);noticeUntil=run.clock+7;context.announce(message);}
 function dialogue(message:string,blocking=false){
  dialogueBlocking=blocking;q<HTMLElement>('.ll-dialogue-hint').textContent=blocking?'PAUSED · MOVE TO CONTINUE':'SAVED IN JOURNAL · MOVE TO DISMISS';
  const colon=message.indexOf(':');q<HTMLElement>('.ll-speaker').textContent=colon>0&&colon<28?message.slice(0,colon):'A memory of Mira';
  q<HTMLElement>('.ll-dialogue p').textContent=colon>0&&colon<28?message.slice(colon+1).trim():message;
  q<HTMLElement>('.ll-dialogue').hidden=false;dialogueUntil=run.clock+Math.max(12,message.length/12);context.announce(message);
 }
 function paint(){
  if(disposed)return;scene.draw(run,reduced());music.sync(active()&&run.phase==='playing',context.settings.sound&&!christmas());
  root.dataset.reducedMotion=String(reduced());root.dataset.phase=run.phase;root.dataset.stage=String(run.stage+1);root.dataset.overlay=overlay??'none';root.dataset.paused=String(paused);root.dataset.cinematic=String(run.cinematic>0);
  if(import.meta.env.DEV){root.dataset.x=run.x.toFixed(2);root.dataset.y=run.y.toFixed(2);root.dataset.ground=String(run.ground);root.dataset.dash=String(run.dashReady);root.dataset.elapsed=String(Math.floor(run.time));root.dataset.activated=run.activated.join(',');}
  const level=LEVELS[run.stage],theme=WORLDS[level.world];root.style.setProperty('--ll-accent',theme.accent);
  const text=`${run.stage+1} / ${LEVEL_COUNT} · ${run.best.toLocaleString()} pts`;
  if(text!==previousHud){previousHud=text;hud.set(text,`Chapter ${run.stage+1} of ${LEVEL_COUNT}. ${run.best} points`);}
  q<HTMLElement>('.ll-world').textContent=`${String(level.world+1).padStart(2,'0')} / ${theme.name}`;
  q<HTMLElement>('.ll-stage').textContent=level.name;
  q<HTMLElement>('.ll-sparks').textContent=String(run.sparks);q<HTMLElement>('.ll-deaths').textContent=String(run.deaths);
  q<HTMLElement>('.ll-objective').textContent=GOAL_LABELS[level.goal];q<HTMLElement>('.ll-task-progress').textContent=level.stations.length?`${run.activated.length}/${level.stations.length}`:'';
  q<HTMLElement>('.ll-prompt').textContent=run.phase==='playing'?instructions(nearby(run)):'';
  const second=Math.floor(run.time/1000);if(second!==previousSecond){previousSecond=second;q<HTMLElement>('.ll-time').textContent=formatTime(run.time);}
  q<HTMLElement>('.ll-progress i').style.width=`${100*run.cleared/LEVEL_COUNT}%`;
  if(noticeUntil&&run.clock>noticeUntil){q<HTMLElement>('.ll-notice').textContent='';noticeUntil=0;}
  if(dialogueUntil&&run.clock>dialogueUntil){q<HTMLElement>('.ll-dialogue').hidden=true;dialogueUntil=0;}
  const cinematic=q<HTMLElement>('.ll-cinematic');cinematic.hidden=run.cinematic<=0;
  q<HTMLElement>('.ll-cinematic small').textContent=touchMode()?'TAP AN ACTION TO CONTINUE':'SPACE / E TO CONTINUE';
  if(run.cinematic>0){q<HTMLElement>('.ll-cinematic span').textContent=CHAPTERS[run.stage].outcome;q<HTMLElement>('.ll-cinematic p').textContent=CHAPTERS[run.stage].after;}
 }
 function mapHtml(){
  const l=LEVELS[run.stage],minY=Math.min(-60,...l.platforms.map(p=>p.y-80));
  return `<svg class="ll-map" viewBox="0 ${minY} ${l.width} ${l.height-minY}" role="img" aria-label="Map showing alternate routes, connections, exit and your position">${l.platforms.map(p=>`<rect x="${p.x}" y="${p.y}" width="${p.w}" height="16" fill="${p.branch?'#8299a0':'#d4c8a4'}"/>`).join('')}${l.stations.map(p=>`<circle cx="${p.x}" cy="${p.y-30}" r="17" fill="${run.activated.includes(p.id)?'#c2d99a':'#dc9e7b'}"/><text x="${p.x}" y="${p.y-20}" text-anchor="middle" font-size="27" fill="#182330">${p.id+1}</text>`).join('')}<path d="M${l.exit.x} ${l.exit.y}v44h30v-44z" fill="#f3c77a"/><circle cx="${run.x+8}" cy="${run.y+12}" r="15" fill="#91d8e2"/></svg>`;
 }
 const button=(action:string,label:string,secondary=false)=>`<button class="ll-button${secondary?' ll-secondary':''}" data-do="${action}">${label}</button>`;
 const eyebrow=(text:string)=>`<p class="ll-eyebrow">${text}</p>`;
 function show(next:Overlay){
  if(next==='complete'&&!run.ending)next='choice';
  overlay=next;stop();layer.hidden=!next;canvas.tabIndex=next?-1:0;q<HTMLElement>('.ll-dialogue').hidden=true;
  if(!next){card.replaceChildren();paint();schedule();canvas.focus({preventScroll:true});return;}
  const level=LEVELS[run.stage],chapter=CHAPTERS[run.stage];let html='';
  if(next==='intro')html=`${eyebrow('A CITY TO FIND YOUR WAY THROUGH')}<h1><span class="sr-only">Last Light</span><img src="${import.meta.env.BASE_URL}game-art/last-light/title.svg" alt="" width="190" height="130"></h1><p class="ll-story">Mira didn’t come home.<br>She left you a lantern.<br>And a city full of people waiting.</p><p class="ll-description">Forty places. Hidden paths. Lives to reconnect.<br>Follow her trail. Decide what dawn means.</p>${button('play','Carry the light →')}${button('help','How to play',true)}<p class="ll-footnote">RUN · EXPLORE · LISTEN · LEAVE A LIGHT ON</p>`;
  if(next==='continue')html=`${eyebrow('YOUR LIGHT IS STILL HERE')}<h2>Welcome back.</h2><p>Chapter ${run.stage+1} · ${level.name}<br>${run.cleared} chapters restored · ${run.best.toLocaleString()} points</p><p class="ll-small">${instructions(chapter.task)}</p>${button('play','Continue the journey →')}${button('help','Controls',true)}${button('confirm','Start a new run',true)}`;
  if(next==='clear'||next==='complete'){
   const ending=run.ending?ENDINGS[run.ending]:null;
   html=`${eyebrow(next==='complete'?'40 / 40 · A WAY HOME':`${String(run.stage+1).padStart(2,'0')} / 40 · ${WORLDS[level.world].name}`)}<h2>${next==='complete'?ending!.title:chapter.outcome}</h2><p class="ll-story">${next==='complete'?ending!.text:chapter.after}</p><div class="ll-results"><span>MEMORIES<strong>${run.collected.filter(id=>id<3).length}/3</strong></span><span>CHAPTER TIME<strong>${formatTime(run.stageTime)}</strong></span><span>POINTS<strong>${run.best.toLocaleString()}</strong></span></div><details class="ll-score-breakdown"><summary>Where your points came from</summary><p>${run.cleared} chapters × 1,000 = ${(run.cleared*1000).toLocaleString()}<br>${run.sparks} sparks × 100 = ${(run.sparks*100).toLocaleString()}<br>Journey pace bonus = ${Math.max(0,run.best-run.cleared*1000-run.sparks*100).toLocaleString()}<br>Each chapter banks its own bonus: up to 250, −2 per active second, −25 per setback. Previously earned points stay yours.</p></details>${next==='clear'?button('next','Next chapter →'):button('confirm','Start another journey →')}${button('journal','Read the journal',true)}${button('rankings','View leaderboard',true)}`;
  }
  if(next==='choice')html=`${eyebrow('THE LAST LANTERN')}<h2>What do we<br>leave alight?</h2><p class="ll-story">Mira stands beside you. Below, the people you helped hold their windows open.</p><p>Share the flame with every district now, or bring it home and let neighbour light neighbour.</p>${button('share','Share the flame →')}${button('home','Carry it home →',true)}<p class="ll-small">Both roads lead home. The last page is yours.</p>`;
  if(next==='menu')html=`${eyebrow('TAKE A BREATHER')}<h2>The light can wait.</h2><p>Chapter ${run.stage+1} · ${level.name}</p>${button('play','Back to the journey →')}${button('map','Map & objectives',true)}${button('journal','Mira’s journal',true)}${button('help','How to play',true)}${button('rankings','Leaderboard',true)}${button('confirm','Start a new run',true)}`;
  if(next==='map')html=`${eyebrow('FIND YOUR OWN WAY')}<h2>${level.name}</h2><p class="ll-small">${instructions(chapter.task)}</p>${mapHtml()}<p class="ll-map-key">Blue: you · Gold: exit · Salmon: unfinished connection<br>Grey ledges are alternate routes. Sparks are optional.</p><ol class="ll-connections">${level.stations.map(p=>`<li>${run.activated.includes(p.id)?'✓':'○'} ${p.label}</li>`).join('')||'<li>Reach the open shelter.</li>'}</ol>${button('back','Back to the journey →')}`;
  if(next==='journal'){
   const pages=CHAPTERS.map((c,i)=>({c,i,found:run.memories.filter(id=>Math.floor(id/3)===i)})).filter(p=>p.found.length||run.heard.includes(p.i)||p.i<run.cleared);
   html=`${eyebrow(`${run.memories.length} FRAGMENTS · ${run.heard.length} CONVERSATIONS`)}<h2>The things<br>we carry.</h2><p class="ll-small">Mira’s trail, and the people you met along the way.</p><div class="ll-journal" tabindex="0" aria-label="Journal entries">${pages.length?pages.map(({c,i,found})=>`<article><h3>${String(i+1).padStart(2,'0')} · ${c.name}</h3>${run.heard.includes(i)?`<p><strong>${speakerFor(i)}</strong> — ${c.line}</p>`:''}${found.map(id=>`<p class="ll-memory">✦ ${id%3+1}/3 · ${memoryFor(i,id%3)}</p>`).join('')}${i<run.cleared?`<p>${c.after}</p>`:''}</article>`).join(''):'<p>Talk to someone with E, or follow a hidden path to find a memory spark. Your discoveries will stay here.</p>'}</div>${button('back','Back →')}`;
  }
  if(next==='help')html=`${eyebrow('SMALL COURIER. MANY ROADS.')}<h2>Find your footing.</h2><dl class="ll-controls-list"><dt>← → / A D</dt><dd>Run</dd><dt>Space / ↑ / W</dt><dd>Jump · hold for height</dd><dt>Shift / X</dt><dd>Air dash · land to recharge</dd><dt>E</dt><dd>Talk · help · turn · light</dd><dt>M / J</dt><dd>Map / journal</dd><dt>Jump at a wall</dt><dd>Kick away from it</dd><dt>R / P</dt><dd>Retry checkpoint / pause</dd></dl><p class="ll-small">Every place has its own task. Explore the blue-grey side paths for memory sparks. Cracking floors shed dust before they break; watch falling pieces and the rebuilding outline. Springs launch, belts push, ice slides; steam and light barriers pulse. In escape chapters the dark follows, so keep moving.</p><p class="ll-small">1,000 points per chapter, 100 per spark, up to 250 per chapter in pace bonuses. On touch screens, hold movement and action buttons together.</p>${button('back','Got it →')}`;
  if(next==='confirm')html=`${eyebrow('A FRESH START')}<h2>Begin again?</h2><p>This replaces your current journey and journal. Your personal best stays saved.</p>${button('fresh','Start new run')}${button('back','Keep this journey',true)}`;
  card.innerHTML=html;layer.scrollTop=0;paint();queueMicrotask(()=>{if(!disposed&&overlay===next)card.querySelector<HTMLButtonElement>('button')?.focus({preventScroll:true});});
 }
 function report(){context.setLevel(`Chapter ${run.stage+1} / ${LEVEL_COUNT}`);context.setScore(run.best);}
 function loop(now:number){
  frame=0;if(!active())return;
  const controls=input();
  if(!q<HTMLElement>('.ll-dialogue').hidden){
   if(controls.move||controls.jump||controls.dash)q<HTMLElement>('.ll-dialogue').hidden=true;
   else if(dialogueBlocking){last=0;acc=0;paint();schedule();return;}
  }
  const interval=last?Math.max(0,(now-last)/1000):0,simulated=Math.min(interval,.1);
  if(run.phase==='playing'){run.time+=(interval-simulated)*1000;run.stageTime+=(interval-simulated)*1000;}acc+=simulated;last=now;
  while(acc>=STEP&&active()){
   acc-=STEP;const events=step(run,controls);scene.step(run,events,STEP);jumpQueued=false;dashQueued=false;interactQueued=false;
   if(events.jump||events.dash||events.pickup)context.sound('tap');
   if(events.message){if(events.message.length>70||events.interact)dialogue(events.message,!!events.interact);else notice(events.message);}
   if(events.interact||events.pickup)save();
   if(events.checkpoint){notice('A place to return to. Checkpoint saved.');save();context.sound('success');}
   if(events.death){notice(LEVELS[run.stage].goal==='escape'?'The dark caught up. Take the other route, or dash ahead.':'The light is safe. Find another way.');q<HTMLElement>('.ll-dialogue').hidden=true;context.sound('lose');save();}
   if(events.clear){q<HTMLElement>('.ll-dialogue').hidden=true;context.sound('success');report();save();context.announce(CHAPTERS[run.stage].after);context.setStatus(run.phase==='complete'?'Run finished. A way home.':CHAPTERS[run.stage].outcome);}
   if(run.phase!=='playing'&&run.cinematic<=0)show(run.phase==='complete'?'complete':'clear');
   if(dialogueBlocking&&!q<HTMLElement>('.ll-dialogue').hidden)break;
  }
  paint();schedule();
 }
 function play(){
  if(run.phase==='cleared'){show('clear');return;}if(run.phase==='complete'){show('complete');return;}
  show(null);notice(LEVELS[run.stage].hint);context.setStatus(LEVELS[run.stage].hint);report();
 }
 function retry(){if(run.phase!=='playing')return;q<HTMLElement>('.ll-dialogue').hidden=true;respawn(run);resetInput();notice('Back to the checkpoint. Your discoveries are safe.');save();paint();}
 let returnTo:Overlay='intro';
 function openTool(next:'map'|'journal'){returnTo=overlay;show(next);}
 root.addEventListener('click',event=>{const action=(event.target as Element).closest<HTMLElement>('[data-ui]')?.dataset.ui;if(!action||paused)return;if(action==='dismiss'){q<HTMLElement>('.ll-dialogue').hidden=true;canvas.focus();}else if(action==='map'||action==='journal')openTool(action);},{signal});
 card.addEventListener('click',event=>{
  const action=(event.target as Element).closest<HTMLElement>('[data-do]')?.dataset.do;if(!action||paused)return;
  if(action==='play')play();
  else if(action==='next'){if(nextStage(run)){save();report();play();}}
  else if(action==='help'||action==='confirm'){returnTo=overlay;show(action==='help'?'help':'confirm');}
  else if(action==='map'||action==='journal')openTool(action);
  else if(action==='back'){show(returnTo);}
  else if(action==='fresh'){music.reset();run=createRun();previousSecond=-1;save();report();play();}
  else if(action==='rankings')context.openRankings?.('last-light');
  else if(action==='share'||action==='home'){run.ending=action;save();show('complete');}
 },{signal});
 window.addEventListener('keydown',event=>{
  const target=event.target as HTMLElement;
  if(disposed||target.closest('dialog,input,textarea,select,[contenteditable=true]')||!container.contains(target))return;
  if(event.code==='KeyP'&&!event.repeat){event.preventDefault();if(paused)context.setPaused?.(false);else if(overlay==='menu')play();else if(!overlay)show('menu');return;}
  if(['KeyM','KeyJ'].includes(event.code)&&!event.repeat&&!paused){event.preventDefault();const next=event.code==='KeyM'?'map':'journal';if(overlay===next)show(returnTo);else if(!overlay||overlay==='menu')openTool(next);return;}
  if(!active())return;
  if(run.phase!=='playing'&&['Space','KeyE'].includes(event.code)){event.preventDefault();run.cinematic=0;show(run.phase==='complete'?'complete':'clear');return;}
  if(['ArrowLeft','ArrowRight','KeyA','KeyD','Space','ArrowUp','KeyW','ShiftLeft','ShiftRight','KeyX','KeyE'].includes(event.code)){event.preventDefault();keys.add(event.code);if(!event.repeat){if(['Space','ArrowUp','KeyW'].includes(event.code))jumpQueued=true;if(['ShiftLeft','ShiftRight','KeyX'].includes(event.code))dashQueued=true;if(event.code==='KeyE')interactQueued=true;}}
  if(event.code==='KeyR'&&!event.repeat){event.preventDefault();retry();}
 },{signal});
 window.addEventListener('keyup',event=>{keys.delete(event.code);},{signal});
 for(const b of root.querySelectorAll<HTMLButtonElement>('[data-action]')){
  b.addEventListener('pointerdown',event=>{if(!active()||event.button!==0)return;event.preventDefault();if(run.phase!=='playing'){run.cinematic=0;show(run.phase==='complete'?'complete':'clear');return;}b.setPointerCapture(event.pointerId);touches.set(event.pointerId,b.dataset.action!);if(b.dataset.action==='jump')jumpQueued=true;if(b.dataset.action==='dash')dashQueued=true;if(b.dataset.action==='interact')interactQueued=true;b.dataset.held='true';},{signal});
  const release=(event:PointerEvent)=>{touches.delete(event.pointerId);if(![...touches.values()].includes(b.dataset.action!))b.removeAttribute('data-held');};
  b.addEventListener('pointerup',release,{signal});b.addEventListener('pointercancel',release,{signal});b.addEventListener('lostpointercapture',release,{signal});
 }
 window.addEventListener('blur',()=>{resetInput();if(!overlay){show('menu');save();}},{signal});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){resetInput();if(!overlay)show('menu');save();}},{signal});
 root.addEventListener('pointerdown',()=>music.unlock(),{signal});root.addEventListener('keydown',()=>music.unlock(),{signal});
 const resize=new ResizeObserver(()=>{
  const header=q<HTMLElement>('.ll-hud').getBoundingClientRect(),bounds=root.getBoundingClientRect();
  root.style.setProperty('--ll-scene-top',`${Math.ceil(header.bottom-bounds.top+6)}px`);
  const r=canvas.getBoundingClientRect();if(r.width&&r.height){scene.resize(r.width,r.height);paint();}
 });resize.observe(root);resize.observe(q('.ll-hud'));resize.observe(canvas);
 report();show('intro');
 return {
  openMenu(){if(!overlay){show('menu');save();}else show(run.phase==='cleared'?'clear':run.phase==='complete'?'complete':'menu');},
  dismissMenu(){if(['menu','help','confirm','map','journal'].includes(overlay??'')){if(overlay==='menu')play();else show(returnTo);return true;}return false;},
  pause(){paused=true;stop();save();paint();},resume(){paused=false;paint();schedule();},
  restart(){if(run.phase!=='playing'||overlay==='intro'||overlay==='continue')return false;retry();if(overlay)show(null);return false;},
  serialize:()=>serialize(run),restore(value){const restored=restore(value);if(!restored)return;music.reset();run=restored;previousSecond=-1;report();show(run.phase==='complete'?'complete':run.phase==='cleared'?'clear':'continue');},
  dispose(){disposed=true;stop();music.dispose();abort.abort();resize.disconnect();hud.dispose();root.remove();},
 };
}
const game:GameModule={id:'last-light',title:'Last Light',cover:'game-art/last-light/cover.svg',rules:'Find your missing sister through forty places across five districts. Explore rooftop branches, underground passages, looping gardens and vertical towers. Each chapter has its own task: help and escort people, reconnect lamps, release pumps, catch ferries or escape the pursuing dark. A/D or arrows run; hold Space, W or Up to jump higher. Shift or X air dashes; landing refills it. Jump at walls to kick away. E talks and interacts; M opens the map, J the journal, P pauses, R retries the checkpoint (+1 setback). Touch buttons can be held together. Optional memory sparks reveal Mira’s story. Cracked floors warn, break into falling pieces and rebuild. All discoveries persist through setbacks. 1,000 points per chapter, 100 per spark, plus a pace bonus of up to 250 per chapter, reduced by 2 per active second and 25 per setback. At the final lantern, choose how to bring the dawn home.',mount};
export default game;
