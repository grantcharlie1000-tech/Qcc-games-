import * as THREE from 'three';
import type { GameModule, GameContext, GameInstance } from '../../core/types';
import { createRun, restoreRun, step, trackAt, section, speedAt, RADIUS, SLOPE, LENGTH } from './model';
import './style.css';

function mount(container:HTMLElement,context:GameContext):GameInstance{
  const root=document.createElement('div');root.className='ball-run';
  root.innerHTML=`<div class="br-viewport"><canvas tabindex="0" aria-label="3D downhill ball track. Drag smoothly to steer, or hold Left and Right arrows or A and D."></canvas><div class="br-hud"><span><small>DISTANCE</small><strong class="br-distance">0</strong></span><span class="br-record"><small>ALL TIME</small><strong class="br-best">0</strong></span></div><small class="br-speed">12 m/s</small><div class="br-boost" hidden>Speed Up</div><div class="br-overlay"><p class="br-eyebrow">BALL RUN</p><h2 class="br-heading">Chase the horizon</h2><p class="br-copy">Drag to steer, or hold ← → / A D.<br>Ride the ramps, thread the blocks,<br>and follow the cyan speed gates.</p><button class="game-button br-start">Start rolling</button></div></div>`;
  container.append(root);
  const canvas=root.querySelector('canvas')!,overlay=root.querySelector<HTMLElement>('.br-overlay')!,heading=root.querySelector('.br-heading')!,copy=root.querySelector('.br-copy')!,start=root.querySelector<HTMLButtonElement>('.br-start')!;
  const distanceLabel=root.querySelector('.br-distance')!,bestLabel=root.querySelector('.br-best')!,speedLabel=root.querySelector('.br-speed')!,boostLabel=root.querySelector<HTMLElement>('.br-boost')!;
  let state=createRun(0x42524e,1,context.highScore),awaitingStart=true,paused=false,disposed=false,contextLost=false,frame=0,last=0,accumulator=0,left=false,right=false,drag:number|null=null,pointerStart=0,ballStart=0,pointerTarget=0,lastMeter=-1;
  const abort=new AbortController(),signal=abort.signal;
  let renderer:THREE.WebGLRenderer;
  try{renderer=new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:'low-power'});}
  catch{
    root.innerHTML='<div class="br-fallback" role="status"><h2>3D graphics unavailable</h2><p>Ball Run needs WebGL 2. Enable browser hardware acceleration or try a recent browser.</p><a class="game-button" href="#/">Choose another game</a></div>';
    context.setStatus('This browser could not create a WebGL 2 renderer.');
    return {pause(){},resume(){},restart(){state=createRun(state.seed,state.run+1,Math.max(state.best,context.highScore));},serialize:()=>({...state}),restore(value){const restored=restoreRun(value);if(restored)state=restored;},dispose(){root.remove();}};
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));renderer.setClearColor(0x000000);
  const scene=new THREE.Scene();scene.fog=new THREE.Fog(0x000000,85,170);
  const camera=new THREE.PerspectiveCamera(64,1,.1,190);
  const geometries:THREE.BufferGeometry[]=[],materials:THREE.Material[]=[],instanceMeshes:THREE.InstancedMesh[]=[];
  const box=new THREE.BoxGeometry(1,1,1);geometries.push(box);
  function basic(color:number){const m=new THREE.MeshBasicMaterial({color});materials.push(m);return m;}
  const road=new THREE.Group();scene.add(road);
  function instances(count:number,material:THREE.Material,parent:THREE.Object3D=road){
    const mesh=new THREE.InstancedMesh(box,material,count);mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;parent.add(mesh);instanceMeshes.push(mesh);return mesh;
  }
  const tiles=instances(320,basic(0x30365f)),grid=instances(1900,basic(0x999df5)),obstacles=instances(20,basic(0xd317c1)),cyan=instances(100,basic(0x30e9f4));
  const projection=new THREE.Vector3(),transform=new THREE.Object3D(),lineDirection=new THREE.Vector3(),zAxis=new THREE.Vector3(0,0,1);
  function gridLine(index:number,ax:number,ay:number,az:number,bx:number,by:number,bz:number){
    lineDirection.set(bx-ax,by-ay,bz-az);const length=lineDirection.length();
    transform.position.set((ax+bx)/2,(ay+by)/2,(az+bz)/2);transform.scale.set(.022,.018,length+.006);transform.quaternion.setFromUnitVectors(zAxis,lineDirection.normalize());transform.updateMatrix();grid.setMatrixAt(index,transform.matrix);
  }
  function put(mesh:THREE.InstancedMesh,index:number,x:number,y:number,z:number,sx:number,sy:number,sz:number,rx=0,ry=0){transform.position.set(x,y,z);transform.scale.set(sx,sy,sz);transform.rotation.set(rx,ry,0);transform.updateMatrix();mesh.setMatrixAt(index,transform.matrix);}
  // A pooled city corridor, with dark faces and genuine grid lines on all sides.
  // Both buffers are built once. Four-block variations repeat every 28m.
  const city=new THREE.Group();scene.add(city);
  const buildingMaterial=basic(0x17192f);
  // Bias the filled faces behind their wire grid to prevent coplanar flicker.
  buildingMaterial.polygonOffset=true;buildingMaterial.polygonOffsetFactor=1;buildingMaterial.polygonOffsetUnits=1;
  const buildings=instances(100,buildingMaterial,city),cityLines:number[]=[];
  function line(ax:number,ay:number,az:number,bx:number,by:number,bz:number){cityLines.push(ax,ay,az,bx,by,bz);}
  let buildingIndex=0;
  for(const side of [-1,1])for(let row=0;row<2;row++)for(let i=0;i<25;i++){
    const x=side*(6.5+row*4+((i+row)%4)*.35),z=14-i*7,h=34+row*9+(i%4)*2+(side>0?4:0),lo=-12,w=3,depth=6;
    put(buildings,buildingIndex++,x,lo+h/2,z,w,h,depth);
    const x0=x-w/2,x1=x+w/2,z0=z-depth/2,z1=z+depth/2;
    for(let y=lo;y<=lo+h;y+=1.4){line(x0,y,z0,x1,y,z0);line(x0,y,z1,x1,y,z1);line(x0,y,z0,x0,y,z1);line(x1,y,z0,x1,y,z1);}
    for(let xx=x0;xx<=x1+.01;xx+=1){line(xx,lo,z0,xx,lo+h,z0);line(xx,lo,z1,xx,lo+h,z1);}
    for(let zz=z0;zz<=z1+.01;zz+=1.5){line(x0,lo,zz,x0,lo+h,zz);line(x1,lo,zz,x1,lo+h,zz);}
  }
  buildings.instanceMatrix.needsUpdate=true;
  const cityGeo=new THREE.BufferGeometry();cityGeo.setAttribute('position',new THREE.Float32BufferAttribute(cityLines,3));geometries.push(cityGeo);
  const lineMat=new THREE.LineBasicMaterial({color:0x7f88df});materials.push(lineMat);city.add(new THREE.LineSegments(cityGeo,lineMat));
  const sphere=new THREE.SphereGeometry(RADIUS,32,20);geometries.push(sphere);
  const ballMat=new THREE.MeshPhongMaterial({color:0xc400a9,specular:0xff7cde,shininess:95});materials.push(ballMat);
  const ball=new THREE.Mesh(sphere,ballMat);scene.add(ball);
  scene.add(new THREE.HemisphereLight(0xe4baff,0x210020,2.1));
  const keyLight=new THREE.DirectionalLight(0xffffff,3.2);keyLight.position.set(-3,6,4);scene.add(keyLight);
  const rim=new THREE.DirectionalLight(0x9c5aff,1.2);rim.position.set(4,1,-5);scene.add(rim);
  let cachedOrigin=NaN;
  function rebuildCourse(origin:number){
    let tileIndex=0,gridIndex=0,cyanIndex=0;
    for(let i=0;i<320;i++){
      const d=origin-6+i*.5,t=trackAt(state.seed,Math.max(0,d+.25));if(d<0||!t.ground)continue;
      const a=trackAt(state.seed,d),b=trackAt(state.seed,d+.5),rise=(b.elevation-a.elevation)/.5,rx=Math.atan(rise);
      const y=t.elevation+origin*SLOPE,z=-(d+.25-origin),length=.5*Math.sqrt(1+rise*rise);
      put(tiles,tileIndex++,t.center,y-.09,z,t.width,.18,length+.008,rx);
      for(let lane=0;lane<=4;lane++){const offset=lane/4-.5;gridLine(gridIndex++,a.center+offset*a.width,a.elevation+origin*SLOPE+.02,-(d-origin),b.center+offset*b.width,b.elevation+origin*SLOPE+.02,-(d+.5-origin));}
      if(Math.round(d*2)%4===0)put(grid,gridIndex++,t.center,y+.016,z,t.width,.018,.027,rx);
    }
    tiles.count=tileIndex;grid.count=gridIndex;
    const first=Math.max(0,Math.floor((origin-6)/LENGTH));let obstacleIndex=0;
    for(let i=0;i<8;i++){
      const index=first+i,s=section(state.seed,index,state.course);
      for(const obstacle of s.obstacles){
        const od=index*LENGTH+obstacle.local,ot=trackAt(state.seed,od);
        put(obstacles,obstacleIndex++,ot.center+obstacle.x,ot.elevation+origin*SLOPE+obstacle.height/2,-(od-origin),obstacle.width,obstacle.height,obstacle.depth);
      }
      if(s.acceleration){
        for(const local of [4,12]){
          const gd=index*LENGTH+local,gt=trackAt(state.seed,gd),gy=gt.elevation+origin*SLOPE,gz=-(gd-origin);
          for(const side of [-1,1])put(cyan,cyanIndex++,gt.center+side*(gt.width/2+.08),gy+.8,gz,.055,1.6,.055);
          put(cyan,cyanIndex++,gt.center,gy+1.6,gz,gt.width+.2,.055,.055);
        }
        for(let local=5;local<=11;local+=2){
          const cd=index*LENGTH+local,ct=trackAt(state.seed,cd),cy=ct.elevation+origin*SLOPE+.025,cz=-(cd-origin);
          for(const side of [-1,1])put(cyan,cyanIndex++,ct.center+side*.22,cy,cz,.08,.025,.65,0,side*.65);
        }
      }
    }
    obstacles.count=obstacleIndex;cyan.count=cyanIndex;
    for(const mesh of [tiles,grid,obstacles,cyan])mesh.instanceMatrix.needsUpdate=true;
  }
  function draw(){
    if(disposed||contextLost)return;
    const origin=Math.floor(state.distance*2)/2;if(origin!==cachedOrigin){cachedOrigin=origin;rebuildCourse(origin);}
    road.position.set(0,(state.distance-origin)*SLOPE,state.distance-origin);
    city.position.z=state.distance%28;
    ball.position.set(state.x,state.height+state.distance*SLOPE,0);ball.rotation.set(-state.distance/RADIUS,0,-state.x/RADIUS);
    // Player-relative tracking keeps valid steering visible even on a narrow phone.
    // No extra camera sway, shake or FOV pulse is layered over gameplay.
    const follow=state.x;
    const cameraLift=Math.max(0,ball.position.y-RADIUS);
    camera.position.set(follow,1.8+cameraLift,3.6);camera.lookAt(follow,-1.8+cameraLift,-20);
    renderer.render(scene,camera);projection.copy(ball.position).project(camera);
    root.dataset.ballScreenY=((1-projection.y)/2).toFixed(5);root.dataset.ballScreenX=((1+projection.x)/2).toFixed(5);
    root.dataset.phase=state.phase;root.dataset.x=state.x.toFixed(3);root.dataset.distance=state.distance.toFixed(3);root.dataset.grounded=String(state.grounded);
    root.dataset.drawCalls=String(renderer.info.render.calls);root.dataset.geometries=String(renderer.info.memory.geometries);root.dataset.aspect=camera.aspect.toFixed(5);
    boostLabel.hidden=state.phase!=='running'||!trackAt(state.seed,state.distance).boost;
  }
  function releasePointer(){const pointer=drag;drag=null;if(pointer!==null&&canvas.hasPointerCapture(pointer))canvas.releasePointerCapture(pointer);}
  function clearInput(){left=false;right=false;releasePointer();pointerTarget=state.x;}
  function report(force=false){const meter=Math.floor(state.distance);if(!force&&meter===lastMeter)return;lastMeter=meter;distanceLabel.textContent=String(meter);bestLabel.textContent=String(Math.max(state.best,context.highScore));speedLabel.textContent=`${speedAt(state.distance).toFixed(1)} m/s`;context.setScore(meter);context.setLevel(`Descent ${1+Math.floor(meter/150)}`);}
  function screen(){overlay.hidden=state.phase==='running';start.hidden=false;start.textContent=state.phase==='over'?'Roll again':'Start rolling';heading.textContent=state.phase==='over'?state.reason:'Chase the horizon';copy.innerHTML=state.phase==='over'?`${Math.floor(state.distance)} m travelled · Best ${Math.max(context.highScore,state.best)} m`:'Drag to steer, or hold ← → / A D.<br>Ride the ramps, thread the blocks,<br>and follow the cyan speed gates.';report(true);draw();}
  function save(){context.save({...state});}
  function loop(time:number){
    frame=0;if(disposed||contextLost||paused||awaitingStart||state.phase!=='running')return;
    const delta=last?Math.min((time-last)/1000,.1):0;last=time;accumulator+=delta;
    while(accumulator>=1/120&&state.phase==='running'){
      const input=drag!==null?Math.max(-1,Math.min(1,(pointerTarget-state.x)*3)):Number(right)-Number(left);
      step(state,input,1/120);accumulator-=1/120;
    }
    report();draw();
    if((state.phase as string)==='over'){clearInput();screen();context.setStatus(`${state.reason}. ${Math.floor(state.distance)} metres. Roll again to retry.`);context.announce(`${state.reason}. ${Math.floor(state.distance)} metres.`);context.sound('lose');save();}
    else frame=requestAnimationFrame(loop);
  }
  function schedule(){last=0;accumulator=0;if(!frame&&!paused&&!disposed&&!contextLost&&!awaitingStart&&state.phase==='running')frame=requestAnimationFrame(loop);}
  function begin(){if(paused||disposed||contextLost)return;awaitingStart=false;if(state.phase==='over'){state=createRun((state.seed+1664525)>>>0||1,state.run+1,Math.max(state.best,context.highScore));cachedOrigin=NaN;}state.phase='running';clearInput();screen();context.setStatus('Drag smoothly to steer, or hold Left / Right or A / D. Ramps carry you across the gaps.');context.announce('Rolling. Follow the track.');context.sound('tap');save();canvas.focus();schedule();}
  start.addEventListener('click',begin,{signal});
  function key(e:KeyboardEvent,down:boolean){
    const direction=['ArrowLeft','a','A'].includes(e.key)?'left':['ArrowRight','d','D'].includes(e.key)?'right':null;if(!direction)return;
    // Key release always clears its action, including after dialog/focus changes.
    if(!down){if(direction==='left')left=false;else right=false;return;}
    if(paused||contextLost||state.phase!=='running'||document.querySelector('dialog[open]')||e.ctrlKey||e.metaKey||e.altKey)return;
    if(e.target instanceof HTMLElement&&e.target.matches('input,textarea,select,[contenteditable=true]'))return;
    if(e.repeat&&!(direction==='left'?left:right))return;
    e.preventDefault();if(direction==='left')left=true;else right=true;
  }
  window.addEventListener('keydown',e=>key(e,true),{signal});window.addEventListener('keyup',e=>key(e,false),{signal});window.addEventListener('blur',clearInput,{signal});
  canvas.addEventListener('pointerdown',e=>{if(paused||contextLost||state.phase!=='running'||drag!==null||e.button!==0)return;e.preventDefault();drag=e.pointerId;pointerStart=e.clientX;ballStart=state.x;pointerTarget=state.x;canvas.setPointerCapture(e.pointerId);canvas.focus();},{signal});
  canvas.addEventListener('pointermove',e=>{if(drag!==e.pointerId||paused)return;pointerTarget=ballStart+(e.clientX-pointerStart)/Math.max(1,canvas.clientWidth)*6;},{signal});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,e=>{if((e as PointerEvent).pointerId===drag)releasePointer();},{signal});
  canvas.addEventListener('webglcontextlost',e=>{if(disposed)return;e.preventDefault();contextLost=true;paused=true;cancelAnimationFrame(frame);frame=0;clearInput();overlay.hidden=false;heading.textContent='Graphics interrupted';copy.textContent='Your run is saved. Leave and reopen Ball Run to restore the graphics.';start.hidden=true;boostLabel.hidden=true;save();context.setStatus('Graphics context lost. Leave and reopen the game.');},{signal});
  const resize=new ResizeObserver(()=>{if(disposed||contextLost)return;releasePointer();pointerTarget=state.x;const w=canvas.clientWidth,h=canvas.clientHeight;if(w<1||h<1)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();draw();});resize.observe(canvas);
  screen();context.setStatus('Ready. Drag to steer or use Left / Right and A / D.');
  return {
    pause(){paused=true;clearInput();cancelAnimationFrame(frame);frame=0;},
    resume(){if(disposed||contextLost)return;paused=false;schedule();},
    restart(){if(contextLost)return;cancelAnimationFrame(frame);frame=0;awaitingStart=true;clearInput();state=createRun((state.seed+1664525)>>>0||1,state.run+1,Math.max(state.best,context.highScore));cachedOrigin=NaN;lastMeter=-1;screen();context.setStatus('Fresh track. Start rolling when ready.');save();},
    serialize:()=>({...state}),
    restore(value){const restored=restoreRun(value);if(!restored)return;cancelAnimationFrame(frame);frame=0;clearInput();state=restored;cachedOrigin=NaN;awaitingStart=true;state.best=Math.max(state.best,context.highScore);screen();if(state.phase==='running'){overlay.hidden=false;heading.textContent='Your descent awaits';copy.textContent=`Resume from ${Math.floor(state.distance)} metres. Ramps now carry you across the gaps — steer to stay on the road.`;start.textContent='Continue rolling';context.setStatus('Saved run ready. Continue rolling to resume.');}},
    dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(frame);frame=0;clearInput();abort.abort();resize.disconnect();for(const mesh of instanceMeshes)mesh.dispose();for(const g of geometries)g.dispose();for(const m of materials)m.dispose();renderer.dispose();renderer.forceContextLoss();scene.clear();root.remove();}
  };
}
const game:GameModule=Object.freeze({id:'ball-run',title:'Ball Run',cover:'game-art/ball-run/cover.svg',rules:'Roll as far as you can. Drag smoothly across the track, or hold Left / Right arrows or A / D to steer. Ride ramps across gaps and follow the cyan acceleration gates. Avoid magenta blocks and stay on narrow sections. Falling off an edge or hitting a block ends the run. Speed increases gradually and cyan sections give a temporary boost. Your best distance is saved. Start rolling or Continue rolling begins a run; Roll again gives you a fresh track.',mount});
export default game;
