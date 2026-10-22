import type {GameModule} from '../../core/types';
import {create,reveal,flag,chord,restore as restoreBoard,score,LEVELS} from './model';
import type {Level} from './model';
import './style.css';
// CSS custom-property URLs otherwise resolve relative to the emitted /assets/ stylesheet.
const art=new URL('game-art/minesweeper/',new URL(import.meta.env.BASE_URL,document.baseURI)).href;
const title=(level:Level)=>level[0].toUpperCase()+level.slice(1);
const game:GameModule={
  id:'minesweeper',title:'Minesweeper',cover:'game-art/minesweeper/cover.svg',
  rules:'Reveal all safe cells to clear the field. Numbers count mines in the eight neighboring cells. Empty cells open a connected area. Your first reveal and its neighbors are always safe.\n\nRight-click, hold a tile, use Flag mode, or press F to flag or unflag a covered cell. Flags are reminders; placing flags alone never wins. Click a revealed number (or press C) to open its neighbors when the flag count matches. Wrong flags can detonate a mine.\n\nUse arrow keys to move, Home/End to move across a row, Enter/Space to reveal. Choose larger cells for easier tapping; wide fields scroll inside the board. The timer starts on your first reveal and pauses with the game. Use Restart above for a new field.',
  mount(container,context){
    let board=create('beginner',newSeed()),paused=false,disposed=false,flagMode=false,focus=0,size=34;
    let last=performance.now(),hold:number|undefined,press:{i:number;pointerId:number;x:number;y:number;consumed:boolean}|undefined,suppress:{i:number;pointerId:number}|undefined;
    const events=new AbortController();
    const root=document.createElement('section');root.className='ms';root.setAttribute('aria-label','Minefield');
    root.innerHTML=`<div class="ms-heading"><div><span class="ms-eyebrow">POCKET EXPEDITION</span><h2>Clear the field</h2></div><img src="${art}flag.svg" alt="" width="50" height="50"></div>
      <div class="ms-options"><label>Field<select class="game-select ms-level" aria-label="Difficulty"><option value="beginner">Beginner · 9 × 9</option><option value="intermediate">Intermediate · 16 × 16</option><option value="expert">Expert · 30 × 16</option></select></label><label>Cells<select class="game-select ms-size" aria-label="Cell size"><option value="34">Regular</option><option value="44">Large</option><option value="54">Extra large</option></select></label></div>
      <div class="ms-instruments"><div class="ms-instrument"><span>MINES − FLAGS</span><strong class="ms-count">10</strong></div><div class="ms-instrument"><span>TIME</span><strong class="ms-time" aria-label="Elapsed time">00:00</strong></div><button class="ms-mode" type="button" aria-label="Flag mode" aria-pressed="false"><img src="${art}flag.svg" alt="" width="28" height="28"><span>Flag mode</span></button></div>
      <p class="ms-outcome" role="status">Your first move is safe.</p><div class="ms-scroll" tabindex="-1" aria-label="Scrollable minefield"><div class="ms-board" role="grid" aria-label="Minesweeper board" aria-describedby="ms-instructions"></div></div>
      <div class="ms-progress"><span class="ms-safe">0 / 71 safe</span><div><i></i></div></div><p class="ms-instructions" id="ms-instructions">Tap to reveal · Hold or right-click to flag<br>Arrows to move · F to flag · C to chord</p>`;
    root.style.setProperty('--ms-tile-art',`url("${art}tile.svg")`);
    container.append(root);
    const grid=root.querySelector<HTMLElement>('.ms-board')!,scroll=root.querySelector<HTMLElement>('.ms-scroll')!;
    const levelSelect=root.querySelector<HTMLSelectElement>('.ms-level')!,sizeSelect=root.querySelector<HTMLSelectElement>('.ms-size')!;
    const mode=root.querySelector<HTMLButtonElement>('.ms-mode')!;
    let buttons:HTMLButtonElement[]=[];
    function newSeed(){return crypto.getRandomValues(new Uint32Array(1))[0];}
    function clearHoldTimer(){window.clearTimeout(hold);hold=undefined;}
    function stopHold(){clearHoldTimer();press=undefined;suppress=undefined;}
    function syncTime(){const now=performance.now();if(!paused&&board.status==='playing')board.elapsedMs=Math.min(31536000000,board.elapsedMs+Math.max(0,now-last));last=now;}
    function clock(){const s=Math.floor(board.elapsedMs/1000);root.querySelector('.ms-time')!.textContent=`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;}
    function snapshot(){syncTime();return {...board,cells:[...board.cells],flags:[...board.flags],revealed:[...board.revealed],cellSize:size};}
    function build(){
      stopHold();focus=0;grid.replaceChildren();buttons=[];
      const {width,height}=LEVELS[board.level];grid.setAttribute('aria-rowcount',String(height));grid.setAttribute('aria-colcount',String(width));
      for(let y=0;y<height;y++){
        const row=document.createElement('div');row.className='ms-row';row.setAttribute('role','row');
        for(let x=0;x<width;x++){
          const i=y*width+x,cell=document.createElement('div'),button=document.createElement('button');cell.setAttribute('role','gridcell');
          button.type='button';button.dataset.index=String(i);button.className='ms-tile';button.tabIndex=i===focus?0:-1;
          cell.append(button);row.append(cell);buttons.push(button);
        }grid.append(row);
      }
      grid.style.setProperty('--ms-size',`${size}px`);scroll.scrollLeft=0;
    }
    function render(){
      const {width,mines}=LEVELS[board.level],safe=board.revealed.filter((v,i)=>v&&board.cells[i]!==-1).length,total=board.cells.length-mines;
      buttons.forEach((button,i)=>{
        const open=board.revealed[i],mine=board.status==='lost'&&board.cells[i]===-1,wrong=board.status==='lost'&&board.flags[i]&&board.cells[i]!==-1;
        const state=mine?'mine':open?'open':board.flags[i]?'flagged':'hidden';
        button.dataset.state=state;button.className=`ms-tile ms-n${board.cells[i]}${i===board.exploded?' ms-exploded':''}${wrong?' ms-wrong':''}`;
        const label=mine?'Mine':open?(board.cells[i]>0?`${board.cells[i]} adjacent mines`:'Empty'):board.flags[i]?(wrong?'Incorrect flag':'Flagged'):'Covered';
        button.setAttribute('aria-label',`Row ${Math.floor(i/width)+1}, column ${i%width+1}: ${label}`);
        button.setAttribute('aria-disabled',String(paused||board.status==='won'||board.status==='lost'));
        if(mine)button.innerHTML=`<img src="${art}mine.svg" alt="">`;
        else if(board.flags[i])button.innerHTML=`<img src="${art}flag.svg" alt="">${wrong?'<span class="ms-cross" aria-hidden="true">×</span>':''}`;
        else button.textContent=open&&board.cells[i]>0?String(board.cells[i]):'';
      });
      root.querySelector('.ms-count')!.textContent=String(mines-board.flags.filter(Boolean).length);
      root.querySelector('.ms-safe')!.textContent=`${safe} / ${total} safe`;
      (root.querySelector('.ms-progress i') as HTMLElement).style.width=`${safe/total*100}%`;
      const message=board.status==='won'?'Field cleared!':board.status==='lost'?'Mine found!':board.status==='ready'?'Your first move is safe.':'Follow the numbers. Trust your logic.';
      root.querySelector('.ms-outcome')!.textContent=message;root.dataset.status=board.status;
      context.setScore(score(board));context.setLevel(title(board.level));
      context.setStatus(board.status==='won'?'All safe cells revealed. Field cleared!':board.status==='lost'?'A mine ended this expedition. Restart for a fresh field.':`${safe} of ${total} safe cells revealed. Flags are reminders, not a win condition.`);
      levelSelect.value=board.level;sizeSelect.value=String(size);mode.setAttribute('aria-pressed',String(flagMode));clock();
    }
    function action(i:number,kind:'reveal'|'flag'|'chord'){
      if(paused||disposed)return;
      syncTime();const before=board.status;
      const changed=kind==='flag'?flag(board,i):kind==='chord'?chord(board,i):board.revealed[i]?chord(board,i):reveal(board,i);
      if(!changed)return;
      render();context.save(snapshot());
      if(board.status!==before&&(board.status==='won'||board.status==='lost')){context.announce(board.status==='won'?'Field cleared. All safe cells are open.':'Mine found. Try another field.');context.sound(board.status==='won'?'success':'lose');}
      else {context.sound('tap');if(kind==='flag')context.announce(board.flags[i]?'Flag placed.':'Flag removed.');}
    }
    function target(e:Event):number|null {const t=(e.target as Element).closest<HTMLButtonElement>('.ms-tile');return t&&grid.contains(t)?Number(t.dataset.index):null;}
    function setFocus(i:number,move=false){if(!buttons[i])return;buttons[focus].tabIndex=-1;focus=i;buttons[focus].tabIndex=0;if(move)buttons[focus].focus({preventScroll:false});}
    root.addEventListener('click',e=>{const i=target(e);if(i===null)return;setFocus(i);if(suppress?.i===i&&suppress.pointerId===(e as PointerEvent).pointerId){suppress=undefined;return;}action(i,flagMode?'flag':'reveal');},{signal:events.signal});
    grid.addEventListener('focusin',e=>{const i=target(e);if(i!==null)setFocus(i);},{signal:events.signal});
    grid.addEventListener('contextmenu',e=>{
      e.preventDefault();const i=target(e);if(i===null)return;
      if((press?.i===i&&press.consumed)||(suppress?.i===i&&suppress.pointerId===(e as PointerEvent).pointerId))return;
      // A native touch context menu can precede our hold timer. Consume that gesture once.
      if(press?.i===i){clearHoldTimer();press.consumed=true;}else stopHold();
      action(i,'flag');
    },{signal:events.signal});
    grid.addEventListener('pointerdown',e=>{
      const i=target(e);stopHold();if(i===null||paused||e.button!==0)return;
      if(e.pointerType==='touch'||e.pointerType==='pen'){
        const gesture={i,pointerId:e.pointerId,x:e.clientX,y:e.clientY,consumed:false};press=gesture;
        hold=window.setTimeout(()=>{
          if(press!==gesture)return;
          gesture.consumed=true;hold=undefined;action(i,'flag');
        },480);
      }
    },{signal:events.signal});
    grid.addEventListener('pointermove',e=>{
      if(press?.pointerId===e.pointerId&&Math.hypot(e.clientX-press.x,e.clientY-press.y)>10){clearHoldTimer();press.consumed=true;}
    },{signal:events.signal});
    grid.addEventListener('pointerup',e=>{
      if(press?.pointerId!==e.pointerId)return;
      // Keep only this pointer's pending click, regardless of how long the finger was down.
      if(press.consumed)suppress={i:press.i,pointerId:press.pointerId};
      clearHoldTimer();press=undefined;
    },{signal:events.signal});
    grid.addEventListener('pointercancel',e=>{if(press?.pointerId===e.pointerId||suppress?.pointerId===e.pointerId)stopHold();},{signal:events.signal});
    grid.addEventListener('pointerleave',e=>{if(press?.pointerId===e.pointerId)stopHold();},{signal:events.signal});
    grid.addEventListener('keydown',e=>{
      const i=target(e);if(i===null||paused||e.altKey||e.ctrlKey||e.metaKey)return;
      const {width}=LEVELS[board.level],row=Math.floor(i/width),col=i%width;
      const moves:Record<string,number>={ArrowLeft:col>0?i-1:i,ArrowRight:col<width-1?i+1:i,ArrowUp:Math.max(0,row-1)*width+col,ArrowDown:Math.min(LEVELS[board.level].height-1,row+1)*width+col,Home:row*width,End:(row+1)*width-1};
      if(e.key in moves){e.preventDefault();setFocus(moves[e.key],true);}else if(['Enter',' ','f','F','c','C'].includes(e.key)){e.preventDefault();if(!e.repeat)action(i,e.key.toLowerCase()==='f'?'flag':e.key.toLowerCase()==='c'?'chord':flagMode?'flag':'reveal');}
    },{signal:events.signal});
    mode.addEventListener('click',()=>{if(paused)return;flagMode=!flagMode;render();context.announce(flagMode?'Flag mode on. Tap covered cells to mark them.':'Reveal mode on.');},{signal:events.signal});
    function restart(){stopHold();suppress=undefined;board=create(board.level,newSeed());flagMode=false;last=performance.now();build();render();context.save(snapshot());}
    levelSelect.addEventListener('change',()=>{if(paused){levelSelect.value=board.level;return;}board=create(levelSelect.value as Level,newSeed());flagMode=false;last=performance.now();build();render();context.save(snapshot());},{signal:events.signal});
    sizeSelect.addEventListener('change',()=>{if(paused){sizeSelect.value=String(size);return;}size=Number(sizeSelect.value);grid.style.setProperty('--ms-size',`${size}px`);context.save(snapshot());},{signal:events.signal});
    const ticker=window.setInterval(()=>{if(!disposed){syncTime();clock();}},200);
    build();render();
    return {
      pause(){syncTime();paused=true;stopHold();render();},resume(){paused=false;last=performance.now();render();},restart,
      serialize:snapshot,
      restore(data){const restored=restoreBoard(data);if(!restored)return;board=restored;const savedSize=(data as {cellSize?:unknown}).cellSize;if(savedSize===34||savedSize===44||savedSize===54)size=savedSize;last=performance.now();flagMode=false;build();render();},
      dispose(){disposed=true;events.abort();stopHold();clearInterval(ticker);root.remove();}
    };
  }
};
export default game;
