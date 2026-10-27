import type {GameModule,GameContext,GameInstance} from '../../core/types';
import {FruitEngine,TIERS,WIDTH,HEIGHT,LEFT,RIGHT,FLOOR,DANGER,STEP} from './engine';
import {drawFruit} from './art';
import './style.css';
interface Spark {x:number;y:number;vx:number;vy:number;life:number;color:string}
const module:GameModule={
 id:'fruit-merge',title:'Suika Game',cover:'game-art/fruit-merge/cover.svg',
 rules:'Independent browser adaptation. Aim with the pointer or Left and Right arrow keys, then click, tap, press Space or use Drop fruit. Two equal fruits touching merge into the next larger fruit. Chain merges within 0.8 seconds earn a combo bonus, up to ×4. Only the four smallest fruits enter the balanced drop queue. The next fruit is shown beside the basket. Reach the watermelon and keep building your score; watermelons do not merge further. Keep the pile below the dashed line. A fruit ends the run only after it has had time to settle and then stays nearly still above the line for 2 seconds. Falling and newly dropped fruit are protected. Pause saves your basket; restart starts a fresh run.',
 mount(container:HTMLElement,context:GameContext):GameInstance{
  container.innerHTML=`<div class="fm"><div class="fm-top"><div class="fm-next"><canvas width="104" height="104" aria-hidden="true"></canvas><div><span class="fm-eyebrow">UP NEXT</span><span class="fm-next-name"></span></div></div><div class="fm-goal">A little fruit, a big dream<strong>Make a watermelon</strong></div></div><canvas class="fm-board" role="img" tabindex="0" aria-label="Fruit basket. Aim with Left and Right arrows; drop with Space or Enter." width="720" height="1020"></canvas><div class="fm-foot"><span class="fm-count">0 fruits in basket</span><button class="game-button fm-drop" type="button">Drop fruit</button></div><div class="fm-banner" role="status"></div><div class="fm-evolution" aria-label="Fruit evolution">${TIERS.map((t,i)=>`<span title="${i+1}. ${t.name}" style="background:${t.color}">${i+1}</span>`).join('')}</div><p class="game-help">Aim &amp; tap to drop · ← → to aim · Space to drop<br>Match a pair. Grow something wonderful.</p></div>`;
  const root=container.querySelector<HTMLDivElement>('.fm')!,canvas=root.querySelector<HTMLCanvasElement>('.fm-board')!,c=canvas.getContext('2d')!;
  const preview=root.querySelector<HTMLCanvasElement>('.fm-next canvas')!,pc=preview.getContext('2d')!,nextLabel=root.querySelector<HTMLElement>('.fm-next-name')!,count=root.querySelector<HTMLElement>('.fm-count')!,drop=root.querySelector<HTMLButtonElement>('.fm-drop')!,banner=root.querySelector<HTMLElement>('.fm-banner')!;
  const physics=new FruitEngine();let paused=false,disposed=false,raf=0,last=0,accumulator=0,previousScore=-1,previousNext=-1,previousCount=-1,previousStatus='',previousLevel=-1,didLose=false,dirty=false;
  let sparks:Spark[]=[];let flash:{x:number;y:number;text:string;life:number}|undefined;
  const report=()=>{
   if(previousScore!==physics.score){previousScore=physics.score;context.setScore(physics.score);}
   if(previousNext!==physics.next){previousNext=physics.next;nextLabel.textContent=TIERS[physics.next].name;pc.clearRect(0,0,104,104);drawFruit(pc,physics.next,52,57,35,0,true);}
   if(previousCount!==physics.fruits.size){previousCount=physics.fruits.size;count.textContent=`${physics.fruits.size} fruit${physics.fruits.size===1?'':'s'} in basket`;}
   let highest=0,danger=0;for(const f of physics.fruits.values()){highest=Math.max(highest,f.tier);danger=Math.max(danger,f.danger);}
   if(previousLevel!==highest){previousLevel=highest;context.setLevel(TIERS[highest].name);}
   const status=physics.lost?'Basket full! Restart for another fresh batch.':danger>200?'Pile too high — a merge could save it!':`Drop a ${TIERS[physics.current].name.toLowerCase()}. Match two of a kind.`;
   if(previousStatus!==status){previousStatus=status;context.setStatus(status);}
   banner.textContent=physics.lost?'Basket full — a fresh start awaits!':danger>200?`Careful! ${Math.max(0,(2000-danger)/1000).toFixed(1)}s to clear the line`:'';
   drop.disabled=paused||!physics.ready;
   if(physics.lost&&!didLose){didLose=true;context.sound('lose');context.announce(`Basket full. Final score ${physics.score}.`);context.save(physics.snapshot());}
  };
  physics.onMerge=m=>{
   context.sound('success');context.announce(`${TIERS[m.tier].name}! ${m.points} points${m.combo>1?`, combo ${m.combo}`:''}.`);dirty=true;
   if(!context.settings.reducedMotion){flash={x:m.x,y:m.y-20,text:m.combo>1?`+${m.points} ×${Math.min(4,m.combo)}`:`+${m.points}`,life:750};for(let n=0;n<10;n++){const angle=n*Math.PI/5;sparks.push({x:m.x,y:m.y,vx:Math.cos(angle)*(1.2+n%3),vy:Math.sin(angle)*2-1,life:450,color:TIERS[m.tier].color});}if(sparks.length>100)sparks=sparks.slice(-100);}
  };
  function draw(){
   const ratio=Math.min(window.devicePixelRatio||1,2);const w=Math.round(WIDTH*ratio),h=Math.round(HEIGHT*ratio);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}c.setTransform(ratio,0,0,ratio,0,0);c.clearRect(0,0,WIDTH,HEIGHT);
   c.fillStyle='#fff2ca';c.fillRect(0,0,WIDTH,HEIGHT);
   c.fillStyle='#eed6a842';for(let y=90;y<HEIGHT;y+=32)for(let x=0;x<WIDTH;x+=32)if((x/32+(y-90)/32)%2===0){c.fillRect(x,y,32,32);}
   // The basket is quiet and light so fruit silhouettes carry the scene.
   c.fillStyle='#fffae9';c.strokeStyle='#cba47b';c.lineWidth=5;c.beginPath();c.roundRect(12,96,336,402,[10,10,23,23]);c.fill();c.stroke();
   c.strokeStyle=[...physics.fruits.values()].some(f=>f.danger>200)?'#db594d':'#d5a08b';c.lineWidth=1.5;c.setLineDash([5,5]);c.beginPath();c.moveTo(LEFT+3,DANGER);c.lineTo(RIGHT-3,DANGER);c.stroke();c.setLineDash([]);
   c.fillStyle='#b68d75';c.font='bold 8px sans-serif';c.textAlign='right';c.fillText('KEEP BELOW',RIGHT-6,DANGER+12);
   if(!physics.lost){
    const r=TIERS[physics.current].r;c.strokeStyle='#c49c7170';c.setLineDash([3,6]);c.lineWidth=1.5;c.beginPath();c.moveTo(physics.aim,62+r);c.lineTo(physics.aim,FLOOR-3);c.stroke();c.setLineDash([]);
    c.fillStyle='#b7926330';c.beginPath();c.ellipse(physics.aim,FLOOR-4,r*.7,4,0,0,Math.PI*2);c.fill();
   }
   for(const f of physics.fruits.values())drawFruit(c,f.tier,f.body.position.x,f.body.position.y,TIERS[f.tier].r,f.body.angle,context.settings.colorBlind);
   c.strokeStyle='#bc8a5b';c.lineWidth=8;c.lineCap='round';c.beginPath();c.moveTo(17,FLOOR+7);c.quadraticCurveTo(180,FLOOR+15,343,FLOOR+7);c.stroke();c.strokeStyle='#e8c599';c.lineWidth=3;c.beginPath();c.moveTo(20,FLOOR+5);c.lineTo(340,FLOOR+5);c.stroke();
   if(!physics.lost){c.globalAlpha=physics.ready?1:.45;drawFruit(c,physics.current,physics.aim,58,TIERS[physics.current].r,0,context.settings.colorBlind);c.globalAlpha=1;}
   if(context.settings.reducedMotion){sparks=[];flash=undefined;}
   for(const p of sparks){c.globalAlpha=p.life/450;c.fillStyle=p.color;c.beginPath();c.arc(p.x,p.y,2.6,0,Math.PI*2);c.fill();}c.globalAlpha=1;
   if(flash){c.globalAlpha=Math.min(1,flash.life/200);c.font='bold 21px sans-serif';c.textAlign='center';c.strokeStyle='#fff9e8';c.lineWidth=5;c.strokeText(flash.text,flash.x,flash.y);c.fillStyle='#975c39';c.fillText(flash.text,flash.x,flash.y);c.globalAlpha=1;}
  }
  function frame(now:number){
   raf=0;if(disposed||paused)return;if(!last)last=now;const elapsed=Math.min(100,Math.max(0,now-last));last=now;
   if(!paused){accumulator+=elapsed;while(accumulator>=STEP){physics.step();for(const p of sparks){p.x+=p.vx;p.y+=p.vy;p.vy+=.08;p.life-=STEP;}sparks=sparks.filter(p=>p.life>0);if(flash){flash.life-=STEP;flash.y-=.35;if(flash.life<=0)flash=undefined;}accumulator-=STEP;}report();if(dirty){dirty=false;context.save(physics.snapshot());}}
   draw();if(!paused&&!disposed)raf=requestAnimationFrame(frame);
  }
  function doDrop(){if(paused||disposed)return;if(physics.drop()){context.sound('tap');report();context.save(physics.snapshot());draw();}else if(!physics.lost){context.announce('Wait for room at the top of the basket.');}}
  function aim(event:PointerEvent){if(paused||disposed)return;const box=canvas.getBoundingClientRect();physics.setAim((event.clientX-box.left)*WIDTH/box.width);draw();}
  let pointer:number|undefined;
  const pointerDown=(event:PointerEvent)=>{if(paused||event.button!==0)return;pointer=event.pointerId;canvas.focus({preventScroll:true});canvas.setPointerCapture(event.pointerId);aim(event);event.preventDefault();};
  const pointerMove=(event:PointerEvent)=>aim(event);
  const pointerUp=(event:PointerEvent)=>{if(event.pointerId!==pointer)return;aim(event);pointer=undefined;if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);doDrop();};
  const pointerCancel=()=>{pointer=undefined;};
  const key=(event:KeyboardEvent)=>{if(paused||disposed)return;if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();physics.setAim(physics.aim+(event.key==='ArrowLeft'?-12:12));draw();}if((event.code==='Space'||event.key==='Enter')&&!event.repeat){event.preventDefault();doDrop();}};
  canvas.addEventListener('pointerdown',pointerDown);canvas.addEventListener('pointermove',pointerMove);canvas.addEventListener('pointerup',pointerUp);canvas.addEventListener('pointercancel',pointerCancel);canvas.addEventListener('keydown',key);drop.addEventListener('click',doDrop);
  report();draw();raf=requestAnimationFrame(frame);
  return {
   pause(){if(paused||disposed)return;paused=true;cancelAnimationFrame(raf);raf=0;pointer=undefined;last=0;accumulator=0;drop.disabled=true;},
   resume(){if(!paused||disposed)return;paused=false;last=0;accumulator=0;report();raf=requestAnimationFrame(frame);},
   restart(){physics.restart();sparks=[];flash=undefined;didLose=false;dirty=false;last=0;accumulator=0;previousNext=-1;report();draw();context.save(physics.snapshot());},
   serialize(){return physics.snapshot();},
   restore(data:unknown){if(physics.restore(data)){sparks=[];flash=undefined;didLose=physics.lost;dirty=false;last=0;accumulator=0;previousNext=-1;report();draw();}},
   dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(raf);canvas.removeEventListener('pointerdown',pointerDown);canvas.removeEventListener('pointermove',pointerMove);canvas.removeEventListener('pointerup',pointerUp);canvas.removeEventListener('pointercancel',pointerCancel);canvas.removeEventListener('keydown',key);drop.removeEventListener('click',doDrop);physics.dispose();sparks=[];root.remove();}
  };
 }
};
export default module;
