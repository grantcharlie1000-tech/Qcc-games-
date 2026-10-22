import type { GameModule } from '../../core/types';
import { LEVELS } from './levels';
import { cloneBoard, pour, won } from './rules';
import { campaignScore, readSnapshot, Session } from './session';
import { bandsFor, COLOURS, liquidArt, tubeArt } from './art';
import { liquidLayers, pourFrame, rotatePoint, spillAngle } from './geometry';
import './style.css';

const undoIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5-6 5 6 5M3 10h10a6 6 0 0 1 0 12H6"/></svg>';
const hintIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6m-5 3h4M8 13a6 6 0 1 1 8 0l-1 3H9zM12 1V0M3 5 1 4m20 0-2 1M2 13H0m24 0h-2"/></svg>';
const module:GameModule={
  id:'water-sort',title:'Water Sort',cover:'game-art/water-sort/cover.svg',
  rules:'Sort the liquids so every nonempty tube contains only one colour. Partial tubes count as sorted. Tap a source tube, then an empty tube or one with the same top colour. The entire matching top run pours, stopping when the destination is full. Each tube holds four bands. Use Tab or arrow keys to focus and Enter or Space to select. Colour-blind mode adds letters to the bands. Undo reverses a completed pour; Hint shows a winning next pour or how many pours to undo if stuck. The compact difficulty and Level controls select any of 27 verified-soluble levels. Restart resets the current level.',
  mount(container,context) {
    const session=new Session(),abort=new AbortController(),root=document.createElement('section');
    root.className='ws-game';root.setAttribute('aria-label','Water Sort puzzle');
    root.innerHTML=`<div class="ws-heading"><select class="ws-difficulty" aria-label="Difficulty"><option>Gentle</option><option>Flow</option><option>Deep</option></select><h2 class="ws-level-name">Level 1</h2><select class="ws-level" aria-label="Level">${LEVELS.map((l,i)=>`<option value="${i}">Level ${i+1} · ${l.name}</option>`).join('')}</select></div><div class="ws-playfield"><div class="ws-tubes" aria-label="Liquid tubes"></div><svg class="ws-stream" aria-hidden="true"><path fill="none" stroke-linecap="round"/></svg><div class="ws-victory" hidden><span class="ws-victory-mark">✓</span><strong>Beautifully sorted!</strong></div></div><div class="ws-footer"><p class="ws-message" role="status"></p><div class="ws-actions"><button type="button" data-action="undo" aria-label="Undo">${undoIcon}<span>Undo</span></button><button type="button" class="ws-next" data-action="next" hidden>Next level</button><button type="button" data-action="hint" aria-label="Hint">${hintIcon}<span>Hint</span></button></div></div>`;
    container.replaceChildren(root);
    const tubes=root.querySelector<HTMLElement>('.ws-tubes')!,field=root.querySelector<HTMLElement>('.ws-playfield')!;
    const difficulty=root.querySelector<HTMLSelectElement>('.ws-difficulty')!,levelSelect=root.querySelector<HTMLSelectElement>('.ws-level')!;
    const stream=root.querySelector<SVGSVGElement>('.ws-stream')!,streamPath=stream.querySelector('path')!;
    let focusAfterPour:number|null=null;
    let selected:number|null=null,hint:ReturnType<Session['hint']>|null=null;
    let message='Tap a tube, then its destination.',disposed=false,raf=0,lastFrame=0,celebrate:number|null=null;
    let pointer:{id:number;x:number;y:number;from:number;target:HTMLElement}|null=null,suppressClick=false;
    const reduced=()=>context.settings.reducedMotion||matchMedia('(prefers-reduced-motion: reduce)').matches;
    const snapshot=()=>({...session.state,tubes:cloneBoard(session.state.tubes),history:session.state.history.map(cloneBoard),best:{...session.state.best}});
    function tell(text:string){message=text;context.announce(text);}
    function clearPointer(suppress=false){
      const active=pointer;pointer=null;
      if(!active)return;
      if(suppress)suppressClick=true;
      // Clear the transaction first: releasing capture may dispatch lostcapture.
      // Synthetic PointerEvents need not correspond to a live browser pointer.
      try{if(active.target.hasPointerCapture(active.id))active.target.releasePointerCapture(active.id);}catch{/* Pointer already ended. */}
    }
    function fit(){
      if(disposed)return;
      const columns=Math.ceil(session.state.tubes.length/2),rect=field.getBoundingClientRect();
      const width=Math.max(20,Math.min(92,(rect.width-12)/(columns+.45),(rect.height*.77-16)/6.4));
      root.style.setProperty('--ws-tube-width',`${width}px`);
      if(session.pending)paintPour();
    }
    function render(save=false){
      if(disposed)return;
      clearPointer(true);
      const focused=(document.activeElement as HTMLElement|null)?.closest<HTMLElement>('[data-tube]')?.dataset.tube;
      const state=session.state,level=LEVELS[state.level],complete=won(state.tubes),busy=!!session.pending;
      root.dataset.phase=session.paused?'paused':busy?'pouring':complete?'won':'ready';
      root.dataset.moves=String(state.history.length);root.dataset.patterns=String(context.settings.colorBlind);root.dataset.reduced=String(reduced());
      root.querySelector('.ws-level-name')!.textContent=`Level ${state.level+1}`;
      levelSelect.value=String(state.level);difficulty.value=level.difficulty;
      levelSelect.disabled=difficulty.disabled=session.paused||busy;
      const count=Math.ceil(state.tubes.length/2);
      const buttons=state.tubes.map((values,i)=>{
        const finished=values.length>0&&values.every(c=>c===values[0]);
        const legal=selected!==null&&i!==selected&&!!pour(state.tubes,selected,i);
        const hintClass=hint?.kind==='pour'?hint.from===i?' ws-hint-from':hint.to===i?' ws-hint-to':'':'';
        const label=`Tube ${i+1}, ${values.length?'bottom to top: '+values.map(c=>COLOURS[c].name).join(', '):'empty'}`;
        return `<button type="button" class="ws-tube${selected===i?' ws-selected':''}${legal?' ws-legal':''}${finished?' ws-finished':''}${hintClass}" data-tube="${i}" data-colours="${values.join(',')}" aria-label="${label}" aria-pressed="${selected===i}" ${session.paused||busy||complete?'disabled':''}>${tubeArt(values,i)}${celebrate===i&&!reduced()?'<span class="ws-bubbles" aria-hidden="true"><i></i><i></i><i></i><i></i></span>':''}${hint?.kind==='pour'&&(hint.from===i||hint.to===i)?`<span class="ws-hint-label">${hint.from===i?'FROM':'TO'}</span>`:''}</button>`;
      });
      tubes.innerHTML=`<div class="ws-row">${buttons.slice(0,count).join('')}</div><div class="ws-row">${buttons.slice(count).join('')}</div>`;
      if(focused!==undefined&&!busy&&!session.paused)tubes.querySelector<HTMLButtonElement>(`[data-tube="${focused}"]`)?.focus({preventScroll:true});
      const undo=root.querySelector<HTMLButtonElement>('[data-action="undo"]')!;
      undo.disabled=session.paused||busy||!state.history.length;undo.classList.toggle('ws-undo-hint',hint?.kind==='undo');
      root.querySelector<HTMLButtonElement>('[data-action="hint"]')!.disabled=session.paused||busy||complete;
      const next=root.querySelector<HTMLButtonElement>('[data-action="next"]')!;
      next.hidden=!complete;next.disabled=session.paused;next.textContent=state.level===LEVELS.length-1?'Play again':'Next level';
      root.querySelector<HTMLElement>('.ws-victory')!.hidden=!complete;
      const status=complete?`All colours home in ${state.history.length} pours.`:message;
      root.querySelector('.ws-message')!.textContent=status;
      context.setLevel(`Level ${state.level+1} · ${level.difficulty}`);context.setScore(campaignScore(state.best));context.setStatus(status);
      fit();if(save)context.save(snapshot());
    }
    function clearAnimation(){
      cancelAnimationFrame(raf);raf=0;stream.style.opacity='0';
      root.removeAttribute('data-pour-phase');root.removeAttribute('data-transfer');
      tubes.querySelectorAll<HTMLElement>('.ws-glass').forEach(el=>el.style.removeProperty('transform'));
    }
    function paintPour(){
      const pending=session.pending;if(!pending)return;
      const {move}=pending,from=tubes.querySelector<HTMLElement>(`[data-tube="${move.from}"]`),to=tubes.querySelector<HTMLElement>(`[data-tube="${move.to}"]`);
      if(!from||!to)return;
      const progress=pending.duration?Math.min(1,pending.elapsed/pending.duration):1,f=pourFrame(progress),gentle=reduced()||pending.duration<=160;
      root.dataset.pourPhase=f.phase;root.dataset.transfer=f.transfer.toFixed(4);
      const source=bandsFor(session.state.tubes[move.from]),target=bandsFor(session.state.tubes[move.to]);
      let drain=move.amount*f.transfer;
      for(let i=source.length-1;i>=0&&drain>0;i--){const part=Math.min(source[i].units,drain);source[i].units-=part;drain-=part;}
      target.push({colour:move.colour,units:move.amount*f.transfer});
      const fromBox=from.getBoundingClientRect(),toBox=to.getBoundingClientRect(),box=field.getBoundingClientRect();
      const artWidth=Number.parseFloat(root.style.getPropertyValue('--ws-tube-width'));
      const a={x:fromBox.x+(fromBox.width-artWidth)/2,y:fromBox.y,width:artWidth};
      const b={x:toBox.x+(toBox.width-artWidth)/2,y:toBox.y,width:artWidth},scale=artWidth/80;
      // Lean inward at the destination so the travelling glass stays in scene.
      const direction=b.x+b.width/2<box.x+box.width/2?-1:1;
      const remaining=session.state.tubes[move.from].length-move.amount*f.transfer;
      const angle=gentle?0:direction*spillAngle(remaining)*f.tilt;
      const lip=rotatePoint({x:direction>0?61:19,y:26},angle);
      const desiredX=b.x+b.width/2-box.x-(lip.x-40)*scale;
      const clearance=Math.max(70,Math.cos(Math.abs(angle)*Math.PI/180)*215+6)*scale;
      const desiredY=Math.max(76-box.y+30*scale,b.y-box.y+24*scale-clearance);
      const dx=(desiredX-(a.x-box.x+40*scale))*f.travel;
      const lift=f.phase==='travel'?Math.sin(Math.min(1,progress/.18)*Math.PI)*48*scale:0;
      const dy=Math.max(76+30*scale-(a.y+24*scale),(desiredY-(a.y-box.y+24*scale))*f.travel-lift);
      const glass=from.querySelector<SVGSVGElement>('.ws-glass')!;
      glass.style.transform=gentle?'none':`translate(${dx}px, ${dy}px) rotate(${angle}deg)`;
      glass.dataset.angle=String(angle);from.style.zIndex='4';
      from.querySelector('.ws-liquid')!.innerHTML=liquidArt(source,angle);
      to.querySelector('.ws-liquid')!.innerHTML=liquidArt(target);
      const x1=a.x-box.x+dx+lip.x*scale,y1=a.y-box.y+dy+lip.y*scale;
      const targetSurface=liquidLayers(target,0).at(-1)?.surface??236;
      const x2=b.x-box.x+40*scale,y2=b.y-box.y+targetSurface*scale;
      stream.setAttribute('viewBox',`0 0 ${box.width} ${box.height}`);
      // The low lip is placed over the receiving opening: a narrow continuous
      // stream, with no decorative arc between the original slots.
      streamPath.setAttribute('d',`M${x1} ${y1} L${x2} ${y2}`);
      streamPath.setAttribute('stroke',COLOURS[move.colour].fill);streamPath.setAttribute('stroke-width',String(Math.max(2,4*scale)));
      stream.style.opacity=!gentle&&f.phase==='flow'?'1':'0';
    }
    function frame(now:number){
      raf=0;if(disposed||session.paused||!session.pending)return;
      const destination=session.pending.move.to,committed=session.advance(now-lastFrame);lastFrame=now;
      if(committed){
        clearAnimation();const values=session.state.tubes[destination];celebrate=values.length&&values.every(c=>c===values[0])?destination:null;
        if(won(session.state.tubes)){tell('Beautifully sorted! Every colour has a home.');context.sound('success');}
        else message='Tap a tube, then its destination.';
        render(true);
        if(focusAfterPour!==null){
          const next=won(session.state.tubes)?root.querySelector<HTMLButtonElement>('[data-action="next"]'):tubes.querySelector<HTMLButtonElement>(`[data-tube="${focusAfterPour}"]`);
          next?.focus({preventScroll:true});focusAfterPour=null;
        }
      }else{paintPour();raf=requestAnimationFrame(frame);}
    }
    function animate(){if(session.pending&&!session.paused&&!raf){lastFrame=performance.now();paintPour();raf=requestAnimationFrame(frame);}}
    function choose(index:number,keyboard=false){
      if(disposed||session.paused||session.pending||won(session.state.tubes))return;
      hint=null;celebrate=null;
      if(selected===null){
        if(!session.state.tubes[index].length){tell('Choose a tube with liquid first.');render();return;}
        selected=index;tell(`Tube ${index+1} selected. Choose a destination.`);
      }else if(selected===index){selected=null;tell('Selection cleared. Choose a tube.');}
      else{
        const result=pour(session.state.tubes,selected,index);
        if(!result){tell(session.state.tubes[index].length===4?'That tube is full. Choose another destination.':'The top colours must match. Try an empty tube.');render();return;}
        if(session.begin(selected,index,reduced()||keyboard?160:1400)){
          focusAfterPour=keyboard?index:null;
          tell(`Pouring ${result.amount} ${COLOURS[result.colour].name} ${result.amount===1?'band':'bands'} from ${selected+1} to ${index+1}.`);
          selected=null;context.sound('tap');render();animate();return;
        }
        tell('This run has reached 5,000 pours. Undo or restart this level.');
      }
      context.sound('tap');render();
    }
    function reset(level=session.state.level){clearPointer(true);clearAnimation();session.pending=null;session.state=new Session(level,session.state.best).state;focusAfterPour=null;selected=null;hint=null;celebrate=null;tell('Tap a tube, then its destination.');render(true);}
    root.addEventListener('click',event=>{
      if(suppressClick&&(event as MouseEvent).detail!==0){suppressClick=false;return;}
      const target=(event.target as Element).closest<HTMLElement>('button');if(!target||session.paused||session.pending)return;
      if(target.dataset.tube!==undefined)choose(Number(target.dataset.tube),(event as MouseEvent).detail===0);
      else if(target.dataset.action==='undo'&&session.undo()){selected=null;hint=null;celebrate=null;tell('Pour undone. Try a new route.');render(true);}
      else if(target.dataset.action==='hint'&&!won(session.state.tubes)){
        selected=null;hint=session.hint();
        if(hint.kind==='pour')tell(`Hint: pour tube ${hint.from+1} into tube ${hint.to+1}. ${hint.remaining} pours from a solution.`);
        else if(hint.kind==='undo')tell(`Undo ${hint.steps} ${hint.steps===1?'pour':'pours'} to reach a winning route.`);
        render();
      }else if(target.dataset.action==='next'&&won(session.state.tubes))reset((session.state.level+1)%LEVELS.length);
    },{signal:abort.signal});
    root.addEventListener('keydown',event=>{
      const button=(event.target as Element).closest<HTMLElement>('[data-tube]');if(!button)return;
      if(event.key==='Escape'){selected=null;clearPointer(true);tell('Selection cleared.');render();return;}
      if(event.repeat&&(event.key==='Enter'||event.key===' ')){event.preventDefault();return;}
      if(session.paused||session.pending)return;
      if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){
        event.preventDefault();const cols=Math.ceil(session.state.tubes.length/2),delta=event.key==='ArrowLeft'?-1:event.key==='ArrowRight'?1:event.key==='ArrowUp'?-cols:cols;
        const index=(Number(button.dataset.tube)+delta+session.state.tubes.length)%session.state.tubes.length;
        tubes.querySelector<HTMLButtonElement>(`[data-tube="${index}"]`)?.focus();
      }
    },{signal:abort.signal});
    // Native clicks/taps are the primary gesture. Optional old drag-to-pour
    // remains compatible; a cancelled gesture never initiates a transaction.
    root.addEventListener('pointerdown',event=>{
      suppressClick=false;const target=(event.target as Element).closest<HTMLElement>('[data-tube]');
      if(!event.isPrimary||event.button!==0||!target||pointer||session.paused||session.pending)return;
      try{
        target.setPointerCapture(event.pointerId);
        pointer={id:event.pointerId,x:event.clientX,y:event.clientY,from:Number(target.dataset.tube),target};
      }catch{/* Synthetic input can have no active pointer; native clicks still work. */}
    },{signal:abort.signal});
    window.addEventListener('pointerup',event=>{
      const start=pointer;if(!start||start.id!==event.pointerId)return;
      // Pending capture may be released before gotpointercapture, in which case
      // browsers emit no lostpointercapture. Such a gesture still cannot pour.
      if(!start.target.hasPointerCapture(start.id)){clearPointer(true);return;}
      clearPointer(); // Release before choose/render replaces the captured button.
      if(Math.hypot(event.clientX-start.x,event.clientY-start.y)<14)return;
      suppressClick=true;
      const target=document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLElement>('[data-tube]');
      if(!target||!root.contains(target))return;
      const to=Number(target.dataset.tube);if(to===start.from||!session.state.tubes[start.from].length)return;
      selected=start.from;choose(to);suppressClick=true;
    },{signal:abort.signal});
    window.addEventListener('pointercancel',event=>{if(pointer?.id===event.pointerId)clearPointer(true);},{signal:abort.signal});
    root.addEventListener('lostpointercapture',event=>{if(pointer?.id===event.pointerId&&pointer.target===event.target)clearPointer(true);},{signal:abort.signal});
    window.addEventListener('blur',()=>clearPointer(true),{signal:abort.signal});
    // The scene can keep the same size when a wide browser window resizes, so
    // field ResizeObserver notifications alone cannot cancel every gesture.
    window.addEventListener('resize',()=>clearPointer(true),{signal:abort.signal});
    difficulty.addEventListener('change',()=>reset(LEVELS.findIndex(l=>l.difficulty===difficulty.value)),{signal:abort.signal});
    levelSelect.addEventListener('change',()=>reset(Number(levelSelect.value)),{signal:abort.signal});
    const observer=new ResizeObserver(()=>{clearPointer(true);fit();});observer.observe(field);
    render();
    return{
      pause(){session.paused=true;clearPointer(true);cancelAnimationFrame(raf);raf=0;render();},
      resume(){session.paused=false;render();animate();},restart(){reset();},serialize:snapshot,
      restore(data){const restored=readSnapshot(data);if(!restored)return;clearPointer(true);clearAnimation();session.pending=null;session.state=restored;focusAfterPour=null;selected=null;hint=null;celebrate=null;message='Your colours are right where you left them.';render();},
      dispose(){clearPointer(true);disposed=true;clearAnimation();observer.disconnect();abort.abort();root.remove();},
    };
  },
};
export default module;
