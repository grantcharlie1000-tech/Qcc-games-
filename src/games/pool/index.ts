import type {GameModule} from '../../core/types';
import {createGame,step,shoot,restoreGame,POCKETS,groupOf,legalTargets,chooseAI,placeAICue,placeCue,validCuePosition,DT,type PoolState} from './model';
import {drawTable} from './render';
import {ballColor} from './appearance';
import {tablePoint,onFelt,beginDrag,moveDrag,releaseDrag,type Drag} from './input';
import './style.css';
export const rules='Eight-ball: drag on the felt to aim, then drag the white ball backwards and release to shoot. Return to your starting point before releasing to cancel, or press C. A second finger cancels. The white aiming line previews the first collision, not a guaranteed pot. Arrow keys on the table adjust aim; up/down change power; Enter or Space shoots. C cancels a drag. Escape opens Study and cancels. Pocket your solids (1–7) or stripes (9–15), then pocket the 8 in your selected numbered pocket. A legal pot keeps your turn; a legal miss passes it. Hit your group first (any colored ball on an open table), then pocket a ball or reach a cushion. A scratch, wrong first hit or no rail/pot gives the opponent ball-in-hand: tap or drag to a clear spot and release (keyboard: arrows then Enter). Groups are assigned by the first legal colored pot after the break. The 8 before your group is gone, in the wrong pocket, or on a foul loses. Local simplifications from WPA: only the 8 pocket is called; player 1 always breaks from the fixed head spot with a repeatable rack; every break foul or illegal break gives ball-in-hand anywhere, with no re-rack choice; a break 8 is automatically re-spotted. A break needs a pot or four object balls reaching cushions. No safety calls, temporary open-table group claims, spin, jumps or tournament/referee fouls. Play against the offline computer or pass the device to Player 2. Easy is a forgiving beginner opponent; Medium is the original computer; Hard checks shots using table physics. Changing Players or AI difficulty starts a new rack.';
const module:GameModule={id:'pool',title:'Pool',cover:'game-art/pool/cover.svg',rules,mount(container,context){
 let state=createGame(),paused=false,disposed=false,frame=0,last=0,accumulator=0,aiPlan:ReturnType<typeof chooseAI>|null=null;
 let ghost:{x:number;y:number;valid:boolean}|null=null;
 const abort=new AbortController(),root=document.createElement('div');root.className='pool-game';
 root.innerHTML=`<div class="pool-players" role="group" aria-label="Ball groups and potted balls"><section class="pool-player"></section><section class="pool-player"></section></div><p class="pool-open-table"></p><div class="pool-table-area"><div class="pool-cue-meter"><span>POWER</span><div aria-hidden="true"><i></i></div><output class="pool-power-value" aria-live="off">0%</output></div><div class="pool-table-wrap"><canvas class="pool-table" tabindex="0" role="img" aria-label="Billiards table. Drag felt to aim; pull white ball back and release to shoot. Arrow keys aim and change power; Enter shoots; C cancels." aria-describedby="pool-tip" width="840" height="440"></canvas><p class="pool-message" role="status"></p></div></div><div class="pool-inhand" hidden>Ball-in-hand: tap or drag to a clear spot and release. Keyboard: arrows to move, Enter to place.</div><div class="pool-under"><label class="pool-mode">Players <select aria-label="Players"><option value="ai">You vs computer</option><option value="two">Two people</option></select></label><label class="pool-mode">AI <select aria-label="AI difficulty"><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></label><div class="pool-pocket-row"><label for="pool-pocket">8-ball pocket</label><select id="pool-pocket" aria-label="8-ball pocket">${POCKETS.map((_,i)=>`<option value="${i}">${i+1} · ${['Top right','Bottom right','Top middle','Bottom middle','Top left','Bottom left'][i]}</option>`).join('')}</select></div><span class="pool-shot-count">0 shots</span></div><p class="pool-gesture-label" role="status">Drag felt to aim · pull white ball back to shoot</p><details class="pool-help"><summary>How to play</summary><p class="pool-tip" id="pool-tip">Drag the felt to aim. Pull back from the white ball, then release to shoot. Cancel: return to your starting point, add a second finger, or press C. Keyboard: ← → aim · ↑ ↓ power · Enter shoot. The top trays fill with your numbered balls as they are potted.</p></details><p class="pool-live"></p>`;
 container.append(root);
 const $=<T extends HTMLElement>(selector:string)=>root.querySelector<T>(selector)!;
 const canvas=$<HTMLCanvasElement>('.pool-table'),pocket=$<HTMLSelectElement>('#pool-pocket'),mode=$<HTMLSelectElement>('[aria-label="Players"]');
 const difficulty=$<HTMLSelectElement>('[aria-label="AI difficulty"]');
 let drag:Drag|null=null,pointer:number|null=null,placing=false,keyboardPower=false;
 let dragRect:DOMRect|null=null;
 const contacts=new Set<number>();
 const cue=()=>state.balls.find(b=>b.id===0)!;
 const human=()=>state.mode==='two'||state.turn===0;
 const canAim=()=>!paused&&!disposed&&state.phase==='aim'&&human()&&!state.ballInHand;
 let lastStatus='';
 const setText=(selector:string,value:string)=>{const el=$(selector);if(el.textContent!==value)el.textContent=value;};
 const name=(player:number)=>state.mode==='ai'?(player===0?'You':'Computer'):`Player ${player+1}`;
 function save(){context.save(instance.serialize());}
 let hudKey='';
 const ballMarkup=(id:number,extra='')=>`<span class="pool-mini-ball ${id>8?'pool-striped':''} ${extra}" style="--ball-color:${ballColor(id)}"><span>${id}</span></span>`;
 function playerHud(){
  const key=[state.turn,state.phase,state.mode,...state.groups,...state.balls.filter(b=>b.pocketed).map(b=>b.id)].join(':');if(key===hudKey)return;hudKey=key;
  for(let i=0;i<2;i++){
   const el=root.querySelectorAll<HTMLElement>('.pool-player')[i],group=state.groups[i],ids=group?Array.from({length:7},(_,n)=>n+(group==='solids'?1:9)):[],potted=ids.filter(id=>state.balls.find(b=>b.id===id)?.pocketed),onEight=!!group&&potted.length===7,current=state.turn===i&&state.phase!=='over';
   el.classList.toggle('pool-current',current);el.setAttribute('aria-label',`${name(i)}: ${group??'group unassigned'}. ${potted.length} potted${current?'. Current player':''}`);
   el.innerHTML=`<div class="pool-player-heading"><div class="pool-group-symbol" aria-hidden="true">${group?ballMarkup(onEight?8:group==='solids'?1:9):'<span class="pool-unassigned-ball">?</span>'}</div><div class="pool-player-identity"><strong>${name(i)}<span class="pool-turn-label">${current?(i===0&&state.mode==='ai'?'Your turn':'To play'):''}</span></strong><span class="pool-group-label">${onEight?'ON THE 8':group==='solids'?'SOLIDS · 1–7':group==='stripes'?'STRIPES · 9–15':'GROUP UNASSIGNED'}</span></div></div><div class="pool-pot-tray" aria-label="${name(i)} potted balls">${Array.from({length:7},(_,n)=>{const id=ids[n],down=id!==undefined&&potted.includes(id);return `<span class="pool-pot-slot ${down?'pool-pot-filled':''}" ${id!==undefined?`data-ball="${id}"`:''} aria-label="${id===undefined?'Unassigned slot':`Ball ${id}: ${down?'potted':'on table'}`}">${down?ballMarkup(id):`<span class="pool-empty-number">${id??''}</span>`}</span>`;}).join('')}</div><small class="pool-pot-count">${group?`${potted.length} POTTED · ${7-potted.length} LEFT`:'POTTED BALLS'}</small>`;
  }
  const open=root.querySelector<HTMLElement>('.pool-open-table')!;
  const down=state.balls.filter(b=>b.pocketed&&b.id!==0&&b.id!==8);
  open.innerHTML=state.groups[0]?`<span class="pool-tray-key">The top trays show potted balls</span>`:`<span>OPEN TABLE · Pot a ball after the break to claim your group</span>${down.length?`<span class="pool-open-pots" aria-label="Potted before groups were assigned">${down.map(b=>ballMarkup(b.id)).join('')}</span>`:''}`;
 }
 function draw(){playerHud();root.dataset.table=state.balls.map(b=>`${b.id}:${b.x.toFixed(2)},${b.y.toFixed(2)},${b.pocketed?1:0}`).join(';');drawTable(canvas,state,ghost,paused,drag);}
 function refresh(announce=false){
  root.dataset.phase=state.phase;root.dataset.shots=String(state.shots);root.dataset.turn=String(state.turn);root.dataset.table=state.balls.map(b=>`${b.id}:${b.x.toFixed(2)},${b.y.toFixed(2)},${b.pocketed?1:0}`).join(';');root.setAttribute('aria-busy',String(state.phase==='moving'));

  const text=state.phase==='over'?`${name(state.winner!)} won. ${state.message}`:state.phase==='moving'?`${name(state.turn)} · balls rolling…`:`${name(state.turn)} to play. ${state.message}`;setText('.pool-message',text);
  $('.pool-shot-count').textContent=`${state.shots} shot${state.shots===1?'':'s'}`;mode.value=state.mode;mode.disabled=paused;difficulty.value=state.difficulty;difficulty.disabled=paused||state.mode==='two';
  pocket.value=String(state.calledPocket);pocket.disabled=!canAim()||state.break;
  const activePower=drag?.kind==='pull'?drag.power:keyboardPower?state.power:0;
  root.dataset.gesture=placing?'place':drag?.kind||'idle';
  $('.pool-power-value').textContent=`${Math.round(activePower*100)}%`;
  $('.pool-cue-meter i').style.height=`${activePower*100}%`;
  const gestureText=drag?.kind==='pull'?(drag.power>=.08?'Release to shoot · return to start to cancel':'Pull away from the aim line to build power'):drag?'Release to set aim · then pull white ball back':keyboardPower?`Aim ${Math.round(((state.angle+Math.PI/2)*180/Math.PI+360)%360)}° · ${Math.round(state.power*100)}% power · Enter to shoot`:'Drag felt to aim · pull white ball back to shoot';
  setText('.pool-gesture-label',gestureText);
  const inHand=state.ballInHand&&human()&&state.phase==='aim';$('.pool-inhand').hidden=!inHand;
  const liveText=state.phase==='over'?'Restart in the top toolbar to play again.':state.ballInHand?'Ball-in-hand · place the white cue ball.':!human()&&state.phase==='aim'?'Computer is choosing a shot locally…':legalTargets(state).some(b=>b.id===8)?'Your group is clear. Select the 8-ball pocket before shooting.':'';setText('.pool-live',liveText);
  context.setScore(state.balls.filter(b=>b.id!==0&&!b.pocketed).length===15?0:state.balls.filter(b=>b.id!==0&&b.id!==8&&b.pocketed).length*100+(state.phase==='over'&&state.winner===0?1000:0));context.setLevel(state.phase==='over'?'Rack complete':`Shot ${state.shots+1}`);if(lastStatus!==text){context.setStatus(text);lastStatus=text;}if(announce)context.announce(text);
  draw();
 }
 function updated(){aiPlan=null;refresh();save();}
 function aimChange(degrees:number){if(!canAim())return;keyboardPower=true;const radians=state.angle+degrees*Math.PI/180;state.angle=Math.atan2(Math.sin(radians),Math.cos(radians));updated();}
 function doShoot(){if(!canAim())return;if(shoot(state,state.angle,state.power,state.calledPocket)){context.sound('tap');ghost=null;updated();}}
 function cancelDrag(){
  const id=pointer;drag=null;pointer=null;placing=false;dragRect=null;
  if(id!==null&&canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);
 }
 function changedLayout(){if(pointer!==null){cancelDrag();refresh();}}
 function reset(next:PoolState['mode']=state.mode){cancelDrag();state=createGame(next,state.difficulty);ghost=null;keyboardPower=false;aiPlan=null;last=0;accumulator=0;refresh(true);save();}
 const on=(el:EventTarget,event:string,fn:EventListener,capture=false)=>el.addEventListener(event,fn,{signal:abort.signal,capture});
 function sameLayout(){const r=canvas.getBoundingClientRect();return !!dragRect&&Math.abs(r.left-dragRect.left)<.5&&Math.abs(r.top-dragRect.top)<.5&&Math.abs(r.width-dragRect.width)<.5&&Math.abs(r.height-dragRect.height)<.5;}
 on(window,'pointerdown',((event:PointerEvent)=>{
  contacts.add(event.pointerId);
  if(pointer!==null&&event.pointerId!==pointer){cancelDrag();refresh();}
 }) as EventListener,true);
 on(canvas,'pointerdown',((event:PointerEvent)=>{
  if(pointer!==null||contacts.size>1||event.isPrimary===false||event.button!==0||paused||disposed||state.phase!=='aim'||!human())return;
  const rect=canvas.getBoundingClientRect(),p=tablePoint(event.clientX,event.clientY,rect);
  if(!onFelt(p))return;
  if(state.ballInHand){placing=true;ghost={...p,valid:validCuePosition(state,p.x,p.y)};}
  else {drag=beginDrag(p,cue(),state.angle,Math.min(55,Math.max(18,22*840/rect.width)));if(!drag)return;state.angle=drag.angle;keyboardPower=false;}
  pointer=event.pointerId;dragRect=rect;canvas.setPointerCapture(pointer);canvas.focus({preventScroll:true});event.preventDefault();refresh();
 }) as EventListener);
 on(canvas,'pointermove',((event:PointerEvent)=>{
  if(event.pointerId!==pointer)return;
  event.preventDefault();if(!sameLayout()){changedLayout();return;}
  const p=tablePoint(event.clientX,event.clientY,canvas.getBoundingClientRect());
  if(placing)ghost={...p,valid:validCuePosition(state,p.x,p.y)};
  else if(drag){moveDrag(drag,p,cue());state.angle=drag.angle;}
  refresh();
 }) as EventListener);
 on(canvas,'pointerup',((event:PointerEvent)=>{
  if(event.pointerId!==pointer)return;
  event.preventDefault();if(!sameLayout()){changedLayout();return;}
  const p=tablePoint(event.clientX,event.clientY,canvas.getBoundingClientRect());
  if(placing){const valid=onFelt(p)&&validCuePosition(state,p.x,p.y);cancelDrag();if(valid&&placeCue(state,p.x,p.y)){ghost=null;context.sound('tap');}updated();return;}
  if(drag)moveDrag(drag,p,cue());const shot=drag?releaseDrag(drag):null;cancelDrag();
  if(shot&&canAim()){state.angle=shot.angle;state.power=shot.power;doShoot();}else updated();
 }) as EventListener);
 for(const event of ['pointercancel','lostpointercapture'])on(canvas,event,((e:PointerEvent)=>{if(e.pointerId===pointer){cancelDrag();refresh();}}) as EventListener);
 for(const event of ['pointerup','pointercancel'])on(window,event,((e:PointerEvent)=>{contacts.delete(e.pointerId);}) as EventListener,true);
 on(window,'resize',changedLayout);on(window,'blur',()=>{contacts.clear();changedLayout();});
 if(window.visualViewport){on(window.visualViewport,'resize',changedLayout);on(window.visualViewport,'scroll',changedLayout);}
 const resizeObserver=new ResizeObserver(changedLayout);resizeObserver.observe(canvas);
 on(pocket,'change',()=>{if(canAim()){cancelDrag();state.calledPocket=Number(pocket.value);updated();}});
 on(difficulty,'change',()=>{if(!paused){state.difficulty=difficulty.value as PoolState['difficulty'];reset();}});
 on(mode,'change',()=>{if(!paused)reset(mode.value==='two'?'two':'ai');});
 on(canvas,'contextmenu',event=>{event.preventDefault();cancelDrag();refresh();});
 on(canvas,'keydown',((event:KeyboardEvent)=>{
  if(['c','C','Escape','Backspace'].includes(event.key)){event.preventDefault();cancelDrag();refresh();return;}
  if(paused||disposed||!human()||state.phase!=='aim'||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' ','Enter'].includes(event.key))return;
  event.preventDefault();if(event.repeat&&(event.key===' '||event.key==='Enter'))return;
  // A keyboard adjustment interrupts a pointer stroke; no stale release can fire it.
  cancelDrag();
  if(state.ballInHand){
   if(event.key==='Enter'&&ghost?.valid&&placeCue(state,ghost.x,ghost.y)){ghost=null;updated();return;}
   ghost=ghost||{x:cue().x,y:cue().y,valid:validCuePosition(state,cue().x,cue().y)};
   // Screen axes are the clockwise rotation of model axes.
   ghost.y+=event.key==='ArrowLeft'?8:event.key==='ArrowRight'?-8:0;
   ghost.x+=event.key==='ArrowUp'?-8:event.key==='ArrowDown'?8:0;
   ghost.valid=validCuePosition(state,ghost.x,ghost.y);refresh();return;
  }
  if(event.key===' '||event.key==='Enter')doShoot();
  else if(event.key==='ArrowLeft'||event.key==='ArrowRight')aimChange((event.key==='ArrowLeft'?-1:1)*(event.shiftKey?.2:1));
  else{keyboardPower=true;state.power=Math.max(.05,Math.min(1,state.power+(event.key==='ArrowUp'?.05:-.05)));updated();}
 }) as EventListener);
 function tick(now:number){if(paused||disposed)return;const elapsed=last?Math.min(.25,(now-last)/1000):0;last=now;
  const previous=state.phase;if(state.phase==='moving'){accumulator+=elapsed;while(accumulator>=DT&&state.phase==='moving'){step(state);accumulator-=DT;}if(state.phase!=='moving'){accumulator=0;aiPlan=null;if(state.ballInHand){const cue=state.balls.find(b=>b.id===0)!;ghost={x:cue.x,y:cue.y,valid:validCuePosition(state,cue.x,cue.y)};}refresh(true);context.sound(state.phase==='over'?'lose':'success');save();}}
  else if(state.phase==='aim'&&!human()){if(!aiPlan){if(state.ballInHand)placeAICue(state);aiPlan=chooseAI(state);state.angle=aiPlan.angle;state.power=aiPlan.power;state.calledPocket=aiPlan.pocket;refresh();}state.aiWait+=elapsed;if(state.aiWait>=.95){shoot(state,aiPlan.angle,aiPlan.power,aiPlan.pocket);aiPlan=null;context.sound('tap');save();}}
  if(previous!==state.phase)refresh();else if(state.phase==='moving')draw();frame=requestAnimationFrame(tick);
 }
 // Pausing cancels the stroke, but physical contacts end only on pointerup/cancel.
 const instance={pause(){if(paused||disposed)return;cancelDrag();paused=true;cancelAnimationFrame(frame);last=0;refresh();},resume(){if(!paused||disposed)return;paused=false;last=0;refresh();frame=requestAnimationFrame(tick);},restart(){reset();},serialize(){return JSON.parse(JSON.stringify(state)) as PoolState;},restore(data:unknown){const restored=restoreGame(data);if(!restored)return;cancelDrag();state=restored;aiPlan=null;accumulator=0;last=0;const cue=state.balls.find(b=>b.id===0)!;ghost=state.ballInHand?{x:cue.x,y:cue.y,valid:validCuePosition(state,cue.x,cue.y)}:null;refresh();},dispose(){cancelDrag();resizeObserver.disconnect();disposed=true;cancelAnimationFrame(frame);abort.abort();root.remove();}};
 refresh();frame=requestAnimationFrame(tick);return instance;
}};
export default module;
