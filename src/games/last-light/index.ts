import type {GameModule,GameContext,GameInstance} from '../../core/types';
import {LEVELS,LEVEL_COUNT,WORLDS} from './levels';
import {createRun,step,nextStage,respawn,serialize,restore,formatTime,nearby,platformAt,stationAt,hazardAt,checkpointsFor,checkpointIndexFor,STEP,type Input} from './model';
import {CHAPTERS,DESTINATIONS,ENDINGS,speakerFor,memoryFor} from './story';
import {missionGuidance,stationAction,targetBearing} from './guidance';
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
 <div class="ll-wayfinding"><span class="ll-sector"></span><span class="ll-bearing"></span></div>
 <p class="ll-guidance-hint"></p>
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
 let run=createRun(),overlay:Overlay='intro',paused=false,disposed=false,frame=0,last=0,acc=0,noticeUntil=0,dialogueUntil=0,dialogueBlocking=false,previousHud='',previousSecond=-1,mapSector:number|null=null,previousSector='';
 const keys=new Set<string>(),touches=new Map<number,string>();let jumpQueued=false,dashQueued=false,interactQueued=false;
 const touchMode=()=>matchMedia('(any-pointer: coarse)').matches;
 const instructions=(text:string)=>touchMode()?text.replace(/A \/ D runs/g,'Hold ← or → to run').replace(/hold Space to jump/g,'hold JUMP to jump').replace(/\bE\b/g,'HELP').replace(/\bSpace\b/g,'JUMP').replace(/\bShift\b/g,'DASH').replace(/\bX\b/g,'DASH'):text;
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
  const guidance=missionGuidance(run),bearing=targetBearing(run,guidance.target),target=guidance.target;
  q<HTMLElement>('.ll-objective').textContent=instructions(guidance.action);q<HTMLElement>('.ll-task-progress').textContent=guidance.phase==='station'?`${guidance.completed}/${guidance.total} done`:guidance.phase==='exit'?'EXIT OPEN':'COMPLETE';
  q<HTMLElement>('.ll-sector').textContent=`${guidance.sector.index+1}/${guidance.sector.total} · ${guidance.sector.name}`;
  q<HTMLElement>('.ll-guidance-hint').textContent=instructions(guidance.hint);
  const offscreen=target.x<scene.cameraX+24||target.x>scene.cameraX+scene.width-24||target.y<scene.cameraY+24||target.y>scene.cameraY+scene.height-24;
  const compass=q<HTMLElement>('.ll-bearing');compass.textContent=offscreen?`${bearing.arrow} ${bearing.distance} m`:'◆ In view';compass.setAttribute('aria-label',`${target.label}: ${offscreen?bearing.label:'in view'}`);compass.title=`${target.label} · Direct bearing. Use the map for the route.`;
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
  const l=LEVELS[run.stage],guidance=missionGuidance(run),positions=l.platforms.map(p=>platformAt(p,run.clock)),checkpoints=checkpointsFor(l),sector=mapSector===null?undefined:l.sectors?.[mapSector];
  const sectorPlatforms=sector?positions.slice(Math.max(0,sector.platform-1),Math.min(l.mainCount,(l.sectors?.[mapSector!+1]?.platform??l.mainCount)+1)):positions;
  const minX=Math.min(...sectorPlatforms.map(p=>p.x))-60,maxX=Math.max(...sectorPlatforms.map(p=>p.x+p.w))+90;
  const minY=Math.min(...sectorPlatforms.map(p=>p.y))-190,height=Math.max(...sectorPlatforms.map(p=>p.y+120))-minY;
  const main=positions.slice(0,l.mainCount).map(p=>`${p.x+p.w/2},${p.y-5}`).join(' ');
  const width=Math.max(700,Math.min(1600,(maxX-minX)*.48));
  const platforms=l.platforms.map((p,i)=>{const r=positions[i];return `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="14" fill="${p.branch?'#627c87':'#d4c8a4'}"><title>${p.branch?'Optional path':`Route ledge ${i+1}`} · ${p.kind}</title></rect>`;}).join('');
  const sectors=(l.sectors??[]).map((section,i)=>{const p=positions[section.platform];return `<text x="${p.x}" y="${p.y-110}" font-size="29" fill="#a8b5ae">${i+1} · ${section.name}</text>`;}).join('');
  const hazards=l.hazards.map(h=>{const r=hazardAt(h,run.clock),disabled=h.disabledBy!==undefined&&run.activated.includes(h.disabledBy);return `<path d="M${r.x+r.w/2} ${r.y-8}l-15 27h30z" fill="${disabled?'#6e957e':'#df8d7a'}"><title>${h.kind}${disabled?' · machinery stopped':' hazard'}</title></path>`;}).join('');
  const flags=checkpoints.map((cp,i)=>`<path d="M${cp.x} ${cp.y}v-56h34l-10 16h-24" fill="none" stroke="${i<=checkpointIndexFor(run)?'#c2d99a':'#819a9c'}" stroke-width="5"><title>Checkpoint ${i+1}${i<=checkpointIndexFor(run)?' saved':''}</title></path>`).join('');
  const stations=l.stations.map(p=>{const at=stationAt(p,l,run.clock),done=run.activated.includes(p.id),selected=guidance.target.id===p.id;return `<circle cx="${at.x}" cy="${at.y-32}" r="25" fill="${done?'#c2d99a':'#dc9e7b'}" stroke="${selected?'#fff1c8':'#172b36'}" stroke-width="${selected?7:3}"/><text x="${at.x}" y="${at.y-22}" text-anchor="middle" font-size="29" font-weight="bold" fill="#182330">${done?'✓':p.id+1}</text><title>${stationAction(p)} ${p.label}${done?' · done':''}</title>`;}).join('');
  const memories=l.pickups.filter(p=>p.kind==='spark'&&!run.collected.includes(p.id)).map(p=>`<path d="M${p.x} ${p.y-12}l9 12-9 12-9-12z" fill="#d9bb77"><title>Optional memory</title></path>`).join('');
  return `<div class="ll-map-viewport" tabindex="0" aria-label="Route map. Scroll to explore." data-focus-x="${(run.x+8-minX)/(maxX-minX)}" data-focus-y="${(run.y+12-minY)/height}"><svg class="ll-map" style="width:${width}px" viewBox="${minX} ${minY} ${maxX-minX} ${height}" role="img" aria-label="Map showing alternate routes, numbered objectives, checkpoints, hazards, exit and your position"><polyline points="${main}" fill="none" stroke="#d4c8a450" stroke-width="7" stroke-dasharray="14 12"/>${platforms}${sectors}${hazards}${flags}${memories}${stations}<path d="M${l.exit.x} ${l.exit.y}v56h38v-56z" fill="${guidance.phase==='station'?'#786f5d':'#f3c77a'}" stroke="#f3c77a" stroke-width="4"/><text x="${l.exit.x+19}" y="${l.exit.y-15}" text-anchor="middle" font-size="29" fill="#f3c77a">EXIT</text><circle cx="${run.x+8}" cy="${run.y+12}" r="18" fill="#91d8e2" stroke="#152834" stroke-width="5"/><text x="${run.x+8}" y="${run.y-17}" text-anchor="middle" font-size="30" font-weight="bold" fill="#91d8e2">YOU</text></svg></div>`;
 }
 const button=(action:string,label:string,secondary=false)=>`<button class="ll-button${secondary?' ll-secondary':''}" data-do="${action}">${label}</button>`;
 const eyebrow=(text:string)=>`<p class="ll-eyebrow">${text}</p>`;
 function show(next:Overlay){
  if(next==='complete'&&!run.ending)next='choice';
  overlay=next;stop();layer.hidden=!next;canvas.tabIndex=next?-1:0;q<HTMLElement>('.ll-dialogue').hidden=true;
  if(!next){card.replaceChildren();paint();schedule();canvas.focus({preventScroll:true});return;}
  const level=LEVELS[run.stage],chapter=CHAPTERS[run.stage],guidance=missionGuidance(run);let html='';
  if(next==='intro')html=`${eyebrow('A CITY TO FIND YOUR WAY THROUGH')}<h1><span class="sr-only">Last Light</span><img src="${import.meta.env.BASE_URL}game-art/last-light/title.svg" alt="" width="190" height="130"></h1><p class="ll-story">Mira didn’t come home.<br>She left you a lantern.<br>And a city full of people waiting.</p><p class="ll-description">First: cross the roofs to Nell’s house.<br>${instructions('A / D runs; hold Space to jump.')}<br>Follow the route. Flags save your place.</p>${button('play','Carry the light →')}${button('help','How to play',true)}<p class="ll-footnote">FORTY PLACES · FIVE DISTRICTS · A WAY HOME</p>`;
  if(next==='continue')html=`${eyebrow('YOUR LIGHT IS STILL HERE')}<h2>Welcome back.</h2><p>Chapter ${run.stage+1} · ${level.name}<br>${run.cleared} chapters restored · ${run.best.toLocaleString()} points</p><p class="ll-map-objective"><strong>Next</strong>${instructions(guidance.action)}</p><p class="ll-small">${instructions(chapter.task)}</p>${button('play','Continue the journey →')}${button('help','Controls',true)}${button('confirm','Start a new run',true)}`;
  if(next==='clear'||next==='complete'){
   const ending=run.ending?ENDINGS[run.ending]:null;
   html=`${eyebrow(next==='complete'?'40 / 40 · A WAY HOME':`${String(run.stage+1).padStart(2,'0')} / 40 · ${WORLDS[level.world].name}`)}<h2>${next==='complete'?ending!.title:chapter.outcome}</h2><p class="ll-story">${next==='complete'?ending!.text:chapter.after}</p><div class="ll-results"><span>MEMORIES<strong>${run.collected.filter(id=>id<3).length}/3</strong></span><span>CHAPTER TIME<strong>${formatTime(run.stageTime)}</strong></span><span>POINTS<strong>${run.best.toLocaleString()}</strong></span></div><details class="ll-score-breakdown"><summary>Where your points came from</summary><p>${run.cleared} chapters × 1,000 = ${(run.cleared*1000).toLocaleString()}<br>${run.sparks} sparks × 100 = ${(run.sparks*100).toLocaleString()}<br>Journey pace bonus = ${Math.max(0,run.best-run.cleared*1000-run.sparks*100).toLocaleString()}<br>Each chapter banks its own bonus: up to 250, −2 per active second, −25 per setback. Previously earned points stay yours.</p></details>${next==='clear'?button('next','Next chapter →'):button('confirm','Start another journey →')}${button('journal','Read the journal',true)}${button('rankings','View leaderboard',true)}`;
  }
  if(next==='choice')html=`${eyebrow('THE LAST LANTERN')}<h2>What do we<br>leave alight?</h2><p class="ll-story">Mira stands beside you. Below, the people you helped hold their windows open.</p><p>Share the flame with every district now, or bring it home and let neighbour light neighbour.</p>${button('share','Share the flame →')}${button('home','Carry it home →',true)}<p class="ll-small">Both roads lead home. The last page is yours.</p>`;
  if(next==='menu')html=`${eyebrow('TAKE A BREATHER')}<h2>The light can wait.</h2><p>Chapter ${run.stage+1} · ${level.name}</p>${button('play','Back to the journey →')}${button('map','Map & objectives',true)}${button('journal','Mira’s journal',true)}${button('help','How to play',true)}${button('rankings','Leaderboard',true)}${button('confirm','Start a new run',true)}`;
  if(next==='map'){
   const sectors=level.sectors??[],controls=sectors.map((s,i)=>`<button data-do="map-sector" data-sector="${i}" aria-pressed="${mapSector===i}">${i+1} · ${s.name}${i===guidance.sector.index?' · You':''}</button>`).join('');
   const stops=level.stations.map(p=>{const done=run.activated.includes(p.id),nextStop=guidance.target.id===p.id,area=sectors.filter(s=>s.platform<=p.platform).at(-1)?.name;return `<li data-state="${done?'done':nextStop?'next':'pending'}"><span>${done?'✓':p.id+1}</span><div>${stationAction(p)} ${p.label}<small>${done?'Complete':nextStop?'Next suggested stop':'Still to do'}${area?` · ${area}`:''}${done?'':' · E to interact'}</small></div></li>`;}).join('');
   html=`${eyebrow('YOUR ROUTE THROUGH THE CHAPTER')}<h2>${level.name}</h2><p class="ll-map-objective"><strong>Now</strong>${instructions(guidance.action)}</p><div class="ll-map-sectors" role="group" aria-label="Map section">${controls}<button data-do="map-sector" data-sector="all" aria-pressed="${mapSector===null}">Overview</button></div>${mapHtml()}<p class="ll-map-key">Pan to explore · Blue YOU · Gold EXIT · Flags save progress<br>Pale dotted line: main route · Blue-grey ledges and sparks: optional<br>Red triangles: hazards · The compass points to the objective; follow the ledges to reach it.</p><ol class="ll-connections">${instructions(stops)}<li data-state="${guidance.phase==='station'?'pending':'next'}"><span>→</span><div>Reach ${DESTINATIONS[run.stage]}<small>${guidance.phase==='station'?`Opens after the ${guidance.total-guidance.completed} remaining ${guidance.total-guidance.completed===1?'task':'tasks'}`:'Exit open · reach the gold marker'}</small></div></li></ol><p class="ll-small">${instructions(guidance.hint)}</p>${button('back','Back to the journey →')}`;
  }
  if(next==='journal'){
   const pages=CHAPTERS.map((c,i)=>({c,i,found:run.memories.filter(id=>Math.floor(id/3)===i)})).filter(p=>p.found.length||run.heard.includes(p.i)||p.i<run.cleared);
   html=`${eyebrow(`${run.memories.length} FRAGMENTS · ${run.heard.length} CONVERSATIONS`)}<h2>The things<br>we carry.</h2><p class="ll-small">Mira’s trail, and the people you met along the way.</p><div class="ll-journal" tabindex="0" aria-label="Journal entries">${pages.length?pages.map(({c,i,found})=>`<article><h3>${String(i+1).padStart(2,'0')} · ${c.name}</h3>${run.heard.includes(i)?`<p><strong>${speakerFor(i)}</strong> — ${c.line}</p>`:''}${found.map(id=>`<p class="ll-memory">✦ ${id%3+1}/3 · ${memoryFor(i,id%3)}</p>`).join('')}${i<run.cleared?`<p>${c.after}</p>`:''}</article>`).join(''):'<p>Talk to someone with E, or follow a hidden path to find a memory spark. Your discoveries will stay here.</p>'}</div>${button('back','Back →')}`;
  }
  if(next==='help'){
   const controls=touchMode()?'<dt>← →</dt><dd>Run · hold a direction</dd><dt>JUMP</dt><dd>Hold for height</dd><dt>DASH</dt><dd>Air dash · land to recharge</dd><dt>HELP</dt><dd>Talk · help · turn · light</dd><dt>Map / Journal</dt><dd>Tap the buttons above the scene</dd><dt>Jump at a wall</dt><dd>Kick away from it</dd>':'<dt>← → / A D</dt><dd>Run</dd><dt>Space / ↑ / W</dt><dd>Jump · hold for height</dd><dt>Shift / X</dt><dd>Air dash · land to recharge</dd><dt>E</dt><dd>Talk · help · turn · light</dd><dt>M / J</dt><dd>Map / journal</dd><dt>Jump at a wall</dt><dd>Kick away from it</dd><dt>R / P</dt><dd>Retry checkpoint / pause</dd>';
   html=`${eyebrow('SMALL COURIER. MANY ROADS.')}<h2>Find your footing.</h2><dl class="ll-controls-list">${controls}</dl><p class="ll-small">${instructions('The task above the scene names your next stop. Press E beside a numbered light, wheel, bell or person. When those tasks are done, reach the gold exit. The compass gives its bearing; the map shows the route through each named area. Flags save your place along the way. Blue-grey side paths hold optional memories.')}</p><p class="ll-small">Cracked floors break after a warning. Springs launch, belts push, ice slides; steam and light barriers pulse. In escape chapters the dark follows, so reach the shelter without stopping for switches.</p><p class="ll-small">1,000 points per chapter, 100 per spark, up to 250 per chapter in pace bonuses. On touch screens, hold movement and action buttons together.</p>${button('back','Got it →')}`;
  }
  if(next==='confirm')html=`${eyebrow('A FRESH START')}<h2>Begin again?</h2><p>This replaces your current journey and journal. Your personal best stays saved.</p>${button('fresh','Start new run')}${button('back','Keep this journey',true)}`;
  if(next==='clear'&&CHAPTERS[run.stage+1]){
   const upcoming=CHAPTERS[run.stage+1];html=html.replace('<button class="ll-button" data-do="next">',`<p class="ll-next-chapter"><strong>Next · ${upcoming.name}</strong>${instructions(upcoming.task)}</p><button class="ll-button" data-do="next">`);
  }
  card.innerHTML=html;layer.scrollTop=0;paint();queueMicrotask(()=>{
   if(disposed||overlay!==next)return;
   card.querySelector<HTMLButtonElement>(next==='map'?'[aria-pressed="true"]':'button')?.focus({preventScroll:true});
   const sectionTabs=card.querySelector<HTMLElement>('.ll-map-sectors'),selected=sectionTabs?.querySelector<HTMLElement>('[aria-pressed="true"]');
   if(sectionTabs&&selected)sectionTabs.scrollLeft=selected.offsetLeft-sectionTabs.offsetLeft-12;
   const viewport=card.querySelector<HTMLElement>('.ll-map-viewport'),map=card.querySelector<SVGElement>('.ll-map');
   if(viewport&&map){viewport.scrollLeft=Number(viewport.dataset.focusX)*map.clientWidth-viewport.clientWidth*.4;viewport.scrollTop=Number(viewport.dataset.focusY)*map.clientHeight-viewport.clientHeight*.6;}
  });
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
   if(events.message){
    if(events.interact&&!events.message.includes(':'))notice(`${events.message} · Next: ${missionGuidance(run).action}`);
    else if(events.message.length>70||events.interact)dialogue(events.message,!!events.interact);
    else notice(events.message);
   }
   if(events.interact||events.pickup)save();
   if(events.checkpoint){notice(`Checkpoint ${checkpointIndexFor(run)+1}/${checkpointsFor(LEVELS[run.stage]).length} saved · ${missionGuidance(run).sector.name}`);save();context.sound('success');}
   if(events.death){notice(`${run.checkpoint?`Back at checkpoint ${checkpointIndexFor(run)+1}.`:'Back at the chapter start.'} ${missionGuidance(run).hint}`);q<HTMLElement>('.ll-dialogue').hidden=true;context.sound('lose');save();}
   if(events.clear){q<HTMLElement>('.ll-dialogue').hidden=true;context.sound('success');report();save();context.announce(CHAPTERS[run.stage].after);context.setStatus(run.phase==='complete'?'Run finished. A way home.':CHAPTERS[run.stage].outcome);}
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
  const guidance=missionGuidance(run);previousSector=`${run.stage}:${guidance.sector.index}`;show(null);notice(LEVELS[run.stage].hint);context.setStatus(guidance.action);report();
 }
 function retry(){if(run.phase!=='playing')return;q<HTMLElement>('.ll-dialogue').hidden=true;respawn(run);resetInput();notice(`${run.checkpoint?`Checkpoint ${checkpointIndexFor(run)+1}`:'Chapter start'} · ${missionGuidance(run).action}`);save();paint();}
 let returnTo:Overlay='intro';
 function openTool(next:'map'|'journal'){returnTo=overlay;if(next==='map')mapSector=missionGuidance(run).sector.index;show(next);}
 root.addEventListener('click',event=>{const action=(event.target as Element).closest<HTMLElement>('[data-ui]')?.dataset.ui;if(!action||paused)return;if(action==='dismiss'){q<HTMLElement>('.ll-dialogue').hidden=true;canvas.focus();}else if(action==='map'||action==='journal')openTool(action);},{signal});
 card.addEventListener('click',event=>{
  const action=(event.target as Element).closest<HTMLElement>('[data-do]')?.dataset.do;if(!action||paused)return;
  if(action==='play')play();
  else if(action==='map-sector'){const selected=(event.target as Element).closest<HTMLElement>('[data-sector]')?.dataset.sector;mapSector=selected==='all'?null:Number(selected);show('map');}
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
