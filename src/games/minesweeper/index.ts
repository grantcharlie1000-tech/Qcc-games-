import type {GameModule} from '../../core/types';
import {create,reveal,flag,chord,restore as restoreBoard,LEVELS,type Board,type Level} from './model';
import {LABELS,emptyStats,readStats,recordStart,recordWin,competitiveScore,rankingKey,formatTime,hint} from './practice';
import {read,write} from '../../core/storage';
import {playSound} from '../../core/audio';
import './style.css';
const art=new URL('game-art/minesweeper/',new URL(import.meta.env.BASE_URL,document.baseURI)).href;
const image=(name:string)=>`<img src="${art}${name}.svg" alt="" draggable="false">`;
const game:GameModule={
 id:'minesweeper',title:'Minesweeper',cover:'game-art/minesweeper/cover.svg',
 rules:'Reveal all safe cells to clear the field. Numbers count mines in the eight surrounding cells. Empty areas open automatically. Your first reveal and its neighbours are always mine-free. Flags left means mine total minus placed flags, not confirmed safe information. You can win without placing any flags.\n\nMouse: left-click to reveal, right-click to flag. Click a revealed number to chord when its adjacent flag count matches. Incorrect flags can cause a loss.\n\nTouch: choose Reveal or Flag, then tap. Optionally hold to flag. Drag to pan a large board; pinch or use − / + to zoom. Moving or using two fingers cancels the tap.\n\nKeyboard: focus a tile, use arrows or Home/End to move; Enter/Space reveals or chords, F flags, C chords. Shortcuts apply only to the focused board.\n\nThe timer starts on the first reveal. Pause and background tabs stop the timer and hide the board. Returning to a saved game excludes time away. Only unassisted wins enter personal bests and online rankings, separately for Easy, Medium and Hard. Practice gives visible-information hints and undo; it never enters competitive records. Sound is optional and starts off.',
 mount(container,context){
  let board=create('beginner',newSeed()),stats=emptyStats(),paused=false,disposed=false,assisted=false,practice=false,flagMode=false,focus=0,size=matchMedia('(max-width: 480px)').matches?Math.max(32,Math.min(44,Math.floor((innerWidth-32)/9))):44;
  let sound=false,longPress=true,last=performance.now(),history:Board[]=[],hinted:number|null=null;
  const events=new AbortController();
  const root=document.createElement('section');root.className='ms';root.setAttribute('aria-label','Minefield');
  root.innerHTML=`<div class="ms-toolbar"><label class="ms-field"><span>Difficulty</span><select class="ms-level" aria-label="Difficulty"><option value="beginner">Easy · 9 × 9</option><option value="intermediate">Medium · 16 × 16</option><option value="expert">Hard · 30 × 16</option></select></label><div class="ms-instrument"><span>Flags left</span><strong class="ms-count">10</strong></div><div class="ms-instrument"><span>Time</span><strong class="ms-time" aria-label="Elapsed time">00:00</strong></div><div class="ms-tools"></div></div>
   <aside class="ms-intro" ${read('minesweeper:intro',false)?'hidden':''}><p>Your first opening is safe. Start anywhere.</p><button type="button" class="ms-dismiss" aria-label="Dismiss first-play explanation">Got it</button></aside>
   <div class="ms-frame"><div class="ms-scroll" tabindex="-1" aria-label="Minefield: drag to pan, pinch to zoom"><div class="ms-board" role="grid" aria-label="Minesweeper board" aria-describedby="ms-instructions"></div></div></div>
   <div class="ms-underboard"><p class="ms-outcome" role="status">Your first move is safe.</p><span class="ms-badge" hidden>Practice · assisted</span></div>
   <p class="ms-hint-message" role="status" hidden></p>
   <section class="ms-result" aria-label="Game result" hidden><div><strong class="ms-result-title"></strong><p class="ms-result-detail"></p></div><button type="button" class="ms-new">New game</button></section>
   <div class="ms-bottom"><div class="ms-mode-switch" role="group" aria-label="Touch action"><button type="button" class="ms-reveal-mode" aria-pressed="true">Reveal</button><button type="button" class="ms-mode" aria-label="Flag mode" aria-pressed="false">${image('flag')}<span>Flag</span></button></div><p class="ms-instructions" id="ms-instructions">Click to reveal · Right-click to flag</p></div>
   <dialog class="ms-settings" aria-labelledby="ms-options-title"><header class="ms-menu-heading"><div><h2 id="ms-options-title">Game options</h2><p class="ms-menu-subtitle"></p></div><button type="button" class="ms-close" aria-label="Close game options">×</button></header>
    <div class="ms-menu-actions"><button type="button" class="ms-pause">Pause game</button><button type="button" class="ms-rankings">Rankings</button></div>
    <section class="ms-menu-section"><h3>Preferences</h3><label class="ms-setting-row"><span>Sound</span><input type="checkbox" class="ms-sound"></label><label class="ms-setting-row"><span>Hold to flag</span><input type="checkbox" class="ms-longpress" checked></label><div class="ms-setting-row"><span>Tile size</span><div class="ms-zoom"><button type="button" class="ms-minus" aria-label="Zoom out">−</button><output class="ms-scale" aria-label="Tile size"></output><button type="button" class="ms-plus" aria-label="Zoom in">+</button></div></div></section>
    <section class="ms-menu-section"><label class="ms-setting-row"><span><strong>Practice</strong><small>Hints and undo. Excluded from records.</small></span><input type="checkbox" class="ms-practice"></label><div class="ms-practice-tools" hidden><button type="button" class="ms-hint">Explain a hint</button><button type="button" class="ms-undo">Undo</button></div></section>
    <section class="ms-menu-section"><h3>Statistics</h3><p class="ms-statistics"></p></section>
    <footer class="ms-menu-footer"><button type="button" class="ms-app-settings">Account & app settings</button><button type="button" class="ms-return">Return to game</button></footer>
   </dialog>`;
  container.append(root);
  const $=<T extends HTMLElement=HTMLElement>(s:string)=>root.querySelector<T>(s)!;
  const grid=$('.ms-board'),scroll=$('.ms-scroll'),levelSelect=$<HTMLSelectElement>('.ms-level'),menu=$<HTMLDialogElement>('.ms-settings');
  let resumeAfterMenu=false;
  // Place QCC's shared controls in the toolbar/menu while retaining their shell handlers.
  const moved:{node:HTMLElement;marker:Comment}[]=[];
  for(const id of ['restart-game','fullscreen-game','rules-game','pause-overlay']){const node=document.getElementById(id);if(node){const marker=document.createComment(id);node.before(marker);moved.push({node,marker});$(id==='pause-overlay'?'.ms-frame':id==='restart-game'?'.ms-tools':'.ms-menu-actions').append(node);
    if(id==='fullscreen-game'||id==='rules-game')node.addEventListener('click',()=>closeMenu(),{capture:true,signal:events.signal});}}
  let buttons:HTMLButtonElement[]=[];
  function newSeed(){return crypto.getRandomValues(new Uint32Array(1))[0];}
  function syncTime(){const now=performance.now();if(!paused&&board.status==='playing')board.elapsedMs=Math.min(31536000000,board.elapsedMs+Math.max(0,now-last));last=now;}
  function clock(){$('.ms-time').textContent=formatTime(board.elapsedMs);}
  function snapshot(){syncTime();return {...structuredClone(board),cellSize:size,practice,assisted,stats:structuredClone(stats),sound,longPress};}
  function save(){context.save(snapshot());}
  function build(){
   cancelGestures();focus=0;grid.replaceChildren();buttons=[];
   const {width,height}=LEVELS[board.level];grid.setAttribute('aria-rowcount',String(height));grid.setAttribute('aria-colcount',String(width));
   for(let y=0;y<height;y++){const row=document.createElement('div');row.className='ms-row';row.setAttribute('role','row');
    for(let x=0;x<width;x++){const i=y*width+x,cell=document.createElement('div'),button=document.createElement('button');cell.setAttribute('role','gridcell');button.type='button';button.dataset.index=String(i);button.className='ms-tile';button.tabIndex=i===focus?0:-1;cell.append(button);row.append(cell);buttons.push(button);}
    grid.append(row);
   }grid.style.setProperty('--ms-size',`${size}px`);scroll.scrollLeft=0;scroll.scrollTop=0;
  }
  function render(){
   const {width,mines}=LEVELS[board.level],safe=board.revealed.filter((v,i)=>v&&board.cells[i]!==-1).length,total=board.cells.length-mines,ended=board.status==='won'||board.status==='lost';
   buttons.forEach((button,i)=>{
    const open=board.revealed[i],mine=board.status==='lost'&&board.cells[i]===-1,wrong=board.status==='lost'&&board.flags[i]&&board.cells[i]!==-1;
    const state=mine?'mine':open?'open':board.flags[i]?'flagged':'hidden';
    const visual=`${state}:${wrong}:${i===board.exploded}`;
    if(button.dataset.visual!==visual){button.dataset.visual=visual;button.dataset.state=state;
     button.className=`ms-tile ms-n${open?board.cells[i]:0}${i===board.exploded?' ms-exploded':''}${wrong?' ms-wrong':''}${(Math.floor(i/width)+i%width)%2?' ms-alternate':''}`;
     if(mine)button.innerHTML=image('mine');else if(board.flags[i])button.innerHTML=`${image('flag')}${wrong?'<span class="ms-cross" aria-hidden="true">×</span>':''}`;else button.textContent=open&&board.cells[i]>0?String(board.cells[i]):'';
    }
    button.classList.toggle('ms-hinted',hinted===i);
    const label=mine?(i===board.exploded?'Triggered mine':'Mine'):open?(board.cells[i]>0?`${board.cells[i]} adjacent mines`:'Empty'):board.flags[i]?(wrong?'Incorrect flag':'Flagged'):'Covered';
    button.setAttribute('aria-label',`Row ${Math.floor(i/width)+1}, column ${i%width+1}: ${label}`);button.setAttribute('aria-disabled',String(paused||ended));
   });
   root.dataset.status=board.status;root.dataset.paused=String(paused);grid.inert=paused;scroll.setAttribute('aria-hidden',String(paused));
   $('.ms-count').textContent=String(mines-board.flags.filter(Boolean).length);
   $('.ms-outcome').textContent=board.status==='won'?'Field cleared!':board.status==='lost'?'Mine found!':board.status==='ready'?'Your first move is safe.':`${safe} / ${total} safe tiles`;
   $('.ms-result').hidden=!ended;$('.ms-hint-message').hidden=!$('.ms-hint-message').textContent;$('.ms-practice-tools').hidden=!practice;
   $('.ms-menu-subtitle').textContent=`${LABELS[board.level]} · ${LEVELS[board.level].mines} mines${assisted?' · Assisted':''}`;
   if(ended){$('.ms-result-title').textContent=board.status==='won'?'Nicely cleared.':'A little wiser for the next field.';$('.ms-result-detail').textContent=`${LABELS[board.level]} · ${formatTime(board.elapsedMs,true)} · Best ${stats[board.level].bestMs===null?'—':formatTime(stats[board.level].bestMs!,true)}${assisted?' · Assisted':''}`;}
   const s=stats[board.level];$('.ms-statistics').textContent=`${LABELS[board.level]} · ${s.played} played · ${s.wins} wins · ${s.played?Math.round(s.wins/s.played*100):0}% win rate · Best ${s.bestMs===null?'—':formatTime(s.bestMs,true)}`;
   $('.ms-badge').hidden=!assisted;$('.ms-badge').textContent=practice?'Practice · assisted':'Assisted · restored field';$<HTMLInputElement>('.ms-practice').checked=practice;$<HTMLInputElement>('.ms-sound').checked=sound;$<HTMLInputElement>('.ms-longpress').checked=longPress;
   $<HTMLButtonElement>('.ms-hint').disabled=!practice||board.status!=='playing';$<HTMLButtonElement>('.ms-undo').disabled=!practice||!history.length;
   levelSelect.value=board.level;$('.ms-mode').setAttribute('aria-pressed',String(flagMode));$('.ms-reveal-mode').setAttribute('aria-pressed',String(!flagMode));$('.ms-scale').textContent=`${Math.round(size/44*100)}%`;
   context.setLevel(LABELS[board.level]);context.setStatus(`${safe} of ${total} safe cells revealed.`);clock();
  }
  function animate(i:number,before:boolean[],wasFlag:boolean,keyboard:boolean){
   if(keyboard||context.settings.reducedMotion||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
   const width=LEVELS[board.level].width;
   buttons.forEach((button,j)=>{if(board.revealed[j]&&!before[j]){const distance=Math.max(Math.abs(j%width-i%width),Math.abs(Math.floor(j/width)-Math.floor(i/width)));button.animate([{opacity:.45,transform:'scale(.96)'},{opacity:1,transform:'scale(1)'}],{duration:180,delay:Math.min(distance*12,100),easing:'cubic-bezier(.23,1,.32,1)'});}});
   if(board.flags[i]&&!wasFlag)buttons[i].firstElementChild?.animate([{transform:'translateY(-18%) rotate(-12deg)',opacity:.5},{transform:'translateY(0) rotate(0)',opacity:1}],{duration:180,easing:'cubic-bezier(.23,1,.32,1)'});
  }
  function action(i:number,kind:'reveal'|'flag'|'chord',keyboard=false){
   if(paused||disposed)return;
   syncTime();const before=structuredClone(board),wasFlag=board.flags[i];
   const changed=kind==='flag'?flag(board,i):kind==='chord'||board.revealed[i]?chord(board,i):reveal(board,i);
   if(!changed){if(kind!=='flag'&&board.revealed[i]&&board.cells[i]>0)context.announce('Chord needs the same number of adjacent flags. Incorrect flags can cause a loss.');return;}
   if(practice){history.push(before);if(history.length>80)history.shift();}
   if(before.status==='ready'&&board.status!=='ready'){last=performance.now();recordStart(stats,board.level,assisted);$('.ms-intro').hidden=true;write('minesweeper:intro',true);}
   if(before.status==='playing')board.elapsedMs=Math.min(31536000000,board.elapsedMs+Math.max(0,performance.now()-last));
   last=performance.now();hinted=null;$('.ms-hint-message').textContent='';
   const ended=board.status==='won'||board.status==='lost';
   if(ended){if(board.status==='won'){recordWin(stats,board.level,board.elapsedMs,assisted);const score=competitiveScore(board,assisted);if(score)context.submitRecord?.(rankingKey(board.level),score);}context.announce(board.status==='won'?'Field cleared. All safe cells are open.':'Mine found. The triggered mine is red; incorrect flags are crossed out.');}
   render();animate(i,before.revealed,wasFlag,keyboard);save();playSound(sound,ended?(board.status==='won'?'success':'lose'):'tap');
  }
  function target(e:Event):number|null {const t=(e.target as Element).closest<HTMLButtonElement>('.ms-tile');return t&&grid.contains(t)?Number(t.dataset.index):null;}
  function setFocus(i:number,move=false){if(!buttons[i])return;buttons[focus].tabIndex=-1;focus=i;buttons[focus].tabIndex=0;if(move)buttons[focus].focus();}
  grid.addEventListener('click',e=>{if((e as PointerEvent).pointerType==='touch'||(e as PointerEvent).pointerType==='pen')return;const i=target(e);if(i!==null){setFocus(i);action(i,(e as MouseEvent).detail===0&&flagMode?'flag':'reveal');}},{signal:events.signal});
  grid.addEventListener('focusin',e=>{const i=target(e);if(i!==null)setFocus(i);},{signal:events.signal});
  grid.addEventListener('contextmenu',e=>{e.preventDefault();if(pointers.size)return;const i=target(e);if(i!==null)action(i,'flag');},{signal:events.signal});
  grid.addEventListener('keydown',e=>{
   const i=target(e);if(i===null||paused||e.altKey||e.ctrlKey||e.metaKey)return;
   const {width,height}=LEVELS[board.level],row=Math.floor(i/width),col=i%width;
   const moves:Record<string,number>={ArrowLeft:col>0?i-1:i,ArrowRight:col<width-1?i+1:i,ArrowUp:Math.max(0,row-1)*width+col,ArrowDown:Math.min(height-1,row+1)*width+col,Home:row*width,End:(row+1)*width-1};
   if(e.key in moves){e.preventDefault();setFocus(moves[e.key],true);}else if(['Enter',' ','f','F','c','C'].includes(e.key)){e.preventDefault();if(!e.repeat)action(i,e.key.toLowerCase()==='f'?'flag':e.key.toLowerCase()==='c'?'chord':'reveal',true);}
  },{signal:events.signal});
  // Touch actions resolve on pointerup only. Every pan, pinch, hold and cancel
  // consumes the gesture; compatibility clicks never activate a second action.
  const pointers=new Map<number,{x:number;y:number}>();
  let press:{id:number;i:number|null;x:number;y:number;left:number;top:number;consumed:boolean}|undefined,hold:number|undefined;
  let pinch:{distance:number;size:number;x:number;y:number;contentX:number;contentY:number}|undefined;
  function cancelGestures(){clearTimeout(hold);press=undefined;pinch=undefined;pointers.clear();}
  function setSize(next:number){size=Math.max(32,Math.min(64,Math.round(next)));grid.style.setProperty('--ms-size',`${size}px`);$('.ms-scale').textContent=`${Math.round(size/44*100)}%`;}
  scroll.addEventListener('pointerdown',e=>{
   if(e.button!==0||paused)return;
   const touch=e.pointerType==='touch'||e.pointerType==='pen';
   if(!touch&&target(e)!==null)return;
   scroll.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
   if(pointers.size===1){press={id:e.pointerId,i:target(e),x:e.clientX,y:e.clientY,left:scroll.scrollLeft,top:scroll.scrollTop,consumed:false};
    if(touch&&longPress&&press.i!==null){const gesture=press;hold=window.setTimeout(()=>{if(press===gesture&&!gesture.consumed){gesture.consumed=true;action(gesture.i!,'flag');}},480);}
   }else{clearTimeout(hold);if(press)press.consumed=true;const [a,b]=[...pointers.values()],box=scroll.getBoundingClientRect(),x=(a.x+b.x)/2-box.left,y=(a.y+b.y)/2-box.top;pinch={distance:Math.hypot(a.x-b.x,a.y-b.y),size,x,y,contentX:scroll.scrollLeft+x,contentY:scroll.scrollTop+y};}
  },{signal:events.signal});
  scroll.addEventListener('pointermove',e=>{
   if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
   if(pinch&&pointers.size>=2){const [a,b]=[...pointers.values()],box=scroll.getBoundingClientRect();setSize(pinch.size*Math.hypot(a.x-b.x,a.y-b.y)/Math.max(1,pinch.distance));scroll.scrollLeft=pinch.contentX*size/pinch.size-((a.x+b.x)/2-box.left);scroll.scrollTop=pinch.contentY*size/pinch.size-((a.y+b.y)/2-box.top);}
   else if(press?.id===e.pointerId){const dx=e.clientX-press.x,dy=e.clientY-press.y;if(Math.hypot(dx,dy)>8){clearTimeout(hold);press.consumed=true;}if(press.consumed){scroll.scrollLeft=press.left-dx;scroll.scrollTop=press.top-dy;}}
  },{signal:events.signal});
  scroll.addEventListener('pointerup',e=>{
   clearTimeout(hold);const gesture=press;pointers.delete(e.pointerId);
   if(gesture?.id===e.pointerId&&!gesture.consumed&&!pinch&&gesture.i!==null){setFocus(gesture.i);action(gesture.i,flagMode?'flag':'reveal');}
   if(!pointers.size){press=undefined;pinch=undefined;save();}
  },{signal:events.signal});
  scroll.addEventListener('pointercancel',()=>cancelGestures(),{signal:events.signal});
  scroll.addEventListener('lostpointercapture',e=>{if(pointers.has(e.pointerId))cancelGestures();},{signal:events.signal});
  $('.ms-minus').addEventListener('click',()=>{setSize(size-6);save();},{signal:events.signal});$('.ms-plus').addEventListener('click',()=>{setSize(size+6);save();},{signal:events.signal});
  $('.ms-mode').addEventListener('click',()=>{flagMode=true;render();},{signal:events.signal});$('.ms-reveal-mode').addEventListener('click',()=>{flagMode=false;render();},{signal:events.signal});
  function fresh(level=board.level,nextPractice=practice){cancelGestures();board=create(level,newSeed());practice=nextPractice;assisted=practice;history=[];hinted=null;flagMode=false;last=performance.now();$('.ms-hint-message').textContent='';build();render();save();}
  function confirmDiscard(){syncTime();return board.status!=='playing'||window.confirm('Discard this active field and start a new game? Your statistics keep this attempt.');}
  function restart(){if(!confirmDiscard())return false;fresh();return true;}
  $('.ms-new').addEventListener('click',restart,{signal:events.signal});
  levelSelect.addEventListener('change',()=>{const level=levelSelect.value as Level;if(confirmDiscard())fresh(level);else levelSelect.value=board.level;},{signal:events.signal});
  $('.ms-practice').addEventListener('change',()=>{const next=$<HTMLInputElement>('.ms-practice').checked;if(confirmDiscard())fresh(board.level,next);else render();},{signal:events.signal});
  $('.ms-hint').addEventListener('click',()=>{if(!practice||board.status!=='playing')return;closeMenu();const result=hint(board);hinted=result?.index??null;$('.ms-hint-message').textContent=result?result.explanation+(board.flags[result.index]?' Remove the flag before revealing it.':' The outlined tile is safe to reveal.'):'No safe move established from visible numbers. This solver uses direct and subset deductions; it will not guess.';if(result)setFocus(result.index,true);render();save();},{signal:events.signal});
  $('.ms-undo').addEventListener('click',()=>{if(!practice||!history.length)return;closeMenu();syncTime();const elapsed=board.elapsedMs;board=history.pop()!;board.elapsedMs=elapsed;hinted=null;$('.ms-hint-message').textContent='';last=performance.now();render();save();},{signal:events.signal});
  $('.ms-rankings').addEventListener('click',()=>{closeMenu();context.openRankings?.(rankingKey(board.level));},{signal:events.signal});
  $('.ms-sound').addEventListener('change',()=>{sound=$<HTMLInputElement>('.ms-sound').checked;playSound(sound);save();},{signal:events.signal});$('.ms-longpress').addEventListener('change',()=>{longPress=$<HTMLInputElement>('.ms-longpress').checked;cancelGestures();save();},{signal:events.signal});
  $('.ms-dismiss').addEventListener('click',()=>{$('.ms-intro').hidden=true;write('minesweeper:intro',true);},{signal:events.signal});
  function openMenu(){
   if(menu.open)return;resumeAfterMenu=!paused;context.setPaused?.(true);$('.ms-pause').hidden=!resumeAfterMenu;menu.showModal();
  }
  function finishMenu(){
   const resume=resumeAfterMenu;resumeAfterMenu=false;if(resume&&!document.hidden)context.setPaused?.(false);
  }
  function closeMenu(resume=true){
   if(!menu.open)return false;if(!resume)resumeAfterMenu=false;menu.close();finishMenu();document.getElementById('game-menu')?.focus({preventScroll:true});return true;
  }
  menu.addEventListener('close',()=>{if(!menu.open)finishMenu();},{signal:events.signal});
  menu.addEventListener('cancel',event=>{event.preventDefault();closeMenu();},{signal:events.signal});
  menu.addEventListener('click',event=>{if(event.target===menu){const rect=menu.getBoundingClientRect(),e=event as MouseEvent;if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)closeMenu();}},{signal:events.signal});
  $('.ms-close').addEventListener('click',()=>closeMenu(),{signal:events.signal});$('.ms-return').addEventListener('click',()=>closeMenu(),{signal:events.signal});
  $('.ms-pause').addEventListener('click',()=>closeMenu(false),{signal:events.signal});
  $('.ms-app-settings').addEventListener('click',()=>{closeMenu();context.openAppMenu?.();},{signal:events.signal});
  const ticker=window.setInterval(()=>{if(!disposed){syncTime();clock();}},200);
  build();render();
  return {openMenu,dismissMenu:()=>closeMenu(),pause(){syncTime();paused=true;cancelGestures();render();},resume(){paused=false;last=performance.now();render();},restart,serialize:snapshot,
   restore(data){const restored=restoreBoard(data);if(!restored)return;board=restored;const saved=data as {cellSize?:number;practice?:boolean;assisted?:boolean;stats?:unknown;sound?:boolean;longPress?:boolean};practice=saved.practice===true;assisted=practice||saved.assisted===true||(restored.first!==null&&saved.assisted!==false);stats=readStats(saved.stats);sound=saved.sound===true;longPress=saved.longPress!==false;if(typeof saved.cellSize==='number'&&Number.isFinite(saved.cellSize))size=Math.max(32,Math.min(64,saved.cellSize));history=[];hinted=null;last=performance.now();build();render();},
   dispose(){disposed=true;closeMenu(false);events.abort();cancelGestures();clearInterval(ticker);for(const {node,marker} of moved)marker.replaceWith(node);root.remove();}
  };
 }
};
export default game;
