import type {GameModule} from '../../core/types';
import {createFlight,flap,advance,restoreFlight,visibleGates,speedOf,SPEED,BIRD_X,GATE_WIDTH,HEIGHT,type Flight} from './model';
import {drawFlight} from './art';
import {christmas} from '../../festive/festive';
import {floorDpr,floorTierActive} from '../../perf/floor';
import {notifyGlassFrame,registerGlassFrameSource} from '../../ui/glass-frame-source';
import './style.css';
import './christmas.css';

const game:GameModule={id:'flappy-bird',title:'Flappy Bird',cover:'game-art/flappy-bird/cover.svg',rules:'Guide the swift through the gates. Press Space, Up arrow or W, click or tap the scene to flap. Each press gives one upward beat; holding a key does not repeat. Gravity pulls you down. Clear a whole gate to earn one point. Each cleared gate makes the flight faster, up to 1.9 times the starting pace. Touching a gate, the sky edge or the ground ends the flight. The first gates are wider, then the opening gradually narrows. Pause freezes the flight. Continue flight resumes a saved run when you choose. Fly again starts a new seeded route; your best score stays saved on this device.',mount(container,context){

  const root=document.createElement('div');root.className='flappy-bird';
  root.innerHTML=`<div class="fb-scene"><canvas data-glass-ink="textured" tabindex="0" role="img" aria-label="Pixel flight. Press Space, Up arrow or W to flap; click or tap to flap."></canvas><span class="fb-location" aria-hidden="true"></span><div class="fb-card"><h2>Flappy Bird</h2><p class="fb-copy">Space / click / tap</p><button class="game-button fb-start">Take flight</button></div></div>`;
  container.append(root);
  const canvas=root.querySelector('canvas')!,ctx=canvas.getContext('2d')!,card=root.querySelector<HTMLElement>('.fb-card')!,heading=card.querySelector('h2')!,copy=root.querySelector('.fb-copy')!,start=root.querySelector<HTMLButtonElement>('.fb-start')!,location=root.querySelector<HTMLElement>('.fb-location')!;
  const pixels=document.createElement('canvas'),paint=pixels.getContext('2d')!;
  const events=new AbortController(),signal=events.signal;
  let state=createFlight(undefined,1,context.highScore),paused=false,waiting=false,disposed=false,frame=0,last:number|null=null,reported=-1;
  let visualTime=0,tilt=0,flapAge=10,scoreAge=10,ending=0,boundsW=0,boundsH=0,lastLoc='',lastPhase='',lastTick=-1,lastSpeed=-1;
  const motionQuery=matchMedia('(prefers-reduced-motion: reduce)');
  const reduced=()=>context.settings.reducedMotion||motionQuery.matches;
  function save(){context.save({...state});}
  function measure(){const b=canvas.getBoundingClientRect();boundsW=b.width;boundsH=b.height;}
  function draw(){
    if(!boundsW||!boundsH)measure();
    if(!boundsW||!boundsH)return;
    const device=devicePixelRatio||1,ratio=floorTierActive()?floorDpr(boundsW,boundsH,device):Math.min(device,2);
    const w=Math.max(1,Math.round(boundsW*ratio)),h=Math.max(1,Math.round(boundsH*ratio));
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    const width=HEIGHT*boundsW/boundsH,pw=Math.max(1,Math.round(width));
    if(pixels.width!==pw||pixels.height!==HEIGHT){pixels.width=pw;pixels.height=HEIGHT;}
    paint.setTransform(1,0,0,1,0,0);
    drawFlight(paint,state,{width:pw,time:visualTime,tilt,flapAge,scoreAge,reducedMotion:reduced()});
    ctx.setTransform(1,0,0,1,0,0);ctx.imageSmoothingEnabled=false;ctx.drawImage(pixels,0,0,w,h);
    if(lastPhase!==state.phase){lastPhase=state.phase;root.dataset.phase=state.phase;}
    if(lastTick!==state.tick){
      lastTick=state.tick;root.dataset.tick=String(state.tick);
      root.dataset.y=state.y.toFixed(3);root.dataset.vy=state.vy.toFixed(3);
      root.dataset.target=String(visibleGates(state).find(g=>g.x+GATE_WIDTH>=BIRD_X-12)?.center??260);
    }
    const spd=speedOf(state);
    if(lastSpeed!==spd){lastSpeed=spd;root.dataset.speed=String(spd);}
    const loc=`${christmas()?'Winter Village':'Golden Marsh'} / ${(spd/SPEED).toFixed(1)}×`;
    if(lastLoc!==loc){lastLoc=loc;location.textContent=loc;}
    notifyGlassFrame(canvas);
  }
  // Glass repaint requests redraw only. They never advance the simulation or visual clock.
  const releaseGlass=registerGlassFrameSource(canvas,()=>{if(!disposed)draw();});
  function report(){
    if(reported!==state.score){reported=state.score;context.setScore(state.score);context.setLevel(christmas()?'Winter Village':'Golden Marsh');}
  }
  function screen(){
    card.hidden=state.phase==='running'&&!waiting;start.disabled=paused;
    if(state.phase==='over'){
      heading.textContent='Flight over';
      copy.textContent=`${state.score} gates · Best ${Math.max(state.best,context.highScore)}`;start.textContent='Fly again';
    }else if(waiting){
      heading.textContent='Saved flight';
      copy.textContent=`${state.score} gates`;start.textContent='Continue flight';
    }else{
      heading.textContent='Flappy Bird';
      copy.textContent='Space / click / tap';start.textContent='Take flight';
    }
    report();draw();
  }
  function stop(){if(frame)cancelAnimationFrame(frame);frame=0;last=null;}
  function schedule(){
    const animating=state.phase==='running'||(!reduced()&&(state.phase==='ready'||ending>0));
    if(!frame&&!paused&&!waiting&&!disposed&&!document.hidden&&animating)frame=requestAnimationFrame(loop);
  }
  function loop(time:number){
    frame=0;if(disposed||paused||waiting||document.hidden)return;
    const dt=last===null?0:Math.min(.1,Math.max(0,(time-last)/1000));last=time;
    visualTime+=dt;flapAge+=dt;scoreAge+=dt;ending=Math.max(0,ending-dt);
    const score=state.score,wasRunning=state.phase==='running';advance(state,dt);
    const target=state.phase==='ready'?Math.sin(visualTime*3)*.06:Math.max(-.38,Math.min(1.1,state.vy/600));
    tilt+=(target-tilt)*(1-Math.exp(-dt*14));
    if(state.score!==score){scoreAge=0;context.sound('success');context.announce(`${state.score} gates cleared.`);save();}
    report();draw();
    if(wasRunning&&(state.phase as Flight['phase'])==='over'){
      ending=.25;screen();context.setStatus(`Flight over. ${state.score} gates.`);
      context.announce(`Flight ended. ${state.score} gates cleared.`);context.sound('lose');save();
    }
    schedule();
  }
  function reset(){
    stop();state=createFlight((Math.imul(state.seed,1664525)+1013904223)>>>0||1,state.run+1,Math.max(state.best,context.highScore));
    waiting=false;reported=-1;tilt=0;flapAge=10;scoreAge=10;ending=0;
    screen();context.setStatus('Ready');save();schedule();
  }
  function action(){
    if(paused||disposed||state.phase==='over'||document.hidden||document.querySelector('dialog[open]'))return;
    waiting=false;flapAge=0;tilt=-.28;flap(state);context.sound('tap');screen();context.setStatus('Playing');schedule();
  }
  start.addEventListener('click',()=>{
    if(paused||disposed)return;
    if(state.phase==='over')reset();
    if(waiting){waiting=false;last=null;screen();schedule();context.setStatus('Flight resumed');}
    else action();
    save();canvas.focus({preventScroll:true});
  },{signal});
  canvas.addEventListener('pointerdown',event=>{if(!event.isPrimary||event.button!==0)return;event.preventDefault();action();canvas.focus({preventScroll:true});},{signal});
  window.addEventListener('keydown',event=>{
    if(![' ','ArrowUp','w','W'].includes(event.key)||event.repeat||event.ctrlKey||event.metaKey||event.altKey||paused||disposed||document.querySelector('dialog[open]'))return;
    if(event.target instanceof HTMLElement&&event.target.closest('button,a,input,textarea,select,[contenteditable=true]'))return;
    event.preventDefault();action();
  },{signal});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else{last=null;schedule();}},{signal});
  motionQuery.addEventListener('change',()=>{stop();draw();schedule();},{signal});
  const observer=new ResizeObserver(()=>{if(!disposed){measure();draw();}});observer.observe(root);
  screen();context.setStatus('Ready');schedule();
  return {
    pause(){paused=true;stop();screen();},
    resume(){if(disposed)return;paused=false;last=null;screen();schedule();},
    restart:reset,
    serialize:()=>({...state}),
    restore(value){const restored=restoreFlight(value);if(!restored)return;stop();state=restored;state.best=Math.max(state.best,context.highScore);waiting=state.phase==='running';reported=-1;screen();context.setStatus(waiting?'Saved flight':'Ready');schedule();},
    dispose(){if(disposed)return;disposed=true;releaseGlass();stop();observer.disconnect();events.abort();root.remove();}
  };
}};
export default game;
