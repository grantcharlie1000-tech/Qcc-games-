import type {GameModule} from '../../core/types';
import {createGame,nextRack,shoot,advance,placeCue,validPlacement,restoreGame,legalFirst,isOnEight,groupOf,groupLabel,remaining,other,
  type PoolState,type Difficulty,type Mode} from './game';
import {R,L,W,DT,POCKETS,POCKET_NAMES,trace,type Impact} from './physics';
import {plan,thinkTime,type Plan} from './ai';
import {Renderer,fitView,toWorld,toScreen,ballCss,type View,type Scene} from './render';
import {PoolSound} from './sound';
import {POOL_ONLINE_VERSION,PoolGuest,PoolHost,parseCommand,parseHostMessage,type Command,type AimMsg} from './online';
import {RoomDialog,inviteCodeFromHash,relayOnlyFromHash} from '../../multiplayer/panel';
import type {Room} from '../../multiplayer/room';
import {notifyGlassFrame,registerGlassFrameSource} from '../../ui/glass-frame-source';
import './style.css';

export const rules=`Eight-ball. Pocket all of your group — solids (1–7) or stripes (9–15) — then pocket the 8 in the pocket you call.
Aim: drag on the table (the cue points at your finger), use the fine-aim wheel, or the mouse wheel. Shoot: pull the cue in the power bar down and let go; drag it back to the top to cancel. Spin: tap the cue-ball button and place the dot for follow, draw or side.
The break: place the cue ball behind the head string and break. A legal break pockets a ball or drives four balls to a cushion; otherwise the opponent re-breaks. A ball potted on the break keeps your turn; the 8 on the break is re-spotted. The table stays open after the break.
Groups: the first legal pot after the break decides your group. On an open table you may hit any ball except the 8 first.
Fouls give your opponent ball in hand anywhere: potting the cue ball, missing every ball, hitting the wrong group (or the 8) first, or no ball reaching a cushion after contact when nothing drops. A scratch on the break gives ball in hand behind the head string.
Your turn continues while you legally pot your own group. When your group is cleared, call a pocket for the 8 by tapping it (one is suggested from your aim). You win by potting the 8 in the called pocket. You lose if you pot the 8 early, in another pocket, or on a foul.
Keyboard: ← → aim (Shift for fine), ↑ ↓ power, Enter or Space shoots, W A S D set spin, X centres spin, P changes the called pocket, H moves the cue ball when you have ball in hand (arrows, then Enter).
Play the computer (easy, medium or hard), pass the device for two players, or play online with Multiplayer.`;

/** Online names come from another device: never markup. */
const escapeHtml=(t:string)=>t.replace(/[&<>"']/g,c=>`&#${c.charCodeAt(0)};`);
type Guide='full'|'short'|'off';

const module:GameModule={id:'pool',title:'Pool',cover:'game-art/pool/cover.svg',rules,mount(container,context){
  let state=createGame('ai','medium',(Date.now()>>>0)||1);
  let paused=false,disposed=false,frame=0,last=0,accumulator=0,guide:Guide='full';
  const root=document.createElement('div');root.className='pool-game';
  root.innerHTML=`
  <header class="pool-hud">
    ${[0,1].map(i=>`<section class="pool-player" data-seat="${i}" aria-live="off"><div class="pool-avatar" aria-hidden="true"><span></span></div><div class="pool-player-body"><div class="pool-player-top"><span class="pool-player-name"></span><span class="pool-player-wins" title="Racks won"></span></div><div class="pool-rack-balls"></div></div></section>`).join('<div class="pool-center"><p class="pool-message"></p><p class="pool-sub"></p></div>')}
  </header>
  <div class="pool-stage">
    <div class="pool-controls">
      <button type="button" class="pool-spin" aria-haspopup="dialog" aria-expanded="false"><span class="pool-spin-ball" aria-hidden="true"><i></i></span><span class="pool-spin-label">Spin</span></button>
      <div class="pool-power" role="slider" tabindex="0" aria-label="Shot power: pull down and release to shoot" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
        <div class="pool-power-track"><div class="pool-power-fill"></div><div class="pool-power-cue"></div><div class="pool-power-grip" aria-hidden="true"></div></div>
        <span class="pool-power-value">Pull</span>
      </div>
    </div>
    <div class="pool-table-box">
      <canvas class="pool-table" tabindex="0" role="img" aria-label="Pool table" aria-describedby="pool-keys"></canvas>
      <div class="pool-toast" aria-hidden="true"><strong></strong><span></span></div>
      <div class="pool-result" hidden><div class="pool-result-card" role="group" aria-label="Rack result"><p class="pool-result-kicker">Rack over</p><h2></h2><p class="pool-result-why"></p><p class="pool-result-score"></p><button type="button" class="pool-again">Next rack</button></div></div>
      <div class="pool-waiting mp-waiting" hidden>Waiting for host<small>The host has paused the game.</small></div>
    </div>
    <div class="pool-fine" role="slider" tabindex="-1" aria-label="Fine aim" aria-valuemin="-180" aria-valuemax="180"><div class="pool-fine-ridges"></div></div>
    <div class="pool-spin-panel" hidden role="dialog" aria-label="Cue ball spin">
      <div class="pool-spin-big" tabindex="0" role="slider" aria-label="Spin position. Arrow keys move the strike point." aria-valuetext="Centre"><i></i></div>
      <div class="pool-spin-row"><span class="pool-spin-text">Centre</span><button type="button" class="pool-spin-reset">Centre</button><button type="button" class="pool-spin-done">Done</button></div>
    </div>
  </div>
  <div class="pool-options">
    <label class="pool-mode">Players <select aria-label="Players"><option value="ai">You vs computer</option><option value="two">Two players, one device</option></select></label>
    <label class="pool-mode">Computer <select aria-label="Computer level"><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></label>
    <label class="pool-mode">Aim guide <select aria-label="Aim guide"><option value="full">Long</option><option value="short">Short</option><option value="off">Off</option></select></label>
    <button type="button" class="pool-multiplayer" aria-haspopup="dialog">Multiplayer</button>
  </div>
  <p class="pool-live sr-only" role="status"></p>
  <p class="sr-only" id="pool-keys">Arrow keys aim and set power, Enter shoots, W A S D spin, P calls the 8 pocket, H moves the cue ball when you have ball in hand.</p>`;
  container.append(root);
  const $=<T extends HTMLElement>(sel:string)=>root.querySelector<T>(sel)!;
  const canvas=$<HTMLCanvasElement>('.pool-table'),box=$('.pool-table-box'),powerEl=$('.pool-power'),fineEl=$('.pool-fine');
  const spinBtn=$<HTMLButtonElement>('.pool-spin'),spinPanel=$('.pool-spin-panel'),spinBig=$('.pool-spin-big');
  const modeSel=$<HTMLSelectElement>('[aria-label="Players"]'),levelSel=$<HTMLSelectElement>('[aria-label="Computer level"]'),guideSel=$<HTMLSelectElement>('[aria-label="Aim guide"]');
  const renderer=new Renderer(canvas),sound=new PoolSound(()=>context.settings.sound);
  let view:View=fitView(300,200,1);

  // ---- Interaction state (never saved)
  let power=0,powerDrag:{id:number;y0:number;h:number}|null=null;
  let aimDrag:number|null=null,fineDrag:{id:number;last:number}|null=null;
  let handDrag:{id:number;x:number;y:number;valid:boolean}|null=null,handKeys=false;
  let manualCall=false,suggested:number|null=null;
  let keyboardPower=.6;
  let strikeAnim:{t:number;angle:number;from:number}|null=null;
  let sinking:Scene['sinking']=[];
  let aiJob:{gen:Generator<void,Plan>;start:number;plan:Plan|null;from:number;anim:number;placed:boolean}|null=null;
  let toastTimer=0,hudKey='',lastStatus='',lastLive='',fast:number|null=null;

  // ---- Online
  type OnlineSession={room:Room;seat:number;offline:PoolState;guestId:string|null;roomPaused:boolean;seq:number;off:()=>void}&({host:PoolHost;guest:null}|{host:null;guest:PoolGuest});
  let online:OnlineSession|null=null,dialog:RoomDialog|null=null,lastAimSent=0;
  const onlineNames=():[string,string]|null=>online?(online.host?online.host.names:online.guest.names):null;
  const onlineReady=()=>!online||(online.host?online.host.opponent:!!online.guest?.state)&&!online.roomPaused&&online.guest?.pending==null;

  const isHuman=(seat:0|1)=>online?seat===online.seat:state.mode==='two'||seat===0;
  const myTurn=()=>isHuman(state.turn);
  const canAct=()=>!paused&&!disposed&&state.phase==='aim'&&myTurn()&&onlineReady()&&!aiJob;
  const nameOf=(seat:0|1)=>{const n=onlineNames();if(n)return n[seat]||'Waiting…';return state.mode==='ai'?(seat===0?'You':'Computer'):`Player ${seat+1}`;};
  const possessive=(seat:0|1)=>{const n=nameOf(seat);return n==='You'?'Your':`${n}’s`;};
  const cue=()=>state.balls[0];

  function save(){context.save(instance.serialize());}
  function setPower(p:number){
    power=Math.max(0,Math.min(1,p));
    root.style.setProperty('--pool-power',String(power));
    powerEl.setAttribute('aria-valuenow',String(Math.round(power*100)));
    $('.pool-power-value').textContent=power>0?`${Math.round(power*100)}%`:'Pull';
  }
  function setSpin(x:number,y:number){
    const m=Math.hypot(x,y);if(m>1){x/=m;y/=m;}
    state.aim.spinX=Math.abs(x)<.04?0:x;state.aim.spinY=Math.abs(y)<.04?0:y;
    root.style.setProperty('--spin-x',String(state.aim.spinX));root.style.setProperty('--spin-y',String(-state.aim.spinY));
    const t=spinText();spinBtn.setAttribute('aria-label',`Spin: ${t}`);spinBig.setAttribute('aria-valuetext',t);$('.pool-spin-text').textContent=t;
    sendAim();
  }
  function spinText(){
    const {spinX:x,spinY:y}=state.aim;if(!x&&!y)return 'Centre';
    const v=y>.15?'Follow':y<-.15?'Draw':'',h=x>.15?'right':x<-.15?'left':'';
    return v&&h?`${v}, ${h} english`:v||`${h[0].toUpperCase()}${h.slice(1)} english`;
  }

  // ---- Layout
  function layout(){
    const stage=$('.pool-stage').getBoundingClientRect();
    const portrait=stage.width<stage.height*.95;
    if(root.dataset.orient!==(portrait?'portrait':'landscape'))root.dataset.orient=portrait?'portrait':'landscape';
    const r=box.getBoundingClientRect();
    view=fitView(Math.max(50,r.width),Math.max(50,r.height),Math.min(2,window.devicePixelRatio||1),portrait);
    canvas.style.width=`${r.width}px`;canvas.style.height=`${r.height}px`;
    if(powerDrag)cancelPower();
    paint();
  }
  const resizeObserver=new ResizeObserver(()=>{if(!disposed)layout();});resizeObserver.observe(box);resizeObserver.observe($('.pool-stage'));

  // ---- Guides and scene
  function legalHit(hit:number|null){return hit===null||legalFirst(state).includes(hit);}
  function currentTrace(){return trace(state.balls,cue(),state.aim.angle);}
  function updateSuggestion(){
    if(state.breakShot||!isOnEight(state)){suggested=null;manualCall=false;state.called=null;return;}
    const t=currentTrace();
    if(t.hit===8){
      const b=state.balls[8];let best=0,bestDot=-2;
      POCKETS.forEach((p,i)=>{const dx=p.mx-b.x,dy=p.my-b.y,d=Math.hypot(dx,dy),dot=(dx*t.ox+dy*t.oy)/d;if(dot>bestDot){bestDot=dot;best=i;}});
      suggested=best;
    }
    if(!manualCall)state.called=suggested??state.called??0;
  }
  function scene():Scene{
    const aiming=state.phase==='aim'&&!state.balls.some(b=>b.vx||b.vy);
    const showCue=(aiming&&(canAct()||!!aiJob?.plan||!!online&&!myTurn()))||!!strikeAnim;
    const pull=powerDrag?power*.24:aiJob?.plan?Math.min(1,Math.max(0,(performance.now()-aiJob.anim-450)/450))*aiJob.plan.power*.24:0;
    let cueDraw:Scene['cue']=null;
    if(strikeAnim){const k=Math.min(1,(performance.now()-strikeAnim.t)/90);cueDraw={angle:strikeAnim.angle,pull:strikeAnim.from*(1-k*k)-.004*k,alpha:1};}
    else if(showCue&&cue().on)cueDraw={angle:state.aim.angle,pull,alpha:1};
    const remote=online?.guest?.hand;
    const handPos=handDrag??(remote&&!myTurn()?{...remote,valid:true}:null)??(state.hand&&cue().on?{x:cue().x,y:cue().y,valid:true}:null);
    const showGuide=aiming&&guide!=='off'&&(canAct()||!!online&&!myTurn())&&!handDrag&&cue().on;
    let g:Scene['guide']=null;
    if(showGuide){const t=currentTrace();g={trace:t,legal:legalHit(t.hit),from:{x:cue().x,y:cue().y},length:guide==='full'?1:.45};}
    const onEight=aiming&&!state.breakShot&&isOnEight(state);
    const dimmed=new Set<number>();
    if(aiming&&canAct()&&!state.breakShot&&state.groups[state.turn]){const legal=new Set(legalFirst(state));for(const b of state.balls)if(b.id!==0&&b.on&&!legal.has(b.id))dimmed.add(b.id);}
    const balls=handPos&&state.hand&&(handDrag||remote)?state.balls.map(b=>b.id===0?{...b,x:handPos.x,y:handPos.y}:b):state.balls;
    return {balls,sinking,cue:cueDraw,guide:g,
      hand:handPos&&state.hand?{x:handPos.x,y:handPos.y,valid:handPos.valid,kitchen:state.hand==='kitchen',active:aiming&&(canAct()||!!remote),pulse:(Math.sin(performance.now()/260)+1)/2}:null,
      pockets:onEight?{called:state.called,choosing:canAct()}:null,dimmed};
  }
  function paint(){if(disposed)return;renderer.draw(view,scene());notifyGlassFrame(canvas);}
  const releaseGlass=registerGlassFrameSource(canvas,()=>paint());

  // ---- HUD
  const miniBall=(id:number,extra='')=>`<span class="pool-ball${id>8?' pool-ball-stripe':''}${extra}" style="--ball:${ballCss(id)}"><b>${id}</b></span>`;
  function hud(){
    const key=JSON.stringify([state.turn,state.phase,state.groups,state.potted,state.wins,state.mode,onlineNames(),online?.seat,state.breakShot]);
    if(key===hudKey)return;hudKey=key;
    for(const seat of [0,1] as const){
      const el=root.querySelector<HTMLElement>(`.pool-player[data-seat="${seat}"]`)!,g=state.groups[seat];
      const active=state.turn===seat&&state.phase!=='over';
      el.classList.toggle('pool-active',active);
      el.classList.toggle('pool-winner',state.phase==='over'&&state.winner===seat);
      const name=nameOf(seat);
      el.querySelector('.pool-avatar span')!.textContent=name==='Computer'?'CPU':name.slice(0,1).toUpperCase();
      el.querySelector('.pool-player-name')!.textContent=name;
      el.querySelector('.pool-player-wins')!.textContent=String(state.wins[seat]);
      const rack=el.querySelector('.pool-rack-balls')!;
      if(!g)rack.innerHTML=`<span class="pool-open">${state.breakShot?(state.breaker===seat?'Breaks':'—'):'Open table'}</span>`;
      else{
        const ids=g==='solids'?[1,2,3,4,5,6,7]:[9,10,11,12,13,14,15],left=remaining(state,g);
        rack.innerHTML=ids.map(id=>miniBall(id,state.balls[id].on?'':' pool-ball-down')).join('')+(left===0?miniBall(8,state.balls[8].on?' pool-ball-eight':' pool-ball-down'):'');
      }
      el.setAttribute('aria-label',`${name}${active?', to shoot':''}. ${g?`${groupLabel(g)}, ${remaining(state,g)} left`:'No group yet'}. Racks won ${state.wins[seat]}.`);
    }
  }
  function message():[string,string]{
    const who=state.turn,human=myTurn();
    if(online&&!(online.host?online.host.opponent:online.guest.state))return ["Waiting for an opponent",`Room ${online.room.code}`];
    if(online?.roomPaused)return ['Paused','Waiting for host'];
    if(state.phase==='over'){const w=state.winner!;return [isHuman(w)&&state.mode==='ai'&&!online?'You win!':`${nameOf(w)} wins`,state.message];}
    if(state.phase==='moving')return [`${possessive(state.shooter)} shot`,''];
    const lead=human?(state.mode==='ai'&&!online?'Your shot':online?'Your shot':`${nameOf(who)} to shoot`):aiJob?`${nameOf(who)} is thinking…`:`${nameOf(who)} to shoot`;
    let sub='';
    if(state.breakShot)sub=state.hand?'Break from behind the line':'Break';
    else if(state.hand)sub=human?'Ball in hand · drag the cue ball':'Ball in hand';
    else if(isOnEight(state))sub='On the 8 · call a pocket';
    else if(!state.groups[who])sub='Open table';
    else sub=`${groupLabel(state.groups[who]!)} · ${remaining(state,state.groups[who]!)} left`;
    return [lead,sub];
  }
  function showToast(title:string,text:string,tone:'foul'|'good'|'info'='info'){
    const t=$('.pool-toast');t.querySelector('strong')!.textContent=title;t.querySelector('span')!.textContent=text;t.dataset.tone=tone;
    t.classList.remove('pool-toast-on');void t.offsetWidth;t.classList.add('pool-toast-on');
    clearTimeout(toastTimer);toastTimer=window.setTimeout(()=>t.classList.remove('pool-toast-on'),1900);
  }
  function refresh(announce=false){
    root.dataset.phase=state.phase;root.dataset.shots=String(state.shots);root.dataset.turn=String(state.turn);
    root.dataset.gesture=powerDrag?'pull':handDrag?'place':aimDrag!==null?'aim':'idle';
    root.dataset.online=online?(online.host?'host':'guest'):'off';root.dataset.rev=String(online?(online.host?online.host.rev:online.guest.rev):0);
    root.dataset.hand=state.hand??'';
    root.setAttribute('aria-busy',String(state.phase==='moving'));
    root.classList.toggle('pool-can-act',canAct());
    hud();
    const [lead,sub]=message();
    $('.pool-message').textContent=lead;$('.pool-sub').textContent=state.phase==='moving'?(online?'':'Hold the table to fast-forward'):sub;
    $('.pool-waiting').hidden=!(online?.guest&&online.roomPaused);
    const over=state.phase==='over';$('.pool-result').hidden=!over;
    if(over){
      const w=state.winner!;$('.pool-result h2').textContent=lead;$('.pool-result-why').textContent=state.message;
      $('.pool-result-score').textContent=`${nameOf(0)} ${state.wins[0]} – ${state.wins[1]} ${nameOf(1)}`;
      $('.pool-result').dataset.win=String(isHuman(w));
      const again=$<HTMLButtonElement>('.pool-again');again.hidden=!!online?.guest;
    }
    modeSel.value=state.mode;levelSel.value=state.difficulty;guideSel.value=guide;
    modeSel.disabled=paused||!!online;levelSel.disabled=paused||state.mode==='two'||!!online;
    $('.pool-multiplayer').textContent=online?'Online room':'Multiplayer';
    const act=canAct();spinBtn.disabled=!act;powerEl.setAttribute('aria-disabled',String(!act));
    const status=state.phase==='moving'?'Balls rolling…':`${lead}${sub?`. ${sub}`:''}`;
    if(status!==lastStatus){lastStatus=status;context.setStatus(status);}
    const live=state.phase==='moving'?'':status;
    if(live&&live!==lastLive){lastLive=live;$('.pool-live').textContent=live;if(announce)context.announce(live);}
    canvas.setAttribute('aria-label',`Pool table. ${status}. ${state.balls.filter(b=>b.on&&b.id).length} object balls on the table.`);
    if(!online){
      const g=state.groups[0],mine=g?7-remaining(state,g):0;
      context.setScore(mine*100+(over&&state.winner===0?1000:0));
    }
    context.setLevel(state.breakShot&&!state.shots||over?`Rack ${state.rack}`:`Rack ${state.rack} · Shot ${state.shots+(state.phase==='moving'?0:1)}`);
    paint();
  }
  function stateChanged(announce=true){updateSuggestion();refresh(announce);save();}

  // ---- Shooting
  function sendAim(force=false){
    if(!online||!myTurn()||state.phase!=='aim')return;
    const now=performance.now();if(!force&&now-lastAimSent<80)return;lastAimSent=now;
    const a:AimMsg&{hx?:number;hy?:number}={...state.aim,...(handDrag?{hx:handDrag.x,hy:handDrag.y}:{})};
    if(online.host)online.host.aim(0,a);else online.guest.aim(a);
  }
  function fire(p:number){
    if(!canAct()||p<.02||!cue().on)return false;
    updateSuggestion();
    const input={angle:state.aim.angle,power:p,spinX:state.aim.spinX,spinY:state.aim.spinY,called:!state.breakShot&&isOnEight(state)?state.called??0:null};
    if(online){act({t:'shoot',...input});return true;}
    if(!shoot(state,input))return false;
    began(p);save();return true;
  }
  function began(p:number){
    strikeAnim={t:performance.now(),angle:state.aim.angle,from:p*.24};
    sound.cue(p);closeSpin();handKeys=false;sinking=[];accumulator=-.07;refresh();
  }
  function settled(){
    accumulator=0;manualCall=false;fast=fast===-1?null:fast;
    const t=state;
    if(t.phase==='over'){
      const win=isHuman(t.winner!);sound.pocket(1);
      context.sound(win||state.mode==='two'?'success':'lose');
      showToast(state.mode==='two'||online?`${nameOf(t.winner!)} wins`:win?'You win':'Computer wins',t.message,win?'good':'foul');
    }else if(t.foul){showToast('Foul',`${t.foul}. ${nameOf(t.turn)} has ball in hand.`,'foul');}
    else if(t.message.endsWith('for this player.')){const g=t.groups[t.turn]!;showToast(groupLabel(g),`${possessive(t.turn)} group`, 'good');}
    else if(t.message.startsWith('Ball down on the break')){showToast('Ball down','Shoot again · table is open','good');}
    else if(t.message.startsWith('Illegal break')){showToast('Illegal break',`${nameOf(t.turn)} re-breaks`,'foul');}
    else if(t.shooter!==t.turn&&state.mode!=='ai'){showToast(`${nameOf(t.turn)}`,'Your turn','info');}
    stateChanged(true);
  }
  function placeAt(x:number,y:number){
    if(online){act({t:'place',x,y});return;}
    if(placeCue(state,x,y)){renderer.look.last.delete(0);stateChanged(false);}
  }

  // ---- Online actions
  type Action={t:'shoot';angle:number;power:number;spinX:number;spinY:number;called:number|null}|{t:'place';x:number;y:number};
  function act(a:Action){
    if(!online)return;
    if(online.host){
      const reason=online.host.command(0,{...a,seq:++online.seq,rev:online.host.rev} as Command);
      state=online.host.state;
      if(!reason&&a.t==='shoot')began(a.power);
    }else online.guest.command(a);
    refresh();
  }
  function afterState(previous:PoolState['phase']){
    if(previous!=='moving'&&state.phase==='moving')began(state.aim.power);
    else if(previous==='moving'&&state.phase!=='moving')settled();
    else refresh(true);
  }
  function startOnline(room:Room){
    cancelAll();
    const offline=online?online.offline:JSON.parse(JSON.stringify(state)) as PoolState;
    online?.off();aiJob=null;
    const self=room.self!;
    const common={room,seat:self.seat,offline,guestId:null as string|null,roomPaused:room.paused,seq:0,off:()=>{}};
    let session:OnlineSession;
    if(room.role==='host'){
      const host=new PoolHost(self.name,null,m=>room.send(m),(seat,m)=>{if(seat!==0&&session.guestId)room.send(m,session.guestId);});
      session={...common,host,guest:null};state=host.state;
    }else{session={...common,host:null,guest:new PoolGuest(m=>room.send(m))};}
    online=session;
    session.off=room.on(e=>{
      if(online!==session)return;
      if(e.type==='joined'&&session.host){
        session.guestId=e.player.id;session.host.setGuest(e.player.name);state=session.host.state;renderer.look.reset();
        context.announce(`${e.player.name} joined. ${self.name} breaks.`);refresh(true);
      }else if(e.type==='left'&&session.host&&e.player.id===session.guestId){
        session.guestId=null;session.host.setGuest(null);state=session.host.state;
        dialog?.panel.setNote(`${e.player.name} left, so that rack ended. Waiting for a new opponent.`);context.announce(`${e.player.name} left the online game.`);refresh();
      }else if(e.type==='message'&&session.host&&e.from.id===session.guestId){
        const m=parseCommand(e.data);if(!m)return;
        const previous=state.phase;
        if(m.t==='sync')session.host.sync(1);
        else if(m.t==='aim'){session.host.aim(1,m);if(!paused)paint();}
        else{session.host.command(1,m);state=session.host.state;afterState(previous);}
      }else if(e.type==='message'&&session.guest){
        const m=parseHostMessage(e.data);if(!m)return;
        const previous=state.phase,kind=session.guest.receive(m,performance.now());
        if(kind==='state'){state=session.guest.state!;afterState(previous);}
        else if(kind==='aim'){if(!paused)paint();}
        else if(kind==='reject'){const why={paused:'The host has paused the game.',duplicate:'That action was already received.',stale:'The table changed before your action arrived. Try again.',turn:'It is not your turn.',busy:'Wait for the balls to stop.',invalid:'That action is not allowed here.',waiting:'Waiting for the opponent.'}[session.guest.lastReject??'invalid'];context.setStatus(why);context.announce(why);refresh();}
      }else if(e.type==='paused'){session.roomPaused=e.paused;cancelAll();if(session.guest)context.announce(e.paused?'Waiting for host.':'The host resumed.');refresh();}
      else if(e.type==='closed')endOnline(e.message);
    });
    if(session.guest){room.send({t:'sync'});dialog?.close();}
    if(session.host&&paused)room.setPaused(true);
    dialog?.panel.setNote(session.host?'You are the host: your device runs the table and breaks first.':'');
    refresh(true);
  }
  function endOnline(message:string){
    const session=online;if(!session)return;
    session.off();online=null;cancelAll();
    state=session.offline;accumulator=0;last=0;renderer.look.reset();
    context.setStatus(message);context.announce(message);stateChanged(false);
  }
  function showOnline(){
    dialog??=new RoomDialog({game:'pool',title:'Pool',version:POOL_ONLINE_VERSION,maxPlayers:2,onOpen:startOnline,onClosed:endOnline,inviteCode:inviteCodeFromHash(location.hash),relayOnly:relayOnlyFromHash(location.hash)});
    dialog.open();
  }

  // ---- Input
  const abort=new AbortController();
  const on=<K extends string>(el:EventTarget,type:K,fn:(e:any)=>void,opts:AddEventListenerOptions={})=>el.addEventListener(type,fn,{...opts,signal:abort.signal});
  const worldAt=(e:{clientX:number;clientY:number})=>{const r=canvas.getBoundingClientRect();return toWorld(view,e.clientX-r.left,e.clientY-r.top);};
  function cancelPower(){if(powerDrag&&powerEl.hasPointerCapture(powerDrag.id))powerEl.releasePointerCapture(powerDrag.id);powerDrag=null;setPower(0);}
  function cancelAll(){
    cancelPower();
    if(aimDrag!==null&&canvas.hasPointerCapture(aimDrag))canvas.releasePointerCapture(aimDrag);aimDrag=null;
    if(handDrag){if(canvas.hasPointerCapture(handDrag.id))canvas.releasePointerCapture(handDrag.id);handDrag=null;}
    fineDrag=null;handKeys=false;root.dataset.gesture='idle';
  }
  function aimAt(p:{x:number;y:number}){
    const c=cue(),dx=p.x-c.x,dy=p.y-c.y;if(Math.hypot(dx,dy)<R*.6)return;
    state.aim.angle=Math.atan2(dy,dx);updateSuggestion();sendAim();
  }
  function turnAim(delta:number){state.aim.angle=Math.atan2(Math.sin(state.aim.angle+delta),Math.cos(state.aim.angle+delta));updateSuggestion();sendAim();}
  on(canvas,'pointerdown',(e:PointerEvent)=>{
    // Holding the table while balls roll fast-forwards the shot.
    if(state.phase==='moving'&&e.isPrimary&&!online){fast=e.pointerId;e.preventDefault();return;}
    if(e.button!==0||!e.isPrimary||!canAct())return;
    if(aimDrag!==null||handDrag||powerDrag)return;
    const p=worldAt(e),c=cue(),touch=e.pointerType!=='mouse'?14/view.scale:4/view.scale;
    canvas.focus({preventScroll:true});
    if(state.hand&&Math.hypot(p.x-c.x,p.y-c.y)<R*1.6+touch){
      handDrag={id:e.pointerId,x:c.x,y:c.y,valid:true};canvas.setPointerCapture(e.pointerId);e.preventDefault();refresh();return;
    }
    if(!state.breakShot&&isOnEight(state)){
      const hit=POCKETS.findIndex(q=>Math.hypot(q.x-p.x,q.y-p.y)<.085+touch);
      if(hit>=0){state.called=hit;manualCall=true;context.announce(`8 called: ${POCKET_NAMES[hit]}`);sendAim(true);e.preventDefault();refresh();return;}
    }
    aimDrag=e.pointerId;canvas.setPointerCapture(e.pointerId);aimAt(p);e.preventDefault();refresh();
  });
  on(canvas,'pointermove',(e:PointerEvent)=>{
    if(handDrag&&e.pointerId===handDrag.id){
      const p=worldAt(e),x=Math.max(R,Math.min(L-R,p.x)),y=Math.max(R,Math.min(W-R,p.y));
      handDrag={...handDrag,x,y,valid:validPlacement(state,x,y)};sendAim();paint();return;
    }
    if(e.pointerId===aimDrag){aimAt(worldAt(e));paint();}
  });
  function endCanvas(e:PointerEvent,commit:boolean){
    if(fast===e.pointerId)fast=null;
    if(handDrag&&e.pointerId===handDrag.id){
      const d=handDrag;handDrag=null;
      if(commit&&d.valid&&canAct())placeAt(d.x,d.y);else refresh();
      return;
    }
    if(e.pointerId===aimDrag){aimDrag=null;refresh();sendAim(true);}
  }
  on(canvas,'pointerup',(e:PointerEvent)=>endCanvas(e,true));
  on(canvas,'pointercancel',(e:PointerEvent)=>endCanvas(e,false));
  on(canvas,'lostpointercapture',(e:PointerEvent)=>{if(handDrag?.id===e.pointerId||aimDrag===e.pointerId)endCanvas(e,false);});
  on(canvas,'wheel',(e:WheelEvent)=>{if(!canAct())return;e.preventDefault();turnAim((e.shiftKey?.00015:.0009)*Math.sign(e.deltaY||e.deltaX)*Math.min(4,Math.abs(e.deltaY||e.deltaX)/30+1));paint();},{passive:false});
  on(canvas,'contextmenu',(e:Event)=>e.preventDefault());

  // Power: pull the cue down, release to shoot. Back at the top cancels.
  on(powerEl,'pointerdown',(e:PointerEvent)=>{
    if(e.button!==0||!canAct()||powerDrag)return;
    const track=$('.pool-power-track').getBoundingClientRect();
    powerDrag={id:e.pointerId,y0:e.clientY,h:Math.max(60,track.height*.88)};powerEl.setPointerCapture(e.pointerId);e.preventDefault();setPower(0);refresh();
  });
  on(powerEl,'pointermove',(e:PointerEvent)=>{if(powerDrag?.id!==e.pointerId)return;setPower((e.clientY-powerDrag.y0)/powerDrag.h);paint();});
  on(powerEl,'pointerup',(e:PointerEvent)=>{
    if(powerDrag?.id!==e.pointerId)return;const p=power;cancelPower();
    if(p>=.02)fire(p);else refresh();
  });
  for(const t of ['pointercancel','lostpointercapture'])on(powerEl,t,(e:PointerEvent)=>{if(powerDrag?.id===e.pointerId){cancelPower();refresh();}});
  on(powerEl,'keydown',(e:KeyboardEvent)=>{
    if(!canAct())return;
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();keyboardPower=Math.max(.05,Math.min(1,keyboardPower+(e.key==='ArrowDown'?.05:-.05)));setPower(keyboardPower);paint();}
    else if(e.key==='Enter'||e.key===' '){e.preventDefault();if(!e.repeat){const p=keyboardPower;setPower(0);fire(p);}}
  });
  on(powerEl,'blur',()=>{if(!powerDrag)setPower(0);});

  // Fine aim wheel.
  on(fineEl,'pointerdown',(e:PointerEvent)=>{if(e.button!==0||!canAct())return;const portrait=root.dataset.orient==='portrait';fineDrag={id:e.pointerId,last:portrait?e.clientX:e.clientY};fineEl.setPointerCapture(e.pointerId);e.preventDefault();});
  on(fineEl,'pointermove',(e:PointerEvent)=>{
    if(fineDrag?.id!==e.pointerId)return;const portrait=root.dataset.orient==='portrait',pos=portrait?e.clientX:e.clientY;
    const d=pos-fineDrag.last;fineDrag.last=pos;turnAim(d*.0007*(portrait?-1:1));
    root.style.setProperty('--fine',String((parseFloat(root.style.getPropertyValue('--fine')||'0')+d)%24));paint();
  });
  for(const t of ['pointerup','pointercancel','lostpointercapture'])on(fineEl,t,(e:PointerEvent)=>{if(fineDrag?.id===e.pointerId){fineDrag=null;sendAim(true);}});

  // Spin picker.
  function openSpin(){if(!canAct())return;spinPanel.hidden=false;spinBtn.setAttribute('aria-expanded','true');spinBig.focus({preventScroll:true});}
  function closeSpin(){if(spinPanel.hidden)return false;spinPanel.hidden=true;spinBtn.setAttribute('aria-expanded','false');return true;}
  on(spinBtn,'click',()=>{if(spinPanel.hidden)openSpin();else closeSpin();});
  let spinDrag:number|null=null;
  const spinFrom=(e:PointerEvent)=>{const r=spinBig.getBoundingClientRect(),x=(e.clientX-r.left)/r.width*2-1,y=(e.clientY-r.top)/r.height*2-1;setSpin(x/.8,-y/.8);paint();};
  on(spinBig,'pointerdown',(e:PointerEvent)=>{if(!canAct())return;spinDrag=e.pointerId;spinBig.setPointerCapture(e.pointerId);spinFrom(e);e.preventDefault();});
  on(spinBig,'pointermove',(e:PointerEvent)=>{if(spinDrag===e.pointerId)spinFrom(e);});
  for(const t of ['pointerup','pointercancel'])on(spinBig,t,(e:PointerEvent)=>{if(spinDrag===e.pointerId)spinDrag=null;});
  on(spinBig,'keydown',(e:KeyboardEvent)=>{
    const step=.1,map:Record<string,[number,number]>={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,step],ArrowDown:[0,-step]};
    if(map[e.key]){e.preventDefault();setSpin(state.aim.spinX+map[e.key][0],state.aim.spinY+map[e.key][1]);paint();}
    else if(e.key==='Enter'){e.preventDefault();closeSpin();spinBtn.focus();}
  });
  on($('.pool-spin-reset'),'click',()=>{setSpin(0,0);paint();});
  on($('.pool-spin-done'),'click',()=>{closeSpin();spinBtn.focus();});
  on(document,'pointerdown',(e:PointerEvent)=>{if(!spinPanel.hidden&&!spinPanel.contains(e.target as Node)&&!spinBtn.contains(e.target as Node))closeSpin();},{capture:true});

  // Keyboard on the table.
  on(canvas,'keydown',(e:KeyboardEvent)=>{
    if(!canAct())return;
    const k=e.key;
    if(handKeys&&state.hand){
      const c=cue(),stepWorld=(e.shiftKey?.004:.02);
      const dirs:Record<string,[number,number]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
      if(dirs[k]){
        e.preventDefault();
        // Screen directions → world.
        const [sx,sy]=dirs[k],a=toScreen(view,c.x,c.y),b=toWorld(view,a.x+sx,a.y+sy),dx=b.x-c.x,dy=b.y-c.y,n=Math.hypot(dx,dy)||1;
        const from=handDrag??{x:c.x,y:c.y},nx=from.x+dx/n*stepWorld,ny=from.y+dy/n*stepWorld;
        const x=Math.max(R,Math.min(L-R,nx)),y=Math.max(R,Math.min(W-R,ny));
        handDrag={id:-1,x,y,valid:validPlacement(state,x,y)};sendAim();refresh();
        return;
      }
      if(k==='Enter'||k==='h'||k==='H'){
        e.preventDefault();
        const d=handDrag;
        if(!d||d.valid){handKeys=false;handDrag=null;if(d)placeAt(d.x,d.y);context.announce('Cue ball placed.');refresh();}
        else context.announce('That spot is not clear.');
        return;
      }
    }
    const fine=e.shiftKey?.0009:.0087;
    switch(k){
      case 'ArrowLeft':case 'ArrowRight':{e.preventDefault();const dir=k==='ArrowLeft'?-1:1;turnAim(dir*fine*(view.portrait?1:1));break;}
      case 'ArrowUp':case 'ArrowDown':e.preventDefault();keyboardPower=Math.max(.05,Math.min(1,keyboardPower+(k==='ArrowUp'?.05:-.05)));setPower(keyboardPower);context.announce(`Power ${Math.round(keyboardPower*100)}%`);break;
      case 'Enter':case ' ':e.preventDefault();if(!e.repeat){setPower(0);fire(keyboardPower);}return;
      case 'w':case 'W':setSpin(state.aim.spinX,state.aim.spinY+.25);break;
      case 's':case 'S':setSpin(state.aim.spinX,state.aim.spinY-.25);break;
      case 'a':case 'A':setSpin(state.aim.spinX-.25,state.aim.spinY);break;
      case 'd':case 'D':setSpin(state.aim.spinX+.25,state.aim.spinY);break;
      case 'x':case 'X':setSpin(0,0);break;
      case 'p':case 'P':if(!state.breakShot&&isOnEight(state)){state.called=((state.called??-1)+1)%6;manualCall=true;context.announce(`8 called: ${POCKET_NAMES[state.called]}`);sendAim(true);}break;
      case 'h':case 'H':if(state.hand){handKeys=true;handDrag={id:-1,x:cue().x,y:cue().y,valid:true};context.announce('Move the cue ball with the arrow keys, then press Enter.');}break;
      default:return;
    }
    refresh();
  });
  on(canvas,'keyup',(e:KeyboardEvent)=>{if(e.key===' '&&fast===-1)fast=null;});
  on(canvas,'keydown',(e:KeyboardEvent)=>{if(e.key===' '&&state.phase==='moving'&&!online){e.preventDefault();fast=-1;}});
  on(canvas,'keyup',(e:KeyboardEvent)=>{if(e.key==='ArrowUp'||e.key==='ArrowDown')window.setTimeout(()=>{if(!powerDrag)setPower(0);paint();},700);});

  on($('.pool-again'),'click',()=>{
    if(online?.host){online.host.newRack();state=online.host.state;renderer.look.reset();refresh(true);return;}
    if(online)return;
    state=nextRack(state);renderer.look.reset();aiJob=null;stateChanged(true);canvas.focus({preventScroll:true});
  });
  on($('.pool-multiplayer'),'click',()=>{if(!paused)showOnline();});
  on(modeSel,'change',()=>{if(!paused&&!online){reset(modeSel.value==='two'?'two':'ai',state.difficulty);}});
  on(levelSel,'change',()=>{if(!paused&&!online){reset(state.mode,levelSel.value as Difficulty);}});
  on(guideSel,'change',()=>{guide=guideSel.value as Guide;paint();});
  on(window,'blur',()=>{cancelAll();refresh();});

  function reset(mode:Mode=state.mode,difficulty:Difficulty=state.difficulty){
    cancelAll();aiJob=null;sinking=[];strikeAnim=null;
    state=createGame(mode,difficulty,(Math.random()*2**32)>>>0||1);renderer.look.reset();accumulator=0;last=0;
    stateChanged(true);
  }

  // ---- Loop
  function aiTurn(now:number){
    if(state.phase!=='aim'||isHuman(state.turn)||online)return;
    if(!aiJob){aiJob={gen:plan(state),start:now,plan:null,from:state.aim.angle,anim:0,placed:false};refresh();}
    const job=aiJob;
    if(!job.plan){
      const budget=performance.now()+7;
      for(;;){const r=job.gen.next();if(r.done){job.plan=r.value;job.anim=now;job.from=state.aim.angle;break;}if(performance.now()>budget)break;}
      return;
    }
    const p=job.plan;
    if(p.place&&!job.placed){placeCue(state,p.place.x,p.place.y);renderer.look.last.delete(0);job.placed=true;job.from=state.aim.angle;}
    // Swing the cue round to the planned line, draw back, then strike.
    const k=Math.min(1,(now-job.anim)/450),ease=k<.5?2*k*k:1-(-2*k+2)**2/2;
    let d=p.angle-job.from;d=Math.atan2(Math.sin(d),Math.cos(d));
    state.aim.angle=job.from+d*ease;state.aim.spinX=p.spinX;state.aim.spinY=p.spinY;
    if(!state.breakShot&&isOnEight(state)){state.called=p.called;manualCall=true;}
    if((now-job.start)/1000>=thinkTime(state)&&now-job.anim>950){
      aiJob=null;
      if(shoot(state,{angle:p.angle,power:p.power,spinX:p.spinX,spinY:p.spinY,called:p.called})){began(p.power);save();}
    }
  }
  function playImpacts(list:Impact[]){
    for(const i of list){
      if(i.kind==='ball')sound.ball(i.speed);
      else if(i.kind==='rail')sound.rail(i.speed);
      else{sound.pocket(i.speed);sinking.push({id:i.id,pocket:nearestPocket(i.x,i.y),t:0,x:i.x,y:i.y});}
    }
  }
  function nearestPocket(x:number,y:number){let best=0,d=Infinity;POCKETS.forEach((p,i)=>{const e=Math.hypot(p.x-x,p.y-y);if(e<d){d=e;best=i;}});return best;}
  function tick(now:number){
    if(paused||disposed)return;
    const elapsed=last?Math.min(.1,(now-last)/1000):0;last=now;
    if(strikeAnim&&now-strikeAnim.t>260)strikeAnim=null;
    for(const s of sinking)s.t+=elapsed/.28;sinking=sinking.filter(s=>s.t<1);
    const impacts:Impact[]=[];
    if(online){
      if(online.host&&state.phase==='moving'&&!online.roomPaused){
        accumulator+=elapsed;const steps=Math.max(0,Math.floor(accumulator/DT));accumulator-=steps*DT;
        const prev=state.phase;if(online.host.advance(steps,impacts)){state=online.host.state;playImpacts(impacts);afterState(prev);}else playImpacts(impacts);
      }else if(online.guest&&state.phase==='moving'){
        const before=state.balls.map(b=>b.on);online.guest.play(now);
        state.balls.forEach((b,i)=>{if(before[i]&&!b.on){sound.pocket(1);sinking.push({id:b.id,pocket:nearestPocket(b.x,b.y),t:0,x:b.x,y:b.y});}});
      }
    }else if(state.phase==='moving'){
      accumulator+=elapsed*(fast!==null?3.5:1);
      while(accumulator>=DT&&state.phase==='moving'){if(advance(state,impacts))break;accumulator-=DT;}
      playImpacts(impacts);
      if(state.phase!=='moving')settled();
    }else aiTurn(now);
    paint();
    frame=requestAnimationFrame(tick);
  }

  const instance={
    dismissMenu(){return closeSpin();},
    pause(){if(paused||disposed)return;cancelAll();closeSpin();paused=true;cancelAnimationFrame(frame);last=0;if(online?.host){online.host.paused=true;online.room.setPaused(true);online.roomPaused=true;}refresh();},
    resume(){if(!paused||disposed)return;paused=false;last=0;if(online?.host){online.host.paused=false;online.roomPaused=false;online.room.setPaused(false);if(online.guestId)online.host.sync(1);}else if(online?.guest)online.room.send({t:'sync'});refresh();frame=requestAnimationFrame(tick);},
    restart(){
      if(online?.host){cancelAll();if(online.host.opponent){online.host.newRack();state=online.host.state;renderer.look.reset();refresh(true);}return;}
      if(online){context.setStatus('Only the host can start a new online rack.');return;}
      reset();canvas.focus({preventScroll:true});
    },
    serialize(){return JSON.parse(JSON.stringify(online?online.offline:state)) as PoolState;},
    restore(data:unknown){
      const restored=restoreGame(data);if(!restored)return;
      if(online){online.offline=restored;return;}
      cancelAll();aiJob=null;sinking=[];state=restored;accumulator=0;last=0;renderer.look.reset();
      setSpin(state.aim.spinX,state.aim.spinY);updateSuggestion();refresh();
    },
    dispose(){
      cancelAll();resizeObserver.disconnect();disposed=true;releaseGlass();online?.off();online=null;dialog?.dispose();dialog=null;
      cancelAnimationFrame(frame);clearTimeout(toastTimer);abort.abort();sound.dispose();root.remove();
    }
  };
  if(inviteCodeFromHash(location.hash))queueMicrotask(()=>{if(!disposed)showOnline();});
  // Development-only hook for the two-browser tests: read the table, aim like the keyboard does, send a raw command.
  if(import.meta.env.DEV)(window as unknown as {__pool?:unknown}).__pool={
    state:()=>JSON.parse(JSON.stringify(state)),seat:()=>online?.seat??null,
    aim(angle:number,p:number,spinX=0,spinY=0,called:number|null=null){
      if(!canAct())return false;
      state.aim.angle=angle;keyboardPower=p;setSpin(spinX,spinY);
      if(called!==null&&!state.breakShot&&isOnEight(state)){state.called=called;manualCall=true;}
      sendAim(true);refresh();return true;
    },
    place(x:number,y:number){if(!state.hand||!canAct())return false;placeAt(x,y);return true;},
    raw(c:Action){return online?.guest?online.guest.command(c):false;}
  };
  setPower(0);setSpin(0,0);layout();refresh();frame=requestAnimationFrame(tick);
  return instance;
}};
export default module;
