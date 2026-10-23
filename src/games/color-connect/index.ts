import type { GameModule, GameContext } from '../../core/types';
import { LEVELS, copyPaths, emptyPaths, endpoint, connected, begin, extend, isWon, hint, traverse, restoreSnapshot, recordWin, campaignScore } from './model';
import type { Paths, Point, Snapshot } from './model';
import './style.css';

const palette = [
  {name:'coral',color:'#ff616e',light:'#ffb5b5',dark:'#bc314b',shape:'circle',letter:'A',dash:'2 12'},
  {name:'gold',color:'#ffca48',light:'#fff1a4',dark:'#c47b18',shape:'diamond',letter:'B',dash:'13 7'},
  {name:'aqua',color:'#38d6d7',light:'#b8ffff',dark:'#11878d',shape:'square',letter:'C',dash:'4 5'},
  {name:'violet',color:'#b08aff',light:'#e7cfff',dark:'#704ab5',shape:'triangle',letter:'D',dash:'16 6 2 6'},
  {name:'lime',color:'#9cde5b',light:'#e3ffb7',dark:'#538b2f',shape:'pentagon',letter:'E',dash:'2 6 2 12'},
  {name:'rose',color:'#fa8dd3',light:'#ffdcf3',dark:'#b34691',shape:'star',letter:'F',dash:'22 8'},
  {name:'sky',color:'#6da9ff',light:'#c8e5ff',dark:'#3568be',shape:'hexagon',letter:'G',dash:'5 12'},
];
const icons = { undo:'<path d="M9 5 3 11l6 6M3 11h10a7 7 0 0 1 0 14" transform="translate(2 -3) scale(.85)"/>', hint:'<path d="M9 19h6m-6 3h6M8 14a7 7 0 1 1 8 0c-1 1-1 2-1 3H9c0-1 0-2-1-3Z"/>', erase:'<path d="m4 14 9-10a2 2 0 0 1 3 0l5 5a2 2 0 0 1 0 3l-9 10H9Zm5-5 9 9M12 22h10"/>' };
const icon = (name:keyof typeof icons) => `<svg viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
function shape(color:number,x:number,y:number):string {
 const radius=31, polygon=(sides:number,rotation:number) => Array.from({length:sides},(_,i)=>`${x+Math.cos(rotation+i*Math.PI*2/sides)*radius},${y+Math.sin(rotation+i*Math.PI*2/sides)*radius}`).join(' ');
 if(color===0)return `<circle cx="${x}" cy="${y}" r="31"/>`;
 if(color===1)return `<polygon points="${polygon(4,-Math.PI/2)}"/>`;
 if(color===2)return `<rect x="${x-28}" y="${y-28}" width="56" height="56" rx="10"/>`;
 if(color===3)return `<polygon points="${polygon(3,-Math.PI/2)}" stroke-linejoin="round"/>`;
 if(color===5)return `<polygon points="${Array.from({length:10},(_,i)=>`${x+Math.cos(-Math.PI/2+i*Math.PI/5)*(i%2?22:34)},${y+Math.sin(-Math.PI/2+i*Math.PI/5)*(i%2?22:34)}`).join(' ')}" stroke-linejoin="round"/>`;
 return `<polygon points="${polygon(color===4?5:6,-Math.PI/2)}" stroke-linejoin="round"/>`;
}

let instanceSequence=0;
const game: GameModule = {
 id:'color-connect', title:'Color Connect', cover:'game-art/color-connect/cover.svg',
 rules:'Connect every pair of matching letters and shapes by drawing through neighbouring cells. Move only up, down, left or right. Paths cannot cross, share cells or enter another pair’s endpoint. To win, connect ALL pairs AND fill the ENTIRE board. Drag from a peg to redraw its colour, or grab a trail to trim it. Undo reverses a gesture. Erase selected removes its trail. Hint checks the current board: it adds one safe step or explains when you must backtrack. Keyboard: Tab into the board, arrows to move, Space or Enter to start/stop drawing, arrows to draw, Backspace to trim, Delete to erase. Thirty-two puzzles grow from 4×4 to 9×9.',
 mount(container:HTMLElement, context:GameContext) {
  const abort = new AbortController(), signal=abort.signal, svgPrefix=`cc-${++instanceSequence}`;
  let state:Snapshot={version:1,level:0,paths:emptyPaths(LEVELS[0]),completed:[],moves:0,history:[],assists:0,best:{}};
  let paused=false,disposed=false,selected=-1,active=-1,focusCell=0,pointerId:number|null=null,lastPoint:Point|null=null,gesture:Paths|null=null,keyboardDrawing=false;
  let feedback='Start at any matching peg. Fill every cell.';
  const root=document.createElement('section');root.className='cc-game';
  root.innerHTML=`<div class="cc-heading"><div><span class="cc-eyebrow">THREAD THE COLOURS</span><h2 class="cc-puzzle-name"></h2></div><label class="cc-picker-label"><span class="sr-only">Choose puzzle</span><select class="game-select cc-picker" aria-label="Choose puzzle"></select></label></div><div class="cc-stats"><span class="cc-progress"></span><span class="cc-pairs"></span><span class="cc-moves"></span></div><div class="cc-frame"><div class="cc-playfield"><svg class="cc-art" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"></svg><div class="cc-grid" role="grid" aria-label="Color Connect board" aria-describedby="${svgPrefix}-help"></div></div></div><div class="cc-legend" aria-label="Pair legend"></div><div class="cc-actions"><button type="button" class="game-button secondary cc-undo">${icon('undo')}<span>Undo</span></button><button type="button" class="game-button cc-hint">${icon('hint')}<span>Hint</span></button><button type="button" class="game-button secondary cc-erase" aria-label="Erase selected">${icon('erase')}<span>Erase</span></button></div><p class="cc-feedback" role="status"></p><div class="cc-win" hidden><strong>Beautifully connected!</strong><span>Every pair. Every cell.</span><button type="button" class="game-button cc-next">Next puzzle</button></div><p id="${svgPrefix}-help" class="cc-help">Drag from a peg • Cover the whole board<br>Keyboard: arrows to move, Space to draw, Delete to erase.</p>`;
  container.append(root);
  const find=<T extends Element>(selector:string)=>root.querySelector<T>(selector)!;
  const grid=find<HTMLElement>('.cc-grid'), art=find<SVGSVGElement>('.cc-art'), picker=find<HTMLSelectElement>('.cc-picker');
  const undo=find<HTMLButtonElement>('.cc-undo'),hintButton=find<HTMLButtonElement>('.cc-hint'),erase=find<HTMLButtonElement>('.cc-erase'),next=find<HTMLButtonElement>('.cc-next');
  LEVELS.forEach((level,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=`${i+1} / ${LEVELS.length} · ${level.size}×${level.size}`;picker.append(option)});
  let buttons:HTMLButtonElement[]=[];
  const level=()=>LEVELS[state.level];
  function snapshot():Snapshot {
   const saved:Snapshot={...state,paths:copyPaths(state.paths),completed:[...state.completed],history:state.history.map(copyPaths),best:{...state.best}};
   // Autosave/pagehide may run while a pointer is still held. Project the entire
   // pending gesture transaction without ending the gesture or mutating live state.
   if(gesture&&JSON.stringify(gesture)!==JSON.stringify(state.paths)){
    saved.history.push(copyPaths(gesture));if(saved.history.length>100)saved.history.shift();saved.moves++;recordWin(saved);
   }
   return saved;
  }
  function say(message:string){feedback=message;context.announce(message)}
  function save(){if(!disposed)context.save(snapshot())}
  function rebuild(){
   const current=level();picker.value=String(state.level);grid.replaceChildren();buttons=[];
   grid.style.gridTemplateColumns=`repeat(${current.size},1fr)`;grid.setAttribute('aria-rowcount',String(current.size));grid.setAttribute('aria-colcount',String(current.size));
   for(let y=0;y<current.size;y++){
    const row=document.createElement('div');row.setAttribute('role','row');row.className='cc-row';grid.append(row);
    for(let x=0;x<current.size;x++){
     const cell=y*current.size+x,button=document.createElement('button');button.type='button';button.className='cc-cell';button.dataset.ccCell=String(cell);button.setAttribute('role','gridcell');button.setAttribute('aria-rowindex',String(y+1));button.setAttribute('aria-colindex',String(x+1));row.append(button);buttons.push(button);
    }
   }
   focusCell=Math.min(focusCell,current.size*current.size-1);render();
  }
  function render(){
   if(disposed)return;
   const current=level(),n=current.size,won=isWon(current,state.paths),pairs=state.paths.filter((path,color)=>connected(current,path,color)).length;
   const used=new Set(current.pairs.flat());state.paths.flat().forEach(cell=>used.add(cell));
   const percent=Math.round(used.size/(n*n)*100);
   find<HTMLElement>('.cc-puzzle-name').textContent=current.name;
   find<HTMLElement>('.cc-progress').textContent=`${percent}% covered`;
   find<HTMLElement>('.cc-pairs').textContent=`${pairs} / ${current.pairs.length} pairs`;
   find<HTMLElement>('.cc-moves').textContent=`${state.moves} moves`;
   context.setLevel(`${state.level+1} / ${LEVELS.length} · ${n}×${n}`);context.setScore(campaignScore(state.best));
   context.setStatus(won?'All pairs connected · Board completely filled':`${pairs} of ${current.pairs.length} pairs · ${percent}% covered`);
   find<HTMLElement>('.cc-feedback').textContent=feedback;
   find<HTMLElement>('.cc-win').hidden=!won;
   next.textContent=state.level===LEVELS.length-1?'Play first puzzle':'Next puzzle';
   undo.disabled=paused||!state.history.length;hintButton.disabled=paused||won;erase.disabled=paused||selected<0||!state.paths[selected]?.length;picker.disabled=paused;next.disabled=paused;
   root.dataset.paused=String(paused);grid.setAttribute('aria-disabled',String(paused));
   buttons.forEach((button,cell)=>{
    const peg=endpoint(current,cell),trail=state.paths.findIndex(path=>path.includes(cell)),color=peg===-1?trail:peg;
    button.tabIndex=cell===focusCell?0:-1;button.disabled=paused;
    button.classList.toggle('cc-selected',cell===focusCell&&keyboardDrawing);
    if(trail===-1)delete button.dataset.path;else button.dataset.path=palette[trail].letter;
    button.setAttribute('aria-label',`Row ${Math.floor(cell/n)+1}, column ${cell%n+1}: ${color<0?'empty':`${palette[color].letter} ${palette[color].name} ${palette[color].shape} ${peg===-1?'trail':'endpoint'}`}`);
    button.setAttribute('aria-selected',String(color!==-1&&color===selected));
   });
   const point=(cell:number)=>`${cell%n*100+50},${Math.floor(cell/n)*100+50}`;
   let drawing=`<defs><linearGradient id="cc-well" x2="0" y2="1"><stop stop-color="#0d203a"/><stop offset="1" stop-color="#1c3451"/></linearGradient><radialGradient id="cc-field" cx=".4" cy="0" r="1"><stop stop-color="#304560"/><stop offset="1" stop-color="#101c33"/></radialGradient>`;
   palette.forEach((p,i)=>drawing+=`<linearGradient id="cc-peg-${i}" x1="0" y1="0" x2=".35" y2="1"><stop stop-color="${p.light}"/><stop offset=".45" stop-color="${p.color}"/><stop offset="1" stop-color="${p.dark}"/></linearGradient>`);
   drawing+=`</defs><rect width="${n*100}" height="${n*100}" rx="15" fill="url(#cc-field)"/>`;
   for(let cell=0;cell<n*n;cell++){const x=cell%n*100,y=Math.floor(cell/n)*100;drawing+=`<rect x="${x+3}" y="${y+4}" width="94" height="94" rx="13" fill="url(#cc-well)" stroke="#40516a" stroke-opacity=".55" stroke-width="1.5"/><circle cx="${x+50}" cy="${y+50}" r="3" fill="#40516a"/>`;}
   state.paths.forEach((path,color)=>{
    if(path.length<2)return;
    const points=path.map(point).join(' '),p=palette[color];
    drawing+=`<polyline points="${points}" fill="none" stroke="#071121" stroke-width="43" stroke-linecap="round" stroke-linejoin="round" transform="translate(0 5)"/><polyline points="${points}" fill="none" stroke="${p.dark}" stroke-width="39" stroke-linecap="round" stroke-linejoin="round"/><polyline points="${points}" fill="none" stroke="${p.color}" stroke-width="29" stroke-linecap="round" stroke-linejoin="round"/><polyline points="${points}" fill="none" stroke="${p.light}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" stroke-opacity=".55" transform="translate(0 -5)"/><polyline points="${points}" fill="none" stroke="#102039" stroke-opacity=".48" stroke-width="3" stroke-dasharray="${p.dash}" stroke-linecap="round"/>`;
   });
   current.pairs.forEach((pair,color)=>pair.forEach(cell=>{
    const x=cell%n*100+50,y=Math.floor(cell/n)*100+50,p=palette[color];
    drawing+=`<g transform="translate(0 5)" fill="#060d1c" opacity=".65">${shape(color,x,y)}</g><g fill="url(#cc-peg-${color})" stroke="#07172b" stroke-width="5">${shape(color,x,y)}</g><path d="M${x-12} ${y-17}q10-9 22-3" fill="none" stroke="white" stroke-width="5" opacity=".6" stroke-linecap="round"/><text x="${x}" y="${y+9}" text-anchor="middle" fill="#10213a" font-family="system-ui,sans-serif" font-weight="900" font-size="25">${p.letter}</text>`;
    if(connected(current,state.paths[color],color))drawing+=`<circle cx="${x+24}" cy="${y-24}" r="10" fill="#f2ffe7" stroke="#10213a" stroke-width="2"/><path d="m${x+19} ${y-24} 4 4 7-8" fill="none" stroke="#20633c" stroke-width="3"/>`;
   }));
   art.setAttribute('viewBox',`0 0 ${n*100} ${n*100}`);art.innerHTML=drawing.replaceAll('id="cc-',`id="${svgPrefix}-`).replaceAll('url(#cc-',`url(#${svgPrefix}-`);
   find<HTMLElement>('.cc-legend').innerHTML=current.pairs.map((_,i)=>`<span class="${selected===i?'cc-legend-selected':''}" style="--cc-color:${palette[i].color}"><b>${palette[i].letter}</b>${palette[i].shape}</span>`).join('');
  }
  function record(before:Paths){
   if(JSON.stringify(before)===JSON.stringify(state.paths))return;
   state.history.push(copyPaths(before));if(state.history.length>100)state.history.shift();state.moves++;
   if(isWon(level(),state.paths)){
    recordWin(state);
    say(state.completed.length===LEVELS.length?'All puzzles complete. A perfect tapestry!':'Beautifully connected! Every cell is filled.');context.sound('success');
   }else{
    if(feedback.startsWith('Drawing ')){
     const allPairs=state.paths.every((path,color)=>connected(level(),path,color));
     feedback=allPairs?'Pairs connected, but empty cells remain. Redraw longer trails to fill them.':selected>=0&&connected(level(),state.paths[selected],selected)?`${palette[selected].letter} connected. Keep filling the board.`:'Path saved. Continue from its tip or redraw a peg.';
    }
    context.sound('tap');
   }
   render();save();
  }
  function finish(){
   const focusWasInGrid=grid.contains(document.activeElement);
   if(pointerId!==null){try{grid.releasePointerCapture(pointerId)}catch{/* capture may already be released */}}
   pointerId=null;lastPoint=null;active=-1;keyboardDrawing=false;
   const before=gesture;gesture=null;if(before)record(before);else render();
   // Pointer traversal updates the roving origin; keep actual focus in sync,
   // but never pull focus back from a toolbar, picker or dialog.
   if(focusWasInGrid)buttons[focusCell]?.focus({preventScroll:true});
  }
  function start(cell:number){
   if(paused||disposed)return false;
   const result=begin(level(),state.paths,cell);if(result.color<0)return false;
   gesture=copyPaths(state.paths);state.paths=result.paths;active=selected=result.color;focusCell=cell;
   feedback=`Drawing ${palette[selected].letter} · ${palette[selected].shape}.`;render();return true;
  }
  function move(cell:number){
   if(paused||active<0)return;
   const nextPaths=extend(level(),state.paths,active,cell);
   if(nextPaths!==state.paths){state.paths=nextPaths;focusCell=cell;render()}
  }
  function logical(event:PointerEvent):Point{const rect=grid.getBoundingClientRect(),n=level().size;return {x:(event.clientX-rect.left)/rect.width*n,y:(event.clientY-rect.top)/rect.height*n}}
  function pointerMove(event:PointerEvent){
   if(paused||pointerId!==event.pointerId||!lastPoint)return;
   event.preventDefault();
   const samples=event.getCoalescedEvents?.()||[];
   for(const sample of samples.length?samples:[event]){const point=logical(sample);for(const cell of traverse(lastPoint,point,level().size).slice(1))move(cell);lastPoint=point}
  }
  grid.addEventListener('pointerdown',event=>{
   if(paused||pointerId!==null||!event.isPrimary||event.button!==0)return;
   if(keyboardDrawing)finish();const point=logical(event),n=level().size;
   const cell=Math.floor(point.y)*n+Math.floor(point.x);
   if(point.x<0||point.y<0||point.x>=n||point.y>=n||!start(cell))return;
   event.preventDefault();pointerId=event.pointerId;lastPoint=point;grid.setPointerCapture(pointerId);buttons[cell].focus({preventScroll:true});
  },{signal});
  grid.addEventListener('pointermove',pointerMove,{signal});
  grid.addEventListener('pointerup',event=>{if(pointerId===event.pointerId){pointerMove(event);finish()}},{signal});
  grid.addEventListener('pointercancel',()=>finish(),{signal});
  grid.addEventListener('lostpointercapture',()=>{if(pointerId!==null)finish()},{signal});
  grid.addEventListener('focusin',event=>{const cell=(event.target as HTMLElement).dataset.ccCell;if(cell!==undefined){focusCell=Number(cell);buttons.forEach((button,i)=>button.tabIndex=i===focusCell?0:-1)}},{signal});
  grid.addEventListener('keydown',event=>{
   if(paused||event.altKey||event.ctrlKey||event.metaKey||pointerId!==null)return;
   const n=level().size,row=Math.floor(focusCell/n),col=focusCell%n;
   const deltas:Record<string,number>={ArrowUp:row>0?-n:0,ArrowDown:row<n-1?n:0,ArrowLeft:col>0?-1:0,ArrowRight:col<n-1?1:0};
   if(event.key in deltas){event.preventDefault();const target=focusCell+deltas[event.key];if(keyboardDrawing){move(target);if(focusCell!==target){say('That cell is blocked. Choose another direction.');render();return}}else focusCell=target;buttons[focusCell].focus({preventScroll:true});render();return}
   if(event.key===' '||event.key==='Enter'){event.preventDefault();if(keyboardDrawing)finish();else if(start(focusCell)){keyboardDrawing=true;render()}return}
   if(event.key==='Backspace'&&keyboardDrawing&&active>=0){event.preventDefault();const path=state.paths[active];if(path.length>1){state.paths=copyPaths(state.paths);state.paths[active].pop();focusCell=state.paths[active].at(-1)!;buttons[focusCell].focus({preventScroll:true});render()}return}
   if(event.key==='Delete'){event.preventDefault();if(keyboardDrawing)finish();const color=endpoint(level(),focusCell);selected=color<0?state.paths.findIndex(path=>path.includes(focusCell)):color;eraseSelected()}
  },{signal});
  grid.addEventListener('focusout',event=>{if(keyboardDrawing&&!grid.contains(event.relatedTarget as Node|null))finish()},{signal});
  function eraseSelected(){if(paused||selected<0)return;finish();const before=copyPaths(state.paths);state.paths[selected]=[];say(`Erased ${palette[selected].letter}.`);record(before)}
  erase.addEventListener('click',eraseSelected,{signal});
  undo.addEventListener('click',()=>{if(paused)return;finish();const previous=state.history.pop();if(!previous)return;state.paths=previous;state.moves=Math.max(0,state.moves-1);state.assists++;say('Last gesture undone.');render();save()},{signal});
  hintButton.addEventListener('click',()=>{
   if(paused)return;finish();const result=hint(level(),state.paths);if(result.kind!=='complete')state.assists++;
   if(result.kind==='step'){const before=copyPaths(state.paths);state.paths=result.paths;selected=result.color;focusCell=result.cell;say(`Hint: extend ${palette[result.color].letter} to row ${Math.floor(result.cell/level().size)+1}, column ${result.cell%level().size+1}.`);record(before)}
   else if(result.kind==='backtrack'){if(result.color===undefined)say('This layout cannot fill the board. At least one path must be shortened or erased.');else{selected=result.color;say(`A backtrack is needed. Erase or redraw ${palette[result.color].letter}; clearing it makes a complete solution possible.`)}render()}
   else if(result.kind==='limit'){say('This layout needs a longer search. No safe hint found yet; try shortening a path.');render()}
  },{signal});
  function changePuzzle(index:number){if(paused)return;finish();state.level=index;state.paths=emptyPaths(level());state.history=[];state.moves=state.assists=0;active=selected=-1;focusCell=0;say('New puzzle. Connect every pair and fill every cell.');rebuild();save()}
  picker.addEventListener('change',()=>changePuzzle(Number(picker.value)),{signal});
  next.addEventListener('click',()=>{if(!paused&&isWon(level(),state.paths))changePuzzle((state.level+1)%LEVELS.length)},{signal});
  rebuild();
  return {
   pause(){if(disposed)return;finish();paused=true;render()},
   resume(){if(disposed)return;paused=false;render()},
   // Restart replays the current puzzle; completed and best are campaign progress.
   restart(){if(disposed)return;finish();state={...state,paths:emptyPaths(level()),moves:0,history:[],assists:0};selected=active=-1;focusCell=0;say('Fresh start. Connect every pair and fill every cell.');rebuild();save()},
   serialize(){return snapshot()},
   restore(data:unknown){if(disposed)return;const restored=restoreSnapshot(data);if(!restored)return;finish();state=restored;selected=active=-1;focusCell=0;feedback='Saved puzzle restored.';rebuild()},
   dispose(){if(disposed)return;finish();disposed=true;abort.abort();root.remove()},
  };
 }
};
export default game;
