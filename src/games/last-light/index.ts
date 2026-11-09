import type {GameModule,GameContext,GameInstance} from '../../core/types';
import {LEVELS,LEVEL_COUNT,WORLDS} from './levels';
import {createRun,step,nextStage,respawn,serialize,restore,formatTime,nearby,checkpointsFor,checkpointIndexFor,escapeLead,STEP,type Input} from './model';
import {CHAPTERS,ENDINGS,speakerFor,memoryFor} from './story';
import {missionGuidance} from './guidance';
import {Scene} from './render';
import {LanternMusic} from './music';
import {christmas} from '../../festive/festive';
import {mountCompactHud} from '../../ui/game-controls-adapter';
import './style.css';
type Overlay='intro'|'continue'|'clear'|'complete'|'choice'|'menu'|'help'|'confirm'|'journal'|null;
function mount(container:HTMLElement,context:GameContext):GameInstance {
 const root=document.createElement('section');root.className='ll-game';root.setAttribute('aria-label','Last Light platformer');
 root.innerHTML=`<canvas class="ll-canvas" tabindex="0" role="application" aria-label="Last Light. Left and Right arrows run, Up jumps, Right Shift dashes, Enter to interact, Delete to pause, End to retry, Page Down for journal." aria-describedby="ll-help"></canvas>
 <div class="ll-hud"><strong class="ll-stage"></strong><div class="ll-stats"><span class="ll-spark-stat" title="Memory sparks">✦ <b class="ll-sparks">0</b></span><span title="Setbacks">↻ <b class="ll-deaths">0</b></span><span class="ll-time">0:00</span></div><span class="ll-task-progress" hidden></span></div>
 <button class="ll-prompt" data-ui="interact" hidden></button><p class="ll-notice" role="status"></p>
 <aside class="ll-dialogue" hidden aria-label="Conversation"><div><strong class="ll-speaker"></strong><button data-ui="dismiss" aria-label="Dismiss conversation">×</button></div><p></p><small class="ll-dialogue-hint">PAUSED · MOVE TO CONTINUE</small></aside>
 <div class="ll-cinematic" hidden><span></span><p></p><small>SPACE / E TO CONTINUE</small></div>
 <div class="ll-touch" role="group" aria-label="Game controls"><div><button data-action="left" aria-label="Move left">←</button><button data-action="right" aria-label="Move right">→</button></div><div><button data-action="dash" aria-label="Dash">⇢<small>DASH</small></button><button data-action="jump" aria-label="Jump">↑<small>JUMP</small></button></div></div>
 <div class="ll-overlay"><div class="ll-card"></div></div><p id="ll-help" class="sr-only">Reach the exit in every level. Conversations, memories and machinery are optional. Enter or E interacts when a prompt appears. Journal: Page Down or J. Hold jump for height. Dash once in the air; landing refills it. Jump while touching a wall to wall jump. Flags save your place. Delete or P pauses. End or R returns to the checkpoint and counts a setback.</p>`;
 container.append(root);
 const q=<T extends Element>(selector:string)=>(root.querySelector<T>(selector)??hudContent.querySelector<T>(selector))!;
 const canvas=q<HTMLCanvasElement>('.ll-canvas'),card=q<HTMLElement>('.ll-card'),layer=q<HTMLElement>('.ll-overlay');
 const music=new LanternMusic(),scene=new Scene(canvas),hud=mountCompactHud(container),abort=new AbortController(),{signal}=abort;
 const hudContent=root.querySelector<HTMLElement>('.ll-hud')!,dock=container.closest('.game-view')!.querySelector<HTMLElement>('.game-dock')!;
 const levelLabel=document.createElement('span'),scoreLabel=document.createElement('span');scoreLabel.className='ll-score';hud.element.replaceChildren(levelLabel,scoreLabel);hud.element.after(hudContent);
 const text=(el:HTMLElement,value:string)=>{if(el.textContent!==value)el.textContent=value;};
 const data=(key:string,value:string)=>{if(root.dataset[key]!==value)root.dataset[key]=value;};
 let run=createRun(),overlay:Overlay='intro',paused=false,disposed=false,frame=0,last=0,acc=0,noticeUntil=0,dialogueUntil=0,dialogueBlocking=false,previousHud='',previousSecond=-1,previousSector='';
 const keys=new Set<string>(),touches=new Map<number,string>();let jumpQueued=false,dashQueued=false,interactQueued=false;
 const touchMode=()=>matchMedia('(any-pointer: coarse)').matches;
 const instructions=(text:string)=>touchMode()?text.replace(/Arrows move; hold Up to jump/g,'Hold ← or → to run; hold JUMP to jump').replace(/Tap Up/g,'Tap JUMP').replace(/Right Shift/g,'DASH').replace(/A \/ D runs/g,'Hold ← or → to run').replace(/hold Space to jump/g,'hold JUMP to jump').replace(/\bE\b/g,'Tap').replace(/\bSpace\b/g,'JUMP').replace(/\bShift\b/g,'DASH').replace(/\bX\b/g,'DASH'):text.replace(/\bSpace\b/g,'↑').replace(/\bX\b/g,'Right Shift').replace(/\bE\b/g,'Enter');
 const reduced=()=>context.settings.reducedMotion||matchMedia('(prefers-reduced-motion: reduce)').matches;
 const resetInput=()=>{keys.clear();touches.clear();jumpQueued=false;dashQueued=false;interactQueued=false;root.querySelectorAll('[data-held]').forEach(b=>b.removeAttribute('data-held'));run.previousJump=false;run.previousDash=false;run.previousInteract=false;};
 const input=():Input=>{
  const actions=new Set(touches.values()),left=actions.has('left')||keys.has('ArrowLeft')||keys.has('KeyA'),right=actions.has('right')||keys.has('ArrowRight')||keys.has('KeyD');
  return {move:Number(right)-Number(left),jump:jumpQueued||actions.has('jump')||['Space','ArrowUp','KeyW'].some(k=>keys.has(k)),dash:dashQueued||actions.has('dash')||['ShiftLeft','ShiftRight','KeyX'].some(k=>keys.has(k)),interact:interactQueued||actions.has('interact')||keys.has('KeyE')||keys.has('Enter')};
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
  data('reducedMotion',String(reduced()));data('phase',run.phase);data('stage',String(run.stage+1));data('overlay',overlay??'none');data('paused',String(paused));data('cinematic',String(run.cinematic>0));data('death',String(scene.dying));
  if(import.meta.env.DEV){data('x',run.x.toFixed(2));data('y',run.y.toFixed(2));data('ground',String(run.ground));data('dash',String(run.dashReady));data('elapsed',String(Math.floor(run.time)));data('activated',run.activated.join(','));}
  const level=LEVELS[run.stage],theme=WORLDS[level.world];if(root.style.getPropertyValue('--ll-accent')!==theme.accent){root.style.setProperty('--ll-accent',theme.accent);hudContent.style.setProperty('--ll-accent',theme.accent);}
  const label=`${run.stage+1} / ${LEVEL_COUNT} · ${run.best.toLocaleString()} pts`;
  if(label!==previousHud){previousHud=label;text(levelLabel,`${run.stage+1} / ${LEVEL_COUNT}`);text(scoreLabel,` · ${run.best.toLocaleString()} pts`);hud.element.setAttribute('aria-label',`Level ${run.stage+1} of ${LEVEL_COUNT}. ${run.best} points`);}
  text(q<HTMLElement>('.ll-stage'),level.name);
  text(q<HTMLElement>('.ll-sparks'),String(run.sparks));text(q<HTMLElement>('.ll-deaths'),String(run.deaths));
  const progress=q<HTMLElement>('.ll-task-progress'),chase=level.goal==='escape'&&run.phase==='playing',lead=escapeLead(run);
  if(progress.hidden===chase)progress.hidden=!chase;text(progress,run.chasing?`Dark · ${Math.ceil(lead/10)} m`:'Escape');
  const danger=String(chase&&run.chasing&&lead<250);if(progress.dataset.danger!==danger)progress.dataset.danger=danger;
  data('chase',String(chase));hudContent.hidden=!!overlay;
  const prompt=q<HTMLButtonElement>('.ll-prompt');text(prompt,run.phase==='playing'?instructions(nearby(run)):'');if(prompt.hidden!==!prompt.textContent)prompt.hidden=!prompt.textContent;
  const second=Math.floor(run.time/1000);if(second!==previousSecond){previousSecond=second;text(q<HTMLElement>('.ll-time'),formatTime(run.time));}
  if(noticeUntil&&run.clock>noticeUntil){q<HTMLElement>('.ll-notice').textContent='';noticeUntil=0;}
  if(dialogueUntil&&run.clock>dialogueUntil){q<HTMLElement>('.ll-dialogue').hidden=true;dialogueUntil=0;}
  const cinematic=q<HTMLElement>('.ll-cinematic');if(cinematic.hidden!==(run.cinematic<=0))cinematic.hidden=run.cinematic<=0;
  text(q<HTMLElement>('.ll-cinematic small'),touchMode()?'TAP AN ACTION TO CONTINUE':'SPACE / E TO CONTINUE');
  if(run.cinematic>0){q<HTMLElement>('.ll-cinematic span').textContent=CHAPTERS[run.stage].outcome;q<HTMLElement>('.ll-cinematic p').textContent=CHAPTERS[run.stage].after;}
 }
 const button=(action:string,label:string,secondary=false)=>`<button class="ll-button${secondary?' ll-secondary':''}" data-do="${action}">${label}</button>`;
 const eyebrow=(text:string)=>`<p class="ll-eyebrow">${text}</p>`;
 function show(next:Overlay){

  overlay=next;stop();layer.hidden=!next;canvas.tabIndex=next?-1:0;q<HTMLElement>('.ll-dialogue').hidden=true;
  if(!next){card.replaceChildren();paint();schedule();canvas.focus({preventScroll:true});return;}
  const level=LEVELS[run.stage];let html='';
  if(next==='intro')html=`${eyebrow('A PRECISION PLATFORMER')}<h1><span class="sr-only">Last Light</span><img src="${import.meta.env.BASE_URL}game-art/last-light/title.svg" alt="" width="190" height="130"></h1><p class="ll-story">Forty levels. One goal.<br>Reach the exit.</p><p class="ll-description">${instructions('Arrows move; hold Up to jump.')}<br>${instructions('Tap Up for a short hop. Right Shift dashes.')}<br>Brake for small ledges. Flags save your place.</p>${button('play','Play →')}${button('help','How to play',true)}<details class="ll-score-breakdown"><summary>The story · optional</summary><p>Mira didn’t come home. She left you a lantern. Follow her trail through a city waiting for dawn. Conversations and hidden memories tell her story; none are required to finish a level.</p></details><p class="ll-footnote">PRECISION · MOMENTUM · TIMING</p>`;
  if(next==='continue')html=`${eyebrow('PICK UP WHERE YOU LEFT OFF')}<h2>Welcome back.</h2><p>Level ${run.stage+1} · ${level.name}<br>${run.cleared} levels cleared · ${run.best.toLocaleString()} points</p><p class="ll-map-objective"><strong>Objective</strong>Reach the exit</p>${button('play','Continue →')}${button('help','Controls',true)}${button('confirm','Start a new run',true)}`;
  if(next==='clear'||next==='complete'){
   const ending=run.ending?ENDINGS[run.ending]:null;
   html=`${eyebrow(next==='complete'?'40 / 40 · CAMPAIGN COMPLETE':`${String(run.stage+1).padStart(2,'0')} / 40 · ${WORLDS[level.world].name}`)}<h2>${next==='complete'?'All forty cleared.':'Level clear.'}</h2><div class="ll-results"><span>MEMORIES<strong>${run.collected.filter(id=>id<3).length}/3</strong></span><span>LEVEL TIME<strong>${formatTime(run.stageTime)}</strong></span><span>POINTS<strong>${run.best.toLocaleString()}</strong></span></div><details class="ll-score-breakdown"><summary>Where your points came from</summary><p>${run.cleared} levels × 1,000 = ${(run.cleared*1000).toLocaleString()}<br>${run.sparks} sparks × 100 = ${(run.sparks*100).toLocaleString()}<br>Pace bonus = ${Math.max(0,run.best-run.cleared*1000-run.sparks*100).toLocaleString()}<br>Each level banks its own bonus: up to 250, −2 per active second, −25 per setback. Previously earned points stay yours.</p></details>${next==='clear'?button('next','Next level →'):button('confirm','Start another run →')}${next==='complete'?button('ending','Read the story ending',true):''}${ending?`<details class="ll-score-breakdown"><summary>${ending.title}</summary><p>${ending.text}</p></details>`:''}${button('journal','Read the journal',true)}${button('rankings','View leaderboard',true)}`;
  }
  if(next==='choice')html=`${eyebrow('OPTIONAL · THE LAST PAGE')}<h2>What do we<br>leave alight?</h2><p class="ll-story">At the end of the city, Mira stands beside you. Below, windows wait for dawn.</p><p>Share the flame with every district now, or bring it home and let neighbour light neighbour.</p>${button('share','Share the flame →')}${button('home','Carry it home →',true)}${button('results','Back to results',true)}<p class="ll-small">Both roads lead home. Your campaign is already complete.</p>`;
  if(next==='menu')html=`${eyebrow('TAKE A BREATHER')}<h2>The light can wait.</h2><p>Level ${run.stage+1} · ${level.name}<br>${WORLDS[level.world].name} · ${missionGuidance(run).sector.name}</p><p class="ll-small">✦ ${run.sparks} memories · ↻ ${run.deaths} setbacks · ${formatTime(run.time)}<br>Checkpoint ${Math.max(0,checkpointIndexFor(run)+1)}/${checkpointsFor(level).length} · ${run.best.toLocaleString()} points</p>${button('play','Resume →')}${button('journal','Mira’s journal',true)}${button('help','How to play',true)}${button('rankings','Leaderboard',true)}${button('confirm','Start a new run',true)}`;
  if(next==='journal'){
   const pages=CHAPTERS.map((c,i)=>({c,i,found:run.memories.filter(id=>Math.floor(id/3)===i)})).filter(p=>p.found.length||run.heard.includes(p.i));
   html=`${eyebrow(`${run.memories.length} FRAGMENTS · ${run.heard.length} CONVERSATIONS`)}<h2>The things<br>we carry.</h2><p class="ll-small">Mira’s trail, and the people you met along the way.</p><div class="ll-journal" tabindex="0" aria-label="Journal entries">${pages.length?pages.map(({c,i,found})=>`<article><h3>${String(i+1).padStart(2,'0')} · ${c.name}</h3>${run.heard.includes(i)?`<p><strong>${speakerFor(i)}</strong> — ${c.line}</p>`:''}${found.map(id=>`<p class="ll-memory">✦ ${id%3+1}/3 · ${memoryFor(i,id%3)}</p>`).join('')}</article>`).join(''):'<p>Talk to someone with E, or follow a hidden path to find a memory spark. Your discoveries will stay here.</p>'}</div>${button('back','Back →')}`;
  }
  if(next==='help'){
   const controls=touchMode()?'<dt>← →</dt><dd>Run · hold a direction</dd><dt>JUMP</dt><dd>Hold for height</dd><dt>DASH</dt><dd>Air dash · land to recharge</dd><dt>Prompt</dt><dd>Tap to interact · optional</dd><dt>Journal</dt><dd>Open Menu, then Mira’s journal</dd><dt>Jump at a wall</dt><dd>Kick away from it</dd>':'<dt>← → / A D</dt><dd>Run</dd><dt>Space / ↑ / W</dt><dd>Jump · hold for height</dd><dt>Right Shift / X</dt><dd>Air dash · land to recharge</dd><dt>Enter / E</dt><dd>Interact · optional</dd><dt>Page Down / J</dt><dd>Journal</dd><dt>Jump at a wall</dt><dd>Kick away from it</dd><dt>End / Delete</dt><dd>Retry checkpoint / pause</dd><dt>Menu arrows / Enter</dt><dd>Select / confirm</dd>';
   html=`${eyebrow('SMALL COURIER. MANY ROADS.')}<h2>Find your footing.</h2><dl class="ll-controls-list">${controls}</dl><p class="ll-small">${instructions('Reach the gold exit. Hold jump for height, tap for short hops, and release direction to brake onto narrow ledges. Dash once per landing. Flags save your place. Conversations, side paths and machinery are optional; a wheel shuts down its nearby steam line.')}</p><p class="ll-small">Cracked floors shake, fracture and fall. Springs launch, belts push, ice slides. Vent grates warn amber before steam erupts; electrical gates pulse between their mounted emitters. In escape chapters the dark follows, so reach the shelter without stopping for switches.</p><p class="ll-small">1,000 points per chapter, 100 per spark, up to 250 per chapter in pace bonuses. On touch screens, hold movement and action buttons together.</p>${button('back','Got it →')}`;
  }
  if(next==='confirm')html=`${eyebrow('A FRESH START')}<h2>Begin again?</h2><p>This replaces your current journey and journal. Your personal best stays saved.</p>${button('fresh','Start new run')}${button('back','Keep this journey',true)}`;
  card.innerHTML=html;layer.scrollTop=0;paint();queueMicrotask(()=>{
   if(disposed||overlay!==next)return;
   card.querySelector<HTMLButtonElement>('button')?.focus({preventScroll:true});

  });
 }
 function report(){context.setLevel(`Level ${run.stage+1} / ${LEVEL_COUNT}`);context.setScore(run.best);}
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
   if(events.message){
    if(events.pickup)notice('Memory saved · J to read');
    else if(events.interact&&events.message.includes(':'))dialogue(events.message,true);
    else notice(events.message);
   }
   if(events.interact||events.pickup)save();
   if(events.checkpoint){notice(`Checkpoint ${checkpointIndexFor(run)+1}/${checkpointsFor(LEVELS[run.stage]).length} saved · ${missionGuidance(run).sector.name}`);save();context.sound('success');}
   if(events.death){notice(`${events.deathCause==='fall'?'Fell':events.deathCause==='spikes'?'Spikes':events.deathCause==='dark'?'Caught by the dark':'Hit'} · ${run.checkpoint?`Checkpoint ${checkpointIndexFor(run)+1}`:'Level start'}`);q<HTMLElement>('.ll-dialogue').hidden=true;context.sound('lose');save();}
   if(events.clear){q<HTMLElement>('.ll-dialogue').hidden=true;context.sound('success');report();save();context.announce('Level clear');context.setStatus(run.phase==='complete'?'All forty levels cleared.':'Level clear.');}
   const guidance=missionGuidance(run),sectorKey=`${run.stage}:${guidance.sector.index}`;
   if(run.grounded&&sectorKey!==previousSector){
    if(previousSector&&run.phase==='playing'&&!events.message&&!events.checkpoint&&!events.death)notice(`${guidance.sector.name} · ${guidance.hint}`);
    previousSector=sectorKey;
   }
   if(run.phase!=='playing'&&run.cinematic<=0)show(run.phase==='complete'?'complete':'clear');
   if(dialogueBlocking&&!q<HTMLElement>('.ll-dialogue').hidden)break;
  }
  paint();schedule();
 }
 function play(){
  if(run.phase==='cleared'){show('clear');return;}if(run.phase==='complete'){show('complete');return;}
  const guidance=missionGuidance(run);previousSector=`${run.stage}:${guidance.sector.index}`;show(null);notice(guidance.hint);context.setStatus(guidance.action);report();
 }
 function retry(){if(run.phase!=='playing')return;q<HTMLElement>('.ll-dialogue').hidden=true;respawn(run);resetInput();notice(`${run.checkpoint?`Checkpoint ${checkpointIndexFor(run)+1}`:'Chapter start'} · ${missionGuidance(run).action}`);save();paint();}
 let returnTo:Overlay='intro';
 function openTool(next:'journal'){returnTo=overlay;show(next);}
 root.addEventListener('click',event=>{const action=(event.target as Element).closest<HTMLElement>('[data-ui]')?.dataset.ui;if(!action||paused)return;if(action==='interact'&&active()){interactQueued=true;canvas.focus({preventScroll:true});}else if(action==='dismiss'){q<HTMLElement>('.ll-dialogue').hidden=true;canvas.focus();}else if(action==='journal')openTool(action);},{signal});
 card.addEventListener('click',event=>{
  const action=(event.target as Element).closest<HTMLElement>('[data-do]')?.dataset.do;if(!action||paused)return;
  if(action==='play')play();
  else if(action==='next'){if(nextStage(run)){save();report();play();}}
  else if(action==='help'||action==='confirm'){returnTo=overlay;show(action==='help'?'help':'confirm');}
  else if(action==='journal')openTool(action);
  else if(action==='back'){show(returnTo);}
  else if(action==='fresh'){music.reset();run=createRun();previousSecond=-1;save();report();play();}
  else if(action==='ending')show('choice');
  else if(action==='results')show('complete');
  else if(action==='rankings')context.openRankings?.('last-light');
  else if(action==='share'||action==='home'){run.ending=action;save();show('complete');}
 },{signal});
 window.addEventListener('keydown',event=>{
  const target=event.target as HTMLElement;
  if(disposed||target.closest('dialog,input,textarea,select,[contenteditable=true]')||!container.closest('.game-view')?.contains(target))return;
  if(['KeyP','Delete','Escape'].includes(event.code)&&!event.repeat){event.preventDefault();if(paused)context.setPaused?.(false);else if(overlay==='menu')play();else if(!overlay)show('menu');else if(overlay==='journal'||overlay==='help'||overlay==='confirm')show(returnTo);return;}
  if(['KeyJ','PageDown'].includes(event.code)&&!event.repeat&&!paused){event.preventDefault();if(overlay==='journal')show(returnTo);else if(!overlay||overlay==='menu')openTool('journal');return;}
  if(overlay){
   if(event.code==='Enter'&&!event.repeat){const focused=target.closest<HTMLElement>('button,summary'),choice=focused&&card.contains(focused)?focused:card.querySelector<HTMLElement>('button');if(choice){event.preventDefault();choice.click();}return;}
   if(['ArrowUp','ArrowDown'].includes(event.code)){
    event.preventDefault();
    if(overlay==='journal'){card.querySelector('.ll-journal')?.scrollBy({top:event.code==='ArrowDown'?72:-72});return;}
    const choices=[...card.querySelectorAll<HTMLElement>('button,summary')].filter(el=>el.getClientRects().length),current=Math.max(0,choices.indexOf(document.activeElement as HTMLElement)),direction=event.code==='ArrowDown'?1:-1;
    const next=choices[(current+direction+choices.length)%choices.length];next?.focus({preventScroll:true});next?.scrollIntoView({block:'nearest'});return;
   }
  }
  if(!active())return;
  if(event.code==='Enter'&&target.closest('button,a,summary'))return;
  if(run.phase!=='playing'&&['Space','KeyE'].includes(event.code)){event.preventDefault();run.cinematic=0;show(run.phase==='complete'?'complete':'clear');return;}
  if(['ArrowLeft','ArrowRight','KeyA','KeyD','Space','ArrowUp','KeyW','ShiftLeft','ShiftRight','KeyX','KeyE','Enter'].includes(event.code)){event.preventDefault();keys.add(event.code);if(!event.repeat){if(['Space','ArrowUp','KeyW'].includes(event.code))jumpQueued=true;if(['ShiftLeft','ShiftRight','KeyX'].includes(event.code))dashQueued=true;if(event.code==='KeyE'||event.code==='Enter')interactQueued=true;}}
  if(['KeyR','End'].includes(event.code)&&!event.repeat){event.preventDefault();retry();}
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
  const bounds=root.getBoundingClientRect(),bar=dock.getBoundingClientRect(),top=`${Math.ceil(bar.bottom-bounds.top+4)}px`;
  if(root.style.getPropertyValue('--ll-scene-top')!==top)root.style.setProperty('--ll-scene-top',top);
  const r=canvas.getBoundingClientRect();if(r.width&&r.height){scene.resize(r.width,r.height);paint();}
 });resize.observe(root);resize.observe(dock);resize.observe(canvas);
 report();show('intro');
 return {
  openMenu(){if(!overlay){show('menu');save();}else show(run.phase==='cleared'?'clear':run.phase==='complete'?'complete':'menu');},
  dismissMenu(){if(['menu','help','confirm','journal'].includes(overlay??'')){if(overlay==='menu')play();else show(returnTo);return true;}return false;},
  pause(){paused=true;stop();save();paint();},resume(){paused=false;paint();schedule();},
  restart(){if(run.phase!=='playing'||overlay==='intro'||overlay==='continue')return false;retry();if(overlay)show(null);return false;},
  serialize:()=>serialize(run),restore(value){const restored=restore(value);if(!restored)return;music.reset();run=restored;previousSecond=-1;report();show(run.phase==='complete'?'complete':run.phase==='cleared'?'clear':'continue');},
  dispose(){disposed=true;stop();music.dispose();abort.abort();resize.disconnect();hudContent.remove();hud.dispose();root.remove();},
 };
}
const game:GameModule={id:'last-light',title:'Last Light',cover:'game-art/last-light/cover.svg',rules:'A precision platformer across forty levels and five districts. Reach each gold exit. Left/Right arrows run; hold Up for height, tap Up for short hops. Right Shift air dashes; landing refills it. Release direction to brake onto small ledges. Jump at walls to kick away. Flags save progress; End or R retries (+1 setback), Delete or P pauses. Page Down or J opens the optional journal. Enter or E interacts when a prompt appears. Conversations, memory sparks and machinery never lock the exit. Cracked floors fracture and fall; vent grates warn amber before firing. Springs launch, belts push, ice slides. In escape levels the dark pursues you. On touch screens, hold movement and jump or dash together. 1,000 points per level, 100 per spark, plus a pace bonus up to 250 per level, reduced by 2 per active second and 25 per setback.',mount};
export default game;
