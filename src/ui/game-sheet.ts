import './game-sheet.css';
import {bindSheetLens} from './webgl-glass';

export type GameSheetState='start'|'paused'|'game-over';
export interface GameSheetControls{touch:string;keyboard:string}
export interface GameSheetOptions{
  title:string;
  controls:GameSheetControls;
  onPlay:()=>void;
  /** Compatibility hooks for a game's existing input and accessibility tests. */
  buttonClass?:string;
  className?:string;
}
interface Values{score?:number|string;best?:number|string}
let sequence=0;

function populate(element:HTMLDivElement,options:GameSheetOptions,existingButton?:HTMLButtonElement){
  const abort=new AbortController(),signal=abort.signal;
  const previousFocus={value:null as HTMLElement|null};
  const panel=document.createElement('section');panel.className='game-sheet-panel ui-glass-sheet';panel.setAttribute('open','');
  const title=document.createElement('h2');title.id=`game-sheet-title-${++sequence}`;title.textContent=options.title;
  const stateLabel=document.createElement('p');stateLabel.className='game-sheet-state';
  const controls=document.createElement('p');controls.className='game-sheet-controls';
  const stats=document.createElement('dl');stats.className='game-sheet-stats';
  const button=existingButton??document.createElement('button');button.type='button';
  button.className=['game-sheet-primary','game-button','secondary',options.buttonClass??''].filter(Boolean).join(' ');
  button.textContent='Play';
  panel.append(title,stateLabel,controls,stats,button);element.replaceChildren(panel);
  element.classList.add('game-sheet');if(options.className)element.classList.add(...options.className.split(/\s+/).filter(Boolean));
  element.setAttribute('role','region');element.setAttribute('aria-labelledby',title.id);
  const host=element.parentElement,dock=element.closest('.game-view')?.querySelector<HTMLElement>('.game-dock');
  function fit(){
    if(!host||!dock)return;
    const area=host.getBoundingClientRect(),controls=dock.getBoundingClientRect();
    const overlaps=controls.right>area.left&&controls.left<area.right&&controls.bottom>area.top&&controls.top<area.bottom;
    const top=overlaps&&controls.top<area.top+area.height/2?Math.max(0,controls.bottom-area.top+8):0;
    element.style.insetBlockStart=`${top}px`;
  }
  const disposeLens=bindSheetLens(panel);
  const resize=new ResizeObserver(fit);if(host)resize.observe(host);if(dock)resize.observe(dock);fit();
  window.addEventListener('resize',fit,{signal});
  // A nonmodal play-area overlay leaves the shared navigation and menu usable.
  // The shell remains the owner of pause state and native modal focus trapping.
  const pointer=matchMedia('(pointer: coarse)');
  const syncControls=()=>{controls.textContent=pointer.matches?options.controls.touch:options.controls.keyboard;controls.hidden=!controls.textContent;};
  pointer.addEventListener('change',syncControls,{signal});syncControls();
  const pause=element.closest('.game-view')?.querySelector<HTMLElement>('#pause-overlay');
  const syncPause=()=>{if(pause&&pause!==element)element.inert=!pause.hidden;};
  const pauseObserver=new MutationObserver(syncPause);if(pause&&pause!==element)pauseObserver.observe(pause,{attributes:true,attributeFilter:['hidden']});syncPause();
  button.addEventListener('click',event=>{
    event.stopPropagation();
    if(pause&&pause!==element&&!pause.hidden){event.preventDefault();return;}
    options.onPlay();
  },{signal});
  for(const name of ['pointerdown','pointerup','touchstart','touchend'] as const)element.addEventListener(name,event=>event.stopPropagation(),{signal});
  // Games often bind Enter/Space on window. Consume keys only while the play
  // area owns focus, so the dock, leaderboard and native sheets retain their keys.
  window.addEventListener('keydown',event=>{
    if(element.hidden||element.closest('[hidden]')||document.querySelector('dialog[open]'))return;
    if(pause&&pause!==element&&!pause.hidden)return;
    const active=document.activeElement;
    if(active instanceof HTMLElement&&active.closest('.game-dock,.lb-sidebar,dialog,input,textarea,select'))return;
    if(active instanceof HTMLElement&&element.contains(active)&&active!==button&&active.closest('button,a,summary'))return;
    if(event.key==='Enter'||event.key===' '){
      event.preventDefault();event.stopImmediatePropagation();
      if(!event.repeat&&!button.disabled)button.click();
    }
  },{capture:true,signal});
  function show(state:GameSheetState,values:Values={}){
    const wasHidden=element.hidden;
    element.dataset.state=state;stateLabel.textContent=state==='paused'?'Paused':state==='game-over'?'Game over':'';stateLabel.hidden=!stateLabel.textContent;
    button.textContent=state==='game-over'?'Play again':'Play';
    stats.replaceChildren();
    for(const [label,value] of [['Score',values.score],['Best',values.best]] as const){
      if(value===undefined)continue;
      const row=document.createElement('div'),term=document.createElement('dt'),number=document.createElement('dd');term.textContent=label;number.textContent=String(value);row.append(term,number);stats.append(row);
    }
    stats.hidden=!stats.childElementCount;element.hidden=false;
    if(wasHidden)previousFocus.value=document.activeElement instanceof HTMLElement?document.activeElement:null;
  }
  function hide(){
    const focused=element.contains(document.activeElement);element.hidden=true;
    if(focused&&previousFocus.value?.isConnected)previousFocus.value.focus({preventScroll:true});
  }
  return{element,button,show,hide,dispose(){abort.abort();disposeLens();resize.disconnect();pauseObserver.disconnect();element.remove();}};
}

/** Presentation and input only. Each game retains its phases, scores and saves. */
export function createGameSheet(host:HTMLElement,options:GameSheetOptions){
  const element=document.createElement('div');element.hidden=true;host.append(element);
  return populate(element,options);
}

/** Adopt the shell's existing pause surface without changing its resume node. */
export function bindGamePauseSheet(container:HTMLElement,options:Pick<GameSheetOptions,'title'|'controls'>){
  const element=container.closest('.game-view')?.querySelector<HTMLDivElement>('#pause-overlay');
  const button=element?.querySelector<HTMLButtonElement>('#resume-game');
  if(!element||!button)return{dispose(){}};
  const hidden=element.hidden;
  const sheet=populate(element,{...options,onPlay(){}},button);
  sheet.show('paused');element.hidden=hidden;
  return{dispose(){sheet.dispose();}};
}
