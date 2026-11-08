import type {GameContext, GameModule} from '../../core/types';
import {christmas} from '../../festive/festive';
import {savedGame} from '../../core/storage';
import {RoomDialog,inviteCodeFromHash,relayOnlyFromHash} from '../../multiplayer/panel';
import type {Room} from '../../multiplayer/room';
import {Court} from './scene';
import {harbour} from './harbour';
import {masterOpen,medal,newBook,readBook,recordDelivery,recoverProgress} from './logbook';
import {chooseRivalShot} from './rival';
import {COURSES,DEFAULT_SHOT,FPS,courseIndex,singles,endCount,endOver,fresh,hasSpin,points,readMatch,replay,seatAt,slide,totals,validShot,type Match,type Mode,type Puck,type Shot,type Spin} from './model';
import './style.css';

const rules = 'Play three shuffleboard courts, with four pucks per player on each. Aim with the angle slider and choose the weight, then press Slide. On the focused court use Left/Right to aim, Up/Down for weight, and Space to shoot. You can also drag back anywhere on the court and release. Each player has one left and one right curl per court. The dotted line shows your release direction. Pucks bump each other. A puck scores 1, 3, 5 or 8 by its centre at the end of the court. A side-rail bank adds 1 and crossing a gold gate adds 2 while that puck stays in a ring. The chevrons show each current. The Rival pilot simulates draws and takeouts using the same shots and curl limits as you. The highest total after three courts wins. Two-player matches alternate the opening player. A tie stands. Solo medals start at 24, 42 and 60 points. A bronze solo tour or a win against the pilot opens the Master Circuit in the club logbook.';
function mount(container:HTMLElement,ctx:GameContext){
  const root=document.createElement('section');root.className='dc';
  root.innerHTML=`<aside class="dc-desk"><header class="dc-brand"><span class="dc-monogram" aria-hidden="true">dc</span><div><p class="dc-overline">Harbour shuffleboard</p><h2>Drift Club<span>.</span></h2></div></header>
  <div class="dc-modes" role="group" aria-label="Game mode"><button data-mode="solo">Solo tour</button><button data-mode="rival" title="Play the harbour pilot">Rival</button><button data-mode="duel">Pass &amp; play</button><button class="dc-online">Online</button></div>
  <div class="dc-tour"><p class="dc-overline dc-tour-label"></p><h3 class="dc-course"></h3><div class="dc-stops" aria-label="Tour progress"></div><p class="dc-tip"></p></div>
  <section class="dc-control"><div class="dc-turn"><span class="dc-token" aria-hidden="true"></span><div><p class="dc-overline dc-delivery"></p><strong class="dc-player"></strong></div></div>
  <div class="dc-inputs"><label><span>Aim <output class="dc-angle-val"></output></span><input type="range" aria-label="Aim angle" class="dc-angle" min="-46" max="46" step="1" value="0"></label>
  <label><span>Weight <output class="dc-power-val"></output></span><input type="range" aria-label="Shot weight" class="dc-power" min="10" max="100" step="1" value="60"></label></div>
  <div class="dc-spin" role="group" aria-label="Shot curl"><button data-spin="-1" title="One left curl per player per court">↶ Left</button><button data-spin="0">Straight</button><button data-spin="1" title="One right curl per player per court">Right ↷</button></div>
  <button class="dc-shoot">Slide puck <span aria-hidden="true">→</span></button></section></aside>
  <section class="dc-window"><canvas class="dc-canvas" tabindex="0" aria-label="Shuffleboard court. Drag back to shoot, or use arrow keys and Space."></canvas>
  <div class="dc-venue"><i></i><span></span></div><div class="dc-board-score"></div><button class="dc-book-open">Logbook ↗</button>
  <div class="dc-caption" aria-live="polite"></div>
  <div class="dc-result" hidden><div><p class="dc-overline">Official scorecard</p><h3></h3><div class="dc-ledger"></div><button class="dc-advance"></button><button class="dc-result-book">Club logbook</button></div></div></section>
  <dialog class="dc-book" aria-labelledby="dc-book-title"><form method="dialog"><p class="dc-overline">Drift Club</p><button aria-label="Close logbook">×</button></form><h3 id="dc-book-title">Club logbook</h3><p class="dc-record"></p><ul class="dc-stamps"></ul><p class="dc-unlock"></p><button class="dc-master dc-advance-style">Enter Master Circuit</button></dialog>`;
  container.replaceChildren(root);
  const el=<T extends HTMLElement=HTMLElement>(s:string)=>root.querySelector<T>(s)!;
  const canvas=el<HTMLCanvasElement>('.dc-canvas'),angle=el<HTMLInputElement>('.dc-angle'),power=el<HTMLInputElement>('.dc-power'),fire=el<HTMLButtonElement>('.dc-shoot'),result=el('.dc-result'),advance=el<HTMLButtonElement>('.dc-advance');
  let winter=christmas(),match=fresh(),localMode:Mode='solo',savedLocal={solo:fresh('solo'),duel:fresh('duel'),rival:fresh('rival'),master:fresh('master')},book=newBook();
  const journal=el<HTMLDialogElement>('.dc-book');
  let settled:Puck[]=[],carried:[number,number]=[0,0],frames:Puck[][]|null=null,elapsed=0,stamp=0,raf=0;
  let aim:Shot={...DEFAULT_SHOT},paused=false,disposed=false,feedback='',roundId=0,awaiting=false;
  let room:Room|null=null,unsubscribe:(()=>void)|null=null,hostMoving=false,lastPublished=-1;
  let rivalTimer:ReturnType<typeof setTimeout>|undefined;
  const court=new Court(canvas,winter?'noel':'pier',harbour);
  const invite=inviteCodeFromHash(location.hash);
  const roomUI=new RoomDialog({game:'drift-club',title:'Drift Club',version:'tour-1',maxPlayers:2,inviteCode:invite,relayOnly:relayOnlyFromHash(location.hash),onOpen:online,onClosed:leaveOnline});
  const events=new AbortController(),on={signal:events.signal};
  roomUI.root.addEventListener('keydown',event=>{
    if(event.key!=='Tab')return;
    const controls=Array.from(roomUI.root.querySelectorAll<HTMLElement>('button:enabled,input:enabled')).filter(n=>n.getClientRects().length);
    const first=controls[0],last=controls.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
    if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  },on);
  const seat=()=>seatAt(match.mode,match.shots.length);
  const player=(s:number)=>room?.players.find(p=>p.seat===s)?.name??(singles(match.mode)?'Solo':match.mode==='rival'?(s?'Pilot':'You'):s?'Blue':'Coral');
  const rivalTurn=()=>match.mode==='rival'&&seat()===1&&!endOver(match);
  const canAct=()=>!paused&&!frames&&!endOver(match)&&!awaiting&&!hostMoving&&!rivalTurn()&&(!room||room.players.length===2&&!room.paused&&room.self?.seat===seat());
  const isHost=()=>!room||room.role==='host';
  const scores=()=>{const v=totals(settled,courseIndex(match));return [carried[0]+v[0],carried[1]+v[1]];};
  const snapshot=()=>({v:1,mode:localMode,...savedLocal,book,flight:frames?elapsed:null});
  function save(){if(!room){savedLocal[localMode]=match;ctx.save(snapshot());}}
  function recalc(){
    settled=replay(match);carried=[0,0];
    for(let i=0;i<match.end;i++){const t=totals(replay(match,i),courseIndex(match,i));carried[0]+=t[0];carried[1]+=t[1];}
  }
  function stopFrames(){cancelAnimationFrame(raf);raf=0;frames=null;elapsed=0;stamp=0;}
  function load(m:Match){stopFrames();clearTimeout(rivalTimer);rivalTimer=undefined;match=m;aim={...DEFAULT_SHOT};awaiting=false;feedback='';recalc();update();}
  function restoreFlight(at:unknown){
    if(typeof at!=='number'||!Number.isFinite(at)||at<0||!endCount(match)||ctx.settings.reducedMotion)return;
    const previous={...match,shots:match.shots.slice(0,-1)};
    const earlier=replay(previous),last=match.shots.at(-1)!;
    const path=slide(earlier,last,seatAt(match.mode,match.shots.length-1),courseIndex(match));
    if(at*FPS>=path.length-1)return;
    settled=earlier;frames=path;elapsed=at;update();animate();
  }
  function draw(){
    court.setCourse(courseIndex(match));
    const tick=frames?Math.min(frames.length-1,Math.floor(elapsed*FPS)):0;
    const tail:Puck[]=[];
    if(frames&&!ctx.settings.reducedMotion)for(let i=Math.max(0,tick-12);i<tick;i+=2)tail.push(frames[i].at(-1)!);
    court.draw(frames?frames[tick]:settled,seat(),!frames&&!endOver(match)?aim:null,tail);
  }
  function update(){
    const course=COURSES[courseIndex(match)],score=scores(),count=endCount(match),over=endOver(match)&&!frames,final=match.end===2;
    el<HTMLButtonElement>('.dc-book-open').hidden=!!room||over;el<HTMLButtonElement>('.dc-book-open').disabled=!!frames;
    el('.dc-result-book').hidden=!!room;
    root.dataset.theme=winter?'noel':'pier';root.dataset.end=String(match.end+1);root.dataset.throws=String(match.shots.length);
    el('.dc-tour-label').textContent=(match.mode==='master'?'Master · ':'')+'Court 0'+(match.end+1)+' / 03';
    el('.dc-course').textContent=course.names[winter?1:0];el('.dc-tip').textContent=course.tip;
    el('.dc-stops').innerHTML=COURSES.slice(0,3).map((_,i)=>'<i class="'+(i<=match.end?'dc-lit':'')+'"></i>').join('');
    el('.dc-venue span').textContent=winter?'Christmas harbour':'Pacific coast';
    el('.dc-delivery').textContent=over?'Court complete':frames?'Puck in motion':'Delivery '+Math.min(4,Math.floor(count/(singles(match.mode)?1:2))+1)+' / 4';
    el('.dc-player').textContent=over?'Scorecard ready':room&&room.players.length<2?'Waiting for opponent':frames?'Sliding…':hostMoving?'Waiting for puck':rivalTurn()?'Pilot is lining up':singles(match.mode)||match.mode==='rival'?'Your shot':player(seat())+' to shoot';
    el('.dc-token').classList.toggle('dc-blue',!!(frames?seatAt(match.mode,match.shots.length-1):seat()));
    el('.dc-board-score').textContent=singles(match.mode)?score[0]+' pts':player(0)+' '+score[0]+'  /  '+score[1]+' '+player(1);
    el('.dc-caption').textContent=feedback||(!frames&&!count?(courseIndex(match)===0?'Drag back to shoot, or set aim and weight.':course.tip):'');
    el('.dc-caption').hidden=!el('.dc-caption').textContent;
    for(const b of root.querySelectorAll<HTMLButtonElement>('[data-mode]')){b.setAttribute('aria-pressed',String(!room&&b.dataset.mode===match.mode));b.disabled=!!room;}
    el('.dc-online').setAttribute('aria-pressed',String(!!room));
    for(const b of root.querySelectorAll<HTMLButtonElement>('[data-spin]')){
      const spin=Number(b.dataset.spin) as Spin;b.disabled=!canAct()||!hasSpin(match,spin);b.setAttribute('aria-pressed',String(aim.spin===spin));
    }
    angle.value=String(aim.angle);power.value=String(aim.power);angle.disabled=power.disabled=fire.disabled=!canAct();
    el('.dc-angle-val').textContent=(aim.angle>0?'+':'')+aim.angle+'°';el('.dc-power-val').textContent=aim.power+'%';
    result.hidden=!over;
    if(over){
      const headline=final?(singles(match.mode)?(medal(score[0])?medal(score[0])+' tour':'Tour complete'):score[0]===score[1]?'Match drawn':match.mode==='rival'&&score[0]>score[1]?'You win':player(score[0]>score[1]?0:1)+' wins'):'Court complete';
      el('.dc-result h3').textContent=headline;
      const lines=el('.dc-ledger');lines.replaceChildren();
      for(let i=0;i<=match.end;i++){
        const s=totals(i===match.end?settled:replay(match,i),courseIndex(match,i)),row=document.createElement('div');
        const title=document.createElement('span'),val=document.createElement('b');title.textContent=COURSES[courseIndex(match,i)].names[winter?1:0];val.textContent=singles(match.mode)?s[0]+(s[0]===1?' pt':' pts'):s.join(' — ');row.append(title,val);lines.append(row);
      }
      advance.textContent=!isHost()?'Waiting for host':final?'Play again':'Next court →';advance.disabled=!isHost()||paused||!!room&&(room.paused||room.players.length!==2);
    }
    ctx.setLevel('Court '+(match.end+1)+'/3');ctx.setStatus(over&&final?'Run finished. '+el('.dc-result h3').textContent:el('.dc-player').textContent||'');
    const record=!room&&localMode==='solo'&&over&&final?score[0]:0;
    if(record!==lastPublished){lastPublished=record;ctx.setScore(record);}
    draw();scheduleRival();
  }
  function scheduleRival(){
    if(disposed||paused||frames||!rivalTurn()||roomUI.isOpen||journal.open){clearTimeout(rivalTimer);rivalTimer=undefined;return;}
    if(rivalTimer!==undefined)return;
    rivalTimer=setTimeout(()=>{
      rivalTimer=undefined;
      if(!disposed&&!paused&&!frames&&rivalTurn()&&!roomUI.isOpen&&!journal.open)perform(chooseRivalShot(match,settled));
    },550);
  }
  function finish(){
    if(!frames)return;
    settled=frames.at(-1)!;stopFrames();
    const last=settled.at(-1)!,n=points(last,courseIndex(match));
    const previouslyOpen=masterOpen(book);if(!room)recordDelivery(book,match,last,scores());
    const tricks=[last.bonus&1?'bank +1':'',last.bonus&2?'gate +2':''].filter(Boolean);
    feedback=n?(n-last.bonus===8?'Bullseye! ':'')+n+(n===1?' point':' points')+' on the board'+(tricks.length?' · '+tricks.join(' / '):''):'Outside the rings';
    if(!previouslyOpen&&masterOpen(book))feedback+=' · Master Circuit unlocked';
    ctx.announce(feedback);ctx.sound(n?'success':'tap');if(!hasSpin(match,aim.spin))aim.spin=0;
    update();save();if(room?.role==='host')broadcast();
  }
  function frame(now:number){
    raf=0;if(!frames||paused||room?.paused||disposed)return;
    if(stamp)elapsed+=(now-stamp)/1000;stamp=now;
    if(elapsed*FPS>=frames.length-1){finish();return;}
    draw();raf=requestAnimationFrame(frame);
  }
  function animate(){stamp=0;if(frames&&!raf&&!paused&&!room?.paused)raf=requestAnimationFrame(frame);}
  function perform(s:Shot){
    const owner=seat();stopFrames();frames=slide(settled,s,owner,courseIndex(match));match.shots.push({...s});
    feedback='';ctx.sound('tap');aim.spin=0;update();save();
    if(ctx.settings.reducedMotion){finish();return;}animate();
  }
  function submit(){
    if(!canAct()||!validShot(aim)||!hasSpin(match,aim.spin))return;
    if(room?.role==='guest'){room.send({kind:'throw',round:roundId,index:match.shots.length,shot:{...aim}});awaiting=true;update();return;}
    perform(aim);if(room)broadcast();
  }
  function broadcast(to?:string){if(room?.role==='host')room.send({kind:'state',round:roundId,moving:!!frames,match},to);}
  function online(connection:Room){
    if(disposed)return;save();room=connection;roundId=1;hostMoving=connection.role==='guest';load(fresh('duel'));
    if(isHost()&&paused)room.setPaused(true);
    unsubscribe=connection.on(event=>{
      if(event.type==='joined'&&isHost()){roundId++;load(fresh('duel'));broadcast();roomUI.close();}
      if(event.type==='left'&&isHost()){roundId++;load(fresh('duel'));roomUI.open();}
      if(event.type==='players')update();
      if(event.type==='paused'){cancelAnimationFrame(raf);raf=0;animate();update();}
      if(event.type!=='message'||!event.data||typeof event.data!=='object')return;
      const m=event.data as Record<string,unknown>;
      if(isHost()){
        if(m.kind==='ready'){broadcast(event.from.id);return;}
        if(m.kind==='throw'&&!paused&&!connection.paused&&connection.players.length===2&&!frames&&!endOver(match)&&m.round===roundId&&m.index===match.shots.length&&event.from.seat===seat()&&validShot(m.shot)&&hasSpin(match,m.shot.spin)){perform(m.shot);broadcast();}
        else if(m.kind==='throw')broadcast(event.from.id);
      }else if(m.kind==='state'&&event.from.host&&Number.isSafeInteger(m.round)&&typeof m.moving==='boolean'){
        const next=readMatch(m.match);if(!next||next.mode!=='duel')return;
        const same=m.round===roundId&&match.end===next.end;
        awaiting=false;hostMoving=m.moving;
        if(same && next.shots.length===match.shots.length+1&&!frames){
          perform(next.shots.at(-1)!);
        }else if(!same||next.shots.length!==match.shots.length){load(next);}
        else update();
        roundId=m.round as number;
      }
    });
    if(connection.role==='guest'){connection.send({kind:'ready'});roomUI.close();}
    else roomUI.panel.setNote('The tour starts when player two joins.');
    update();
  }
  function restore(value:unknown){
    if(room||!value||typeof value!=='object')return false;
    const v=value as Record<string,unknown>,solo=readMatch(v.solo),duel=readMatch(v.duel),rival=v.rival===undefined?fresh('rival'):readMatch(v.rival),master=v.master===undefined?fresh('master'):readMatch(v.master),storedBook=readBook(v.book);
    if(v.v!==1||(v.mode!=='solo'&&v.mode!=='duel'&&v.mode!=='rival'&&v.mode!=='master')||solo?.mode!=='solo'||duel?.mode!=='duel'||rival?.mode!=='rival'||master?.mode!=='master')return false;
    for(const run of [solo,rival,master])recoverProgress(storedBook,run);
    if(v.mode==='master'&&!masterOpen(storedBook))return false;
    book=storedBook;savedLocal={solo,duel,rival,master};localMode=v.mode;load(savedLocal[localMode]);restoreFlight(v.flight);return true;
  }
  function leaveOnline(message:string){
    unsubscribe?.();unsubscribe=null;room=null;hostMoving=false;if(disposed)return;
    if(!restore(savedGame(ctx.id)))load(savedLocal[localMode]);
    feedback=message;update();
  }
  function bankAcceptedProgress(){
    if(!frames)return;
    recoverProgress(book,match);
    if(localMode==='solo'&&match.end===2&&endOver(match)){ctx.setScore(book.best);lastPublished=book.best;}
  }
  const modeSwitch=(mode:Mode)=>{if(room||paused||mode===localMode||mode==='master'&&!masterOpen(book))return;bankAcceptedProgress();save();localMode=mode;load(savedLocal[mode]);save();};
  root.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(b=>b.addEventListener('click',()=>modeSwitch(b.dataset.mode as Mode),on));
  function openBook(){
    if(room||paused||frames)return;
    const grade=medal(book.best);
    el('.dc-record').textContent='Solo best '+book.best+' pts'+(grade?' · '+grade:'')+' / Master best '+book.masterBest+' pts';
    const stamps=el('.dc-stamps');stamps.replaceChildren();
    for(const [earned,title,hint] of [[book.bank,'Rail artist','Score a bank shot.'],[book.gate,'Gate pilot','Score through a gold gate.'],[book.pilot,'Harbour champion','Beat the pilot in Rival mode.'],[book.masterFinished,'Master mariner','Finish all three Master courts.']] as const){
      const li=document.createElement('li'),label=document.createElement('strong'),detail=document.createElement('small');
      li.classList.toggle('dc-earned',earned);label.textContent=title;detail.textContent=(earned?'Earned · ':'')+hint;li.append(label,detail);stamps.append(li);
    }
    el('.dc-unlock').textContent=masterOpen(book)?'Master Circuit unlocked · Three expert courts':'Unlock the Master Circuit with 24 solo points in one tour or a win against the pilot.';
    el<HTMLButtonElement>('.dc-master').disabled=!masterOpen(book);journal.showModal();scheduleRival();
  }
  el('.dc-book-open').addEventListener('click',openBook,on);el('.dc-result-book').addEventListener('click',openBook,on);
  el('.dc-master').addEventListener('click',()=>{journal.close();modeSwitch('master');},on);
  journal.addEventListener('close',scheduleRival,on);
  el('.dc-online').addEventListener('click',()=>roomUI.open(),on);
  root.querySelectorAll<HTMLButtonElement>('[data-spin]').forEach(b=>b.addEventListener('click',()=>{if(canAct()){aim.spin=Number(b.dataset.spin) as Spin;update();}},on));
  function readControls(){if(canAct()){aim.angle=Number(angle.value);aim.power=Number(power.value);update();}}
  angle.addEventListener('input',readControls,on);power.addEventListener('input',readControls,on);
  fire.addEventListener('click',submit,on);
  advance.addEventListener('click',()=>{
    if(!isHost()||paused||room?.paused||!endOver(match)||frames)return;
    if(match.end===2){roundId++;load(fresh(match.mode));}
    else{match.end++;load(match);}
    save();broadcast();canvas.focus({preventScroll:true});
  },on);
  canvas.addEventListener('keydown',e=>{
    if(!canAct()||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' ','Enter'].includes(e.key))return;
    e.preventDefault();
    if(e.key===' '||e.key==='Enter'){if(!e.repeat)submit();return;}
    if(e.key==='ArrowLeft'||e.key==='ArrowRight')aim.angle=Math.max(-46,Math.min(46,aim.angle+(e.key==='ArrowLeft'?-1:1)));
    else aim.power=Math.max(10,Math.min(100,aim.power+(e.key==='ArrowUp'?1:-1)));
    update();
  },on);
  let drag:{id:number;x:number;y:number}|null=null;
  canvas.addEventListener('pointerdown',e=>{if(!canAct()||drag||e.button!==0)return;canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);drag={id:e.pointerId,x:e.clientX,y:e.clientY};},on);
  function dragAim(e:PointerEvent){
    if(!drag||drag.id!==e.pointerId||!canAct())return false;
    const dx=drag.x-e.clientX,dy=e.clientY-drag.y;if(dy<10)return false;
    aim.angle=Math.max(-46,Math.min(46,Math.round(Math.atan2(dx,dy)*180/Math.PI)));
    aim.power=Math.max(10,Math.min(100,Math.round(100*Math.hypot(dx,dy)/Math.min(170,canvas.clientHeight*.35))));
    update();return true;
  }
  canvas.addEventListener('pointermove',dragAim,on);
  canvas.addEventListener('pointerup',e=>{if(drag?.id!==e.pointerId)return;const valid=dragAim(e);drag=null;if(valid)submit();},on);
  canvas.addEventListener('lostpointercapture',()=>{drag=null;},on);
  const themeObs=new MutationObserver(()=>{const now=christmas();if(winter!==now){winter=now;court.setTheme(now?'noel':'pier');update();}});
  themeObs.observe(document.documentElement,{attributes:true,attributeFilter:['data-festive']});
  const dialogObserver=new MutationObserver(scheduleRival);
  dialogObserver.observe(roomUI.root,{attributes:true,attributeFilter:['hidden']});
  update();const inviteFrame=invite?requestAnimationFrame(()=>{if(!disposed)roomUI.open();}):0;
  return {
    dismissMenu(){if(journal.open){journal.close();return true;}if(!roomUI.isOpen)return false;roomUI.close();return true;},
    pause(){paused=true;drag=null;cancelAnimationFrame(raf);raf=0;stamp=0;if(isHost())room?.setPaused(true);update();},
    resume(){paused=false;if(isHost())room?.setPaused(false);animate();update();},
    restart(){if(room)return false;bankAcceptedProgress();load(fresh(localMode));save();return true;},
    serialize:()=>room?undefined:snapshot(),
    restore,
    dispose(){disposed=true;stopFrames();clearTimeout(rivalTimer);cancelAnimationFrame(inviteFrame);events.abort();themeObs.disconnect();dialogObserver.disconnect();unsubscribe?.();roomUI.dispose();court.dispose();root.remove();}
  };
}
const game:GameModule={id:'drift-club',title:'Drift Club',cover:'game-art/drift-club/cover.svg',rules,mount};
export default game;
