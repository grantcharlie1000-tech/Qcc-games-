import type {GameModule} from '../../core/types';
import {createGame,place,canPlace,hasMove,clearLines,SHAPES,NAMES,restoreGame,SIZE,type PlaceResult} from './model';
import {gem,blockSvg,colorName} from './art';
import {mapDrag,grabCell,type Point,type Bounds} from './input';
import {describeBreakdown,rewardLabel} from './rewards';
import './style.css';
import './christmas.css';
const freshGame=()=>createGame(crypto.getRandomValues(new Uint32Array(1))[0]);
const EASE_OUT='cubic-bezier(.23,1,.32,1)';
const module:GameModule={
 id:'color-blocks',title:'Block Blast',cover:'game-art/color-blocks/cover.svg',
 rules:'Independent browser adaptation. Place the three fixed-orientation pieces onto the 8 by 8 board. Drag a piece, or select one and tap its top-left destination. Full rows and columns clear together, and the preview lights up the lines a drop will clear. Points per placement: 1 per block, plus 20 × lines², plus 10 × lines × (combo − 1), plus 40 for each colour that disappears from the board, plus 200 for clearing the whole board. Each clearing move raises the combo (counted up to 10) and gives you two setup moves, shown as pips: one or two placements without a clear keep the combo, and the third ends it. Use all three pieces to get a new tray. Every new tray has a way to place all three pieces, including any line clears along the way. Plan carefully: other placements can leave the remaining pieces stuck. The game ends only when none of your remaining pieces fits. No rotation and no timer. Keyboard: select with 1, 2 or 3, use arrow keys to aim, and Enter or Space to place.',
 mount(container,context){
  let state=freshGame(),paused=false,disposed=false,selected:number|null=null,cursor={x:0,y:0},preview=false;
  let drag:{id:number;slot:number;anchor:Point;start:Point;pointer:Point;pointerType:string;moved:boolean;bounds:Bounds;viewW:number;viewH:number}|null=null;
  let ignoreClick=false;const animations=new Set<Animation>();let floatAnimation:Animation|null=null;
  let publishedScore=-1,publishedLines=-1,publishedStatus='';
  // Presentation only: the shown total counts toward the committed score and never feeds back into it.
  let shownScore=state.score,scoreFrame=0,best=context.highScore,bestShown=false,lastBreakdown='';
  const abort=new AbortController(),signal=abort.signal;
  const root=document.createElement('section');root.className='cb-game';root.setAttribute('aria-label','Block Blast puzzle');
  root.innerHTML=`<div class="cb-hud-row" aria-hidden="true"><span class="cb-combo" hidden><b class="cb-combo-label"></b><span class="cb-pips"><i></i><i></i></span></span><span class="cb-breakdown"></span><span class="cb-best" hidden>★ New best</span><span class="cb-score-wrap"><span class="cb-score-total">0</span></span></div><div class="cb-board-frame"><div class="cb-board" role="grid" aria-label="8 by 8 placement board" aria-describedby="cb-instructions"></div><div class="cb-effects" aria-hidden="true"></div><div class="cb-result" hidden><strong>No pieces fit</strong><span class="cb-result-score"></span><span class="cb-result-note"></span><dl class="cb-result-stats"></dl><button type="button" class="cb-again">Play again</button></div></div><div class="cb-tray" role="group" aria-label="Three-piece tray"></div><div class="cb-feedback" role="status"></div><p class="cb-instructions sr-only" id="cb-instructions">Drag to place, or select a piece then tap the board. Touch pieces lift above your finger. Keyboard: 1, 2 or 3 select, arrows aim, Enter places, Esc pauses and opens Study Mode.</p><svg class="cb-drag-art" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" hidden></svg>`;
  container.replaceChildren(root);
  const $=<T extends Element=HTMLElement>(s:string)=>root.querySelector<T>(s)!;
  const board=$('.cb-board'),tray=$('.cb-tray'),feedback=$('.cb-feedback'),floating=$<SVGSVGElement>('.cb-drag-art'),effects=$('.cb-effects');
  const comboChip=$('.cb-combo'),comboLabel=$('.cb-combo-label'),pips=[...root.querySelectorAll<HTMLElement>('.cb-pips i')],breakdownEl=$('.cb-breakdown'),bestBadge=$('.cb-best'),scoreTotal=$('.cb-score-total');
  const result=$('.cb-result'),resultScore=$('.cb-result-score'),resultNote=$('.cb-result-note'),resultStats=$('.cb-result-stats');
  const rows=Array.from({length:SIZE},()=>{const row=document.createElement('div');row.className='cb-row';row.setAttribute('role','row');board.append(row);return row;});
  const cells=Array.from({length:SIZE*SIZE},(_,i)=>{const c=document.createElement('button');c.className='cb-cell';c.type='button';c.dataset.cell=String(i);c.setAttribute('role','gridcell');c.setAttribute('aria-rowindex',String(Math.floor(i/SIZE)+1));c.setAttribute('aria-colindex',String(i%SIZE+1));c.id=`cb-cell-${i}`;rows[Math.floor(i/SIZE)].append(c);return c;});
  const slots=Array.from({length:3},(_,i)=>{const b=document.createElement('button');b.type='button';b.className='cb-piece';b.dataset.slot=String(i);tray.append(b);return b;});
  const cellHtml=new Array<string>(SIZE*SIZE).fill('-'),trayHtml=['-','-','-'];
  function active(){return !paused&&!disposed&&hasMove(state);}
  function setShown(value:number){shownScore=value;const text=String(value);if(scoreTotal.textContent!==text)scoreTotal.textContent=text;}
  function settleScore(){cancelAnimationFrame(scoreFrame);scoreFrame=0;setShown(state.score);}
  /** Elapsed-time count toward the committed total, driven by requestAnimationFrame. */
  function countScore(){
   cancelAnimationFrame(scoreFrame);const from=shownScore,to=state.score;
   if(reduced()||from===to){settleScore();return;}
   const start=performance.now(),duration=300;
   const tick=(now:number)=>{const p=Math.min(1,(now-start)/duration);setShown(Math.round(from+(to-from)*(1-(1-p)**3)));scoreFrame=p<1?requestAnimationFrame(tick):0;};
   scoreFrame=requestAnimationFrame(tick);
  }
  function draw(){
   root.classList.toggle('cb-patterns',context.settings.colorBlind);root.classList.toggle('cb-reduced',context.settings.reducedMotion);root.dataset.moves=String(state.moves);root.dataset.score=String(state.score);root.dataset.combo=String(state.combo);root.dataset.setup=String(state.setup);
   const shape=selected===null?null:state.tray[selected],color=selected===null?0:state.colors[selected]??1;
   const valid=preview&&shape!==null&&shape!==undefined&&canPlace(state.board,shape,cursor.x,cursor.y)&&active();
   const ghosts=new Set(valid?SHAPES[shape!].map(([x,y])=>(cursor.y+y)*SIZE+cursor.x+x):[]);
   // Projected clear: the same simultaneous row/column rule the model applies on release.
   let projected=new Set<number>(),rainbow=false;
   if(valid){const filled=[...state.board];for(const i of ghosts)filled[i]=color;const c=clearLines(filled);projected=new Set(c.cleared);rainbow=c.lines>=3||c.lines>0&&state.combo+1>=5;}
   board.classList.toggle('cb-invalid',preview&&!valid&&selected!==null);board.classList.toggle('cb-preview-rainbow',rainbow);board.setAttribute('aria-disabled',String(!active()));
   for(let i=0;i<SIZE*SIZE;i++){
    const value=state.board[i],ghost=ghosts.has(i),lit=projected.has(i),shown=ghost||lit?color:value;
    cells[i].classList.toggle('cb-ghost',ghost);cells[i].classList.toggle('cb-line-preview',lit);cells[i].classList.toggle('cb-occupied',!!value);cells[i].classList.toggle('cb-aim',preview&&i===cursor.y*SIZE+cursor.x);
    cells[i].dataset.value=String(value);cells[i].dataset.ghost=String(ghost);
    const html=shown?blockSvg(shown):'';if(cellHtml[i]!==html){cells[i].innerHTML=html;cellHtml[i]=html;}
    cells[i].tabIndex=selected!==null&&i===Math.max(0,Math.min(SIZE*SIZE-1,cursor.y*SIZE+cursor.x))?0:-1;
    cells[i].setAttribute('aria-label',`Row ${Math.floor(i/SIZE)+1}, column ${i%SIZE+1}, ${value?colorName(value):'empty'}${ghost?', placement preview':''}${lit?', will clear':''}`);
   }
   for(let i=0;i<3;i++){
    const p=state.tray[i],b=slots[i];b.classList.toggle('cb-dragging',drag?.slot===i);b.disabled=p===null||paused||!hasMove(state);b.setAttribute('aria-pressed',String(selected===i));
    if(p===null){b.innerHTML='';trayHtml[i]='';b.setAttribute('aria-label',`Piece ${i+1} placed`);continue;}
    const cellsOf=SHAPES[p],w=Math.max(...cellsOf.map(c=>c[0]))+1,h=Math.max(...cellsOf.map(c=>c[1]))+1,c=state.colors[i]??1;
    b.setAttribute('aria-label',`Piece ${i+1}: ${NAMES[p]}, ${cellsOf.length} blocks, ${colorName(c)}`);
    const cell=board.getBoundingClientRect().width/SIZE*.5;
    const art=`<svg class="cb-piece-art" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w*32} ${h*32}" width="${w*cell}" height="${h*cell}" aria-hidden="true">${cellsOf.map(([x,y])=>gem(c,x*32,y*32)).join('')}</svg>`;
    if(trayHtml[i]!==art){b.innerHTML=art;trayHtml[i]=art;}
   }
   comboChip.hidden=state.combo<1;comboLabel.textContent=`Combo ${state.combo}`;pips.forEach((pip,i)=>pip.classList.toggle('cb-pip-on',i<state.setup));
   breakdownEl.textContent=lastBreakdown;bestBadge.hidden=!bestShown;
   if(!scoreFrame)setShown(state.score);
   if(state.score!==publishedScore){context.setScore(state.score);publishedScore=state.score;}
   if(state.lines!==publishedLines){context.setLevel(`${state.lines} lines`);publishedLines=state.lines;}
   const status=paused?'Paused':hasMove(state)?`${state.moves} ${state.moves===1?'piece':'pieces'} placed · ${state.tray.filter(p=>p!==null).length} left in tray`:'No pieces fit.';
   if(status!==publishedStatus){context.setStatus(status);publishedStatus=status;}
   if(preview&&cursor.x>=0&&cursor.x<SIZE&&cursor.y>=0&&cursor.y<SIZE)board.setAttribute('aria-activedescendant',`cb-cell-${cursor.y*SIZE+cursor.x}`);else board.removeAttribute('aria-activedescendant');
   const over=!hasMove(state);root.classList.toggle('cb-over',over);result.hidden=!over;
   if(over){
    resultScore.textContent=String(state.score);resultNote.textContent=bestShown?'points · New best!':`points · Best ${Math.max(best,state.score)}`;
    resultStats.innerHTML=[['Lines',state.lines],['Best combo',state.maxCombo],['Biggest clear',`${state.maxLines} ${state.maxLines===1?'line':'lines'}`],['Pieces',state.moves]].map(([k,v])=>`<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
   }
  }
  function choose(slot:number){if(!active()||state.tray[slot]===null)return;ignoreClick=false;selected=slot;preview=false;context.sound('tap');feedback.textContent=`${NAMES[state.tray[slot]!]} selected`;draw();}
  function commit(animate=true){if(!active()||selected===null)return false;const previous=state,result=place(state,selected,cursor.x,cursor.y);
   if(!result){feedback.textContent='No room for that piece.';context.announce(feedback.textContent);return false;}
   // Game state commits exactly once, before any presentation runs.
   state=result.state;selected=null;preview=false;
   const newBest=!bestShown&&best>0&&state.score>best;if(newBest)bestShown=true;
   lastBreakdown=`+${result.gained} = ${describeBreakdown(result.breakdown)}`;
   const label=rewardLabel(result,state.combo,newBest);
   const message=`${result.lines?`${result.lines} ${result.lines===1?'line':'lines'} cleared! `:''}${label?`${label.primary} `:''}${state.combo>0&&result.lines?`Combo ${state.combo} · `:''}${lastBreakdown}`;
   feedback.textContent=message;context.announce(message);context.sound(result.lines?'success':'tap');if(!hasMove(state)){context.sound('lose');context.announce('No remaining pieces fit. Your run is over.');}
   context.save(state);draw();
   if(animate){countScore();celebrate(result,previous.board,label,newBest);}else settleScore();
   return true;
  }
  function reduced(){return context.settings.reducedMotion||matchMedia('(prefers-reduced-motion: reduce)').matches;}
  function motion(el:Element,keyframes:Keyframe[],options:KeyframeAnimationOptions,finish:()=>void){
   const animation=el.animate(keyframes,{easing:EASE_OUT,fill:'forwards',...options});animations.add(animation);
   animation.onfinish=()=>{animations.delete(animation);finish();animation.cancel();};
   animation.oncancel=()=>animations.delete(animation);
   return animation;
  }
  function clearEffects(){for(const a of animations)a.cancel();animations.clear();effects.replaceChildren();hideFloating();settleScore();}
  function hideFloating(){floatAnimation?.cancel();floatAnimation=null;floating.setAttribute('hidden','');floating.style.opacity='';}
  const at=(i:number)=>`left:${i%SIZE*12.5}%;top:${Math.floor(i/SIZE)*12.5}%`;
  function celebrate(r:PlaceResult,before:readonly number[],label:ReturnType<typeof rewardLabel>,newBest:boolean){
   const low=reduced(),removed=new Set(r.cleared),sweep=r.lines>1?210:150;
   // Valid drop: placed blocks settle into the anchored board.
   if(!low)for(let i=0;i<SIZE*SIZE;i++)if(!before[i]&&r.filled[i]&&!removed.has(i)){const svg=cells[i].querySelector('svg');if(svg)motion(svg,[{transform:'scale(.9)'},{transform:'scale(1)'}],{duration:90,fill:'none'},()=>{});}
   // Removed cells live only in the effects layer; the board already holds the committed result.
   for(const i of r.cleared){
    const shard=document.createElement('span');shard.className='cb-shard';shard.setAttribute('style',at(i));shard.innerHTML=blockSvg(r.filled[i]);effects.append(shard);
    motion(shard,low?[{opacity:1},{opacity:0}]:[{opacity:1,transform:'scale(1)'},{opacity:0,transform:'scale(.6)'}],{duration:low?140:sweep+90},()=>shard.remove());
   }
   let n=0;
   for(let i=0;i<SIZE;i++)for(const axis of ['row','col'] as const){
    if(!Array.from({length:SIZE},(_,j)=>axis==='row'?i*SIZE+j:j*SIZE+i).every(c=>removed.has(c)))continue;
    // Cross-clears sweep in alternating directions so gradients do not collide.
    const forward=n++%2===0,band=document.createElement('span');band.className=`cb-sweep cb-sweep-${axis}${r.rainbow?' cb-rainbow':''}`;
    band.style[axis==='row'?'top':'left']=`${i*12.5}%`;band.style.transformOrigin=axis==='row'?(forward?'left center':'right center'):(forward?'center top':'center bottom');effects.append(band);
    const s=axis==='row'?'scaleX':'scaleY';
    motion(band,low?[{opacity:0},{opacity:.8},{opacity:0}]:[{opacity:1,transform:`${s}(.05)`},{opacity:1,transform:`${s}(1)`,offset:.6},{opacity:0,transform:`${s}(1)`}],{duration:low?140:sweep+120},()=>band.remove());
    // Small bounded particle tail; cosmetic randomness never touches the game RNG.
    if(!low)for(let k=0;k<4&&effects.querySelectorAll('.cb-spark').length<24;k++){
     const spark=document.createElement('span');spark.className='cb-spark';const along=Math.random()*100,mid=(i+.5)*12.5;
     spark.style.left=`${axis==='row'?along:mid}%`;spark.style.top=`${axis==='row'?mid:along}%`;spark.style.background=r.rainbow?`hsl(${Math.random()*360} 95% 70%)`:'';effects.append(spark);
     const angle=Math.random()*Math.PI*2,dist=10+Math.random()*22;
     motion(spark,[{opacity:1,transform:'translate(-50%,-50%)'},{opacity:0,transform:`translate(calc(-50% + ${Math.cos(angle)*dist}px),calc(-50% + ${Math.sin(angle)*dist}px))`}],{duration:300+Math.random()*150},()=>spark.remove());
    }
   }
   if(label){
    effects.querySelector('.cb-label')?.remove();
    const el=document.createElement('div');el.className=`cb-label${label.big?' cb-label-big':''}${r.rainbow?' cb-rainbow-text':''}`;
    el.innerHTML=`<strong></strong><small></small>`;el.querySelector('strong')!.textContent=label.primary;el.querySelector('small')!.textContent=label.secondary;effects.append(el);
    motion(el,low?[{opacity:0},{opacity:1,offset:.15},{opacity:1,offset:.75},{opacity:0}]:[{opacity:0,transform:'translate(-50%,-50%) scale(.94)'},{opacity:1,transform:'translate(-50%,-50%) scale(1)',offset:.2},{opacity:1,transform:'translate(-50%,-50%) scale(1)',offset:.75},{opacity:0,transform:'translate(-50%,-62%) scale(1)'}],{duration:label.big?650:500},()=>el.remove());
   }else{
    // Every move: a quiet points confirmation by the placed piece.
    const first=r.filled.findIndex((v,i)=>v&&!before[i]),pop=document.createElement('span');pop.className='cb-score-pop';pop.textContent=`+${r.gained}`;pop.setAttribute('style',at(first));effects.append(pop);
    motion(pop,low?[{opacity:1},{opacity:0}]:[{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(-14px)'}],{duration:280},()=>pop.remove());
   }
   if(newBest)motion(bestBadge,low?[{opacity:.4},{opacity:1}]:[{transform:'scale(.92)',opacity:.4},{transform:'scale(1)',opacity:1}],{duration:300,fill:'none'},()=>{});
  }
  function mapPointer(e:PointerEvent){
   if(!drag)return false;
   // setViewportSize can update the window before the resize event is delivered.
   if(window.innerWidth!==drag.viewW||window.innerHeight!==drag.viewH){cancel();draw();return false;}
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
  /** Cancels only the gesture. A fading celebration keeps playing over the committed board. */
  function cancel(){
   const id=drag?.id;drag=null;selected=null;preview=false;ignoreClick=true;hideFloating();if(id!==undefined)releaseCapture(id);
  }
  function returnToTray(slot:number){
   const art=slots[slot].querySelector('svg');if(!art||reduced()){hideFloating();return;}
   const target=art.getBoundingClientRect(),current=floating.getBoundingClientRect();
   floatAnimation=floating.animate([{transform:floating.style.transform,opacity:1},{transform:`translate(${target.left}px,${target.top}px) scale(${target.width/current.width})`,opacity:.25}],{duration:180,easing:EASE_OUT,fill:'forwards'});
   floatAnimation.onfinish=()=>hideFloating();
  }
  function restartRun(){cancel();clearEffects();best=Math.max(best,state.score);bestShown=false;lastBreakdown='';state=freshGame();selected=null;cursor={x:0,y:0};feedback.textContent='';draw();context.save(state);board.focus({preventScroll:true});}
  root.addEventListener('pointerdown',e=>{
   if(!active()||drag||e.button!==0||!e.isPrimary)return;
   const button=(e.target as Element).closest<HTMLElement>('[data-slot]');if(!button)return;
   const slot=Number(button.dataset.slot),p=state.tray[slot];if(p===null)return;
   hideFloating();ignoreClick=false;
   const art=button.querySelector('svg')!,anchor=grabCell(p,art.getBoundingClientRect(),{x:e.clientX,y:e.clientY});
   choose(slot);drag={id:e.pointerId,slot,anchor,start:{x:e.clientX,y:e.clientY},pointer:{x:e.clientX,y:e.clientY},pointerType:e.pointerType,moved:false,bounds:board.getBoundingClientRect(),viewW:window.innerWidth,viewH:window.innerHeight};
   floating.setAttribute('viewBox',art.getAttribute('viewBox')!);floating.innerHTML=art.innerHTML;
   root.setPointerCapture(e.pointerId);mapPointer(e);draw();e.preventDefault();
  },{signal});
  root.addEventListener('pointermove',e=>{
   if(!active()||selected===null)return;
   if(drag){if(e.pointerId!==drag.id)return;
    if(Math.hypot(e.clientX-drag.start.x,e.clientY-drag.start.y)>5)drag.moved=true;
    if(!mapPointer(e))return;
   }else{
    const r=board.getBoundingClientRect();cursor={x:Math.floor((e.clientX-r.left)/r.width*SIZE),y:Math.floor((e.clientY-r.top)/r.height*SIZE)};preview=cursor.x>=0&&cursor.x<SIZE&&cursor.y>=0&&cursor.y<SIZE;
   }
   draw();
  },{signal});
  root.addEventListener('pointerup',e=>{
   if(!drag||e.pointerId!==drag.id)return;
   if(!mapPointer(e))return;const d=drag!;drag=null;ignoreClick=d.moved;
   const placed=d.moved&&active()&&commit();preview=false;
   releaseCapture(e.pointerId);draw();
   if(placed||!d.moved)hideFloating();else returnToTray(d.slot);
  },{signal});
  root.addEventListener('pointercancel',e=>{if(e.pointerId===drag?.id){cancel();draw();}},{signal});
  root.addEventListener('lostpointercapture',e=>{if(e.pointerId===drag?.id){cancel();draw();}},{signal});
  root.addEventListener('pointerleave',()=>{if(!drag){preview=false;draw();}},{signal});
  root.addEventListener('click',e=>{
   if((e.target as Element).closest('.cb-again')){restartRun();return;}
   if(ignoreClick&&(e as MouseEvent).detail!==0){ignoreClick=false;return;}
   if(!active())return;const target=e.target as Element;
   const cell=target.closest<HTMLElement>('[data-cell]');if(cell&&selected!==null){const i=Number(cell.dataset.cell);cursor={x:i%SIZE,y:Math.floor(i/SIZE)};preview=true;commit((e as MouseEvent).detail!==0);draw();}
   const slot=target.closest<HTMLElement>('[data-slot]');if(slot&&(e as MouseEvent).detail===0)choose(Number(slot.dataset.slot));
  },{signal});
  container.addEventListener('keydown',e=>{
   if(e.key==='Escape'){cancel();draw();return;}
   if(!active()||e.altKey||e.ctrlKey||e.metaKey||drag)return;
   if(['1','2','3'].includes(e.key)){e.preventDefault();if(e.repeat)return;choose(Number(e.key)-1);preview=true;draw();board.focus();return;}
   if(selected===null)return;
   const steps:Record<string,[number,number]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
   if(steps[e.key]){e.preventDefault();const [x,y]=steps[e.key];cursor={x:Math.max(0,Math.min(SIZE-1,cursor.x+x)),y:Math.max(0,Math.min(SIZE-1,cursor.y+y))};preview=true;draw();}
   else if((e.key==='Enter'||e.key===' ')&&!(e.target as Element).closest('[data-slot]')){e.preventDefault();if(e.repeat)return;preview=true;commit(false);draw();}
  },{signal});
  window.addEventListener('blur',()=>{cancel();draw();},{signal});
  window.addEventListener('resize',()=>{cancel();draw();},{signal});
  let lastWidth=board.getBoundingClientRect().width,lastHeight=root.getBoundingClientRect().height;
  const resize=new ResizeObserver(()=>{const width=board.getBoundingClientRect().width,height=root.getBoundingClientRect().height;if(width!==lastWidth||height!==lastHeight){lastWidth=width;lastHeight=height;cancel();draw();}});resize.observe(board);resize.observe(root);
  // Grid owns keyboard focus while aiming; cells expose precise accessible labels.
  board.tabIndex=0;
  draw();
  return {pause(){paused=true;cancel();clearEffects();draw();},resume(){paused=false;draw();},restart(){restartRun();},serialize(){return structuredClone(state);},restore(data){const restored=restoreGame(data);if(!restored)return;cancel();clearEffects();state=restored;selected=null;lastBreakdown='';feedback.textContent='';draw();},dispose(){disposed=true;cancel();clearEffects();resize.disconnect();abort.abort();root.remove();}};
 }
};
export default module;
