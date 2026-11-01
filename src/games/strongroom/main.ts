import type {GameContext,GameInstance} from '../../core/types';
import {playBox} from '../../core/play-surface';
// @ts-expect-error -- licensed input facade.
import Input from './engine/core/input.js';
// @ts-expect-error -- licensed key remap settings.
import Settings from './engine/core/settings.js';
// @ts-expect-error -- licensed event bus.
import {EventBus} from './engine/shared/events.js';
import {AutoQuality,HostGuard,QUALITY,defaultTier,hostRates,isTier,type Tier} from './quality';
import {Simulation,BUTTON,neutralInput,type Entity,type InputFrame,type Seat} from './sim';
import {View} from './render';
import {HUD,type MatchOptions} from './ui/hud';
import {bindTouch} from './touch';
import {Audio} from './audio';
export function mount(container:HTMLElement,context:GameContext):GameInstance{
 const root=document.createElement('div');root.className='strongroom-game';root.dataset.ready='false';container.append(root);
 const abort=new AbortController(),signal=abort.signal,touch=matchMedia('(any-pointer:coarse)').matches||navigator.maxTouchPoints>0;
 const params=new URLSearchParams(location.search),seed=Number(params.get('seed'))||1;
 let savedTier:Tier|null=null;try{const t=localStorage.getItem('strongroom:quality');if(isTier(t))savedTier=t;}catch{}
 const detected=defaultTier({touch,cores:navigator.hardwareConcurrency,memory:(navigator as Navigator&{deviceMemory?:number}).deviceMemory,ua:navigator.userAgent});
 const override=import.meta.env.DEV&&isTier(params.get('quality'))?params.get('quality') as Tier:null;
 const quality=new AutoQuality(override??savedTier??detected,!!savedTier,touch);let view=new View(root,quality.tier);
 const game:any={root,canvas:view.renderer.domElement,context,events:new EventBus(),disposed:false,paused:false,debug:import.meta.env.DEV&&params.has('test'),listen(target:EventTarget|null,type:string,fn:EventListener,options:any={}){target?.addEventListener(type,fn,{...options,signal});}};
 game.settings=new Settings(game);game.input=new Input(game);game.input.setTouchMode(touch);
 const input=game.input,settings=game.settings;let sim=new Simulation(view.collision,[],seed),localSeat=0,seq=0,menuPaused=false,shownEnd=false,wasPhase=sim.phase,crouched=false,weapon=0;
 let last=performance.now(),acc=0,inputAcc=0,homeDraw=0,disposed=false,frameId=0,hostPassed=false,benchmarkDone=false;
 const options:MatchOptions={teamSize:3,difficulty:touch?'easy':'normal',quick:false};
 const audio=new Audio(QUALITY[quality.tier].voices,()=>context.settings.sound),guard=new HostGuard(QUALITY[quality.tier].thinkHz);
 let appliedTier=quality.tier,queuedTier:Tier|null=null;
 const stats={frames:[] as number[],ticks:[] as number[],draws:0,triangles:0,heap:0,predictionErrors:[] as number[]};
 function release(){input.cancelLockRequest();input.cancelKeyCapture('pause');input.releaseVirtualControls();input._releaseAll(true);if(document.pointerLockElement===game.canvas)document.exitPointerLock?.();input.locked=false;}
 function resize(){const vv=window.visualViewport,box=playBox(vv?{width:vv.width,height:vv.height,offsetLeft:vv.offsetLeft,offsetTop:vv.offsetTop}:null,{width:innerWidth,height:innerHeight});view.resize(Math.max(1,Math.round(box.width)),Math.max(1,Math.round(box.height)),quality.scale);}
 const hud=new HUD(root,{settings,start:o=>start(o),play:()=>{audio.unlock();input.requestLock();},home:()=>home(),sheet:on=>{menuPaused=on;release();},quality:t=>{queuedTier=t??detected;quality.manual=t!==null;try{if(t)localStorage.setItem('strongroom:quality',t);else localStorage.removeItem('strongroom:quality');}catch{}if(sim.phase==='menu'||sim.phase==='roundEnd')applyQuality();else hud.notice('Quality will change at the end of this round');},remap:(action,done)=>{input.captureNextKey((key:string|null)=>{if(key)settings.rebind(action,key);done();});},maxTeam:()=>hostRates(quality.tier,hostPassed).maxTeam,currentTier:()=>quality.tier,online:()=>hud.notice('Online rooms are being connected')},touch);
 function applyQuality(){if(queuedTier){quality.set(queuedTier,quality.manual);queuedTier=null;}if(appliedTier===quality.tier){resize();return;}release();view.dispose();view=new View(root,quality.tier);game.canvas=view.renderer.domElement;sim.world=view.collision;appliedTier=quality.tier;audio.limit=QUALITY[quality.tier].voices;hud.restGlass();void view.loadCharacters().catch(()=>hud.notice('Character models could not load. Reload to try again.'));resize();}
 function start(o:MatchOptions){Object.assign(options,o);options.teamSize=Math.min(o.teamSize,hostRates(quality.tier,hostPassed).maxTeam) as 3|5;const seats:Seat[]=[];for(let n=0;n<options.teamSize*2;n++)seats.push({seat:n,team:n<options.teamSize?0:1,name:n===0?'You':`Bot ${n}`,bot:n!==0});view.clearAvatars();sim=new Simulation(view.collision,seats,seed,options.quick);sim.difficulty=options.difficulty;sim.thinkHz=QUALITY[quality.tier].thinkHz;sim.start();game.sim=sim;game.state=sim;shownEnd=false;seq=0;acc=0;context.setLevel('Harbor');audio.unlock();input.requestLock();}
 function home(){hud.closeAll();release();sim.phase='menu';shownEnd=false;hud.notice('');view.clearAvatars();}
 const look=()=>{const delta=input.consumeLook(),e=sim.entities.find(e=>e.seat===localSeat);if(e){e.yaw-=delta.dx*.0022*settings.lookSensitivity;e.pitch=Math.max(-1.45,Math.min(1.45,e.pitch-delta.dy*.0022*settings.lookSensitivity));}};
 function readInput():InputFrame{
  const e=sim.entities.find(e=>e.seat===localSeat),i=neutralInput(++seq);i.at=sim.time;i.view=sim.time;i.yaw=e?.yaw??0;i.pitch=e?.pitch??0;i.weapon=weapon;
  if(game.paused||menuPaused||!input.locked||document.hidden)return i;
  const v=input.moveVector();i.x=Math.round(Math.max(-1,Math.min(1,(input.isActionDown('moveRight')||input.isDown('arrowright')?1:0)-(input.isActionDown('moveLeft')||input.isDown('arrowleft')?1:0)+v.x))*127);
  i.z=Math.round(Math.max(-1,Math.min(1,(input.isActionDown('moveForward')||input.isDown('arrowup')?1:0)-(input.isActionDown('moveBackward')||input.isDown('arrowdown')?1:0)+v.y))*127);
  i.buttons=(input.firing?BUTTON.FIRE:0)|(input.aiming?BUTTON.ADS:0)|(input.isActionDown('reload')?BUTTON.RELOAD:0)|(input.isActionDown('jump')?BUTTON.JUMP:0)|(crouched?BUTTON.CROUCH:0)|(input.isActionDown('walk')?BUTTON.WALK:0);return i;
 }
 game.events.on('input:keydown',({key}:{key:string})=>{if(key==='p'){hud.dismiss()||hud.openMenu();return;}if(key==='tab'&&sim.phase!=='menu'){hud.scoreboard(sim.entities,true);return;}if(key==='c')crouched=!crouched;if(key==='1')weapon=0;if(key==='2')weapon=1;});
 window.addEventListener('keyup',e=>{if(settings.resolveInputKey(e.key)==='tab')hud.scoreboard(sim.entities,false);},{signal});
 root.querySelector('.sr-ammo')!.addEventListener('click',()=>weapon=1-weapon,{signal});
 if(touch)bindTouch(hud.touchRoot,input,()=>hud.scoreboard(sim.entities,true),()=>hud.openMenu(),signal);
 const orientation=document.createElement('div');orientation.className='ui-glass-sheet sr-orientation';orientation.innerHTML='<p>↻</p><h2>Turn your phone sideways to play</h2>';orientation.hidden=true;root.append(orientation);
 const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(root);window.addEventListener('resize',resize,{signal});window.visualViewport?.addEventListener('resize',resize,{signal});
 // Device check is measured locally and expires in seven days. It never enables 5v5 on potato/low.
 const bench=new Simulation(view.collision,Array.from({length:10},(_,n)=>({seat:n,name:'Benchmark',team:n<5?0:1,bot:n!==0})),seed);bench.start();bench.phase='action';let benchAt=performance.now(),benchSum=0,benchFrames=0,benchFrameSum=0;
 try{const cache=JSON.parse(localStorage.getItem('strongroom:device-check')??'null');if(cache&&Date.now()-cache.at<7*86400000){hostPassed=cache.passed===true;benchmarkDone=true;}}catch{}
 function processEvents(){for(const event of sim.events.splice(0)){const e=sim.entities.find(e=>e.seat===event.seat),target=sim.entities.find(e=>e.seat===event.target);if(event.type==='shot'&&e)audio.shot(e,sim.entities.find(e=>e.seat===localSeat));if(event.type==='damage'&&event.seat===localSeat)hud.hit();if(event.type==='eliminated'&&e&&target)hud.elimination(`${e.name} eliminated ${target.name}`);if(event.type==='phase'&&event.phase==='roundEnd'){context.announce(`${sim.winner===0?'Defenders':'Attackers'} win the round`);hud.notice(`${sim.winner===0?'Defenders':'Attackers'} win`);}}}
 function frame(now:number){
  if(disposed)return;frameId=requestAnimationFrame(frame);const raw=Math.min(250,now-last),dt=raw/1000;last=now;
  const portrait=touch&&innerHeight>innerWidth&&sim.phase!=='menu';orientation.hidden=!portrait;const paused=game.paused||menuPaused||portrait;
  look();if(!paused&&sim.phase!=='menu'){
   inputAcc+=dt;while(inputAcc>=1/30){inputAcc-=1/30;sim.applyInput(localSeat,readInput());}
   const rate=hostRates(quality.tier,hostPassed).tickHz;acc=Math.min(.25,acc+dt);while(acc>=1/rate){const at=performance.now();sim.thinkHz=guard.thinkHz;sim.step(1/rate);const elapsed=performance.now()-at;stats.ticks.push(elapsed);guard.sample(elapsed,now);acc-=1/rate;}
  }else{acc=0;inputAcc=0;}
  if(!benchmarkDone&&sim.phase==='menu'&&!document.hidden){const at=performance.now();bench.step(1/60);benchSum+=performance.now()-at;benchFrameSum+=raw;benchFrames++;if(now-benchAt>=3000){hostPassed=benchSum/benchFrames<=5&&benchFrameSum/benchFrames<=28;benchmarkDone=true;try{localStorage.setItem('strongroom:device-check',JSON.stringify({at:Date.now(),passed:hostPassed}));}catch{}}}
  processEvents();if(sim.phase!==wasPhase){if(sim.phase==='roundEnd'){quality.roundEnd();applyQuality();}if(sim.phase==='prep')hud.notice('Get ready');if(sim.phase==='action')hud.notice('');wasPhase=sim.phase;}
  if(sim.phase==='gameEnd'&&!shownEnd){shownEnd=true;hud.end(`${sim.winner===0?'Defenders':'Attackers'} win`,sim.entities,()=>start(options));}
  root.dataset.phase=sim.phase;root.dataset.paused=String(paused);root.dataset.tier=quality.tier;hud.update(sim.entities,localSeat,sim,input.locked);view.camera.userData.ads=input.aiming;
  homeDraw+=dt;const home=sim.phase==='menu';if(!document.hidden&&(!home||homeDraw>=.1)){view.draw(sim.entities,localSeat,sim.phase,dt,home,context.settings.reducedMotion||matchMedia('(prefers-reduced-motion:reduce)').matches);homeDraw=0;stats.draws=view.renderer.info.render.calls;stats.triangles=view.renderer.info.render.triangles;stats.heap=(performance as any).memory?.usedJSHeapSize??0;}
  if(!home&&!paused){stats.frames.push(raw);if(quality.sample(raw,now,document.hidden)){resize();if(quality.lowered)hud.notice('Quality lowered for smoother play');}}else quality.sample(raw,now,true);
  if(stats.frames.length>20000)stats.frames.splice(0,10000);if(stats.ticks.length>20000)stats.ticks.splice(0,10000);input.update(dt);
 }
 const instance:GameInstance={openMenu:()=>hud.openMenu(),dismissMenu:()=>hud.dismiss(),pause(){game.paused=true;release();audio.pause();},resume(){game.paused=false;last=performance.now();if(touch&&sim.phase!=='menu')input.requestLock();},restart(){start(options);return true;},serialize:()=>({version:2,settings:settings.snapshot()}),restore(){},dispose(){if(disposed)return;disposed=true;game.disposed=true;release();abort.abort();cancelAnimationFrame(frameId);resizeObserver.disconnect();hud.dispose();audio.dispose();game.events._handlers.clear();view.dispose();root.remove();if(import.meta.env.DEV&&(window as any).__game===game)delete (window as any).__game;}};
 game.sim=sim;game.state=sim;game.stats=stats;game.quality=quality;game.view=view;game.instance=instance;game.start=start;game.options=options;game.localSeat=localSeat;
 Object.defineProperties(game,{player:{get:()=>sim.entities.find(e=>e.seat===localSeat)},renderer:{get:()=>view.renderer},world:{get:()=>view.world}});
 if(import.meta.env.DEV)(window as any).__game=game;
 resize();void view.loadCharacters().then(()=>{if(!disposed)root.dataset.models='true';}).catch(()=>hud.notice('Character models could not load. Reload to try again.'));
 root.dataset.ready='true';context.setStatus('Strongroom · Harbor. P opens the game menu; Escape opens Study.');frameId=requestAnimationFrame(frame);return instance;
}
