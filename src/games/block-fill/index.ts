import type { GameModule } from '../../core/types';
import { generateLevel, initialState, step, undo, solved, hint, restoreState, sampleSegment, recordWin, campaignScore, LEVEL_COUNT, type Point } from './logic';
import './style.css';

const game:GameModule={
  id:'block-fill',title:'Block Fill',cover:'game-art/block-fill/cover.svg',
  rules:'Trace one unbroken path from START through every open square exactly once. Move only up, down, left or right: no diagonals, jumps, loops or crossings. Dark crosshatched squares are walls. Drag from the trail head or tap an adjacent square. Trace back one square to undo, or use Undo. With the board focused, use arrow keys to extend, Backspace to undo, H for a hint and Home to reset. Hints search your current trail; if it cannot finish, they tell you how far to backtrack. Cover every square to open the next garden.',
  mount(container,context){
    let state=initialState(), paused=false, disposed=false, selected:number|undefined, recovery=0;
    let activePointer:number|undefined, previous:Point|undefined;
    const abort=new AbortController(), options={signal:abort.signal};
    const root=document.createElement('section');root.className='bf-game';
    root.innerHTML=`<div class="bf-heading"><div><span class="bf-kicker">ONE GOLDEN TRAIL</span><h2>Fill the garden</h2></div><div class="bf-counter" aria-live="polite"></div></div><div class="bf-board-wrap"><svg class="bf-board" xmlns="http://www.w3.org/2000/svg" tabindex="0" role="img" aria-label="Block Fill board. Use arrow keys to trace, Backspace to undo, H for hint."></svg></div><div class="bf-message" role="status"></div><div class="bf-actions"><button class="game-button secondary" data-action="undo">Undo</button><button class="game-button" data-action="hint">Hint</button><button class="game-button secondary" data-action="reset">Reset path</button></div><button class="game-button bf-next" hidden>Next garden <span aria-hidden="true">→</span></button><p class="bf-help">Drag the head • tap a neighbour • arrow keys<br>Every square, exactly once.</p>`;
    container.append(root);
    const board=root.querySelector<SVGSVGElement>('.bf-board')!,message=root.querySelector<HTMLElement>('.bf-message')!,next=root.querySelector<HTMLButtonElement>('.bf-next')!;
    const buttons=Array.from(root.querySelectorAll<HTMLButtonElement>('button'));
    function snapshot(){return {version:1,level:state.level,path:[...state.path],rewarded:state.rewarded,steps:state.steps,hints:state.hints,best:{...state.best}};}
    function stopPointer(){
      if(activePointer!==undefined&&board.hasPointerCapture(activePointer)) board.releasePointerCapture(activePointer);
      activePointer=undefined;previous=undefined;
    }
    function render(note?:string){
      const level=generateLevel(state.level),complete=solved(level,state.path),size=level.size*64+24,head=state.path.at(-1)!;
      const xy=(c:number)=>`${12+(c%level.size)*64+32},${12+Math.floor(c/level.size)*64+32}`;
      const trail=state.path.map(xy).join(' ');
      board.setAttribute('viewBox',`0 0 ${size} ${size}`);
      board.setAttribute('aria-label',`Block Fill board, garden ${state.level+1}. ${state.path.length} of ${level.cells.length} covered. Head row ${Math.floor(head/level.size)+1}, column ${head%level.size+1}. Arrow keys trace, Backspace undoes, H hints.`);
      board.dataset.covered=String(state.path.length);board.dataset.total=String(level.cells.length);board.dataset.level=String(state.level+1);
      board.innerHTML=`<defs><linearGradient id="bf-gold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff4ad"/><stop offset=".5" stop-color="#ffc83e"/><stop offset="1" stop-color="#f5a81f"/></linearGradient><pattern id="bf-wall" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="9" height="9" fill="#143b3a"/><path d="M0 0V9" stroke="#2c5551" stroke-width="3"/></pattern></defs>${Array.from({length:level.size**2},(_,c)=>{
        const x=12+c%level.size*64,y=12+Math.floor(c/level.size)*64,index=state.path.indexOf(c),open=level.cells.includes(c);
        return `<g data-cell="${c}" aria-label="Row ${Math.floor(c/level.size)+1} column ${c%level.size+1}${open?index>=0?', covered '+(index+1):', open':', wall'}"><rect x="${x+4}" y="${y+7}" width="56" height="56" rx="13" fill="#082e2d"/><rect x="${x+4}" y="${y+3}" width="56" height="56" rx="13" fill="${open?index>=0?'#b18b35':'#316b60':'url(#bf-wall)'}" stroke="${open?'#4d8b75':'#173f3b'}" stroke-width="2"/></g>`;
      }).join('')}<polyline points="${trail}" fill="none" stroke="#765514" stroke-width="31" stroke-linejoin="round" stroke-linecap="round" transform="translate(0 3)"/><polyline points="${trail}" fill="none" stroke="url(#bf-gold)" stroke-width="26" stroke-linejoin="round" stroke-linecap="round"/><polyline points="${trail}" fill="none" stroke="#fff5bc" stroke-opacity=".6" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>${state.path.map((c,i)=>{const [x,y]=xy(c).split(',');return `<circle cx="${x}" cy="${y}" r="${c===head?21:i===0?18:12}" fill="${c===head?'#fff6c9':'#f6c346'}" stroke="#805721" stroke-width="${c===head?3:1}"/><text x="${x}" y="${Number(y)+5}" text-anchor="middle" fill="#3b361d" font-family="system-ui,sans-serif" font-weight="900" font-size="${c===head?16:13}">${i===0?'S':i+1}</text>`;}).join('')}${selected!==undefined?`<rect x="${16+selected%level.size*64}" y="${15+Math.floor(selected/level.size)*64}" width="56" height="56" rx="13" fill="none" stroke="#fff9d5" stroke-width="4" stroke-dasharray="6 4"/><text x="${44+selected%level.size*64}" y="${50+Math.floor(selected/level.size)*64}" text-anchor="middle" fill="#fff9d5" font-size="21" font-weight="900">★</text>`:''}`;
      root.querySelector('.bf-counter')!.innerHTML=`<strong>${state.path.length}<small> / ${level.cells.length}</small></strong><span>SQUARES COVERED</span>`;
      const text=note??(complete?(state.level===LEVEL_COUNT-1?'All gardens filled. Beautifully traced!':'Garden complete! Every square has its place.'):'Start at S. The pale circle is your trail head.');
      message.textContent=text;
      next.hidden=!complete||state.level===LEVEL_COUNT-1;
      context.setLevel(`Garden ${state.level+1} / ${LEVEL_COUNT}`);context.setScore(campaignScore(state.best));context.setStatus(complete?'Trail complete':`${state.path.length} / ${level.cells.length} squares covered`);
      for(const button of buttons) button.disabled=paused;
      root.querySelector<HTMLButtonElement>('[data-action="undo"]')!.disabled=paused||state.path.length<2;
      root.dataset.reducedMotion=String(context.settings.reducedMotion);root.classList.toggle('bf-complete',complete);
    }
    function update(path:number[],note?:string){
      if(path===state.path) return;
      const wasComplete=solved(generateLevel(state.level),state.path);
      state=recordWin({...state,path,rewarded:state.rewarded||solved(generateLevel(state.level),path),steps:state.steps+Math.max(0,path.length-state.path.length)});selected=undefined;recovery=0;render(note);context.save(snapshot());
      if(solved(generateLevel(state.level),path)&&!wasComplete){context.sound('success');context.announce('Garden complete. All squares covered.');}
    }
    function move(cell:number){if(paused||disposed)return;update(step(generateLevel(state.level),state.path,cell));}
    function doHint(){
      if(paused||disposed)return;
      const level=generateLevel(state.level),h=hint(level,state.path);selected=undefined;recovery=0;
      if(h.kind!=='done'){state={...state,hints:state.hints+1};context.save(snapshot());}
      if(h.kind==='step'){selected=h.cell;render(`Try the marked square: row ${Math.floor(h.cell/level.size)+1}, column ${h.cell%level.size+1}.`);}
      else if(h.kind==='backtrack'){recovery=h.count;render(`${h.proven?'This trail cannot finish.':'A verified route is available after undoing.'} Undo ${recovery} ${recovery===1?'square':'squares'} for a solvable position.`);}
      else render('Every square is already covered!');
      context.announce(message.textContent!);
    }
    root.addEventListener('click',event=>{
      if(paused||disposed)return;
      const action=(event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]')?.dataset.action;
      if(action==='undo')update(undo(state.path));
      if(action==='reset')update([generateLevel(state.level).start]);
      if(action==='hint')doHint();
    },options);
    next.addEventListener('click',()=>{if(!paused&&solved(generateLevel(state.level),state.path)&&state.level<LEVEL_COUNT-1){state={...state,level:state.level+1,path:[generateLevel(state.level+1).start],rewarded:false,steps:0,hints:0};selected=undefined;render();context.save(snapshot());board.focus();}},options);
    const point=(e:PointerEvent):Point=>{const rect=board.getBoundingClientRect(),s=generateLevel(state.level).size,logical=s*64+24;return{x:((e.clientX-rect.left)/rect.width*logical-12)/64,y:((e.clientY-rect.top)/rect.height*logical-12)/64};};
    board.addEventListener('pointerdown',e=>{
      if(paused||disposed||activePointer!==undefined||e.button!==0)return;
      e.preventDefault();board.focus();activePointer=e.pointerId;previous=point(e);board.setPointerCapture(e.pointerId);
      for(const c of sampleSegment(previous,previous,generateLevel(state.level).size))move(c);
    },options);
    board.addEventListener('pointermove',e=>{
      if(paused||activePointer!==e.pointerId||!previous)return;
      const events=e.getCoalescedEvents?.()??[];
      for(const sample of [...events,e]){const p=point(sample);for(const c of sampleSegment(previous,p,generateLevel(state.level).size))move(c);previous=p;}
    },options);
    board.addEventListener('pointerup',stopPointer,options);board.addEventListener('pointercancel',stopPointer,options);board.addEventListener('lostpointercapture',()=>{activePointer=undefined;previous=undefined;},options);
    board.addEventListener('keydown',e=>{
      if(paused||disposed||document.querySelector('dialog[open]'))return;
      const size=generateLevel(state.level).size,head=state.path.at(-1)!;
      const delta:Record<string,number>={ArrowUp:-size,ArrowRight:1,ArrowDown:size,ArrowLeft:-1};
      if(e.key in delta){e.preventDefault();move(head+delta[e.key]!);}
      else if(e.key==='Backspace'){e.preventDefault();update(undo(state.path));}
      else if(e.key.toLowerCase()==='h'){e.preventDefault();doHint();}
      else if(e.key==='Home'){e.preventDefault();update([generateLevel(state.level).start]);}
    },options);
    render();
    return {
      pause(){paused=true;stopPointer();render();},resume(){paused=false;render();},
      restart(){stopPointer();state=initialState(state.best);selected=undefined;recovery=0;render();context.save(snapshot());},
      serialize:snapshot,
      restore(data){const validated=restoreState(data);if(validated){stopPointer();state=validated;selected=undefined;recovery=0;render();}},
      dispose(){disposed=true;stopPointer();abort.abort();root.remove();},
    };
  }
};
export default game;
