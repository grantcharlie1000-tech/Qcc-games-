import type {GameModule} from '../../core/types';
import {createFlight,flap,advance,restoreFlight,visibleGates,BIRD_X,GATE_WIDTH,WIDTH,HEIGHT,type Flight} from './model';
import {drawFlight} from './art';
import './style.css';
const game:GameModule={id:'flappy-bird',title:'Flappy Bird',cover:'game-art/flappy-bird/cover.svg',rules:'Guide our marsh swift through the reed gates. Press Space, Up arrow or W, click or tap the scene, or use the Flap button to flap. Each press gives one upward beat; holding a key does not repeat. Gravity pulls you down. Clear a whole gate to earn one point. Touching a reed, the sky edge or the water ends the flight. The first gates are wider, then the opening gradually narrows. Pause freezes the flight. Continue flight resumes a saved run when you choose. Fly again starts a new seeded route; your best score stays saved on this device.',mount(container,context){
  const root=document.createElement('div');root.className='flappy-bird';
  root.innerHTML=`<div class="fb-scene"><canvas tabindex="0" role="img" aria-label="Marsh flight. Press Space, Up arrow or W to flap; click or tap to flap." aria-describedby="fb-help"></canvas><div class="fb-card"><p class="fb-eyebrow">A LITTLE LIFT</p><h2>Find your rhythm</h2><p class="fb-copy">One small swift. A sky of possibilities.<br>Flap through the reeds.</p><button class="game-button fb-start">Take flight</button></div></div><div class="fb-actions"><button class="game-button fb-flap" aria-label="Flap">Flap <span aria-hidden="true">↑</span></button><p id="fb-help" class="fb-help">Space / ↑ / W · Click or tap<br>One point for every gate</p></div>`;
  container.append(root);
  const canvas=root.querySelector('canvas')!,ctx=canvas.getContext('2d')!,card=root.querySelector<HTMLElement>('.fb-card')!,heading=card.querySelector('h2')!,copy=root.querySelector('.fb-copy')!,start=root.querySelector<HTMLButtonElement>('.fb-start')!,button=root.querySelector<HTMLButtonElement>('.fb-flap')!;
  const events=new AbortController(),signal=events.signal;
  let state=createFlight(undefined,1,context.highScore),paused=false,waiting=false,disposed=false,frame=0,last:number|null=null,reported=-1;
  function save(){context.save({...state});}
  function draw(){
    const ratio=Math.min(devicePixelRatio||1,2),w=Math.round(WIDTH*ratio),h=Math.round(HEIGHT*ratio);
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    ctx.setTransform(w/WIDTH,0,0,h/HEIGHT,0,0);drawFlight(ctx,state,context.settings.reducedMotion);
    root.dataset.phase=state.phase;root.dataset.tick=String(state.tick);root.dataset.y=state.y.toFixed(3);root.dataset.vy=state.vy.toFixed(3);
    root.dataset.target=String(visibleGates(state).find(g=>g.x+GATE_WIDTH>=BIRD_X-12)?.center??260);
  }
  function report(){
    if(reported!==state.score){reported=state.score;context.setScore(state.score);context.setLevel('Reed flight');}
  }
  function screen(){
    card.hidden=state.phase==='running'&&!waiting;start.disabled=paused;button.disabled=paused||state.phase==='over';
    if(state.phase==='over'){heading.textContent=state.reason;copy.textContent=`${state.score} gates cleared · Best ${Math.max(state.best,context.highScore)}`;start.textContent='Fly again';}
    else if(waiting){heading.textContent='Your sky is waiting';copy.textContent=`Continue from ${state.score} gates. Flap when you need a lift.`;start.textContent='Continue flight';}
    else{heading.textContent='Find your rhythm';copy.innerHTML='One small swift. A sky of possibilities.<br>Flap through the reeds.';start.textContent='Take flight';}
    report();draw();
  }
  function stop(){if(frame)cancelAnimationFrame(frame);frame=0;last=null;}
  function schedule(){if(!frame&&!paused&&!waiting&&!disposed&&state.phase==='running')frame=requestAnimationFrame(loop);}
  function loop(time:number){
    frame=0;if(disposed||paused||waiting||state.phase!=='running')return;
    const score=state.score;advance(state,last===null?0:Math.min(.1,Math.max(0,(time-last)/1000)));last=time;
    if(state.score!==score){context.sound('success');context.announce(`${state.score} gates cleared.`);save();}
    report();draw();
    if((state.phase as Flight['phase'])==='over'){screen();context.setStatus(`${state.reason} ${state.score} gates. Fly again to retry.`);context.announce(`Flight ended. ${state.score} gates cleared.`);context.sound('lose');save();}
    else schedule();
  }
  function reset(){stop();state=createFlight((Math.imul(state.seed,1664525)+1013904223)>>>0||1,state.run+1,Math.max(state.best,context.highScore));waiting=false;reported=-1;screen();context.setStatus('Ready. Space, Up arrow, W, click or tap to flap.');save();}
  function action(){
    if(paused||disposed||state.phase==='over'||document.querySelector('dialog[open]'))return;
    waiting=false;flap(state);context.sound('tap');screen();context.setStatus('Find your rhythm. Clear the reeds and stay above the water.');schedule();
  }
  start.addEventListener('click',()=>{
    if(paused||disposed)return;
    if(state.phase==='over')reset();
    if(waiting){waiting=false;last=null;screen();schedule();context.setStatus('Flight resumed. Space, click or tap to flap.');}
    else action();
    save();canvas.focus({preventScroll:true});
  },{signal});
  button.addEventListener('click',()=>{action();canvas.focus({preventScroll:true});},{signal});
  canvas.addEventListener('pointerdown',event=>{if(!event.isPrimary||event.button!==0)return;event.preventDefault();action();canvas.focus({preventScroll:true});},{signal});
  window.addEventListener('keydown',event=>{
    if(![' ','ArrowUp','w','W'].includes(event.key)||event.repeat||event.ctrlKey||event.metaKey||event.altKey||paused||disposed||document.querySelector('dialog[open]'))return;
    if(event.target instanceof HTMLElement&&event.target.closest('button,a,input,textarea,select,[contenteditable=true]'))return;
    event.preventDefault();action();
  },{signal});
  screen();context.setStatus('Ready. Space, Up arrow, W, click or tap to flap.');
  return {
    pause(){paused=true;stop();screen();},
    resume(){if(disposed)return;paused=false;last=null;screen();schedule();},
    restart:reset,
    serialize:()=>({...state}),
    restore(value){const restored=restoreFlight(value);if(!restored)return;stop();state=restored;state.best=Math.max(state.best,context.highScore);waiting=state.phase==='running';reported=-1;screen();context.setStatus(waiting?'Saved flight ready. Continue flight when you are ready.':'Space, Up arrow, W, click or tap to flap.');},
    dispose(){if(disposed)return;disposed=true;stop();events.abort();root.remove();}
  };
}};
export default game;
