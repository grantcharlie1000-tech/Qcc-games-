import type { GameModule } from '../../core/types';
import { LEVELS } from './levels';
import { cloneBoard, pour, won } from './rules';
import { hintFor, readSnapshot, Session } from './session';
import './style.css';

const COLOURS = [
  { name:'Coral A', fill:'#ff756d', ink:'#47212a', pattern:'M18 0l8 8m6-8l8 8m6-8l8 8' },
  { name:'Azure B', fill:'#50c7f1', ink:'#153e52', pattern:'M21 4h4m9 0h4m9 0h4' },
  { name:'Honey C', fill:'#f6ce55', ink:'#584217', pattern:'M21 2v4m12-4v4m12-4v4' },
  { name:'Mint D', fill:'#70d9a6', ink:'#1d4937', pattern:'M20 4l3-3 3 3-3 3zm15 0l3-3 3 3-3 3z' },
  { name:'Lilac E', fill:'#bb9af7', ink:'#392958', pattern:'M20 1h6v6h-6zm15 0h6v6h-6z' },
];
const arrowIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l7 7-7 7"/></svg>';
const undoIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5L4 10l5 5M4 10h9a6 6 0 1 1 0 12"/></svg>';
const hintIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6m-5 3h4M8 14a7 7 0 1 1 8 0l-1 2H9z"/></svg>';
function tubeArt(values: readonly number[], index: number): string {
  const id = `ws-clip-${index}`;
  const bands = values.map((c, i) => {
    const y = 139 - i * 28, colour = COLOURS[c];
    return `<g data-band="${c}"><rect x="16" y="${y}" width="44" height="29" fill="${colour.fill}"/><path class="ws-pattern" d="${colour.pattern}" transform="translate(0 ${y+10})" stroke="${colour.ink}" stroke-width="1.7" fill="none" opacity=".6"/><text x="38" y="${y+19}" fill="${colour.ink}" font-size="12" font-family="system-ui,sans-serif" font-weight="800" text-anchor="middle">${String.fromCharCode(65+c)}</text></g>`;
  }).join('');
  return `<svg class="ws-glass" viewBox="0 0 76 180" aria-hidden="true"><defs><clipPath id="${id}"><path d="M16 30h44v115a22 22 0 0 1-44 0z"/></clipPath><linearGradient id="ws-shine-${index}" x1="0" x2="1"><stop stop-color="#fff" stop-opacity=".14"/><stop offset=".5" stop-color="#fff" stop-opacity=".02"/><stop offset="1" stop-color="#fff" stop-opacity=".11"/></linearGradient></defs><path d="M10 12h56v12l-5 7v114a23 23 0 0 1-46 0V31l-5-7z" fill="#241f38" stroke="#cab6dc" stroke-width="3"/><g clip-path="url(#${id})">${bands}${values.length?`<ellipse cx="38" cy="${140-(values.length-1)*28}" rx="22" ry="3" fill="${COLOURS[values.at(-1)!].fill}"/><path d="M17 ${140-(values.length-1)*28}h42" stroke="#fff" opacity=".3" stroke-width="2"/>`:''}<path d="M19 32h37v131H19z" fill="url(#ws-shine-${index})"/></g><path d="M20 37v97M21 143v7" stroke="#fff" stroke-opacity=".27" stroke-width="3" stroke-linecap="round"/><path d="M54 55h6m-6 28h6m-6 28h6m-6 28h6" stroke="#fff" stroke-opacity=".25" stroke-width="1.5"/><path d="M11 16h54" stroke="#f4e4ff" stroke-width="3" stroke-linecap="round"/></svg>`;
}

const module: GameModule = {
  id:'water-sort', title:'Water Sort', cover:'game-art/water-sort/cover.svg',
  rules:'Sort the liquids so every nonempty tube contains only one colour. Partial tubes count as sorted. Select a tube, then select an empty tube or one with the same top colour. The entire matching top run pours, stopping when the destination is full. Each tube holds four bands. Tap, drag between tubes, or use Tab and arrow keys to focus a tube and Enter or Space to select. Letters identify colours. Undo reverses a completed pour; Hint shows a winning next pour from your current board, or how many moves to undo if you are stuck. Choose Gentle, Flow or Deep difficulty and any of nine verified-soluble levels. Restart resets the current level.',
  mount(container, context) {
    const session = new Session();
    const abort = new AbortController();
    const root = document.createElement('section');
    root.className = 'ws-game';
    root.setAttribute('aria-label','Water Sort puzzle');
    root.innerHTML = `<div class="ws-heading"><div><span class="ws-eyebrow">A LITTLE LIQUID LOGIC</span><h2 class="ws-level-name"></h2></div><span class="ws-level-pill"></span></div><div class="ws-selects"><label>Difficulty<select class="ws-difficulty game-select" aria-label="Difficulty"><option>Gentle</option><option>Flow</option><option>Deep</option></select></label><label>Level<select class="ws-level game-select" aria-label="Level">${LEVELS.map((l,i)=>`<option value="${i}">${i+1} · ${l.name}</option>`).join('')}</select></label></div><div class="ws-playfield"><div class="ws-stats"><span>POURS <strong class="ws-moves">0</strong></span><span>SORTED <strong class="ws-sorted">0 / 2</strong></span></div><div class="ws-tubes" aria-label="Liquid tubes"></div><svg class="ws-stream" aria-hidden="true"><path fill="none" stroke-width="5" stroke-linecap="round"/></svg><div class="ws-victory" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 12 5 5L20 6"/></svg><span>Beautifully sorted!</span></div></div><p class="ws-message" role="status"></p><div class="ws-actions"><button class="game-button secondary" data-action="undo">${undoIcon}Undo</button><button class="game-button secondary" data-action="hint">${hintIcon}Hint</button><button class="game-button ws-next" data-action="next" hidden>Next level${arrowIcon}</button></div><p class="ws-instructions">Tap a tube, then its destination. Or drag between tubes.<br><span>Keyboard: Tab or arrows to focus · Enter to select</span></p>`;
    container.replaceChildren(root);
    const tubes = root.querySelector<HTMLElement>('.ws-tubes')!;
    const difficulty = root.querySelector<HTMLSelectElement>('.ws-difficulty')!;
    const levelSelect = root.querySelector<HTMLSelectElement>('.ws-level')!;
    const stream = root.querySelector<SVGSVGElement>('.ws-stream')!;
    const streamPath = stream.querySelector('path')!;
    let selected: number | null = null;
    let hint: ReturnType<typeof hintFor> | null = null;
    let message = 'Make some space. Pour a top colour into an empty tube.';
    let disposed = false, raf = 0, lastFrame = 0;
    let drag: {from:number;x:number;y:number;id:number} | null = null;
    let suppressClick = false;
    const reduced = () => context.settings.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;
    const snapshot = () => ({...session.state,tubes:cloneBoard(session.state.tubes),history:session.state.history.map(cloneBoard)});
    function tell(text: string) { message = text; context.announce(text); }
    function render(save = false) {
      if (disposed) return;
      const focused = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-tube]')?.dataset.tube;
      const state = session.state, level = LEVELS[state.level], complete = won(state.tubes), busy = !!session.pending;
      root.dataset.phase = session.paused ? 'paused' : busy ? 'pouring' : complete ? 'won' : 'ready';
      root.dataset.moves = String(state.history.length);
      root.dataset.patterns = String(context.settings.colorBlind);
      root.dataset.reduced = String(reduced());
      root.querySelector('.ws-level-name')!.textContent = level.name;
      root.querySelector('.ws-level-pill')!.textContent = `${level.difficulty} ${state.level+1} / 9`;
      root.querySelector('.ws-moves')!.textContent = String(state.history.length);
      const separated = Array.from({length:level.colours},(_,colour)=>state.tubes.filter(t=>t.includes(colour)).every(t=>t.every(c=>c===colour))).filter(Boolean).length;
      root.querySelector('.ws-sorted')!.textContent = `${separated} / ${level.colours}`;
      levelSelect.value = String(state.level); difficulty.value = level.difficulty;
      levelSelect.disabled = difficulty.disabled = session.paused || busy;
      tubes.innerHTML = state.tubes.map((values,i) => {
        const finished = values.length > 0 && values.every(c=>c===values[0]);
        const legal = selected !== null && i !== selected && !!pour(state.tubes,selected,i);
        const hintClass = hint?.kind === 'pour' ? hint.from === i ? ' ws-hint-from' : hint.to === i ? ' ws-hint-to' : '' : '';
        const label = `Tube ${i+1}, ${values.length ? 'bottom to top: '+values.map(c=>COLOURS[c].name).join(', ') : 'empty'}`;
        return `<button type="button" class="ws-tube${selected===i?' ws-selected':''}${legal?' ws-legal':''}${finished?' ws-finished':''}${hintClass}" data-tube="${i}" data-colours="${values.join(',')}" aria-label="${label}" aria-pressed="${selected===i}" ${session.paused||busy||complete?'disabled':''}>${tubeArt(values,i)}<span class="ws-tube-number">${i+1}${finished?'<span aria-hidden="true">✓</span>':''}</span>${hint?.kind==='pour'&&(hint.from===i||hint.to===i)?`<span class="ws-hint-label">${hint.from===i?'FROM':'TO'}</span>`:''}</button>`;
      }).join('');
      if (focused !== undefined && !busy && !session.paused) tubes.querySelector<HTMLButtonElement>(`[data-tube="${focused}"]`)?.focus({preventScroll:true});
      const undo = root.querySelector<HTMLButtonElement>('[data-action="undo"]')!;
      undo.disabled = session.paused || busy || !state.history.length;
      undo.classList.toggle('ws-undo-hint', hint?.kind === 'undo');
      root.querySelector<HTMLButtonElement>('[data-action="hint"]')!.disabled = session.paused || busy || complete;
      const next = root.querySelector<HTMLButtonElement>('[data-action="next"]')!;
      next.hidden = !complete; next.disabled = session.paused;
      next.innerHTML = state.level===LEVELS.length-1 ? `Play again${arrowIcon}` : `Next level${arrowIcon}`;
      root.querySelector<HTMLElement>('.ws-victory')!.hidden = !complete;
      const status = complete ? `All colours home in ${state.history.length} pours. ${state.level===8?'You mastered the collection!':'Ready for the next level?'}` : message;
      root.querySelector('.ws-message')!.textContent = status;
      context.setLevel(`Level ${state.level+1} · ${level.difficulty}`);
      context.setScore(complete ? Math.max(100,1000-state.history.length*10) : 0);
      context.setStatus(status);
      if (save) context.save(snapshot());
    }
    function clearAnimation() {
      cancelAnimationFrame(raf); raf = 0;
      stream.style.opacity = '0';
      tubes.querySelectorAll<HTMLElement>('.ws-tube').forEach(el=>el.style.removeProperty('transform'));
    }
    function paintPour() {
      const pending = session.pending;
      if (!pending) return;
      const from = tubes.querySelector<HTMLElement>(`[data-tube="${pending.move.from}"]`)!;
      const to = tubes.querySelector<HTMLElement>(`[data-tube="${pending.move.to}"]`)!;
      const progress = pending.duration ? Math.min(1,pending.elapsed/pending.duration) : 1;
      const lift = Math.sin(progress*Math.PI);
      if (!reduced() && pending.duration>50) from.style.transform = `translateY(${-14*lift}px) rotate(${(pending.move.to>pending.move.from?12:-12)*lift}deg)`;
      const field = root.querySelector<HTMLElement>('.ws-playfield')!.getBoundingClientRect();
      const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
      const x1 = a.x-field.x+a.width/2, y1 = a.y-field.y+16;
      const x2 = b.x-field.x+b.width/2, y2 = b.y-field.y+16;
      stream.setAttribute('viewBox',`0 0 ${field.width} ${field.height}`);
      streamPath.setAttribute('d',`M${x1} ${y1} Q${(x1+x2)/2} ${Math.min(y1,y2)-48} ${x2} ${y2}`);
      streamPath.setAttribute('stroke',COLOURS[pending.move.colour].fill);
      stream.style.opacity = progress>.18 && progress<.85 ? reduced()?'.45':'1' : '0';
    }
    function frame(now: number) {
      raf = 0;
      if (disposed || session.paused || !session.pending) return;
      const committed = session.advance(now-lastFrame); lastFrame = now;
      if (committed) {
        clearAnimation();
        const complete = won(session.state.tubes);
        if (complete) { tell('Beautifully sorted! Every colour has a home.'); context.sound('success'); }
        else message='Choose your next pour. Match the top colour or use an empty tube.';
        render(true);
      } else { paintPour(); raf = requestAnimationFrame(frame); }
    }
    function animate() { if (session.pending && !session.paused && !raf) { lastFrame=performance.now(); raf=requestAnimationFrame(frame); } }
    function choose(index: number, keyboard = false) {
      if (disposed || session.paused || session.pending || won(session.state.tubes)) return;
      hint = null;
      if (selected === null) {
        if (!session.state.tubes[index].length) { tell('Choose a tube with liquid first.'); render(); return; }
        selected = index; tell(`Tube ${index+1} selected. Choose a matching top colour or an empty tube.`);
      } else if (selected === index) { selected=null; tell('Selection cleared. Choose a tube.'); }
      else {
        const result = pour(session.state.tubes,selected,index);
        if (!result) { tell(session.state.tubes[index].length===4?'That tube is full. Choose another destination.':'The top colours must match. Try an empty tube.'); render(); return; }
        if (session.begin(selected,index,reduced()||keyboard?50:260)) {
          tell(`Pouring ${result.amount} ${COLOURS[result.colour].name} ${result.amount===1?'band':'bands'} from ${selected+1} to ${index+1}.`);
          selected=null; context.sound('tap'); render(); animate(); return;
        }
        tell('This run has reached 5,000 pours. Undo a pour or restart this level.');
      }
      context.sound('tap'); render();
    }
    function reset(level = session.state.level) {
      clearAnimation(); session.pending=null; session.state=new Session(level).state;
      selected=null; hint=null; drag=null;
      tell('Fresh tubes. Pour a top colour into an empty one.'); render(true);
    }
    root.addEventListener('click', event => {
      if (suppressClick) { suppressClick=false; return; }
      const target = (event.target as Element).closest<HTMLElement>('button');
      if (!target || session.paused || session.pending) return;
      if (target.dataset.tube !== undefined) choose(Number(target.dataset.tube),(event as MouseEvent).detail===0);
      else if (target.dataset.action === 'undo' && session.undo()) { selected=null; hint=null; tell('Pour undone. Try a new route.'); render(true); }
      else if (target.dataset.action === 'hint' && !won(session.state.tubes)) {
        selected=null; hint=hintFor(session.state);
        if (hint.kind==='pour') tell(`Hint: pour tube ${hint.from+1} into tube ${hint.to+1}. ${hint.remaining} pours from a solution.`);
        else if (hint.kind==='undo') tell(`This route needs a rethink. Undo ${hint.steps} ${hint.steps===1?'pour':'pours'} to reach a winning route.`);
        render();
      } else if (target.dataset.action === 'next' && won(session.state.tubes)) reset((session.state.level+1)%LEVELS.length);
    }, {signal:abort.signal});
    root.addEventListener('keydown', event => {
      const button = (event.target as Element).closest<HTMLElement>('[data-tube]');
      if (!button || session.paused || session.pending || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const delta = event.key==='ArrowLeft'?-1:event.key==='ArrowRight'?1:event.key==='ArrowUp'?-4:4;
      const index = (Number(button.dataset.tube)+delta+session.state.tubes.length)%session.state.tubes.length;
      tubes.querySelector<HTMLButtonElement>(`[data-tube="${index}"]`)?.focus();
    }, {signal:abort.signal});
    root.addEventListener('pointerdown', event => {
      suppressClick=false;
      const button = (event.target as Element).closest<HTMLElement>('[data-tube]');
      if (!button || session.paused || session.pending || event.button !== 0) return;
      drag={from:Number(button.dataset.tube),x:event.clientX,y:event.clientY,id:event.pointerId};
    }, {signal:abort.signal});
    window.addEventListener('pointerup', event => {
      if (!drag || drag.id!==event.pointerId) return;
      const start=drag; drag=null;
      if (Math.hypot(event.clientX-start.x,event.clientY-start.y)<12) return;
      const target=document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLElement>('[data-tube]');
      if (!target || !root.contains(target)) return;
      const to=Number(target.dataset.tube);
      if (to===start.from || !session.state.tubes[start.from].length) return;
      selected=start.from; choose(to); suppressClick=true;
    }, {signal:abort.signal});
    window.addEventListener('pointercancel',()=>{drag=null;},{signal:abort.signal});
    difficulty.addEventListener('change',()=>reset(LEVELS.findIndex(l=>l.difficulty===difficulty.value)),{signal:abort.signal});
    levelSelect.addEventListener('change',()=>reset(Number(levelSelect.value)),{signal:abort.signal});
    render();
    return {
      pause() { session.paused=true; drag=null; clearAnimation(); render(); },
      resume() { session.paused=false; render(); animate(); },
      restart() { reset(); },
      serialize: snapshot,
      restore(data) {
        const restored=readSnapshot(data);
        if (!restored) return;
        clearAnimation(); session.pending=null; session.state=restored; selected=null; hint=null;
        message='Your colours are right where you left them.'; render();
      },
      dispose() { disposed=true; clearAnimation(); abort.abort(); root.remove(); },
    };
  },
};
export default module;
