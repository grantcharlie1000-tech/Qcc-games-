import Matter from 'matter-js';
import type { GameModule } from '../../core/types';
import { AnimalWorld, ANIMALS, KINDS, WIDTH, HEIGHT, FLOOR, createAnimal } from './model';
import type { Animal, Kind } from './model';
import { animalSvg } from './art';
import './style.css';
const module:GameModule={
  id:'animal-stack',title:'Animal Stack',cover:'game-art/animal-stack/cover.svg',
  rules:'Build a woodland tower on the little island. Move the pointer left or right, then click or lift your finger to drop an animal. You can also use the arrow buttons or Left/Right keys and Space to drop. Wait for each animal to settle before the next drop. Each animal connected to the island and still for half a second earns 100 points, plus 2 points for every centimetre of your best tower height. Different shapes and weights can tip the tower. If any dropped animal tumbles below the island, the run ends. The waiting preview is safe. Balance 40 friends to complete the sanctuary.',
  mount(container,context) {
    container.innerHTML='<div class="animal-stack"><div class="animal-stack__hud"><span data-friends>0 friends balanced</span><span data-height>Height 0 cm</span></div><div class="animal-stack__board"><canvas tabindex="0" aria-label="Animal tower. Move left or right to aim. Click, tap or press Space to drop."></canvas><div class="animal-stack__result" hidden><strong></strong><p></p></div></div><p class="animal-stack__next"></p><div class="animal-stack__controls"><button class="game-button secondary" aria-label="Aim left">←</button><button class="game-button" data-drop>Drop Hippo</button><button class="game-button secondary" aria-label="Aim right">→</button></div><p class="animal-stack__help">Move to aim · tap / release to drop<br>Keyboard: ← → to aim · Space to drop</p></div>';
    const root=container.firstElementChild as HTMLElement,canvas=root.querySelector('canvas')!,draw=canvas.getContext('2d')!;
    const dropButton=root.querySelector<HTMLButtonElement>('[data-drop]')!,left=root.querySelector<HTMLButtonElement>('[aria-label="Aim left"]')!,right=root.querySelector<HTMLButtonElement>('[aria-label="Aim right"]')!;
    const result=root.querySelector<HTMLElement>('.animal-stack__result')!,friends=root.querySelector<HTMLElement>('[data-friends]')!,height=root.querySelector<HTMLElement>('[data-height]')!,next=root.querySelector<HTMLElement>('.animal-stack__next')!;
    let world=new AnimalWorld(),paused=false,disposed=false,raf=0,last=0,accumulator=0,camera=0,previousScore=-1,previousEnd=false,pointer:number|null=null,lastUI='';
    let preview=createAnimal(world.nextKind,world.aimX,world.spawnY);
    const sprites={} as Record<Kind,HTMLImageElement>;
    for (const kind of KINDS) { const image=new Image();image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(animalSvg(kind));sprites[kind]=image; }
    const ratio=Math.min(2,window.devicePixelRatio||1);canvas.width=WIDTH*ratio;canvas.height=HEIGHT*ratio;
    function sync() {
      root.dataset.tick=String(world.tick);
      const signature=[world.animals.length,world.supportedCount,world.height,world.ready,world.aimX,world.score,world.over,world.complete,paused,world.nextKind].join('|');
      if(signature===lastUI)return;lastUI=signature;
      const info=ANIMALS[world.nextKind];
      root.dataset.count=String(world.animals.length);root.dataset.balanced=String(world.supportedCount);root.dataset.ready=String(world.ready);root.dataset.aim=String(Math.round(world.aimX));root.dataset.tick=String(world.tick);root.dataset.over=String(world.over);
      friends.textContent=`${world.supportedCount} ${world.supportedCount===1?'friend':'friends'} balanced`;height.textContent=`Height ${world.height} cm`;
      next.textContent=world.over?'A brave little tower. Shall we build another?':world.complete?'All 40 friends have a home!':world.ready?`Next up: ${info.name} · ${info.mass.toFixed(1)} kg`:'Easy now… let your friend find their feet.';
      dropButton.textContent=world.over?'Tower finished':world.complete?'Sanctuary complete':world.ready?`Drop ${info.name}`:'Settling…';
      dropButton.disabled=paused || !world.ready;left.disabled=right.disabled=paused || !world.ready;
      result.hidden=!world.over&&!world.complete;result.querySelector('strong')!.textContent=world.complete?'Sanctuary complete!':'Timber… and a tumble!';result.querySelector('p')!.textContent=`${world.supportedCount} friends · ${world.height} cm · ${world.score} points. Use Restart above to build again.`;
      context.setLevel(`${world.supportedCount}/40 friends`);
      if(previousScore!==world.score) { if(previousScore>=0&&world.score>previousScore){context.sound('success');context.announce(`${world.supportedCount} friends balanced. Height ${world.height} centimetres.`);}context.setScore(world.score);previousScore=world.score; }
      if((world.over||world.complete)&&!previousEnd) {context.sound(world.over?'lose':'success');context.announce(world.over?'An animal tumbled. Tower finished.':'All forty friends balanced!');context.save(world.snapshot());}
      previousEnd=world.over||world.complete;
      context.setStatus(world.over?'The tower tumbled. Restart to try again.':world.complete?'Forty friends balanced. Beautiful building!':world.ready?'Aim carefully, then drop your next friend.':'Let the animal settle onto the tower.');
    }
    function animal(a:Animal,preview=false) {
      const b=a.body,img=sprites[a.kind];draw.save();draw.translate(b.position.x,b.position.y);draw.rotate(b.angle);
      if(preview)draw.globalAlpha=.88;
      draw.translate(a.offset.x,a.offset.y);
      if(img.complete&&img.naturalWidth)draw.drawImage(img,-72,-55,144,110);
      else {draw.fillStyle=ANIMALS[a.kind].color;draw.fillRect(-ANIMALS[a.kind].width/2,-ANIMALS[a.kind].height/2,ANIMALS[a.kind].width,ANIMALS[a.kind].height);}
      // Collision feedback is paint-only: physics geometry never changes on impact.
      if(!context.settings.reducedMotion && a.impact>.12) {draw.strokeStyle=`rgba(255,255,255,${a.impact*.8})`;draw.lineWidth=2;draw.beginPath();draw.arc(-20,-35,6,Math.PI,Math.PI*1.8);draw.stroke();}
      draw.restore();
    }
    function render() {
      draw.setTransform(ratio,0,0,ratio,0,0);
      const gradient=draw.createLinearGradient(0,0,0,HEIGHT);gradient.addColorStop(0,'#c9edf2');gradient.addColorStop(1,'#eff7d2');draw.fillStyle=gradient;draw.fillRect(0,0,WIDTH,HEIGHT);
      draw.fillStyle='#ffffff8c';for(const [x,y] of [[42,70],[285,155],[80,290]]) {draw.beginPath();draw.ellipse(x,y,39,10,0,0,Math.PI*2);draw.fill();}
      draw.fillStyle='#78a6a0';draw.font='11px sans-serif';draw.textAlign='center';draw.fillText('THE WOODLAND BALANCING CLUB',180,22);
      const target=Math.max(0,202-world.cameraTop);camera=context.settings.reducedMotion?target:camera+(target-camera)*.09;
      draw.save();draw.translate(0,camera);
      // Height ruler travels with the world, making the camera follow legible.
      draw.strokeStyle='#84ada17a';draw.lineWidth=1;draw.fillStyle='#658d82';draw.font='10px sans-serif';draw.textAlign='left';
      for(let cm=0;cm<=6000;cm+=50) {const y=FLOOR-cm;if(y+camera<35||y+camera>HEIGHT)continue;draw.beginPath();draw.moveTo(17,y);draw.lineTo(28,y);draw.stroke();draw.fillText(String(cm),32,y+3);}
      draw.fillStyle='#c0dca2';draw.beginPath();draw.ellipse(180,FLOOR+50,177,36,0,0,Math.PI*2);draw.fill();
      draw.fillStyle='#a97b53';draw.beginPath();draw.roundRect(75,FLOOR,210,37,12);draw.fill();draw.strokeStyle='#4d6250';draw.lineWidth=3;draw.stroke();
      draw.fillStyle='#7fb663';draw.beginPath();draw.roundRect(74,FLOOR-2,212,12,6);draw.fill();draw.stroke();
      draw.strokeStyle='#c79b6c';draw.lineWidth=3;for(let x=94;x<270;x+=27){draw.beginPath();draw.moveTo(x,FLOOR+22);draw.lineTo(x+12,FLOOR+22);draw.stroke();}
      for(const a of world.animals) animal(a);
      if(world.ready&&!world.over) {
        if(preview.kind!==world.nextKind)preview=createAnimal(world.nextKind,world.aimX,world.spawnY);
        Matter.Body.setPosition(preview.body,{x:world.aimX,y:world.spawnY});const p=preview;
        draw.setLineDash([3,7]);draw.strokeStyle='#5e828d8c';draw.lineWidth=1.5;draw.beginPath();draw.moveTo(world.aimX,p.body.bounds.max.y+7);draw.lineTo(world.aimX,FLOOR-8);draw.stroke();draw.setLineDash([]);animal(p,true);
        // Preview is a drawing, never added to the physics world.
        draw.fillStyle='#3e6571';draw.beginPath();draw.moveTo(world.aimX-5,p.body.bounds.min.y-12);draw.lineTo(world.aimX+5,p.body.bounds.min.y-12);draw.lineTo(world.aimX,p.body.bounds.min.y-6);draw.fill();
      }
      draw.restore();
    }
    function drop() {if(paused||disposed)return;if(world.drop()){context.sound('tap');context.save(world.snapshot());sync();}}
    function aim(clientX:number) {if(paused||!world.ready)return;const r=canvas.getBoundingClientRect();world.aim((clientX-r.left)/r.width*WIDTH);sync();}
    const controller=new AbortController(),options={signal:controller.signal};
    canvas.addEventListener('pointerdown',e=>{if(paused||!world.ready||e.button!==0)return;pointer=e.pointerId;canvas.setPointerCapture(e.pointerId);aim(e.clientX);canvas.focus({preventScroll:true});},options);
    canvas.addEventListener('pointermove',e=>{if(e.pointerType==='mouse'||pointer===e.pointerId)aim(e.clientX);},options);
    canvas.addEventListener('pointerup',e=>{if(pointer!==e.pointerId)return;aim(e.clientX);pointer=null;drop();},options);
    canvas.addEventListener('pointercancel',()=>{pointer=null;},options);
    left.addEventListener('click',()=>{if(!paused&&world.ready){world.aim(world.aimX-12);sync();}},options);right.addEventListener('click',()=>{if(!paused&&world.ready){world.aim(world.aimX+12);sync();}},options);dropButton.addEventListener('click',drop,options);
    // Listener belongs to the stage: shell dialogs, text fields and toolbar keep their native keys.
    container.addEventListener('keydown',e=>{const t=e.target as HTMLElement;if(paused||disposed||t.matches('input,textarea,select,button')||document.querySelector('dialog[open]'))return;if(['ArrowLeft','ArrowRight',' ','Enter'].includes(e.key)){e.preventDefault();if(e.key==='ArrowLeft'||e.key==='ArrowRight'){if(world.ready)world.aim(world.aimX+(e.key==='ArrowLeft'?-10:10));sync();}else if(!e.repeat)drop();}},options);
    function frame(time:number) {if(disposed)return;if(!last)last=time;const elapsed=Math.min(80,time-last);last=time;if(!paused){accumulator+=elapsed;while(accumulator>=1000/60){world.step();accumulator-=1000/60;}sync();}render();raf=requestAnimationFrame(frame);}
    sync();raf=requestAnimationFrame(frame);
    return {
      pause(){paused=true;pointer=null;accumulator=0;sync();},resume(){paused=false;last=0;sync();},
      restart(){world.dispose();world=new AnimalWorld();camera=0;accumulator=0;last=0;previousScore=-1;previousEnd=false;pointer=null;lastUI='';sync();context.save(world.snapshot());},
      serialize(){return world.snapshot();},restore(data){if(world.restore(data)){camera=Math.max(0,202-world.cameraTop);accumulator=0;previousScore=-1;previousEnd=world.over||world.complete;lastUI='';sync();}},
      dispose(){disposed=true;cancelAnimationFrame(raf);controller.abort();world.dispose();container.replaceChildren();},
    };
  },
};
export default module;
