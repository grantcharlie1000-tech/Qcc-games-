import Matter from 'matter-js';
import type { GameModule } from '../../core/types';
import { AnimalWorld, ANIMALS, KINDS, WIDTH, HEIGHT, FLOOR, createAnimal, TAP_ROTATION_RADIANS } from './model';
import type { Animal, Kind } from './model';
import { animalSvg, ART_BOX } from './art';
import { AnimalGesture } from './input';
import { frameCamera } from './framing';
import './style.css';
const module:GameModule={
 id:'animal-stack',title:'Animal Stack',cover:'game-art/animal-stack/cover.svg',
 rules:'Drag only the waiting animal left or right. A short tap rotates it 45°. Press DROP, Space or Enter to release. A/D or Left/Right move; Q/E rotate. Wait for each animal to settle. Each animal connected to the platform and still for half a second earns 100 points, plus 2 points per centimetre of your best tower height. Whole animals can tip and tumble. An animal falling off ends the run. Balance 40 animals to complete the stack.',
 mount(container,context){
  container.innerHTML='<div class="animal-stack"><canvas tabindex="0" aria-label="Animal Stack. Drag the waiting animal horizontally; tap to rotate 45°. Press DROP or Space to release."></canvas><div class="animal-stack__bubble" hidden aria-hidden="true"></div><button class="animal-stack__drop" data-drop>DROP</button><p class="animal-stack__status" role="status"></p></div>';
  const root=container.firstElementChild as HTMLElement,canvas=root.querySelector('canvas')!,draw=canvas.getContext('2d')!,dropButton=root.querySelector<HTMLButtonElement>('[data-drop]')!,bubble=root.querySelector<HTMLElement>('.animal-stack__bubble')!,status=root.querySelector<HTMLElement>('.animal-stack__status')!;
  let world=new AnimalWorld(),paused=false,disposed=false,raf:number|null=null,last=0,accumulator=0,camera=0,previousScore=-1,previousEnd=false,lastUI='',bubbleUntil=0,heldAimAt=0;
  let preview=createAnimal(world.nextKind,world.aimX,world.spawnY);
  const gesture=new AnimalGesture(),keys=new Set<string>();
  let colliderOverlay=new URLSearchParams(location.search).has('animal-colliders');
  const sprites={} as Record<Kind,HTMLImageElement>;
  for(const kind of KINDS){const image=new Image();image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(animalSvg(kind));sprites[kind]=image;}
  let scale=1,left=0,top=0,ratio=1;
  function resize(){const box=canvas.getBoundingClientRect();ratio=Math.min(2,devicePixelRatio||1);canvas.width=Math.max(1,Math.round(box.width*ratio));canvas.height=Math.max(1,Math.round(box.height*ratio));scale=Math.min(box.width/WIDTH,box.height/HEIGHT);left=(box.width-WIDTH*scale)/2;top=box.height*.73-FLOOR*scale;clearPointer();if(paused)render();}
  function sync(){
   root.dataset.tick=String(world.tick);
   const lastAnimal=world.animals.at(-1);root.dataset.bodyAngle=String(lastAnimal?.body.angle??0);root.dataset.bodyBottom=String(lastAnimal?.body.bounds.max.y??0);
   const signature=[world.animals.length,world.supportedCount,world.height,world.ready,world.aimX,world.rotation,world.score,world.over,world.complete,paused,world.nextKind,colliderOverlay].join('|');if(signature===lastUI)return;lastUI=signature;
   Object.assign(root.dataset,{count:String(world.animals.length),balanced:String(world.supportedCount),ready:String(world.ready),aim:String(Math.round(world.aimX)),angle:String(world.rotation),over:String(world.over),next:world.nextKind,colliders:String(colliderOverlay),rotationAdaptation:'45deg'});
   dropButton.disabled=paused||!world.ready;dropButton.textContent='DROP';dropButton.setAttribute('aria-label',`Drop ${ANIMALS[world.nextKind].name}`);
   status.textContent=world.over?'The stack tumbled. Restart to try again.':world.complete?'All 40 animals balanced!':'';
   context.setLevel(`${world.supportedCount}/40 animals`);
   if(previousScore!==world.score){if(previousScore>=0&&world.score>previousScore){context.sound('success');context.announce(`${world.supportedCount} animals balanced. Height ${world.height} centimetres.`);bubbleUntil=performance.now()+600;}context.setScore(world.score);previousScore=world.score;}
   if((world.over||world.complete)&&!previousEnd){context.sound(world.over?'lose':'success');context.announce(status.textContent);context.save(world.snapshot());}previousEnd=world.over||world.complete;
   context.setStatus(world.over?status.textContent:world.ready?`Drag ${ANIMALS[world.nextKind].name} horizontally, tap to rotate, then press DROP.`:'Let the animal settle.');
  }
  function drawAnimal(a:Animal){const b=a.body,img=sprites[a.kind];draw.save();draw.translate(b.position.x,b.position.y);draw.rotate(b.angle);draw.translate(a.offset.x,a.offset.y);if(img.complete&&img.naturalWidth)draw.drawImage(img,ART_BOX.x,ART_BOX.y,ART_BOX.width,ART_BOX.height);draw.restore();
   if(colliderOverlay){draw.save();draw.strokeStyle='#ed176b';draw.fillStyle='#ff1c6422';draw.lineWidth=.8;for(const part of b.parts.slice(1)){draw.beginPath();part.vertices.forEach((v,i)=>i?draw.lineTo(v.x,v.y):draw.moveTo(v.x,v.y));draw.closePath();draw.fill();draw.stroke();}draw.strokeStyle='#fff';draw.lineWidth=1.3;draw.beginPath();draw.moveTo(b.position.x-4,b.position.y);draw.lineTo(b.position.x+4,b.position.y);draw.moveTo(b.position.x,b.position.y-4);draw.lineTo(b.position.x,b.position.y+4);draw.stroke();draw.restore();}
  }
  function preparePreview(){if(preview.kind!==world.nextKind)preview=createAnimal(world.nextKind,world.aimX,world.spawnY);Matter.Body.setPosition(preview.body,{x:world.aimX,y:world.spawnY});Matter.Body.setAngle(preview.body,world.rotation);}
  function render(){
   draw.setTransform(ratio,0,0,ratio,0,0);draw.fillStyle='#55c3ec';draw.fillRect(0,0,canvas.width/ratio,canvas.height/ratio);draw.save();draw.translate(left,top);draw.scale(scale,scale);
   if(world.ready)preparePreview();
   const current=world.ready?preview:world.active!==null?world.animals[world.active]:null;
   camera=frameCamera({previous:camera,stackTop:world.cameraTop,cutoutTop:current?.body.bounds.min.y??Infinity,top,scale,immediate:context.settings.reducedMotion});
   draw.save();draw.translate(0,camera);
   draw.fillStyle='#779b25';draw.strokeStyle='#161719';draw.lineWidth=3;draw.beginPath();draw.roundRect(18,FLOOR,324,10,1);draw.fill();draw.stroke();draw.fillStyle='#a0cf31';draw.fillRect(20,FLOOR+1,320,5);
   for(const a of world.animals)drawAnimal(a);if(world.ready)drawAnimal(preview);draw.restore();draw.restore();
   // The platform camera can rise with a very tall tower; the release button remains fixed.
   bubble.hidden=performance.now()>=bubbleUntil;const active=world.animals.at(-1);if(active){bubble.style.left=`${(left+active.body.position.x*scale)/(canvas.width/ratio)*100}%`;bubble.style.top=`${(top+(active.body.bounds.min.y+camera-10)*scale)/(canvas.height/ratio)*100}%`;}
  }
  function clearPointer(){const id=gesture.pointer;gesture.clear();if(id!==null&&canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);}
  // Layout changes cancel pointer coordinates but keep physically held keys.
  // Blur, pause, restart and disposal still release every input source.
  function clearInput(){heldAimAt=0;clearPointer();keys.clear();}
  function rotate(direction=1){if(paused||disposed||!world.ready)return;world.rotateBy(TAP_ROTATION_RADIANS*direction);sync();context.save(world.snapshot());}
  function drop(){if(paused||disposed)return;clearInput();if(world.drop()){context.sound('tap');context.save(world.snapshot());sync();}}
  function local(e:PointerEvent){const box=canvas.getBoundingClientRect();return{x:(e.clientX-box.left-left)/scale,y:(e.clientY-box.top-top)/scale-camera};}
  function releaseKey(e:KeyboardEvent){const key=e.key.toLowerCase();if(key!==' '&&key!=='enter')return;e.preventDefault();if(paused||disposed||e.repeat||keys.has(key))return;drop();keys.add(key);}
  const controller=new AbortController(),options={signal:controller.signal};
  dropButton.addEventListener('keydown',releaseKey,options);
  root.addEventListener('focusout',e=>{if(!root.contains(e.relatedTarget as Node|null))clearInput();},options);
  canvas.addEventListener('pointerdown',e=>{if(paused||!world.ready||e.button!==0||gesture.pointer!==null)return;preparePreview();const p=local(e);if(!Matter.Query.point(preview.body.parts.slice(1),p).length)return;keys.clear();if(gesture.begin(e.pointerId,p.x,p.y,world.aimX,e.timeStamp)){canvas.setPointerCapture(e.pointerId);canvas.focus({preventScroll:true});e.preventDefault();}},options);
  canvas.addEventListener('pointermove',e=>{if(paused||gesture.pointer!==e.pointerId)return;const p=local(e),x=gesture.move(e.pointerId,p.x,p.y);if(x!==null){world.aim(x);sync();}},options);
  canvas.addEventListener('pointerup',e=>{if(gesture.pointer!==e.pointerId)return;const p=local(e),x=gesture.move(e.pointerId,p.x,p.y);if(x!==null)world.aim(x);const tap=gesture.end(e.pointerId,p.x,p.y,e.timeStamp);if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);if(tap)rotate();sync();context.save(world.snapshot());},options);
  canvas.addEventListener('pointercancel',clearInput,options);canvas.addEventListener('lostpointercapture',()=>gesture.clear(),options);window.addEventListener('blur',clearInput,options);dropButton.addEventListener('click',drop,options);
  container.addEventListener('keydown',e=>{const target=e.target as HTMLElement;if(paused||disposed||target.matches('input,textarea,select,button')||document.querySelector('dialog[open]')||e.altKey||e.ctrlKey||e.metaKey)return;const key=e.key.toLowerCase();if(key==='escape'){clearInput();return;}if(!['arrowleft','arrowright','a','d','q','e',' ','enter','c'].includes(key))return;e.preventDefault();if(key===' '||key==='enter'){releaseKey(e);return;}if(e.repeat||keys.has(key))return;keys.add(key);if(key==='c'){colliderOverlay=!colliderOverlay;sync();return;}if(key==='q'||key==='e'){rotate(key==='q'?-1:1);return;}if(world.ready)world.aim(world.aimX+(['arrowleft','a'].includes(key)?-10:10));heldAimAt=performance.now()+180;sync();},options);
  window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()),options);
  function schedule(){if(!disposed&&!paused&&raf===null)raf=requestAnimationFrame(frame);}
  function frame(time:number){
   raf=null;if(disposed||paused)return;if(!last)last=time;const elapsed=Math.min(80,time-last);last=time;
   if(world.ready&&time>=heldAimAt){const direction=Number(keys.has('arrowright')||keys.has('d'))-Number(keys.has('arrowleft')||keys.has('a'));if(direction)world.aim(world.aimX+direction*elapsed*.13);}
   accumulator+=elapsed;while(accumulator>=1000/60){world.step();accumulator-=1000/60;}sync();render();schedule();
  }
  const observer=new ResizeObserver(resize);observer.observe(root);resize();sync();schedule();
  return {
   pause(){if(disposed||paused)return;paused=true;clearInput();accumulator=0;last=0;if(raf!==null){cancelAnimationFrame(raf);raf=null;}sync();},
   resume(){if(disposed||!paused)return;paused=false;last=0;accumulator=0;sync();schedule();},
   restart(){clearInput();world.dispose();world=new AnimalWorld();camera=0;accumulator=0;last=0;previousScore=-1;previousEnd=false;lastUI='';bubbleUntil=0;sync();if(paused)render();context.save(world.snapshot());},
   serialize(){return world.snapshot();},
   restore(data){clearInput();if(world.restore(data)){if(world.legacyScore!==null)context.setScore(world.legacyScore);camera=Math.max(0,220-world.cameraTop);accumulator=0;previousScore=-1;previousEnd=world.over||world.complete;lastUI='';sync();if(paused)render();if(data&&typeof data==='object'&&(data as {version?:number}).version===1){status.textContent='New shapes reset the stack. Score kept in Record.';context.announce(status.textContent);context.save(world.snapshot());}}},
   dispose(){disposed=true;clearInput();if(raf!==null)cancelAnimationFrame(raf);observer.disconnect();controller.abort();world.dispose();container.replaceChildren();},
  };
 },
};
export default module;
