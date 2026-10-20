import type {GameModule} from '../../core/types';
import {createGame,place,canPlace,hasMove,SHAPES,NAMES,colorOf,restoreGame} from './model';
import {gem,blockSvg,COLOR_NAMES} from './art';
import {mapDrag,grabCell,type Point,type Bounds} from './input';
import './style.css';
const module:GameModule={
 id:'color-blocks',title:'Color Blocks',cover:'game-art/color-blocks/cover.svg',
 rules:'Place the three fixed-orientation pieces onto the 8 by 8 board. Drag a piece, or select one and tap its top-left destination. Full rows and columns clear together. Each placed block earns 1 point; each cleared line earns 20 times your current clear streak. Consecutive clearing moves build the streak; a move without a clear resets it. Use all three pieces to get a new tray. Every new tray has a way to place all three pieces, including any line clears along the way. Plan carefully: other placements can leave the remaining pieces stuck. The game ends only when none of your remaining pieces fits. No rotation and no timer. Keyboard: select with 1, 2 or 3, use arrow keys to aim, and Enter or Space to place.',
 mount(container,context){
  let state=createGame(),paused=false,disposed=false,selected:number|null=null,cursor={x:0,y:0},preview=false;
  let drag:{id:number;slot:number;anchor:Point;start:Point;pointer:Point;pointerType:string;moved:boolean;bounds:Bounds}|null=null;
  let ignoreClick=false;const animations=new Set<Animation>();
  let publishedScore=-1,publishedLines=-1,publishedStatus='';
  const abort=new AbortController(),signal=abort.signal;
  const root=document.createElement('section');root.className='cb-game';root.setAttribute('aria-label','Color Blocks puzzle');
  root.innerHTML=`<div class="cb-board-frame"><div class="cb-board" role="grid" aria-label="8 by 8 placement board" aria-describedby="cb-instructions"></div><div class="cb-effects" aria-hidden="true"></div></div><div class="cb-tray" role="group" aria-label="Three-piece tray"></div><div class="cb-feedback" role="status">Pick a piece and find its place</div><p class="cb-instructions" id="cb-instructions">Drag to place, or select a piece then tap the board. Touch pieces lift above your finger. Keyboard: 1, 2 or 3 select, arrows aim, Enter places, Esc pauses and opens Study Mode.</p><svg class="cb-drag-art" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" hidden></svg>`;
  container.replaceChildren(root);
  const board=root.querySelector<HTMLElement>('.cb-board')!,tray=root.querySelector<HTMLElement>('.cb-tray')!,feedback=root.querySelector<HTMLElement>('.cb-feedback')!;
  const floating=root.querySelector<SVGSVGElement>('.cb-drag-art')!,effects=root.querySelector<HTMLElement>('.cb-effects')!;
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
    const p=state.tray[i],b=slots[i];b.classList.toggle('cb-dragging',drag?.slot===i);b.disabled=p===null||paused||!hasMove(state);b.setAttribute('aria-pressed',String(selected===i));
    if(p===null){b.innerHTML='';b.setAttribute('aria-label',`Piece ${i+1} placed`);continue;}
    const shape=SHAPES[p],w=Math.max(...shape.map(c=>c[0]))+1,h=Math.max(...shape.map(c=>c[1]))+1;
    b.setAttribute('aria-label',`Piece ${i+1}: ${NAMES[p]}, ${shape.length} blocks, ${COLOR_NAMES[colorOf(p)]}`);
    const cell=board.getBoundingClientRect().width/8*.5;
    b.innerHTML=`<svg class="cb-piece-art" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w*32} ${h*32}" width="${w*cell}" height="${h*cell}" aria-hidden="true">${shape.map(([x,y])=>gem(colorOf(p),x*32,y*32)).join('')}</svg>`;
   }
   if(state.score!==publishedScore){context.setScore(state.score);publishedScore=state.score;}
   if(state.lines!==publishedLines){context.setLevel(`${state.lines} lines`);publishedLines=state.lines;}
   const status=paused?'Paused':hasMove(state)?`${state.moves} ${state.moves===1?'piece':'pieces'} placed · ${state.tray.filter(p=>p!==null).length} left in tray`:'No pieces fit. Restart for another run.';
   if(status!==publishedStatus){context.setStatus(status);publishedStatus=status;}
   if(preview&&cursor.x>=0&&cursor.x<8&&cursor.y>=0&&cursor.y<8)board.setAttribute('aria-activedescendant',`cb-cell-${cursor.y*8+cursor.x}`);else board.removeAttribute('aria-activedescendant');
   if(!hasMove(state)){feedback.textContent=`No pieces fit · ${state.score} points`;root.classList.add('cb-over');}else root.classList.remove('cb-over');
  }
  function choose(slot:number){if(!active()||state.tray[slot]===null)return;ignoreClick=false;selected=slot;preview=false;context.sound('tap');feedback.textContent=`${NAMES[state.tray[slot]!]} selected · fixed orientation`;draw();}
  function commit(animate=true){if(!active()||selected===null)return false;const result=place(state,selected,cursor.x,cursor.y);
   if(!result){feedback.textContent='That piece needs empty cells. Try another spot.';context.announce(feedback.textContent);return false;}
   state=result.state;selected=null;preview=false;
   if(animate)celebrate(result.cleared,result.gained,result.lines);
   const message=result.lines?`${result.lines} ${result.lines===1?'line':'lines'} cleared! Streak ${state.combo} · +${result.gained}`:`Nicely placed · +${result.gained}`;
   feedback.textContent=message;context.announce(message);context.sound(result.lines?'success':'tap');if(!hasMove(state)){context.sound('lose');context.announce('No remaining pieces fit. Your run is over.');}
   context.save(state);draw();return true;
  }
  function reduced(){return context.settings.reducedMotion||matchMedia('(prefers-reduced-motion: reduce)').matches;}
  function motion(el:Element,keyframes:Keyframe[],duration:number,finish:()=>void){
   if(reduced()){finish();return;}
   const animation=el.animate(keyframes,{duration,easing:'cubic-bezier(.23,1,.32,1)',fill:'forwards'});animations.add(animation);
   animation.onfinish=()=>{animations.delete(animation);finish();animation.cancel();};
   animation.oncancel=()=>animations.delete(animation);
  }
  function clearEffects(){for(const a of animations)a.cancel();animations.clear();effects.replaceChildren();floating.setAttribute('hidden','');}
  function celebrate(cleared:number[],gained:number,lines:number){
   if(reduced())return;
   const removed=new Set(cleared);
   for(let i=0;i<8;i++)for(const axis of ['row','col'] as const){
    if(!Array.from({length:8},(_,j)=>axis==='row'?i*8+j:j*8+i).every(c=>removed.has(c)))continue;
    const streak=document.createElement('span');streak.className=`cb-clear-streak cb-clear-${axis}`;streak.style[axis==='row'?'top':'left']=`${(i+.5)*12.5}%`;effects.append(streak);
    motion(streak,[{opacity:1,transform:axis==='row'?'scaleX(.7)':'scaleY(.7)'},{opacity:0,transform:axis==='row'?'scaleX(1.05)':'scaleY(1.05)'}],250,()=>streak.remove());
   }
   const pop=document.createElement('span');pop.className='cb-score-pop';pop.innerHTML=`+${gained}${lines&&state.combo>1?`<small>COMBO ${state.combo}</small>`:''}`;effects.append(pop);
   motion(pop,[{opacity:1,transform:'translate(-50%,0)'},{opacity:0,transform:'translate(-50%,-18px)'}],280,()=>pop.remove());
  }
  function mapPointer(e:PointerEvent){
   if(!drag)return false;
   const rect=board.getBoundingClientRect();
   // A release can precede the browser's queued resize notification.
   if((['left','top','width','height'] as const).some(key=>Math.abs(rect[key]-drag!.bounds[key])>.5)){cancel();draw();return false;}
   drag.pointer={x:e.clientX,y:e.clientY};
   const mapped=mapDrag(rect,drag.pointer,drag.anchor,drag.pointerType);
   cursor={x:mapped.x,y:mapped.y};preview=true;
   const p=state.tray[drag.slot]!;const shape=SHAPES[p],w=Math.max(...shape.map(c=>c[0]))+1,h=Math.max(...shape.map(c=>c[1]))+1;
   floating.setAttribute('width',String(w*mapped.cell));floating.setAttribute('height',String(h*mapped.cell));
   floating.style.transform=`translate(${mapped.left}px,${mapped.top}px)`;floating.removeAttribute('hidden');
   floating.classList.toggle('cb-drop-invalid',!canPlace(state.board,p,cursor.x,cursor.y));return true;
  }
  function releaseCapture(id:number){if(root.hasPointerCapture(id))root.releasePointerCapture(id);}
  function cancel(){
   const id=drag?.id;drag=null;selected=null;preview=false;ignoreClick=true;clearEffects();if(id!==undefined)releaseCapture(id);
  }
  function returnToTray(slot:number){
   const art=slots[slot].querySelector('svg');if(!art){floating.setAttribute('hidden','');return;}
   const target=art.getBoundingClientRect(),current=floating.getBoundingClientRect();
   motion(floating,[{transform:floating.style.transform,opacity:1},{transform:`translate(${target.left}px,${target.top}px) scale(${target.width/current.width})`,opacity:.25}],180,()=>{floating.setAttribute('hidden','');floating.style.opacity='';});
  }
  root.addEventListener('pointerdown',e=>{
   if(!active()||drag||e.button!==0||!e.isPrimary)return;
   const button=(e.target as Element).closest<HTMLElement>('[data-slot]');if(!button)return;
   const slot=Number(button.dataset.slot),p=state.tray[slot];if(p===null)return;
   clearEffects();ignoreClick=false;
   const art=button.querySelector('svg')!,anchor=grabCell(p,art.getBoundingClientRect(),{x:e.clientX,y:e.clientY});
   choose(slot);drag={id:e.pointerId,slot,anchor,start:{x:e.clientX,y:e.clientY},pointer:{x:e.clientX,y:e.clientY},pointerType:e.pointerType,moved:false,bounds:board.getBoundingClientRect()};
   floating.setAttribute('viewBox',art.getAttribute('viewBox')!);floating.innerHTML=art.innerHTML;
   root.setPointerCapture(e.pointerId);mapPointer(e);draw();e.preventDefault();
  },{signal});
  root.addEventListener('pointermove',e=>{
   if(!active()||selected===null)return;
   if(drag){if(e.pointerId!==drag.id)return;
    if(Math.hypot(e.clientX-drag.start.x,e.clientY-drag.start.y)>5)drag.moved=true;
    if(!mapPointer(e))return;
   }else{
    const r=board.getBoundingClientRect();cursor={x:Math.floor((e.clientX-r.left)/r.width*8),y:Math.floor((e.clientY-r.top)/r.height*8)};preview=cursor.x>=0&&cursor.x<8&&cursor.y>=0&&cursor.y<8;
   }
   draw();
  },{signal});
  root.addEventListener('pointerup',e=>{
   if(!drag||e.pointerId!==drag.id)return;
   if(!mapPointer(e))return;const d=drag!;drag=null;ignoreClick=d.moved;
   const placed=d.moved&&active()&&commit();preview=false;
   releaseCapture(e.pointerId);draw();
   if(placed||!d.moved)floating.setAttribute('hidden','');else returnToTray(d.slot);
  },{signal});
  root.addEventListener('pointercancel',e=>{if(e.pointerId===drag?.id){cancel();draw();}},{signal});
  root.addEventListener('lostpointercapture',e=>{if(e.pointerId===drag?.id){cancel();draw();}},{signal});
  root.addEventListener('pointerleave',()=>{if(!drag){preview=false;draw();}},{signal});
  root.addEventListener('click',e=>{
   if(ignoreClick&&(e as MouseEvent).detail!==0){ignoreClick=false;return;}
   if(!active())return;const target=e.target as Element;
   const cell=target.closest<HTMLElement>('[data-cell]');if(cell&&selected!==null){const i=Number(cell.dataset.cell);cursor={x:i%8,y:Math.floor(i/8)};preview=true;commit((e as MouseEvent).detail!==0);draw();}
   const slot=target.closest<HTMLElement>('[data-slot]');if(slot&&(e as MouseEvent).detail===0)choose(Number(slot.dataset.slot));
  },{signal});
  container.addEventListener('keydown',e=>{
   if(e.key==='Escape'){cancel();draw();return;}
   if(!active()||e.altKey||e.ctrlKey||e.metaKey||drag)return;
   if(['1','2','3'].includes(e.key)){e.preventDefault();if(e.repeat)return;choose(Number(e.key)-1);preview=true;draw();board.focus();return;}
   if(selected===null)return;
   const steps:Record<string,[number,number]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
   if(steps[e.key]){e.preventDefault();const [x,y]=steps[e.key];cursor={x:Math.max(0,Math.min(7,cursor.x+x)),y:Math.max(0,Math.min(7,cursor.y+y))};preview=true;draw();}
   else if((e.key==='Enter'||e.key===' ')&&!(e.target as Element).closest('[data-slot]')){e.preventDefault();if(e.repeat)return;preview=true;commit(false);draw();}
  },{signal});
  window.addEventListener('blur',()=>{cancel();draw();},{signal});
  window.addEventListener('resize',()=>{cancel();draw();},{signal});
  let lastWidth=board.getBoundingClientRect().width,lastHeight=root.getBoundingClientRect().height;
  const resize=new ResizeObserver(()=>{const width=board.getBoundingClientRect().width,height=root.getBoundingClientRect().height;if(width!==lastWidth||height!==lastHeight){lastWidth=width;lastHeight=height;cancel();draw();}});resize.observe(board);resize.observe(root);
  // Grid owns keyboard focus while aiming; cells expose precise accessible labels.
  board.tabIndex=0;
  draw();
  return {pause(){paused=true;cancel();draw();},resume(){paused=false;draw();},restart(){cancel();state=createGame();selected=null;cursor={x:0,y:0};feedback.textContent='Fresh board · find your flow';draw();context.save(state);},serialize(){return structuredClone(state);},restore(data){const restored=restoreGame(data);if(!restored)return;cancel();state=restored;selected=null;feedback.textContent='Your puzzle is ready to continue';draw();},dispose(){disposed=true;cancel();resize.disconnect();abort.abort();root.remove();}};
 }
};
export default module;
