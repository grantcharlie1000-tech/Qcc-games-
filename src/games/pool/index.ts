import type {GameModule} from '../../core/types';
import {createGame,step,shoot,restoreGame,POCKETS,groupOf,legalTargets,chooseAI,placeAICue,placeCue,validCuePosition,DT,type PoolState} from './model';
import {drawTable} from './render';
import {POOL_ONLINE_VERSION,PoolGuest,PoolHost,parseCommand,parseHostMessage,type Command} from './online';
import {RoomDialog,inviteCodeFromHash,relayOnlyFromHash} from '../../multiplayer/panel';
import type {Room} from '../../multiplayer/room';
import {ballColor} from './appearance';
import {tablePoint,onFelt,beginDrag,moveDrag,releaseDrag,type Drag} from './input';
import './style.css';
export const rules='Eight-ball: drag on the felt to aim, then drag the white ball backwards and release to shoot. Return to your starting point before releasing to cancel, or press C. A second finger cancels. The white aiming line previews the first collision, not a guaranteed pot. Arrow keys on the table adjust aim; up/down change power; Enter or Space shoots. C cancels a drag. Escape opens Study and cancels. Pocket your solids (1–7) or stripes (9–15), then pocket the 8 in your selected numbered pocket. A legal pot keeps your turn; a legal miss passes it. Hit your group first (any colored ball on an open table), then pocket a ball or reach a cushion. A scratch, wrong first hit or no rail/pot gives the opponent ball-in-hand: tap or drag to a clear spot and release (keyboard: arrows then Enter). Groups are assigned by the first legal colored pot after the break. The 8 before your group is gone, in the wrong pocket, or on a foul loses. Local simplifications from WPA: only the 8 pocket is called; player 1 always breaks from the fixed head spot with a repeatable rack; every break foul or illegal break gives ball-in-hand anywhere, with no re-rack choice; a break 8 is automatically re-spotted. A break needs a pot or four object balls reaching cushions. No safety calls, temporary open-table group claims, spin, jumps or tournament/referee fouls. Play against the offline computer or pass the device to Player 2. Easy is a forgiving beginner opponent; Medium is the original computer; Hard checks shots using table physics. Changing Players or AI difficulty starts a new rack. Multiplayer plays on two devices: one player creates a room and shares its code or invite link, the other joins. Online, the host breaks and the host’s device runs the official table.';
/** Online names come from another device: never markup. */
const escapeHtml=(t:string)=>t.replace(/[&<>"']/g,c=>`&#${c.charCodeAt(0)};`);
const module:GameModule={id:'pool',title:'Pool',cover:'game-art/pool/cover.svg',rules,mount(container,context){
 let state=createGame(),paused=false,disposed=false,frame=0,last=0,accumulator=0,aiPlan:ReturnType<typeof chooseAI>|null=null;
 let ghost:{x:number;y:number;valid:boolean}|null=null;
 const abort=new AbortController(),root=document.createElement('div');root.className='pool-game';
 root.innerHTML=`<div class="pool-players" role="group" aria-label="Ball groups and potted balls"><section class="pool-player"></section><section class="pool-player"></section></div><p class="pool-open-table"></p><div class="pool-table-area"><div class="pool-cue-meter"><span>POWER</span><div aria-hidden="true"><i></i></div><output class="pool-power-value" aria-live="off">0%</output></div><div class="pool-table-wrap"><div class="mp-waiting" hidden>Waiting for host<small>The host has paused the game.</small></div><canvas class="pool-table" tabindex="0" role="img" aria-label="Billiards table. Drag felt to aim; pull white ball back and release to shoot. Arrow keys aim and change power; Enter shoots; C cancels." aria-describedby="pool-tip" width="840" height="440"></canvas><p class="pool-message" role="status"></p></div></div><div class="pool-inhand" hidden>Ball-in-hand: tap or drag to a clear spot and release. Keyboard: arrows to move, Enter to place.</div><div class="pool-under"><label class="pool-mode">Players <select aria-label="Players"><option value="ai">You vs computer</option><option value="two">Two people</option></select></label><button type="button" class="pool-multiplayer" aria-haspopup="dialog">Multiplayer</button><label class="pool-mode">AI <select aria-label="AI difficulty"><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></label><div class="pool-pocket-row"><label for="pool-pocket">8-ball pocket</label><select id="pool-pocket" aria-label="8-ball pocket">${POCKETS.map((_,i)=>`<option value="${i}">${i+1} · ${['Top right','Bottom right','Top middle','Bottom middle','Top left','Bottom left'][i]}</option>`).join('')}</select></div><span class="pool-shot-count">0 shots</span></div><p class="pool-gesture-label" role="status">Drag felt to aim · pull white ball back to shoot</p><details class="pool-help"><summary>How to play</summary><p class="pool-tip" id="pool-tip">Drag the felt to aim. Pull back from the white ball, then release to shoot. Cancel: return to your starting point, add a second finger, or press C. Keyboard: ← → aim · ↑ ↓ power · Enter shoot. The top trays fill with your numbered balls as they are potted.</p></details><p class="pool-live"></p>`;
 container.append(root);
 const $=<T extends HTMLElement>(selector:string)=>root.querySelector<T>(selector)!;
 const canvas=$<HTMLCanvasElement>('.pool-table'),pocket=$<HTMLSelectElement>('#pool-pocket'),mode=$<HTMLSelectElement>('[aria-label="Players"]');
 const difficulty=$<HTMLSelectElement>('[aria-label="AI difficulty"]');
 let drag:Drag|null=null,pointer:number|null=null,placing=false,keyboardPower=false;
 let dragRect:DOMRect|null=null;
 const contacts=new Set<number>();
 const cue=()=>state.balls.find(b=>b.id===0)!;
 /** Online play: the room, this device's seat, the host's authoritative table or the guest's mirror, and the offline
  *  game kept aside (the shell keeps saving that one, so online racks never replace it). */
 let online:{room:Room;seat:number;host:PoolHost|null;guest:PoolGuest|null;offline:PoolState;guestId:string|null;roomPaused:boolean;seq:number;off:()=>void}|null=null;
 let dialog:RoomDialog|null=null,lastAimSent=0;
 const human=()=>online?state.turn===online.seat:state.mode==='two'||state.turn===0;
 const onlineReady=()=>!online||(online.host?online.host.opponent:!!online.guest?.state)&&!online.roomPaused&&online.guest?.pending==null;
 const canAim=()=>!paused&&!disposed&&state.phase==='aim'&&human()&&!state.ballInHand&&onlineReady();
 let lastStatus='';
 const setText=(selector:string,value:string)=>{const el=$(selector);if(el.textContent!==value)el.textContent=value;};
 const onlineNames=():[string,string]|null=>online?(online.host?online.host.names:online.guest!.names):null;
 const name=(player:number)=>{const n=onlineNames();if(n)return `${n[player]||'Waiting…'}${player===online!.seat?' (you)':''}`;return state.mode==='ai'?(player===0?'You':'Computer'):`Player ${player+1}`;};
 function save(){context.save(instance.serialize());}
 let hudKey='';
 const ballMarkup=(id:number,extra='')=>`<span class="pool-mini-ball ${id>8?'pool-striped':''} ${extra}" style="--ball-color:${ballColor(id)}"><span>${id}</span></span>`;
 function playerHud(){
  const key=[state.turn,state.phase,state.mode,...(onlineNames()??[]),...state.groups,...state.balls.filter(b=>b.pocketed).map(b=>b.id)].join(':');if(key===hudKey)return;hudKey=key;
  for(let i=0;i<2;i++){
   const el=root.querySelectorAll<HTMLElement>('.pool-player')[i],group=state.groups[i],ids=group?Array.from({length:7},(_,n)=>n+(group==='solids'?1:9)):[],potted=ids.filter(id=>state.balls.find(b=>b.id===id)?.pocketed),onEight=!!group&&potted.length===7,current=state.turn===i&&state.phase!=='over';
   el.classList.toggle('pool-current',current);el.setAttribute('aria-label',`${escapeHtml(name(i))}: ${group??'group unassigned'}. ${potted.length} potted${current?'. Current player':''}`);
   el.innerHTML=`<div class="pool-player-heading"><div class="pool-group-symbol" aria-hidden="true">${group?ballMarkup(onEight?8:group==='solids'?1:9):'<span class="pool-unassigned-ball">?</span>'}</div><div class="pool-player-identity"><strong>${escapeHtml(name(i))}<span class="pool-turn-label">${current?(i===0&&state.mode==='ai'?'Your turn':'To play'):''}</span></strong><span class="pool-group-label">${onEight?'ON THE 8':group==='solids'?'SOLIDS · 1–7':group==='stripes'?'STRIPES · 9–15':'GROUP UNASSIGNED'}</span></div></div><div class="pool-pot-tray" aria-label="${escapeHtml(name(i))} potted balls">${Array.from({length:7},(_,n)=>{const id=ids[n],down=id!==undefined&&potted.includes(id);return `<span class="pool-pot-slot ${down?'pool-pot-filled':''}" ${id!==undefined?`data-ball="${id}"`:''} aria-label="${id===undefined?'Unassigned slot':`Ball ${id}: ${down?'potted':'on table'}`}">${down?ballMarkup(id):`<span class="pool-empty-number">${id??''}</span>`}</span>`;}).join('')}</div><small class="pool-pot-count">${group?`${potted.length} POTTED · ${7-potted.length} LEFT`:'POTTED BALLS'}</small>`;
  }
  const open=root.querySelector<HTMLElement>('.pool-open-table')!;
  const down=state.balls.filter(b=>b.pocketed&&b.id!==0&&b.id!==8);
  open.innerHTML=state.groups[0]?`<span class="pool-tray-key">The top trays show potted balls</span>`:`<span>OPEN TABLE · Pot a ball after the break to claim your group</span>${down.length?`<span class="pool-open-pots" aria-label="Potted before groups were assigned">${down.map(b=>ballMarkup(b.id)).join('')}</span>`:''}`;
 }
 function draw(){playerHud();root.dataset.table=state.balls.map(b=>`${b.id}:${b.x.toFixed(2)},${b.y.toFixed(2)},${b.pocketed?1:0}`).join(';');drawTable(canvas,state,ghost,paused,drag,onlineNames());}
 function refresh(announce=false){
  root.dataset.phase=state.phase;root.dataset.shots=String(state.shots);root.dataset.turn=String(state.turn);root.dataset.table=state.balls.map(b=>`${b.id}:${b.x.toFixed(2)},${b.y.toFixed(2)},${b.pocketed?1:0}`).join(';');root.setAttribute('aria-busy',String(state.phase==='moving'));

  const text=state.phase==='over'?`${name(state.winner!)} won. ${state.message}`:state.phase==='moving'?`${name(state.turn)} · balls rolling…`:`${name(state.turn)} to play. ${state.message}`;setText('.pool-message',text);
  $('.pool-shot-count').textContent=`${state.shots} shot${state.shots===1?'':'s'}`;mode.value=state.mode;mode.disabled=paused||!!online;difficulty.value=state.difficulty;difficulty.disabled=paused||state.mode==='two'||!!online;
  $('.pool-multiplayer').textContent=online?'Online room':'Multiplayer';
  root.dataset.online=online?(online.host?'host':'guest'):'off';root.dataset.rev=String(online?(online.host?online.host.rev:online.guest!.rev):0);
  $('.mp-waiting').hidden=!(online?.guest&&online.roomPaused);
  pocket.value=String(state.calledPocket);pocket.disabled=!canAim()||state.break;
  const activePower=drag?.kind==='pull'?drag.power:keyboardPower?state.power:0;
  root.dataset.gesture=placing?'place':drag?.kind||'idle';
  $('.pool-power-value').textContent=`${Math.round(activePower*100)}%`;
  $('.pool-cue-meter i').style.height=`${activePower*100}%`;
  const gestureText=drag?.kind==='pull'?(drag.power>=.08?'Release to shoot · return to start to cancel':'Pull away from the aim line to build power'):drag?'Release to set aim · then pull white ball back':keyboardPower?`Aim ${Math.round(((state.angle+Math.PI/2)*180/Math.PI+360)%360)}° · ${Math.round(state.power*100)}% power · Enter to shoot`:'Drag felt to aim · pull white ball back to shoot';
  setText('.pool-gesture-label',gestureText);
  const inHand=state.ballInHand&&human()&&state.phase==='aim'&&onlineReady();$('.pool-inhand').hidden=!inHand;
  const liveText=online&&!(online.host?online.host.opponent:online.guest!.state)?`Waiting for an opponent to join room ${online.room.code}.`:online?.roomPaused?'Waiting for host.':online?.guest?.pending!=null?'Sent to the host…':online&&state.phase==='aim'&&!human()?`Waiting for ${name(state.turn)}…`:state.phase==='over'?(online?.guest?'The host can start a new rack with Restart.':'Restart in the top toolbar to play again.'):state.ballInHand?'Ball-in-hand · place the white cue ball.':!human()&&state.phase==='aim'?'Computer is choosing a shot locally…':legalTargets(state).some(b=>b.id===8)?'Your group is clear. Select the 8-ball pocket before shooting.':'';setText('.pool-live',liveText);
  if(!online)context.setScore(state.balls.filter(b=>b.id!==0&&!b.pocketed).length===15?0:state.balls.filter(b=>b.id!==0&&b.id!==8&&b.pocketed).length*100+(state.phase==='over'&&state.winner===0?1000:0));context.setLevel(state.phase==='over'?'Rack complete':`Shot ${state.shots+1}`);if(lastStatus!==text){context.setStatus(text);lastStatus=text;}if(announce)context.announce(text);
  draw();
 }
 function updated(){aiPlan=null;refresh();save();}
 function aimChange(degrees:number){if(!canAim())return;keyboardPower=true;const radians=state.angle+degrees*Math.PI/180;state.angle=Math.atan2(Math.sin(radians),Math.cos(radians));sendAim(true);updated();}
 function doShoot(){if(!canAim())return;if(online){act({t:'shoot',angle:state.angle,power:state.power,pocket:state.calledPocket});return;}if(shoot(state,state.angle,state.power,state.calledPocket)){context.sound('tap');ghost=null;updated();}}
 function tryPlace(x:number,y:number){if(online){act({t:'place',x,y});return;}if(placeCue(state,x,y)){ghost=null;context.sound('tap');}updated();}
 // ---- Online ------------------------------------------------------------------------------------------------------
 type Action={t:'shoot';angle:number;power:number;pocket:number}|{t:'place';x:number;y:number}|{t:'pocket';pocket:number};
 /** The host applies its own actions through the same checks as a guest's; a guest sends them and waits. */
 function act(a:Action){
  if(!online)return;
  if(online.host){
   const reason=online.host.command(0,{...a,seq:++online.seq,rev:online.host.rev} as Command);
   state=online.host.state;
   if(!reason){if(a.t!=='pocket')context.sound('tap');ghost=null;}
  }else if(online.guest?.command(a))cancelDrag();
  refresh();
 }
 function sendAim(force=false){
  if(!online||!human()||state.phase!=='aim')return;
  const now=performance.now();if(!force&&now-lastAimSent<90)return;lastAimSent=now;
  if(online.host)online.host.aim(0,state.angle,state.power);else online.guest?.aim(state.angle,state.power);
 }
 /** After an authoritative change: put the ball-in-hand marker on the cue for the player who must place it. */
 function afterState(previous:PoolState['phase']){
  if(state.ballInHand&&human()){const c=cue();ghost={x:c.x,y:c.y,valid:validCuePosition(state,c.x,c.y)};}else if(!state.ballInHand)ghost=null;
  if(previous!=='moving'&&state.phase==='moving')context.sound('tap');
  if(previous==='moving'&&state.phase!=='moving')context.sound(state.phase==='over'?'lose':'success');
  refresh(previous!==state.phase);
 }
 function startOnline(room:Room){
  cancelDrag();
  const offline=online?online.offline:JSON.parse(JSON.stringify(state)) as PoolState;
  online?.off();
  const self=room.self!;
  const session={room,seat:self.seat,host:null as PoolHost|null,guest:null as PoolGuest|null,offline,guestId:null as string|null,roomPaused:room.paused,seq:0,off:()=>{}};
  if(room.role==='host'){
   const host=new PoolHost(self.name,null,m=>room.send(m),(seat,m)=>{if(seat!==0&&session.guestId)room.send(m,session.guestId);});
   session.host=host;state=host.state;
  }else session.guest=new PoolGuest(m=>room.send(m));
  online=session;
  session.off=room.on(e=>{
   if(online!==session)return;
   if(e.type==='joined'&&session.host){
    session.guestId=e.player.id;session.host.setGuest(e.player.name);state=session.host.state;ghost=null;
    context.announce(`${e.player.name} joined. ${self.name} breaks.`);refresh(true);
   }else if(e.type==='left'&&session.host&&e.player.id===session.guestId){
    session.guestId=null;session.host.setGuest(null);state=session.host.state;ghost=null;
    dialog?.panel.setNote(`${e.player.name} left, so that rack ended. Waiting for a new opponent.`);context.announce(`${e.player.name} left the online game.`);refresh();
   }else if(e.type==='message'&&session.host&&e.from.id===session.guestId){
    const m=parseCommand(e.data);if(!m)return;
    const previous=state.phase;
    if(m.t==='sync')session.host.sync(1);
    else if(m.t==='aim'){session.host.aim(1,m.angle,m.power);if(!paused)draw();}
    else{session.host.command(1,m);state=session.host.state;afterState(previous);}
   }else if(e.type==='message'&&session.guest){
    const m=parseHostMessage(e.data);if(!m)return;
    const previous=state.phase,kind=session.guest.receive(m,performance.now());
    if(kind==='state'){state=session.guest.state!;afterState(previous);}
    else if(kind==='aim'){if(!paused)draw();}
    else if(kind==='reject'){const why={paused:'The host has paused the game.',duplicate:'That action was already received.',stale:'The table changed before your action arrived. Try again.',turn:'It is not your turn.',busy:'Wait for the balls to stop.',invalid:'That action is not allowed here.',waiting:'Waiting for the opponent.'}[session.guest.lastReject??'invalid'];context.setStatus(why);context.announce(why);refresh();}
   }else if(e.type==='paused'){session.roomPaused=e.paused;cancelDrag();if(session.guest)context.announce(e.paused?'Waiting for host.':'The host resumed.');refresh();}
   else if(e.type==='closed')endOnline(e.message);
  });
  if(session.guest){room.send({t:'sync'});dialog?.close();}
  if(session.host&&paused)room.setPaused(true);
  dialog?.panel.setNote(session.host?'You are the host: your device runs the table and breaks first.':'');
  refresh(true);
 }
 function endOnline(message:string){
  const session=online;if(!session)return;
  session.off();online=null;cancelDrag();
  state=session.offline;aiPlan=null;accumulator=0;last=0;
  const c=cue();ghost=state.ballInHand?{x:c.x,y:c.y,valid:validCuePosition(state,c.x,c.y)}:null;
  context.setStatus(message);context.announce(message);refresh();
 }
 /** The Multiplayer menu floats over the game: nothing in the table layout changes size. */
 function showOnline(){
  dialog??=new RoomDialog({game:'pool',title:'Pool',version:POOL_ONLINE_VERSION,maxPlayers:2,onOpen:startOnline,onClosed:endOnline,inviteCode:inviteCodeFromHash(location.hash),relayOnly:relayOnlyFromHash(location.hash)});
  dialog.open();
 }
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
  if(pointer!==null||contacts.size>1||event.isPrimary===false||event.button!==0||paused||disposed||state.phase!=='aim'||!human()||!onlineReady())return;
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
  else if(drag){moveDrag(drag,p,cue());state.angle=drag.angle;sendAim();}
  refresh();
 }) as EventListener);
 on(canvas,'pointerup',((event:PointerEvent)=>{
  if(event.pointerId!==pointer)return;
  event.preventDefault();if(!sameLayout()){changedLayout();return;}
  const p=tablePoint(event.clientX,event.clientY,canvas.getBoundingClientRect());
  if(placing){const valid=onFelt(p)&&validCuePosition(state,p.x,p.y);cancelDrag();if(valid&&onlineReady())tryPlace(p.x,p.y);else updated();return;}
  if(drag)moveDrag(drag,p,cue());const shot=drag?releaseDrag(drag):null;cancelDrag();
  if(shot&&canAim()){state.angle=shot.angle;state.power=shot.power;doShoot();}else updated();
 }) as EventListener);
 for(const event of ['pointercancel','lostpointercapture'])on(canvas,event,((e:PointerEvent)=>{if(e.pointerId===pointer){cancelDrag();refresh();}}) as EventListener);
 for(const event of ['pointerup','pointercancel'])on(window,event,((e:PointerEvent)=>{contacts.delete(e.pointerId);}) as EventListener,true);
 on(window,'resize',changedLayout);on(window,'blur',()=>{contacts.clear();changedLayout();});
 if(window.visualViewport){on(window.visualViewport,'resize',changedLayout);on(window.visualViewport,'scroll',changedLayout);}
 const resizeObserver=new ResizeObserver(changedLayout);resizeObserver.observe(canvas);
 on(pocket,'change',()=>{if(canAim()){cancelDrag();if(online)act({t:'pocket',pocket:Number(pocket.value)});else{state.calledPocket=Number(pocket.value);updated();}}});
 on($('.pool-multiplayer'),'click',()=>{if(!paused)showOnline();});
 on(difficulty,'change',()=>{if(!paused&&!online){state.difficulty=difficulty.value as PoolState['difficulty'];reset();}});
 on(mode,'change',()=>{if(!paused&&!online)reset(mode.value==='two'?'two':'ai');});
 on(canvas,'contextmenu',event=>{event.preventDefault();cancelDrag();refresh();});
 on(canvas,'keydown',((event:KeyboardEvent)=>{
  if(['c','C','Escape','Backspace'].includes(event.key)){event.preventDefault();cancelDrag();refresh();return;}
  if(paused||disposed||!human()||state.phase!=='aim'||!onlineReady()||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' ','Enter'].includes(event.key))return;
  event.preventDefault();if(event.repeat&&(event.key===' '||event.key==='Enter'))return;
  // A keyboard adjustment interrupts a pointer stroke; no stale release can fire it.
  cancelDrag();
  if(state.ballInHand){
   if(event.key==='Enter'&&ghost?.valid){tryPlace(ghost.x,ghost.y);return;}
   ghost=ghost||{x:cue().x,y:cue().y,valid:validCuePosition(state,cue().x,cue().y)};
   // Screen axes are the clockwise rotation of model axes.
   ghost.y+=event.key==='ArrowLeft'?8:event.key==='ArrowRight'?-8:0;
   ghost.x+=event.key==='ArrowUp'?-8:event.key==='ArrowDown'?8:0;
   ghost.valid=validCuePosition(state,ghost.x,ghost.y);refresh();return;
  }
  if(event.key===' '||event.key==='Enter')doShoot();
  else if(event.key==='ArrowLeft'||event.key==='ArrowRight')aimChange((event.key==='ArrowLeft'?-1:1)*(event.shiftKey?.2:1));
  else{keyboardPower=true;state.power=Math.max(.05,Math.min(1,state.power+(event.key==='ArrowUp'?.05:-.05)));sendAim(true);updated();}
 }) as EventListener);
 function tick(now:number){if(paused||disposed)return;const elapsed=last?Math.min(.25,(now-last)/1000):0;last=now;
  const previous=state.phase;
  if(online){
   // The host runs the official table; a guest only plays back the host's frames.
   if(online.host&&state.phase==='moving'&&!online.roomPaused){accumulator+=elapsed;const steps=Math.floor(accumulator/DT);accumulator-=steps*DT;if(online.host.advance(steps)){accumulator=0;state=online.host.state;afterState(previous);}else draw();}
   else if(online.guest&&state.phase==='moving'){online.guest.play(now);draw();}
   frame=requestAnimationFrame(tick);return;
  }
  if(state.phase==='moving'){accumulator+=elapsed;while(accumulator>=DT&&state.phase==='moving'){step(state);accumulator-=DT;}if(state.phase!=='moving'){accumulator=0;aiPlan=null;if(state.ballInHand){const cue=state.balls.find(b=>b.id===0)!;ghost={x:cue.x,y:cue.y,valid:validCuePosition(state,cue.x,cue.y)};}refresh(true);context.sound(state.phase==='over'?'lose':'success');save();}}
  else if(state.phase==='aim'&&!human()){if(!aiPlan){if(state.ballInHand)placeAICue(state);aiPlan=chooseAI(state);state.angle=aiPlan.angle;state.power=aiPlan.power;state.calledPocket=aiPlan.pocket;refresh();}state.aiWait+=elapsed;if(state.aiWait>=.95){shoot(state,aiPlan.angle,aiPlan.power,aiPlan.pocket);aiPlan=null;context.sound('tap');save();}}
  if(previous!==state.phase)refresh();else if(state.phase==='moving')draw();frame=requestAnimationFrame(tick);
 }
 // Pausing cancels the stroke, but physical contacts end only on pointerup/cancel.
 // Online, the host's pause pauses the room; resuming resends the whole table so every device agrees again.
 const instance={pause(){if(paused||disposed)return;cancelDrag();paused=true;cancelAnimationFrame(frame);last=0;if(online?.host){online.host.paused=true;online.room.setPaused(true);online.roomPaused=true;}refresh();},resume(){if(!paused||disposed)return;paused=false;last=0;if(online?.host){online.host.paused=false;online.roomPaused=false;online.room.setPaused(false);if(online.guestId)online.host.sync(1);}else if(online?.guest)online.room.send({t:'sync'});refresh();frame=requestAnimationFrame(tick);},restart(){if(online?.host){cancelDrag();if(online.host.opponent){online.host.newRack();state=online.host.state;ghost=null;refresh(true);}return;}if(online){context.setStatus('Only the host can start a new online rack.');return;}reset();},serialize(){return JSON.parse(JSON.stringify(online?online.offline:state)) as PoolState;},restore(data:unknown){const restored=restoreGame(data);if(!restored)return;if(online){online.offline=restored;return;}cancelDrag();state=restored;aiPlan=null;accumulator=0;last=0;const cue=state.balls.find(b=>b.id===0)!;ghost=state.ballInHand?{x:cue.x,y:cue.y,valid:validCuePosition(state,cue.x,cue.y)}:null;refresh();},dispose(){cancelDrag();resizeObserver.disconnect();disposed=true;online?.off();online=null;dialog?.dispose();dialog=null;cancelAnimationFrame(frame);abort.abort();root.remove();}};
 if(inviteCodeFromHash(location.hash))queueMicrotask(()=>{if(!disposed)showOnline();});
 // Development-only hook for the two-browser tests: read the table, aim like the keyboard does, send a raw command.
 if(import.meta.env.DEV)(window as unknown as {__pool?:unknown}).__pool={
  state:()=>JSON.parse(JSON.stringify(state)),seat:()=>online?.seat??null,
  aim(angle:number,power:number){if(!canAim())return false;state.angle=angle;state.power=power;keyboardPower=true;sendAim(true);refresh();return true;},
  ghost(x:number,y:number){if(!state.ballInHand)return false;ghost={x,y,valid:validCuePosition(state,x,y)};refresh();return ghost.valid;},
  raw(c:Action){return online?.guest?online.guest.command(c):false;}
 };
 refresh();frame=requestAnimationFrame(tick);return instance;
}};
export default module;
