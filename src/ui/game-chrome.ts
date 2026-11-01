import type {GameId} from '../core/types';
import {bindGlass} from './glass';

type Field={label:string;source:string;attribute?:string;labelSource?:string};
const score:Field={label:'Score',source:'#game-score strong'};
const level:Field={label:'',source:'#game-level'};
/** Read the game's existing presentation. Models and the frozen context API remain the owners of state. */
const fields:Record<GameId,Field[]>={
  strongroom:[level],
  'fruit-merge':[score], 'water-sort':[level], 'color-blocks':[score],
  tower:[{label:'Floors',source:'.tower-height'},{label:'Streak',source:'.tower-combo'}],
  snake:[score], 'neon-coil':[{label:'Mass',source:'.nc-mass'}],
  minesweeper:[{label:'Flags',source:'.ms-count'},{label:'Time',source:'.ms-time'}],
  solitaire:[level], 'block-fill':[level,{label:'Covered',source:'.bf-counter strong'}],
  'color-connect':[{label:'',source:'.cc-pairs'},{label:'',source:'.cc-progress'}],
  'ball-run':[{label:'Score',source:'.br-score',labelSource:'.br-mode-label'},{label:'Next record',source:'.br-target-value',labelSource:'.br-target-label'}], pool:[level], 'animal-stack':[score,level],
  'flappy-bird':[{...score,label:'Gates'}],
  globle:[{label:'',source:'.gl-round'},{label:'Guesses',source:'.gl-count'}],
  blockcraft:[level], 'maze-muncher':[score,level],
  'corn-clicker':[{label:'Kernels',source:'.cc-kernels-num'},{label:'Per second',source:'.cc-cps'}],
  slipline:[{label:'',source:'.sl-level'},{label:'',source:'.sl-hearts',attribute:'aria-label'}],
  quadfall:[score,level], fivefold:[{label:'',source:'.ff-puzzle'}]
};

type Choice={selector:string;label?:string};
const choices:Partial<Record<GameId,Choice[]>>={
  'water-sort':[{selector:'.ws-difficulty'},{selector:'.ws-level'}],
  minesweeper:[{selector:'.ms-level'}],
  'color-connect':[{selector:'.cc-picker'}],
  pool:[{selector:'.pool-mode select'},{selector:'.pool-multiplayer'}],
  fivefold:[{selector:'.ff-modes button'},{selector:'.ff-stats-button',label:'Stats'},{selector:'.ff-new',label:'New practice word'}],
  globle:[{selector:'.gl-mode'}],
  'corn-clicker':[{selector:'.cc-face-toggle'}]
};

// Presentation backgrounds only. Copy the existing game's surface through the
// reserved dock area; no canvas copies, game-state reads or per-frame sampling.
const surfaceSources:Partial<Record<GameId,string>>={
  'fruit-merge':'.fm-board',tower:'.tower-viewport',solitaire:'.solitaire','block-fill':'.bf-game',
  'color-connect':'.cc-game','water-sort':'.ws-game','color-blocks':'.cb-game',
  fivefold:'.ff',quadfall:'.qf-game',slipline:'.sl-game'
};
const lightSurfaces=new Set<GameId>(['fruit-merge','tower','flappy-bird','animal-stack','blockcraft']);

export function bindGameChrome(view:HTMLElement,id:GameId):{options(host:HTMLElement,activate:(action:()=>void)=>void):void;dispose():void}{
  const dock=view.querySelector<HTMLElement>('.game-dock')!;
  const hud=dock.querySelector<HTMLElement>('.game-hud')!;
  view.dataset.glassTone=lightSurfaces.has(id)?'light':'dark';
  const surface=view.querySelector<HTMLElement>('.game-surface')!;
  const source=surfaceSources[id]?view.querySelector(surfaceSources[id]!):null;
  if(source){
    const style=getComputedStyle(source);
    surface.style.backgroundColor=style.backgroundColor;
    surface.style.backgroundImage=style.backgroundImage;
    surface.style.backgroundSize=style.backgroundSize;
    surface.style.backgroundPosition=style.backgroundPosition;
  }
  // Continue Fruit Merge's existing 32px checkerboard outside its basket. Its
  // artwork is painted into a 360px canvas; align the CSS continuation to that
  // canvas after layout, including when a phone rotates. This is background art
  // only and never copies the moving fruit or consumes input.
  const alignSurface=()=>{
    if(id!=='fruit-merge'||!source)return;
    const board=source.getBoundingClientRect(),box=view.getBoundingClientRect(),scale=board.width/360;
    surface.style.backgroundImage='repeating-conic-gradient(#eed6a842 0% 25%, transparent 0% 50%)';
    surface.style.backgroundSize=`${64*scale}px ${64*scale}px`;
    surface.style.backgroundPosition=`${board.x-box.x}px ${board.y-box.y+90*scale}px`;
  };
  const surfaceResize=id==='fruit-merge'?new ResizeObserver(alignSurface):undefined;
  if(source)surfaceResize?.observe(source);
  surfaceResize?.observe(view.querySelector('.stage-wrap')!);
  alignSurface();
  const glass=[...dock.querySelectorAll<HTMLElement>('.arcade-glass')].map(bindGlass);
  const observers:MutationObserver[]=[];
  for(const field of fields[id]){
    const source=view.querySelector<HTMLElement>(field.source);
    if(!source)continue;
    const item=document.createElement('span'),label=document.createElement('small'),value=document.createElement('strong');
    item.className='game-hud-item';label.textContent=field.label;item.append(label,value);hud.append(item);
    const sync=()=>{
      // Some games replace the value element on each render (for example Block Fill).
      const current=view.querySelector<HTMLElement>(field.source);
      const next=(field.attribute?current?.getAttribute(field.attribute):current?.textContent)?.trim()??'';
      const nextLabel=field.labelSource?view.querySelector(field.labelSource)?.textContent?.trim()||field.label:field.label;
      if(label.textContent!==nextLabel)label.textContent=nextLabel;
      if(value.textContent!==next)value.textContent=next;
      item.hidden=!next;
    };
    sync();
    const observer=new MutationObserver(sync);
    observer.observe(source.parentElement!,{childList:true,subtree:true,characterData:true,attributes:!!field.attribute,attributeFilter:field.attribute?[field.attribute]:undefined});
    observers.push(observer);
  }
  const sources=()=> (choices[id]??[]).flatMap(choice=>[...view.querySelectorAll<HTMLButtonElement|HTMLSelectElement>(`#game-stage ${choice.selector}`)].map(source=>({source,label:choice.label??source.getAttribute('aria-label')??source.textContent?.trim()??''})));
  // Sources retain their game-owned listeners and DOM ancestry. Menu choices invoke them only after closing/resuming.
  for(const {source} of sources())source.classList.add('game-menu-source');
  return {
    options(host,activate){
      host.replaceChildren();
      for(const {source,label} of sources()){
        if(source.hidden)continue;
        if(source instanceof HTMLSelectElement){
          const row=document.createElement('label'),text=document.createElement('span'),select=document.createElement('select');
          row.className='game-menu-choice';text.textContent=label;select.setAttribute('aria-label',label);
          for(const option of source.options)select.append(option.cloneNode(true));
          select.value=source.value;select.disabled=source.disabled;
          select.addEventListener('change',()=>activate(()=>{source.value=select.value;source.dispatchEvent(new Event('change',{bubbles:true}));}));
          row.append(text,select);host.append(row);
        }else{
          const button=document.createElement('button');button.type='button';button.className='game-menu-action';button.textContent=label;
          button.disabled=source.disabled;
          if(source.hasAttribute('aria-pressed'))button.setAttribute('aria-pressed',source.getAttribute('aria-pressed')!);
          button.addEventListener('click',()=>activate(()=>source.click()));host.append(button);
        }
      }
      host.hidden=!host.childElementCount;
    },
    dispose(){surfaceResize?.disconnect();for(const binding of glass)binding.dispose();for(const observer of observers)observer.disconnect();}
  };
}
