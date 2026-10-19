import * as THREE from 'three';
import type { GameModule, GameContext, GameInstance } from '../../core/types';
import { createRun, restoreRun, step, trackAt, section, speedAt, RADIUS, SLOPE, LENGTH } from './model';
import './style.css';

function mount(container:HTMLElement, context:GameContext):GameInstance {
  const root=document.createElement('div');root.className='ball-run';
  root.innerHTML=`<div class="br-viewport"><canvas tabindex="0" aria-label="3D downhill ball track. Arrow keys or A and D steer. Space or Up jumps."></canvas><div class="br-hud"><span>NEON DESCENT</span><strong class="br-distance">0 m</strong><small class="br-speed">12 m/s</small></div><div class="br-overlay"><p class="br-eyebrow">KEEP YOUR BALANCE</p><h2 class="br-heading">Chase the horizon</h2><p class="br-copy">Steer around blocks. Jump the striped gaps.<br>The track gets faster as you descend.</p><button class="game-button br-start">Start rolling</button></div></div><div class="br-actions"><button class="game-button secondary br-left" aria-label="Steer left"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m11 2-6 6 6 6" fill="none" stroke="currentColor" stroke-width="3"/></svg><span>Left</span></button><button class="game-button br-jump">Jump <span>↑ / Space</span></button><button class="game-button secondary br-right" aria-label="Steer right"><span>Right</span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m5 2 6 6-6 6" fill="none" stroke="currentColor" stroke-width="3"/></svg></button></div><p class="game-help">← → or A / D to steer · Space / ↑ to jump<br>Touch: hold a direction or drag on the track.</p>`;
  container.append(root);
  const canvas=root.querySelector('canvas')!;
  const overlay=root.querySelector<HTMLElement>('.br-overlay')!;
  const heading=root.querySelector('.br-heading')!;
  const copy=root.querySelector('.br-copy')!;
  const start=root.querySelector<HTMLButtonElement>('.br-start')!;
  const distanceLabel=root.querySelector('.br-distance')!;
  const speedLabel=root.querySelector('.br-speed')!;
  let renderer:THREE.WebGLRenderer;
  let state=createRun(0x42524e,1,context.highScore);
  let awaitingStart=true,paused=false,disposed=false,frame=0,last=0,accumulator=0,jump=false,left=false,right=false,drag:number|null=null,pointerInput=0,lastMeter=-1;
  const abort=new AbortController(); const signal=abort.signal;
  try {renderer=new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:'low-power'});}
  catch {
    root.querySelector('.br-viewport')!.innerHTML='<div class="br-fallback" role="status"><h2>3D graphics unavailable</h2><p>Ball Run needs WebGL 2. Try enabling browser hardware acceleration or opening it in a recent browser.</p><a class="game-button" href="#/">Choose another game</a></div>';
    root.querySelector('.br-actions')!.remove();context.setStatus('This browser could not create a WebGL 2 renderer.');
    return {pause(){},resume(){},restart(){},serialize:()=>state,restore(){},dispose(){root.remove();}};
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
  renderer.setClearColor(0x090b24);
  const scene=new THREE.Scene();scene.fog=new THREE.Fog(0x090b24,45,138);
  const camera=new THREE.PerspectiveCamera(58,1,.1,180);
  const geometries:THREE.BufferGeometry[]=[]; const materials:THREE.Material[]=[];
  const box=new THREE.BoxGeometry(1,1,1);geometries.push(box);
  function mat(color:number,lit=false){const m=lit?new THREE.MeshStandardMaterial({color,roughness:.4,metalness:.15}):new THREE.MeshBasicMaterial({color});materials.push(m);return m;}
  function instances(count:number,material:THREE.Material){const mesh=new THREE.InstancedMesh(box,material,count);mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;scene.add(mesh);return mesh;}
  const tiles=instances(112,mat(0x26294f));
  const cyan=instances(112,mat(0x30e8ed));const pink=instances(112,mat(0xff48b3));
  const stripes=instances(112,mat(0xffe681));const obstacles=instances(9,mat(0xff9d4b,true));
  const sphere=new THREE.SphereGeometry(RADIUS,20,12);geometries.push(sphere);
  const ball=new THREE.Group();const body=new THREE.Mesh(sphere,mat(0xff4ab7,true));ball.add(body);
  const ringGeo=new THREE.TorusGeometry(RADIUS*.995,.025,5,24);geometries.push(ringGeo);
  const ringMat=mat(0xfff7dc);for(let i=0;i<2;i++){const m=new THREE.Mesh(ringGeo,ringMat);m.rotation.y=i*Math.PI/2;ball.add(m);}scene.add(ball);
  scene.add(new THREE.HemisphereLight(0xb9f7ff,0x54205b,2));const sun=new THREE.DirectionalLight(0xffffff,2.2);sun.position.set(-4,9,4);scene.add(sun);
  // Fixed low-poly silhouettes supply depth without textures, shadows or postprocessing.
  const peakGeo=new THREE.ConeGeometry(1,1,4);geometries.push(peakGeo);const peaks=new THREE.InstancedMesh(peakGeo,mat(0x191c43),22);scene.add(peaks);peaks.frustumCulled=false;
  const transform=new THREE.Object3D();
  function put(mesh:THREE.InstancedMesh,index:number,x:number,y:number,z:number,sx:number,sy:number,sz:number,tilt=0){transform.position.set(x,y,z);transform.scale.set(sx,sy,sz);transform.rotation.set(tilt,0,0);transform.updateMatrix();mesh.setMatrixAt(index,transform.matrix);}
  for(let i=0;i<22;i++){const z=-i*6;put(peaks,i,(i%2?-1:1)*(11+i%4*3),-3-i*.65,z,5+i%3,8+i%5*2,7);}
  peaks.instanceMatrix.needsUpdate=true;
  const tilt=-Math.atan(SLOPE);
  function draw(){
    if(disposed)return;
    const origin=Math.floor((state.distance-7)/1.5)*1.5;
    for(let i=0;i<112;i++){
      const d=origin+i*1.5+.75;const t=trackAt(state.seed,Math.max(0,d));const rel=d-state.distance;
      const visible=d>=0&&t.ground;
      const y=-rel*SLOPE;
      put(tiles,i,t.center,y-.16,-rel,visible?t.width:0,.3,1.51,tilt);
      put(cyan,i,t.center-t.width/2,y+.015,-rel,visible?.07:0,.055,1.51,tilt);
      put(pink,i,t.center+t.width/2,y+.015,-rel,visible?.07:0,.055,1.51,tilt);
      const warn=t.gap>0&&t.local>=13&&t.local<17;
      put(stripes,i,t.center,y+.012,-rel,visible&&(warn||i%4===0)?(warn?t.width:.07):0,.025,warn?.28:.65,tilt);
    }
    const first=Math.floor(state.distance/LENGTH);
    for(let i=0;i<9;i++){
      const n=first+i;const s=section(state.seed,n);const d=n*LENGTH+12;const rel=d-state.distance;const t=trackAt(state.seed,d);
      put(obstacles,i,t.center+s.obstacle,-rel*SLOPE+.475,-rel,s.obstacle?.96:0,.95,.96);
    }
    for(const mesh of [tiles,cyan,pink,stripes,obstacles])mesh.instanceMatrix.needsUpdate=true;
    ball.position.set(state.x,state.height,0);ball.rotation.set(-state.distance/RADIUS,0,-state.x/RADIUS);
    // Camera follows steering softly; reduced motion removes lateral camera sway.
    const follow=context.settings.reducedMotion?0:state.x*.28;
    camera.position.set(follow,5.2,8.5);camera.lookAt(follow*.5,-1.9,-14);
    renderer.render(scene,camera);
    root.dataset.phase=state.phase;root.dataset.x=state.x.toFixed(3);root.dataset.distance=state.distance.toFixed(3);
    root.dataset.drawCalls=String(renderer.info.render.calls);root.dataset.geometries=String(renderer.info.memory.geometries);
  }
  function clearInput(){left=false;right=false;jump=false;drag=null;pointerInput=0;}
  function report(force=false){const meter=Math.floor(state.distance);if(!force&&meter===lastMeter)return;lastMeter=meter;distanceLabel.textContent=`${meter} m`;speedLabel.textContent=`${speedAt(state.distance).toFixed(1)} m/s`;context.setScore(meter);context.setLevel(`Descent ${1+Math.floor(meter/150)}`);}
  function screen(){overlay.hidden=state.phase==='running';start.textContent=state.phase==='over'?'Roll again':'Start rolling';heading.textContent=state.phase==='over'?state.reason:'Chase the horizon';copy.textContent=state.phase==='over'?`${Math.floor(state.distance)} m travelled · Best ${Math.max(context.highScore,state.best)} m`:'Steer around blocks. Jump the striped gaps. The track gets faster as you descend.';report(true);draw();}
  function save(){context.save({...state});}
  function loop(time:number){frame=0;if(disposed||paused||awaitingStart||state.phase!=='running')return;
    const delta=last?Math.min((time-last)/1000,.1):0;last=time;accumulator+=delta;
    while(accumulator>=1/120&&state.phase==='running'){const wasGrounded=state.grounded;step(state,drag!==null?pointerInput:Number(right)-Number(left),jump,1/120);if(jump&&wasGrounded)context.sound('tap');jump=false;accumulator-=1/120;}
    report();draw();
    if((state.phase as string)==='over'){clearInput();screen();context.setStatus(`${state.reason}. ${Math.floor(state.distance)} metres. Roll again to retry.`);context.announce(`${state.reason}. ${Math.floor(state.distance)} metres.`);context.sound('lose');save();}
    else frame=requestAnimationFrame(loop);
  }
  function schedule(){last=0;accumulator=0;if(!frame&&!paused&&!disposed&&!awaitingStart&&state.phase==='running')frame=requestAnimationFrame(loop);}
  function begin(){if(paused||disposed)return;awaitingStart=false;if(state.phase==='over')state=createRun((state.seed+1664525)>>>0||1,state.run+1,Math.max(state.best,context.highScore));state.phase='running';clearInput();screen();context.setStatus('Steer with arrows or A / D. Jump with Space or Up.');context.announce('Rolling. Stay on the neon track.');context.sound('tap');save();canvas.focus();schedule();}
  start.addEventListener('click',begin,{signal});
  function requestJump(){if(!paused&&state.phase==='running')jump=true;}
  root.querySelector('.br-jump')!.addEventListener('click',requestJump,{signal});
  function bindDirection(selector:string,direction:'left'|'right'){
    const b=root.querySelector<HTMLButtonElement>(selector)!;
    const set=(v:boolean)=>{if(direction==='left')left=v;else right=v;};
    b.addEventListener('pointerdown',e=>{if(paused||state.phase!=='running')return;e.preventDefault();b.setPointerCapture(e.pointerId);set(true);},{signal});
    for(const event of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(event,()=>set(false),{signal});
    // Native keyboard button activation gives an accessible short steering nudge.
    b.addEventListener('keydown',e=>{if((e.key===' '||e.key==='Enter')&&!paused){e.preventDefault();set(true);}},{signal});
    b.addEventListener('keyup',()=>set(false),{signal});b.addEventListener('blur',()=>set(false),{signal});
  }
  bindDirection('.br-left','left');bindDirection('.br-right','right');
  const key=(e:KeyboardEvent,down:boolean)=>{
    if(paused||document.querySelector('dialog[open]')||e.ctrlKey||e.metaKey||e.altKey)return;
    if(e.target instanceof HTMLElement&&e.target.matches('input,textarea,select'))return;
    if(e.target instanceof HTMLButtonElement&&e.key===' ')return;
    if(!['ArrowLeft','ArrowRight','a','A','d','D','ArrowUp',' ','w','W'].includes(e.key))return;e.preventDefault();
    if(state.phase!=='running')return;
    if(['ArrowLeft','a','A'].includes(e.key))left=down;else if(['ArrowRight','d','D'].includes(e.key))right=down;else if(down&&!e.repeat)requestJump();
  };
  window.addEventListener('keydown',e=>key(e,true),{signal});window.addEventListener('keyup',e=>key(e,false),{signal});window.addEventListener('blur',clearInput,{signal});
  canvas.addEventListener('pointerdown',e=>{if(paused||state.phase!=='running')return;drag=e.pointerId;canvas.setPointerCapture(e.pointerId);pointerInput=0;canvas.dataset.pointerStart=String(e.clientX);},{signal});
  canvas.addEventListener('pointermove',e=>{if(drag!==e.pointerId||paused)return;const width=canvas.getBoundingClientRect().width;pointerInput=Math.max(-1,Math.min(1,(e.clientX-Number(canvas.dataset.pointerStart))/(width*.18)));},{signal});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,()=>{drag=null;pointerInput=0;},{signal});
  canvas.addEventListener('webglcontextlost',e=>{if(disposed)return;e.preventDefault();paused=true;cancelAnimationFrame(frame);frame=0;clearInput();overlay.hidden=false;heading.textContent='Graphics interrupted';copy.textContent='Leave and reopen Ball Run to restore your saved descent.';start.hidden=true;save();context.setStatus('Graphics context lost. Leave and reopen the game.');},{signal});
  const resize=new ResizeObserver(()=>{if(disposed)return;const w=canvas.clientWidth,h=canvas.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();draw();});resize.observe(canvas);
  screen();context.setStatus('Ready to descend. Start rolling when you are ready.');
  return {
    pause(){paused=true;clearInput();cancelAnimationFrame(frame);frame=0;},
    resume(){if(disposed)return;paused=false;schedule();},
    restart(){cancelAnimationFrame(frame);frame=0;awaitingStart=true;clearInput();state=createRun((state.seed+1664525)>>>0||1,state.run+1,Math.max(state.best,context.highScore));lastMeter=-1;screen();context.setStatus('Fresh track. Start rolling when ready.');save();},
    serialize:()=>({...state}),
    restore(value){const restored=restoreRun(value);if(!restored)return;cancelAnimationFrame(frame);frame=0;clearInput();state=restored;awaitingStart=true;state.best=Math.max(state.best,context.highScore);screen();if(state.phase==='running'){// Restored runs wait for an explicit start, preserving their world exactly.
      overlay.hidden=false;heading.textContent='Your descent awaits';copy.textContent=`Resume from ${Math.floor(state.distance)} metres. The same track is waiting.`;start.textContent='Continue rolling';context.setStatus('Saved run ready. Continue rolling to resume.');
    }},
    dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(frame);frame=0;abort.abort();resize.disconnect();for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const mesh of [tiles,cyan,pink,stripes,obstacles,peaks])mesh.dispose();renderer.dispose();renderer.forceContextLoss();scene.clear();root.remove();}
  };
}
const game:GameModule=Object.freeze({id:'ball-run',title:'Ball Run',cover:'game-art/ball-run/cover.svg',rules:'Roll downhill as far as you can. Steer with Left / Right arrows, A / D, the direction buttons, or drag across the track. Jump with Space, Up, W, or Jump. Avoid orange blocks and jump across gaps marked with yellow stripes. Falling off an edge or hitting a block ends the run. Speed increases gradually. Your best distance is saved. Start rolling or Continue rolling begins a run; Roll again gives you a fresh track.',mount});
export default game;
