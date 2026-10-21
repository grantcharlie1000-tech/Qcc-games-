// The Advancements screen body, built inside the container the ui area frames ('advancements' screen): tabs for the
// three trees plus Statistics; each tree is laid out like the vanilla screen (root on the left, white connectors,
// gold frames once earned, task/goal/challenge frame shapes) on its block background, with a vanilla-style tooltip
// (title bar, description, progress) on hover, focus or tap. Arrow keys move along the tree; a mouse drag pans it.
import type {Game} from '../engine/contracts';
import {iconUrl} from '../art/items';
import {tilePixels} from '../art/atlas';
import {TILE,familyStates} from '../data/blocks';
import {ITEMS} from '../data/items';
import {ADVANCEMENTS,ADVANCEMENT_BY_ID,ADVANCEMENT_TABS,layoutTab,type AdvancementTabId,type TreeCell} from './advancements-data';
import {statRows,topEntries,type Statistics} from './advancements-stats';
import type {AdvancementTracker} from './advancements-tracker';

export type ScreenTab=AdvancementTabId|'statistics';
export interface MountedScreen{
  /** 'tree' after advancements change; 'stats' on the periodic statistics refresh. */
  refresh(what:'tree'|'stats'):void;
  unmount():void;
}
export interface ScreenOptions{tracker:AdvancementTracker;game:Game;tab:ScreenTab;onTab(tab:ScreenTab):void}

/** Tree geometry in CSS pixels: frame size, column and row pitch, outer margin. */
export const NODE=40,COLUMN=60,ROW=48,MARGIN=22;
const LIST_LIMIT=8;
let uid=0;
const titleCase=(id:string)=>id.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
const safeIcon=(id:string)=>{try{return iconUrl(id);}catch{return'';}};
const tileUrls=new Map<string,string>();
function tileUrl(tile:string):string{
  let url=tileUrls.get(tile);
  if(url===undefined){
    url='';
    try{
      const c=document.createElement('canvas');c.width=TILE;c.height=TILE;
      const ctx=c.getContext('2d');
      if(ctx){ctx.putImageData(new ImageData(new Uint8ClampedArray(tilePixels(tile)),TILE,TILE),0,0);url=c.toDataURL();}
    }catch{url='';}
    tileUrls.set(tile,url);
  }
  return url;
}
function el<K extends keyof HTMLElementTagNameMap>(tag:K,cls?:string,text?:string):HTMLElementTagNameMap[K]{
  const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;
}
function icon(id:string,cls:string){const i=el('img',cls);i.alt='';i.draggable=false;const src=safeIcon(id);if(src)i.src=src;return i;}
/** Readable name of a counted key (food item, mob kind). */
const keyName=(key:string)=>ITEMS.get(key)?.displayName??titleCase(key);
const familyName=(family:string)=>familyStates(family)[0]?.displayName??titleCase(family);
const familyIcon=(family:string)=>ITEMS.has(family)?family:familyStates(family)[0]?.item??family;

export function mountAdvancementsScreen(container:HTMLElement,o:ScreenOptions):MountedScreen{
  const {tracker,game}=o,id=++uid,abort=new AbortController(),signal=abort.signal;
  let tab:ScreenTab=o.tab;
  const root=el('div','bc-adv');
  if(game.context.settings.colorBlind)root.classList.add('is-cb');
  const tablist=el('div','bc-adv-tabs');tablist.setAttribute('role','tablist');tablist.setAttribute('aria-label','Advancement categories');
  const panel=el('div','bc-adv-panel');panel.id=`bc-adv-panel-${id}`;panel.setAttribute('role','tabpanel');
  const summary=el('p','bc-adv-summary');summary.setAttribute('aria-live','polite');
  root.append(tablist,panel,summary);container.append(root);

  // ---- Tabs ---------------------------------------------------------------------------------------
  const tabs:{id:ScreenTab;button:HTMLButtonElement;count:HTMLElement|null}[]=[];
  for(const t of [...ADVANCEMENT_TABS.map(t=>({id:t.id as ScreenTab,title:t.title,icon:t.icon})),{id:'statistics' as ScreenTab,title:'Statistics',icon:'book'}]){
    const b=el('button','bc-adv-tab');b.type='button';b.id=`bc-adv-tab-${id}-${t.id}`;b.setAttribute('role','tab');b.setAttribute('aria-controls',panel.id);
    b.append(icon(t.icon,'bc-adv-tab-icon'),el('span','bc-adv-tab-name',t.title));
    const count=t.id==='statistics'?null:el('span','bc-adv-tab-count');if(count)b.append(count);
    b.addEventListener('click',()=>select(t.id),{signal});
    tablist.append(b);tabs.push({id:t.id,button:b,count});
  }
  tablist.addEventListener('keydown',e=>{
    const i=tabs.findIndex(t=>t.id===tab);let next=-1;
    if(e.key==='ArrowRight')next=(i+1)%tabs.length;else if(e.key==='ArrowLeft')next=(i+tabs.length-1)%tabs.length;
    else if(e.key==='Home')next=0;else if(e.key==='End')next=tabs.length-1;
    if(next<0)return;
    e.preventDefault();e.stopPropagation();select(tabs[next].id);tabs[next].button.focus();
  },{signal});

  // ---- Views ----------------------------------------------------------------------------------------
  let tree:TreeView|null=null,stats:StatsView|null=null;
  function select(next:ScreenTab){
    tab=next;o.onTab(next);
    for(const t of tabs){const on=t.id===next;t.button.setAttribute('aria-selected',String(on));t.button.tabIndex=on?0:-1;}
    panel.setAttribute('aria-labelledby',`bc-adv-tab-${id}-${next}`);
    tree?.dispose();stats?.dispose();tree=stats=null;panel.textContent='';
    if(next==='statistics')stats=new StatsView(panel,tracker);else tree=new TreeView(panel,tracker,next);
    counts();
  }
  function counts(){
    const all=ADVANCEMENTS.length,made=ADVANCEMENTS.filter(a=>tracker.has(a.id)).length;
    for(const t of tabs){
      if(!t.count)continue;
      const defs=ADVANCEMENTS.filter(a=>a.tab===t.id),n=defs.filter(a=>tracker.has(a.id)).length;
      t.count.textContent=`${n}/${defs.length}`;
      t.button.setAttribute('aria-label',`${t.button.querySelector('.bc-adv-tab-name')?.textContent}, ${n} of ${defs.length} made`);
    }
    summary.textContent=`${made} of ${all} advancements made`;
  }
  select(tab);
  return{
    refresh(what){
      if(what==='tree'){counts();tree?.refresh();stats?.refresh();}
      else stats?.refresh();
    },
    unmount(){abort.abort();tree?.dispose();stats?.dispose();root.remove();}
  };
}

class TreeView{
  private readonly scroller:HTMLElement;private readonly canvas:HTMLElement;private readonly tip:HTMLElement;
  private readonly cells:TreeCell[];private readonly nodes=new Map<string,HTMLButtonElement>();
  private readonly abort=new AbortController();
  private tipFor:string|null=null;private drag:{id:number;x:number;y:number;moved:boolean}|null=null;
  constructor(panel:HTMLElement,private readonly tracker:AdvancementTracker,tabId:AdvancementTabId){
    const signal=this.abort.signal,tabDef=ADVANCEMENT_TABS.find(t=>t.id===tabId)!;
    this.cells=layoutTab(tabId);
    const cols=Math.max(...this.cells.map(c=>c.x))+1,rows=Math.max(...this.cells.map(c=>c.y))+1;
    const w=MARGIN*2+(cols-1)*COLUMN+NODE,h=MARGIN*2+(rows-1)*ROW+NODE;
    this.scroller=el('div','bc-adv-tree');this.scroller.dataset.tab=tabId;
    this.canvas=el('div','bc-adv-canvas');this.canvas.style.width=`${w}px`;this.canvas.style.height=`${h}px`;
    const bg=tileUrl(tabDef.background);if(bg)this.scroller.style.setProperty('--bc-adv-bg',`url("${bg}")`);
    this.canvas.append(this.lines(w,h));
    for(const c of this.cells){
      const b=el('button',`bc-adv-node is-${c.def.frame}`);b.type='button';b.dataset.id=c.def.id;
      b.style.left=`${this.px(c.x,COLUMN)}px`;b.style.top=`${this.px(c.y,ROW)}px`;
      b.append(icon(c.def.icon,'bc-adv-node-icon'),el('span','bc-adv-check'));
      b.addEventListener('focus',()=>this.showTip(c.def.id),{signal});
      b.addEventListener('blur',()=>{if(this.tipFor===c.def.id)this.hideTip();},{signal});
      b.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse')this.showTip(c.def.id);},{signal});
      b.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse'&&document.activeElement!==b)this.hideTip();},{signal});
      b.addEventListener('click',()=>this.showTip(c.def.id),{signal});
      this.nodes.set(c.def.id,b);this.canvas.append(b);
    }
    this.tip=el('div','bc-adv-tip');this.tip.id=`bc-adv-tip-${++uid}`;this.tip.setAttribute('role','tooltip');this.tip.hidden=true;
    this.canvas.append(this.tip);this.scroller.append(this.canvas);panel.append(this.scroller);
    this.canvas.addEventListener('keydown',e=>this.key(e),{signal});
    this.scroller.addEventListener('pointerdown',e=>this.pointerDown(e),{signal});
    this.scroller.addEventListener('pointermove',e=>this.pointerMove(e),{signal});
    for(const type of ['pointerup','pointercancel'] as const)this.scroller.addEventListener(type,e=>{if(this.drag?.id===e.pointerId)this.drag=null;},{signal});
    this.refresh();
  }
  private px(v:number,pitch:number){return Math.round(MARGIN+v*pitch);}
  /** Vanilla connectors: from the parent's centre right to the middle of the gap, down/up to the child's row, then into the child. */
  private lines(w:number,h:number){
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
    svg.setAttribute('class','bc-adv-lines');svg.setAttribute('width',String(w));svg.setAttribute('height',String(h));svg.setAttribute('aria-hidden','true');
    let d='';
    for(const c of this.cells){
      if(!c.def.parent)continue;
      const p=this.cells.find(q=>q.def.id===c.def.parent)!,half=NODE/2;
      const px=this.px(p.x,COLUMN)+half,py=this.px(p.y,ROW)+half,cx=this.px(c.x,COLUMN)+half,cy=this.px(c.y,ROW)+half;
      const mid=this.px(p.x,COLUMN)+NODE+Math.round((COLUMN-NODE)/2);
      d+=`M${px} ${py}H${mid}V${cy}H${cx}`;
    }
    for(const cls of ['bc-adv-line-shadow','bc-adv-line']){const path=document.createElementNS(ns,'path');path.setAttribute('class',cls);path.setAttribute('d',d);svg.append(path);}
    return svg;
  }
  refresh(){
    for(const [id,b] of this.nodes){
      const def=ADVANCEMENT_BY_ID.get(id)!,done=this.tracker.has(id),p=this.tracker.progress(id);
      b.classList.toggle('is-done',done);
      b.setAttribute('aria-label',`${def.title}. ${def.description}. ${done?'Made':'Not made yet'}${p&&!done?`, ${p[0]} of ${p[1]}`:''}.`);
    }
    if(this.tipFor)this.showTip(this.tipFor);
  }
  private showTip(id:string){
    const def=ADVANCEMENT_BY_ID.get(id),node=this.nodes.get(id);if(!def||!node)return;
    const done=this.tracker.has(id),p=this.tracker.progress(id),tip=this.tip;
    this.tipFor=id;tip.textContent='';tip.className=`bc-adv-tip is-${def.frame}${done?' is-done':''}`;
    const bar=el('div','bc-adv-tip-bar');bar.append(el('span','bc-adv-tip-title',def.title));
    if(p)bar.append(el('span','bc-adv-tip-count',`${p[0]}/${p[1]}`));
    const body=el('div','bc-adv-tip-body');body.append(el('p','bc-adv-tip-desc',def.description));
    if(p){
      const meter=el('div','bc-adv-tip-meter'),fill=el('i');fill.style.width=`${Math.round(p[0]/p[1]*100)}%`;meter.append(fill);body.append(meter);
      const keys=this.tracker.collectedKeys(id);
      if(keys.length&&!done)body.append(el('p','bc-adv-tip-list',`Done: ${keys.map(keyName).join(', ')}`));
    }
    const day=this.tracker.earnedOn(id);
    body.append(el('p','bc-adv-tip-when',done?`Made on day ${day}`:def.parent&&!this.tracker.has(def.parent)
      ?`Follows ${ADVANCEMENT_BY_ID.get(def.parent)!.title}`:'Not made yet'));
    tip.append(bar,body);tip.hidden=false;
    node.setAttribute('aria-describedby',tip.id);
    // Beside the node, kept inside the visible part of the tree.
    const nx=node.offsetLeft,ny=node.offsetTop,tw=tip.offsetWidth,th=tip.offsetHeight,s=this.scroller;
    const minX=s.scrollLeft+4,maxX=s.scrollLeft+s.clientWidth-tw-4,minY=s.scrollTop+4,maxY=s.scrollTop+s.clientHeight-th-4;
    let x=nx+NODE+6;if(x>maxX)x=nx-tw-6;
    x=Math.max(minX,Math.min(maxX,x));const y=Math.max(minY,Math.min(maxY,ny-2));
    tip.style.left=`${Math.max(0,x)}px`;tip.style.top=`${Math.max(0,y)}px`;
  }
  private hideTip(){
    if(this.tipFor)this.nodes.get(this.tipFor)?.removeAttribute('aria-describedby');
    this.tipFor=null;this.tip.hidden=true;
  }
  /** Left: parent; Right: first child; Up/Down: the nearest node in the same column. */
  private key(e:KeyboardEvent){
    const id=(e.target as HTMLElement|null)?.dataset?.id,cell=id?this.cells.find(c=>c.def.id===id):undefined;if(!cell)return;
    let next:TreeCell|undefined;
    if(e.key==='ArrowLeft')next=this.cells.find(c=>c.def.id===cell.def.parent);
    else if(e.key==='ArrowRight')next=this.cells.find(c=>c.def.parent===cell.def.id);
    else if(e.key==='ArrowUp'||e.key==='ArrowDown'){
      const up=e.key==='ArrowUp';
      for(const c of this.cells)if(c.x===cell.x&&(up?c.y<cell.y:c.y>cell.y)&&(!next||Math.abs(c.y-cell.y)<Math.abs(next.y-cell.y)))next=c;
    }else return;
    e.preventDefault();e.stopPropagation();
    if(next){const b=this.nodes.get(next.def.id)!;b.focus({preventScroll:true});b.scrollIntoView({block:'nearest',inline:'nearest'});}
  }
  private pointerDown(e:PointerEvent){
    if(e.pointerType!=='mouse'||e.button!==0)return;
    if(!(e.target as HTMLElement).closest('.bc-adv-node'))this.hideTip();
    this.drag={id:e.pointerId,x:e.clientX,y:e.clientY,moved:false};
  }
  private pointerMove(e:PointerEvent){
    const d=this.drag;if(!d||d.id!==e.pointerId)return;
    const dx=e.clientX-d.x,dy=e.clientY-d.y;
    if(!d.moved&&Math.abs(dx)+Math.abs(dy)<4)return;
    if(!d.moved){d.moved=true;try{this.scroller.setPointerCapture(e.pointerId);}catch{/* pointer already gone */}this.scroller.classList.add('is-panning');}
    this.scroller.scrollLeft-=dx;this.scroller.scrollTop-=dy;d.x=e.clientX;d.y=e.clientY;
    if(e.buttons===0){this.drag=null;this.scroller.classList.remove('is-panning');}
  }
  dispose(){this.abort.abort();this.scroller.remove();}
}

class StatsView{
  private readonly root:HTMLElement;private readonly values=new Map<string,HTMLElement>();
  private readonly lists:{key:'minedBy'|'craftedBy'|'killedBy';list:HTMLElement;signature:string}[]=[];
  constructor(panel:HTMLElement,private readonly tracker:AdvancementTracker){
    this.root=el('div','bc-adv-stats');
    const general=el('section','bc-adv-stat-sec'),dl=el('dl','bc-adv-stat-list');
    general.append(el('h3','bc-adv-stat-head','General'),dl);
    for(const row of statRows(tracker.statistics())){
      const item=el('div','bc-adv-stat-row'),dd=el('dd','bc-adv-stat-val',row.value);
      item.append(el('dt','bc-adv-stat-name',row.label),dd);dl.append(item);this.values.set(row.key,dd);
    }
    this.root.append(general);
    for(const [key,title] of [['minedBy','Blocks Mined'],['craftedBy','Items Crafted'],['killedBy','Mobs Killed']] as const){
      const sec=el('section','bc-adv-stat-sec'),list=el('ul','bc-adv-stat-items');
      sec.append(el('h3','bc-adv-stat-head',title),list);this.root.append(sec);
      this.lists.push({key,list,signature:'-'});
    }
    panel.append(this.root);
    this.refresh();
  }
  refresh(){
    const s:Statistics=this.tracker.statistics();
    for(const row of statRows(s)){const dd=this.values.get(row.key);if(dd&&dd.textContent!==row.value)dd.textContent=row.value;}
    for(const l of this.lists){
      const top=topEntries(s[l.key],LIST_LIMIT),signature=JSON.stringify(top);
      if(signature===l.signature)continue;
      l.signature=signature;l.list.textContent='';
      if(!top.length){l.list.append(el('li','bc-adv-stat-empty','Nothing yet'));continue;}
      for(const [key,n] of top){
        const li=el('li','bc-adv-stat-item');
        const name=l.key==='minedBy'?familyName(key):l.key==='killedBy'?titleCase(key):keyName(key);
        const iconId=l.key==='minedBy'?familyIcon(key):l.key==='killedBy'?`${key}_spawn_egg`:key;
        li.append(icon(iconId,'bc-adv-stat-icon'),el('span','bc-adv-stat-label',name),el('span','bc-adv-stat-num',n.toLocaleString('en-US')));
        l.list.append(li);
      }
    }
  }
  dispose(){this.root.remove();}
}
