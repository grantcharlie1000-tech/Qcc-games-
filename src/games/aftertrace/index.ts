import type {GameModule} from '../../core/types';
import {begin,fire,makeWorld,resize,restore,snapshot,step, type Effects,type World,type Vec} from './model';
import './style.css';

const RULES = [
  'AFTERTRACE is an original endless survival arcade game. You are the little blue craft. Moving paints a cyan route that fades after about three seconds. Enemy drones chase you. Collect the gold shards and avoid touching enemies: you have three lives.',
  'When you have at least one charged PULSE, ignite the route you just drew. It becomes a glowing pink trap for a brief moment, destroying enemies that touch any part of the line. Aim to lure enemies across your path and trigger at just the right moment. Each extra enemy caught by one pulse is worth more points.',
  'Move with WASD or arrow keys. On desktop you can also steer toward your mouse pointer. On a phone or tablet drag anywhere in the arena to steer with a floating thumbstick. Press Space or the large PULSE button to ignite. The pulse meter recharges with time and with gold shards; you can bank two charges.',
  'Your score increases for survival, collecting shards and eliminating enemies. Every 18 seconds you enter a harder wave, and faster weaving drones begin appearing. Pause in the arcade menu; Escape opens Study Mode. Progress is saved locally and can be continued after leaving.',
].join('\n\n');
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
const audioTime=()=>performance.now();
function segment(ctx:CanvasRenderingContext2D, pts:Vec[]) {if(pts.length<2)return;ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i].x,pts[i].y);}
function paint(ctx:CanvasRenderingContext2D, w:World, ms:number, reduced:boolean) {
  const {width:W,height:H}=w,t=ms*.001;
  ctx.clearRect(0,0,W,H);
  const g=ctx.createLinearGradient(0,0,W,H);g.addColorStop(0,'#101932');g.addColorStop(.52,'#090f22');g.addColorStop(1,'#131027');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  let bloom=ctx.createRadialGradient(W*.52,H*.47,15,W*.5,H*.48,Math.max(W,H)*.67);
  bloom.addColorStop(0,'rgba(35,89,128,.14)');bloom.addColorStop(1,'rgba(3,8,17,0)');ctx.fillStyle=bloom;ctx.fillRect(0,0,W,H);
  ctx.save();ctx.strokeStyle='rgba(119,171,215,.063)';ctx.lineWidth=1;ctx.beginPath();
  const space=38;for(let x=19;x<W;x+=space){for(let y=21;y<H;y+=space){ctx.moveTo(x-1,y);ctx.lineTo(x+1,y);ctx.moveTo(x,y-1);ctx.lineTo(x,y+1);}}ctx.stroke();ctx.restore();
  // A small perimeter glow keeps the arena visible on very dark displays.
  ctx.strokeStyle='#46b7e01a';ctx.lineWidth=2;ctx.strokeRect(13,86,W-26,H-165);
  for(const spark of w.sparks){
    const r=9+(!reduced?Math.sin(t*4+spark.id)*1.6:0);
    ctx.save();ctx.translate(spark.x,spark.y);ctx.rotate(Math.PI/4);
    ctx.shadowBlur=20;ctx.shadowColor='#ffcb6d';ctx.fillStyle='#ffd47a';ctx.fillRect(-r*.66,-r*.66,r*1.32,r*1.32);
    ctx.shadowBlur=0;ctx.strokeStyle='#fff2cf';ctx.lineWidth=1.5;ctx.strokeRect(-r*.66,-r*.66,r*1.32,r*1.32);ctx.restore();
  }
  // Fresh traces are thin and cool; older pieces fade individually.
  for(let i=1;i<w.trail.length;i++){
    const a=w.trail[i-1],b=w.trail[i],alpha=clamp(1-(w.seconds-a.t)/3.45,0,1);
    ctx.strokeStyle=`rgba(82,237,249,${(alpha*.68).toFixed(3)})`;ctx.lineWidth=5;ctx.lineCap='round';
    ctx.shadowBlur=reduced?0:10;ctx.shadowColor='#40e1fd';ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
  }
  ctx.shadowBlur=0;
  if(w.pulseFor>0&&w.pulsePath.length>=2){
    const intensity=Math.min(1,w.pulseFor*2.7);
    ctx.save();ctx.globalAlpha=intensity;ctx.lineJoin='round';ctx.lineCap='round';
    segment(ctx,w.pulsePath);ctx.strokeStyle='#fc448a';ctx.lineWidth=20;ctx.shadowBlur=reduced?0:25;ctx.shadowColor='#ff489e';ctx.stroke();
    segment(ctx,w.pulsePath);ctx.strokeStyle='#fff3fb';ctx.lineWidth=3.5;ctx.shadowBlur=0;ctx.stroke();ctx.restore();
  }
  for(const foe of w.enemies){
    ctx.save();ctx.translate(foe.x,foe.y);ctx.rotate(Math.atan2(foe.vy,foe.vx)+Math.PI/2);
    const weaver=foe.kind===1;ctx.shadowBlur=reduced?0:14;ctx.shadowColor=weaver?'#e09bff':'#ff647d';
    ctx.strokeStyle=weaver?'#ddb7ff':'#ff8295';ctx.lineWidth=2.2;ctx.fillStyle=weaver?'#8038a7':'#9c305a';ctx.beginPath();
    if(weaver){ctx.moveTo(0,-14);ctx.lineTo(12,0);ctx.lineTo(0,14);ctx.lineTo(-12,0);}
    else{ctx.moveTo(0,-15);ctx.lineTo(13,11);ctx.lineTo(0,6);ctx.lineTo(-13,11);}
    ctx.closePath();ctx.fill();ctx.stroke();ctx.shadowBlur=0;ctx.fillStyle='#fff1fa';ctx.fillRect(-2,-3,4,5);ctx.restore();
  }
  const p=w.player;
  ctx.save();ctx.translate(p.x,p.y);ctx.rotate(Math.PI/4);
  if(w.hurtFor>0){ctx.save();ctx.rotate(-Math.PI/4);ctx.setLineDash([5,6]);ctx.strokeStyle='#73f5ffcc';ctx.lineWidth=2.4;ctx.beginPath();ctx.arc(0,0,24+(!reduced?Math.sin(t*9)*2:0),0,Math.PI*2);ctx.stroke();ctx.restore();}
  ctx.shadowBlur=reduced?0:27;ctx.shadowColor='#25dcff';ctx.fillStyle='#38dbe8';ctx.strokeStyle='#e0fdff';ctx.lineWidth=2.4;ctx.beginPath();ctx.moveTo(0,-14);ctx.lineTo(13,0);ctx.lineTo(0,14);ctx.lineTo(-13,0);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.shadowBlur=0;ctx.fillStyle='#ecffff';ctx.fillRect(-3,-3,6,6);ctx.restore();
}

const game:GameModule={
 id:'aftertrace',title:'Aftertrace',cover:'game-art/aftertrace/cover.svg',rules:RULES,
 mount(container,context){
  const root=document.createElement('section');root.className='at-game';
  root.innerHTML=`<canvas class="at-canvas" tabindex="0" aria-label="Aftertrace arena. WASD or arrows or mouse to move. On touch drag to steer. Space or Pulse button to fire the trail."></canvas>
  <div class="at-top"><div class="at-brand"><span class="at-logo" aria-hidden="true">◈</span><span>AFTERTRACE</span></div><div class="at-stats"><div class="at-stat"><small>SCORE</small><strong class="at-score">0</strong></div><div class="at-stat at-wave-box"><small>WAVE</small><strong class="at-wave">01</strong></div><div class="at-lives" aria-label="Three lives left"><i></i><i></i><i></i></div></div></div>
  <div class="at-combo" hidden>TRACE COMBO <strong>×2</strong></div>
  <div class="at-controls"><div class="at-joystick" aria-hidden="true"><i></i></div><div class="at-actions"><span class="at-hint">DRAW. LURE. DETONATE.</span><button type="button" class="at-pulse" aria-label="Fire pulse" disabled><span class="at-pulse-icon" aria-hidden="true">⌁</span><span class="at-pulse-label">PULSE</span><span class="at-charge"><i></i></span></button></div></div>
  <div class="at-overlay"><div class="at-card"><div class="at-eyebrow">ORIGINAL ARCADE / SURVIVAL</div><div class="at-emblem" aria-hidden="true"><span></span><i></i></div><h2>AFTER<span>TRACE</span></h2><p class="at-description">The path you leave behind is your greatest weapon.</p><div class="at-steps"><div><b>01</b><span>Move to draw your trail</span></div><div><b>02</b><span>Lure the hunters across it</span></div><div><b>03</b><span>Pulse to ignite the line</span></div></div><div class="at-result" hidden></div><button class="at-start" type="button">START RUN <span aria-hidden="true">↗</span></button><p class="at-help">WASD / arrows / mouse · Touch: drag · Space: pulse</p></div></div>`;
  container.append(root);
  const q=<T extends Element>(s:string)=>root.querySelector<T>(s)!;
  const canvas=q<HTMLCanvasElement>('.at-canvas'),ctx=canvas.getContext('2d',{alpha:false})!;
  const button=q<HTMLButtonElement>('.at-pulse'),start=q<HTMLButtonElement>('.at-start');
  const overlay=q<HTMLElement>('.at-overlay'),headline=q<HTMLElement>('.at-card h2');
  const description=q<HTMLElement>('.at-description'),steps=q<HTMLElement>('.at-steps'),result=q<HTMLElement>('.at-result');
  const score=q<HTMLElement>('.at-score'),wave=q<HTMLElement>('.at-wave'),lives=q<HTMLElement>('.at-lives');
  const combo=q<HTMLElement>('.at-combo'),charge=q<HTMLElement>('.at-charge i');
  const stick=q<HTMLElement>('.at-joystick');
  const abort=new AbortController(),signal=abort.signal;
  let world=makeWorld(390,760,(Math.random()*0xffffffff)>>>0);
  let paused=false,savedRun=false,disposed=false,last:number|null=null,frame=0,accumulator=0;
  let currentScore=-1,lastWave=0,lastHealth=-1,lastCombo=0;
  let touchId:number|null=null,stickX=0,stickY=0,stickDx=0,stickDy=0,mouse:Vec|null=null,usingTouch=false;
  const keys=new Set<string>();
  const reduce=()=>context.settings.reducedMotion||matchMedia('(prefers-reduced-motion: reduce)').matches;
  function getDims(){const r=root.getBoundingClientRect();return {width:Math.max(290,r.width),height:Math.max(390,r.height)};}
  function setCanvasSize(){const {width,height}=getDims();const dpr=Math.min(2,window.devicePixelRatio||1);
   canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
   resize(world,width,height);paint(ctx,world,audioTime(),reduce());}
  const observer=new ResizeObserver(setCanvasSize);observer.observe(root);
  function refreshUI(){
    const value=Math.floor(world.score);
    if(currentScore!==value){currentScore=value;score.textContent=value.toLocaleString();context.setScore(value);}
    if(lastWave!==world.wave){lastWave=world.wave;wave.textContent=String(world.wave).padStart(2,'0');context.setLevel(`Wave ${world.wave}`);}
    if(lastHealth!==world.lives){lastHealth=world.lives;lives.setAttribute('aria-label',`${world.lives} lives left`);lives.querySelectorAll('i').forEach((h,i)=>h.classList.toggle('is-empty',i>=world.lives));}
    charge.style.width=`${Math.floor(world.charge/2*100)}%`;
    button.disabled=paused||savedRun||world.phase!=='playing'||world.charge<1||world.trail.length<4||world.pulseFor>0;
    button.classList.toggle('at-ready',!button.disabled);
    combo.hidden=world.pulseCount<2||world.pulseFor<=0;
    if(!combo.hidden){combo.querySelector('strong')!.textContent=`×${Math.min(5,world.pulseCount)}`;lastCombo=world.pulseCount;}else if(lastCombo)lastCombo=0;
    root.dataset.phase=world.phase;root.dataset.paused=String(paused);
    root.dataset.score=String(value);root.dataset.wave=String(world.wave);root.dataset.lives=String(world.lives);
  }
  function renderModal(){const over=world.phase==='over';const show=world.phase==='ready'||over||savedRun;
    overlay.hidden=!show;
    if(over){headline.innerHTML='RUN <span>ENDED</span>';description.textContent='Every brilliant escape starts with a trace.';
      steps.hidden=true;result.hidden=false;result.textContent=`${Math.floor(world.score).toLocaleString()} POINTS · ${world.kills} HUNTERS · WAVE ${world.wave}`;start.textContent='PLAY AGAIN ↗';}
    else if(savedRun){headline.innerHTML='AFTER<span>TRACE</span>';description.textContent='Your previous route is waiting.';
      steps.hidden=true;result.hidden=false;result.textContent=`${Math.floor(world.score).toLocaleString()} POINTS · WAVE ${world.wave}`;start.textContent='CONTINUE RUN ↗';}
    else{headline.innerHTML='AFTER<span>TRACE</span>';description.textContent='The path you leave behind is your greatest weapon.';
      steps.hidden=false;result.hidden=true;start.textContent='START RUN ↗';}
    start.disabled=paused;
  }
  function clearInput(){keys.clear();mouse=null;if(touchId!==null&&canvas.hasPointerCapture(touchId))canvas.releasePointerCapture(touchId);touchId=null;stickDx=stickDy=0;stick.classList.remove('at-dragging');}
  function getAxis():Vec{
    let x=0,y=0;
    if(keys.has('arrowleft')||keys.has('a'))x--;if(keys.has('arrowright')||keys.has('d'))x++;
    if(keys.has('arrowup')||keys.has('w'))y--;if(keys.has('arrowdown')||keys.has('s'))y++;
    if(x||y)return {x,y};
    if(touchId!==null)return{x:stickDx,y:stickDy};
    if(mouse){const dx=mouse.x-world.player.x,dy=mouse.y-world.player.y,d=Math.hypot(dx,dy);
      if(d>11)return{x:dx/Math.max(d,1)*Math.min(1,d/52),y:dy/Math.max(d,1)*Math.min(1,d/52)};}
    return{x:0,y:0};
  }
  function onEffects(e:Effects){
    if(e.pickups){context.sound('tap');context.announce('Energy collected');}
    if(e.kills){context.sound('success');context.setStatus(`${world.kills} hunters caught · Wave ${world.wave}`);}
    if(e.damage){context.sound('lose');context.announce(`${world.lives} lives remaining`);}
    if(e.finished){context.setStatus('Run ended');context.announce(`Run ended. ${Math.floor(world.score)} points`);context.save(snapshot(world));clearInput();renderModal();}
  }
  function animate(ms:number){if(disposed)return;frame=requestAnimationFrame(animate);
    if(last===null)last=ms;let delta=Math.min(.1,(ms-last)/1000);last=ms;
    if(!paused&&!savedRun&&world.phase==='playing'){
      accumulator+=delta;let steps=0;
      while(accumulator>=1/60&&steps++<6){onEffects(step(world,1/60,getAxis().x,getAxis().y));accumulator-=1/60;}
      if(steps>=6)accumulator=0;
    }
    paint(ctx,world,ms,reduce());refreshUI();
  }
  const beginGame=()=>{
    if(paused)return;
    if(world.phase==='over'){world=makeWorld(world.width,world.height,(Math.random()*0xffffffff)>>>0);savedRun=false;}
    savedRun=false;begin(world);last=null;accumulator=0;clearInput();renderModal();refreshUI();canvas.focus({preventScroll:true});
    context.setStatus('Draw a trail, then pulse to strike');context.save(snapshot(world));
  };
  start.addEventListener('click',beginGame,{signal});
  const shoot=()=>{if(paused||savedRun)return;const f=fire(world);if(f.pulse){context.sound('success');context.announce('Trace ignited');context.save(snapshot(world));refreshUI();}};
  button.addEventListener('click',e=>{e.stopPropagation();shoot();},{signal});
  function gameKey(e:KeyboardEvent){if(disposed||paused||savedRun||world.phase!=='playing'||e.altKey||e.ctrlKey||e.metaKey)return false;
    if(document.activeElement instanceof HTMLInputElement||document.activeElement instanceof HTMLTextAreaElement||document.querySelector('dialog[open]'))return false;
    const k=e.key.toLowerCase();
    if(['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d',' '].includes(k)){
      if(k===' '){if(!e.repeat)shoot();}else keys.add(k);
      e.preventDefault();return true;
    }return false;
  }
  window.addEventListener('keydown',gameKey,{signal});
  window.addEventListener('keyup',e=>{keys.delete(e.key.toLowerCase());},{signal});
  window.addEventListener('blur',()=>{clearInput();last=null;},{signal});
  canvas.addEventListener('pointermove',e=>{
    const r=canvas.getBoundingClientRect();const x=e.clientX-r.left,y=e.clientY-r.top;
    if(e.pointerType==='mouse'){mouse={x,y};return;}
    if(e.pointerId===touchId){stickDx=clamp((e.clientX-stickX)/54,-1,1);stickDy=clamp((e.clientY-stickY)/54,-1,1);
       const magnitude=Math.max(1,Math.hypot(stickDx,stickDy));stickDx/=magnitude;stickDy/=magnitude;
       stick.querySelector('i')!.setAttribute('style',`transform:translate(${stickDx*40}px,${stickDy*40}px)`);}
  },{signal});
  canvas.addEventListener('pointerdown',e=>{
    if(paused||savedRun||world.phase!=='playing'||e.button!==0&&e.pointerType==='mouse')return;
    if(e.pointerType==='mouse'){mouse={x:e.clientX-canvas.getBoundingClientRect().left,y:e.clientY-canvas.getBoundingClientRect().top};return;}
    if(touchId!==null)return;usingTouch=true;root.dataset.touch='true';touchId=e.pointerId;stickX=e.clientX;stickY=e.clientY;
    stick.style.left=`${e.clientX-root.getBoundingClientRect().left}px`;stick.style.top=`${e.clientY-root.getBoundingClientRect().top}px`;
    stick.classList.add('at-dragging');canvas.setPointerCapture(e.pointerId);e.preventDefault();
  },{signal});
  const endTouch=(e:PointerEvent)=>{if(e.pointerId!==touchId)return;touchId=null;stickDx=stickDy=0;stick.classList.remove('at-dragging');stick.style.left='';stick.style.top='';stick.querySelector('i')!.removeAttribute('style');};
  canvas.addEventListener('pointerup',endTouch,{signal});canvas.addEventListener('pointercancel',endTouch,{signal});
  canvas.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse')mouse=null;},{signal});
  function restart(){world=makeWorld(world.width,world.height,(Math.random()*0xffffffff)>>>0);savedRun=false;clearInput();begin(world);last=null;accumulator=0;renderModal();refreshUI();context.save(snapshot(world));}
  // Native pointer users see a clear on-screen pulse, but not a misleading unused stick.
  if(matchMedia('(pointer:coarse)').matches){usingTouch=true;root.dataset.touch='true';}
  const dims=getDims();resize(world,dims.width,dims.height);setCanvasSize();renderModal();refreshUI();frame=requestAnimationFrame(animate);
  return {
    pause(){paused=true;last=null;clearInput();refreshUI();renderModal();},
    resume(){paused=false;last=null;refreshUI();renderModal();},
    restart,
    serialize(){return snapshot(world);},
    restore(data:unknown){const state=restore(data,world.width,world.height);if(!state)return;world=state;savedRun=world.phase==='playing';last=null;clearInput();refreshUI();renderModal();},
    dispose(){disposed=true;abort.abort();observer.disconnect();cancelAnimationFrame(frame);clearInput();root.remove();}
  };
 }
};
export default game;
