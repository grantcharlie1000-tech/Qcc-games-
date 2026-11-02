import type {GameId} from '../core/types';

// Layout/artwork only. These are rendered cells, not model state or hit maps.
const cells:Partial<Record<GameId,string>>={
 'fruit-merge':'.fm-board','water-sort':'.ws-tube','color-blocks':'.cb-board',tower:'.tower-viewport',snake:'.snake-canvas',
 minesweeper:'.ms-board',solitaire:'.sol-top,.sol-tableau','block-fill':'.bf-board','color-connect':'.cc-grid',pool:'.pool-table,.pool-players',
 'flappy-bird':'.fb-scene',globle:'.gl-globe','maze-muncher':'.mm-svg',slipline:'.sl-board',quadfall:'.qf-board,.qf-hold,.qf-next',fivefold:'.ff-board,.ff-keyboard'
};
const fullBleed=new Set<GameId>(['animal-stack','ball-run','neon-coil','blockcraft']);
const textSelector='h1,h2,h3,.fm-top,.sol-summary,.cc-stats,.sl-header,.bf-counter,.gl-message,.pool-players,.pool-inhand,.pool-live,.cc-hud,.cc-counters';
type Rect={left:number;top:number;right:number;bottom:number};
const overlap=(a:Rect,b:Rect)=>a.left<b.right+.5&&b.left<a.right+.5&&a.top<b.bottom+.5&&b.top<a.bottom+.5;

/** Use existing free scene margins; only a real collision asks for headroom.
 * There is no painted/reserved dock row. Full-bleed scenes keep their canvas/input
 * mapping and expose the cluster's bounds to their game-owned foreground HUD. */
export function bindDockClearance(view:HTMLElement,id:GameId):{dispose():void}{
 const dock=view.querySelector<HTMLElement>('.game-dock')!,stage=view.querySelector<HTMLElement>('#game-stage')!;
 let frame=0,disposed=false,clearance=0,viewport='',shape={width:0,height:0};
 const publish=()=>{
  const top=dock.offsetTop,left=dock.offsetLeft;
  view.style.setProperty('--game-dock-top',`${top}px`);view.style.setProperty('--game-dock-bottom',`${top+dock.offsetHeight}px`);
  view.style.setProperty('--game-dock-inline-size',`${dock.offsetWidth}px`);view.style.setProperty('--game-dock-inline-end',`${left+dock.offsetWidth}px`);
 };
 const visible=(e:Element)=>{const s=getComputedStyle(e);return e.getClientRects().length>0&&s.visibility!=='hidden'&&!e.closest('dialog:not([open]),[hidden],.sr-only');};
 const boxes=():Rect[]=>{
  const result:Rect[]=[];
  for(const e of stage.querySelectorAll(`${cells[id]??':not(*)'},button,input,select`))if(visible(e))result.push(e.getBoundingClientRect());
  for(const e of stage.querySelectorAll(textSelector))if(visible(e)){
   const walker=document.createTreeWalker(e,NodeFilter.SHOW_TEXT);
   while(walker.nextNode())if(walker.currentNode.textContent?.trim()&&visible(walker.currentNode.parentElement!)){
    const range=document.createRange();range.selectNodeContents(walker.currentNode);for(const r of range.getClientRects())if(r.width&&r.height)result.push(r);
   }
  }
  return result;
 };
 const measure=()=>{
  frame=0;if(disposed||!view.isConnected||!dock.isConnected)return;publish();
  if(fullBleed.has(id))return;
  const key=`${view.clientWidth}/${view.clientHeight}/${dock.dataset.dockPlacement}`;
  const contracted=dock.offsetWidth<shape.width-.5||dock.offsetHeight<shape.height-.5;
  shape={width:dock.offsetWidth,height:dock.offsetHeight};
  if(clearance&&(viewport&&key!==viewport||contracted)){clearance=0;view.style.removeProperty('--game-dock-clearance');viewport=key;schedule();return;}
  viewport=key;
  const r=view.getBoundingClientRect(),edge={left:r.left+dock.offsetLeft-6,right:r.left+dock.offsetLeft+dock.offsetWidth+6,top:r.top+dock.offsetTop-4,bottom:r.top+dock.offsetTop+dock.offsetHeight+6};
  const hits=boxes().filter(b=>overlap(edge,b));
  if(hits.length){
   const delta=edge.bottom+6-Math.min(...hits.map(b=>b.top));
   // Width-fitted scenes sit in vertical slack. Moving their container by d
   // initially moves the centred artwork by d/2; solve that first placement
   // before paint, including when a game's clock/RAF is paused.
   const slack=stage.classList.contains('viewport-fitted')?Math.max(0,stage.parentElement!.clientHeight-stage.getBoundingClientRect().height):0;
   const next=Math.min(view.clientHeight*.4,Math.ceil(clearance+Math.max(1,delta)+Math.min(Math.max(0,delta),slack/2)));
   if(next>clearance){clearance=next;view.style.setProperty('--game-dock-clearance',`${clearance}px`);}
  }
 };
 const schedule=()=>{if(!disposed&&!frame)frame=requestAnimationFrame(measure);};
 const resize=new ResizeObserver(schedule);resize.observe(view);resize.observe(dock);resize.observe(stage.parentElement!);if(stage.firstElementChild)resize.observe(stage.firstElementChild);
 const caption=view.querySelector('#game-level');let lastCaption=caption?.textContent;
 const placement=new MutationObserver(records=>{
  if(caption?.textContent!==lastCaption){lastCaption=caption?.textContent;queueMicrotask(()=>{cancelAnimationFrame(frame);measure();});}
  else if(records.some(r=>r.target===dock))schedule();
 });
 placement.observe(dock,{attributes:true,attributeFilter:['data-dock-placement','data-dock-actions']});
 if(caption)placement.observe(caption,{childList:true,subtree:true,characterData:true});
 window.addEventListener('resize',schedule);queueMicrotask(measure);
 return{dispose(){disposed=true;cancelAnimationFrame(frame);resize.disconnect();placement.disconnect();window.removeEventListener('resize',schedule);}};
}
