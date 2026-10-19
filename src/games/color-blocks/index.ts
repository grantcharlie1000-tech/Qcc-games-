import type {GameModule} from '../../core/types';
import {createGame,place,canPlace,hasMove,SHAPES,NAMES,colorOf,restoreGame} from './model';
import {gem,blockSvg,COLOR_NAMES} from './art';
import './style.css';
const module:GameModule={
 id:'color-blocks',title:'Color Blocks',cover:'game-art/color-blocks/cover.svg',
 rules:'Place the three fixed-orientation pieces onto the 8 by 8 board. Drag a piece, or select one and tap its top-left destination. Full rows and columns clear together. Each placed block earns 1 point; each cleared line earns 20 times your current clear streak. Consecutive clearing moves build the streak; a move without a clear resets it. Use all three pieces to get a new tray. The game ends only when none of your remaining pieces fits. No rotation and no timer. Keyboard: select with 1, 2 or 3, use arrow keys to aim, and Enter or Space to place.',
 mount(container,context){
  let state=createGame(),paused=false,disposed=false,selected:number|null=null,cursor={x:0,y:0},preview=false;
  let drag:{id:number;anchorX:number;anchorY:number;startX:number;startY:number;moved:boolean}|null=null;
  let publishedScore=-1,publishedLines=-1,publishedStatus='';
  const abort=new AbortController(),signal=abort.signal;
  const root=document.createElement('section');root.className='cb-game';root.setAttribute('aria-label','Color Blocks puzzle');
  root.innerHTML=`<div class="cb-banner"><img src="${import.meta.env.BASE_URL}game-art/color-blocks/spark.svg" alt="" width="56" height="56"><div><strong>Make room for magic</strong><span>Fill a line. Clear some space.</span></div><span class="cb-chain">0<br><small>STREAK</small></span></div><div class="cb-board-frame"><div class="cb-board" role="grid" aria-label="8 by 8 placement board" aria-describedby="cb-instructions"></div></div><div class="cb-feedback" role="status">Pick a piece and find its place</div><div class="cb-tray" role="group" aria-label="Three-piece tray"></div><p class="cb-instructions" id="cb-instructions">Drag to place, or select a piece then tap the board.<br><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> select · arrows aim · <kbd>Enter</kbd> place</p>`;
  container.replaceChildren(root);
  const board=root.querySelector<HTMLElement>('.cb-board')!,tray=root.querySelector<HTMLElement>('.cb-tray')!,feedback=root.querySelector<HTMLElement>('.cb-feedback')!;
  const rows=Array.from({length:8},()=>{const row=document.createElement('div');row.className='cb-row';row.setAttribute('role','row');board.append(row);return row;});
  const cells=Array.from({length:64},(_,i)=>{const c=document.createElement('button');c.className='cb-cell';c.type='button';c.dataset.cell=String(i);c.setAttribute('role','gridcell');c.setAttribute('aria-rowindex',String(Math.floor(i/8)+1));c.setAttribute('aria-colindex',String(i%8+1));c.id=`cb-cell-${i}`;rows[Math.floor(i/8)].append(c);return c;});
  const slots=Array.from({length:3},(_,i)=>{const b=document.createElement('button');b.type='button';b.className='cb-piece';b.dataset.slot=String(i);tray.append(b);return b;});
  function active(){return !paused&&!disposed&&hasMove(state);}
  function draw(){
   root.classList.toggle('cb-patterns',context.settings.colorBlind);root.classList.toggle('cb-reduced',context.settings.reducedMotion);root.dataset.moves=String(state.moves);root.dataset.score=String(state.score);root.dataset.combo=String(state.combo);
   const shape=selected===null?null:state.tray[selected];const valid=preview&&shape!==null&&shape!==undefined&&canPlace(state.board,shape,cursor.x,cursor.y)&&active();
   const ghosts=new Set(valid?SHAPES[shape!].map(([x,y])=>(cursor.y+y)*8+cursor.x+x):[]);
   board.classList.toggle('cb-invalid',preview&&!valid&&selected!==null);board.setAttribute('aria-disabled',String(!active()));
   for(let i=0;i<64;i++){
    const value=state.board[i],ghost=ghosts.has(i),color=ghost?colorOf(shape!):value;
    cells[i].classList.toggle('cb-ghost',ghost);cells[i].classList.toggle('cb-occupied',!!value);cells[i].classList.toggle('cb-aim',preview&&i===cursor.y*8+cursor.x);
    cells[i].dataset.value=String(value);cells[i].dataset.ghost=String(ghost);cells[i].innerHTML=color?blockSvg(color):'';
    cells[i].tabIndex=selected!==null&&i===Math.max(0,Math.min(63,cursor.y*8+cursor.x))?0:-1;
    cells[i].setAttribute('aria-label',`Row ${Math.floor(i/8)+1}, column ${i%8+1}, ${value?COLOR_NAMES[value]:'empty'}${ghost?', placement preview':''}`);
   }
   for(let i=0;i<3;i++){
    const p=state.tray[i],b=slots[i];b.disabled=p===null||paused||!hasMove(state);b.setAttribute('aria-pressed',String(selected===i));
    if(p===null){b.innerHTML='<span class="cb-used">Placed<span>✓</span></span>';b.setAttribute('aria-label',`Piece ${i+1} placed`);continue;}
    const shape=SHAPES[p],w=Math.max(...shape.map(c=>c[0]))+1,h=Math.max(...shape.map(c=>c[1]))+1;
    b.setAttribute('aria-label',`Piece ${i+1}: ${NAMES[p]}, ${shape.length} blocks, ${COLOR_NAMES[colorOf(p)]}`);
    b.innerHTML=`<span class="cb-piece-number">${i+1}</span><svg class="cb-piece-art" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w*32} ${h*32}" width="${w*21}" height="${h*21}" aria-hidden="true">${shape.map(([x,y])=>gem(colorOf(p),x*32,y*32)).join('')}</svg><span class="cb-piece-name">${NAMES[p]}</span>`;
   }
   root.querySelector('.cb-chain')!.innerHTML=`${state.combo}<br><small>STREAK</small>`;
   if(state.score!==publishedScore){context.setScore(state.score);publishedScore=state.score;}
   if(state.lines!==publishedLines){context.setLevel(`${state.lines} lines`);publishedLines=state.lines;}
   const status=paused?'Paused':hasMove(state)?`${state.moves} ${state.moves===1?'piece':'pieces'} placed · ${state.tray.filter(p=>p!==null).length} left in tray`:'No pieces fit. Restart for another run.';
   if(status!==publishedStatus){context.setStatus(status);publishedStatus=status;}
   if(preview&&cursor.x>=0&&cursor.x<8&&cursor.y>=0&&cursor.y<8)board.setAttribute('aria-activedescendant',`cb-cell-${cursor.y*8+cursor.x}`);else board.removeAttribute('aria-activedescendant');
   if(!hasMove(state)){feedback.textContent=`No pieces fit · ${state.score} points`;root.classList.add('cb-over');}else root.classList.remove('cb-over');
  }
  function choose(slot:number){if(!active()||state.tray[slot]===null)return;selected=slot;preview=false;context.sound('tap');feedback.textContent=`${NAMES[state.tray[slot]!]} selected · fixed orientation`;draw();}
  function commit(){if(!active()||selected===null)return false;const result=place(state,selected,cursor.x,cursor.y);
   if(!result){feedback.textContent='That piece needs empty cells. Try another spot.';context.announce(feedback.textContent);return false;}
   state=result.state;selected=null;preview=false;
   const message=result.lines?`${result.lines} ${result.lines===1?'line':'lines'} cleared! Streak ${state.combo} · +${result.gained}`:`Nicely placed · +${result.gained}`;
   feedback.textContent=message;context.announce(message);context.sound(result.lines?'success':'tap');if(!hasMove(state)){context.sound('lose');context.announce('No remaining pieces fit. Your run is over.');}
   context.save(state);draw();return true;
  }
  function locate(e:PointerEvent,anchorX=0,anchorY=0){const r=board.getBoundingClientRect();const x=(e.clientX-r.left)/r.width*8,y=(e.clientY-r.top)/r.height*8;
   if(x<0||x>=8||y<0||y>=8){preview=false;return;}
   cursor={x:Math.floor(x)-anchorX,y:Math.floor(y)-anchorY};preview=true;
  }
  root.addEventListener('pointerdown',e=>{
   if(!active()||drag||e.button!==0)return;const target=e.target as Element,button=target.closest<HTMLElement>('[data-slot]');
   if(button){const slot=Number(button.dataset.slot);if(state.tray[slot]===null)return;
    const svg=button.querySelector('svg')!,rect=svg.getBoundingClientRect(),shape=SHAPES[state.tray[slot]!],w=Math.max(...shape.map(c=>c[0]))+1,h=Math.max(...shape.map(c=>c[1]))+1;
    let anchorX=Math.max(0,Math.min(w-1,Math.floor((e.clientX-rect.left)/rect.width*w))),anchorY=Math.max(0,Math.min(h-1,Math.floor((e.clientY-rect.top)/rect.height*h)));
    if(!shape.some(([x,y])=>x===anchorX&&y===anchorY)){[anchorX,anchorY]=shape[0];}
    choose(slot);drag={id:e.pointerId,anchorX,anchorY,startX:e.clientX,startY:e.clientY,moved:false};root.setPointerCapture(e.pointerId);e.preventDefault();
   }
  },{signal});
  root.addEventListener('pointermove',e=>{if(!active()||selected===null)return;if(drag&&e.pointerId!==drag.id)return;
   if(drag&&Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>5)drag.moved=true;
   locate(e,drag?.anchorX,drag?.anchorY);draw();
  },{signal});
  root.addEventListener('pointerup',e=>{if(!drag||e.pointerId!==drag.id)return;const d=drag;drag=null;
   locate(e,d.anchorX,d.anchorY);if(d.moved&&preview)commit();if(root.hasPointerCapture(e.pointerId))root.releasePointerCapture(e.pointerId);draw();
  },{signal});
  root.addEventListener('pointercancel',()=>{drag=null;preview=false;draw();},{signal});
  root.addEventListener('pointerleave',()=>{if(!drag){preview=false;draw();}},{signal});
  root.addEventListener('click',e=>{if(!active())return;const target=e.target as Element;
   const cell=target.closest<HTMLElement>('[data-cell]');if(cell&&selected!==null){const i=Number(cell.dataset.cell);cursor={x:i%8,y:Math.floor(i/8)};preview=true;commit();draw();}
   // Native keyboard activation and assistive technology dispatch a click with detail 0.
   const slot=target.closest<HTMLElement>('[data-slot]');if(slot&&(e as MouseEvent).detail===0)choose(Number(slot.dataset.slot));
  },{signal});
  container.addEventListener('keydown',e=>{
   if(!active()||e.altKey||e.ctrlKey||e.metaKey)return;
   if(['1','2','3'].includes(e.key)){e.preventDefault();choose(Number(e.key)-1);preview=true;draw();board.focus();return;}
   if(selected===null)return;
   const steps:Record<string,[number,number]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
   if(steps[e.key]){e.preventDefault();const [x,y]=steps[e.key];cursor={x:Math.max(0,Math.min(7,cursor.x+x)),y:Math.max(0,Math.min(7,cursor.y+y))};preview=true;draw();}
   else if((e.key==='Enter'||e.key===' ')&&!(e.target as Element).closest('[data-slot]')){e.preventDefault();preview=true;commit();draw();}
  },{signal});
  // Grid owns keyboard focus while aiming; cells expose precise accessible labels.
  board.tabIndex=0;
  function cancel(){if(drag&&root.hasPointerCapture(drag.id))root.releasePointerCapture(drag.id);drag=null;preview=false;}
  draw();
  return {pause(){paused=true;cancel();draw();},resume(){paused=false;draw();},restart(){cancel();state=createGame();selected=null;cursor={x:0,y:0};feedback.textContent='Fresh board · find your flow';draw();context.save(state);},serialize(){return structuredClone(state);},restore(data){const restored=restoreGame(data);if(!restored)return;cancel();state=restored;selected=null;feedback.textContent='Your puzzle is ready to continue';draw();},dispose(){disposed=true;cancel();abort.abort();root.remove();}};
 }
};
export default module;
