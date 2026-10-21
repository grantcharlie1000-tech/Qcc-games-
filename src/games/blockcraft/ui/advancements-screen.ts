// The Advancements screen body, built inside the container the ui area frames ('advancements' screen): tabs for the
// three trees plus Statistics; each tree is laid out like the vanilla screen (root on the left, white connectors,
// gold frames once earned, task/goal/challenge frame shapes) on its block background, with a vanilla-style tooltip
// (title bar, description, progress) on hover, focus or tap. Arrow keys move along the tree; a mouse drag pans it.
// Like vanilla, a tree shows only what the player has earned plus two levels beyond (visibleIds); a tab with nothing to
// show is hidden, and before anything is earned the panel shows the vanilla "nothing here" message.
import type {Game} from '../engine/contracts';
import {iconUrl} from '../art/items';
import {tilePixels} from '../art/atlas';
import {TILE,familyStates} from '../data/blocks';
import {ITEMS} from '../data/items';
import {ADVANCEMENTS,ADVANCEMENT_BY_ID,ADVANCEMENT_TABS,layoutTab,visibleIds,type AdvancementTabId,type TreeCell} from './advancements-data';
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
/** The vanilla advancements screen before anything is earned (advancements.empty, advancements.sad_label). */
export const EMPTY_LINES=["There doesn't seem to be anything here...",':('] as const;
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
  /** The tab last shown (remembered between openings); `shown` is what the panel shows now, null for the empty message. */
  let tab:ScreenTab=o.tab,shown:ScreenTab|null=null;
  let visible=visibleIds(a=>tracker.has(a));
  const treeShows=(t:AdvancementTabId)=>visible.has(ADVANCEMENT_TABS.find(x=>x.id===t)!.root);
  const available=(t:ScreenTab)=>t==='statistics'||treeShows(t);
  /** The remembered tab if it has something to show, else the first tree that has; null when no tree has anything yet. */
  const pick=():ScreenTab|null=>available(tab)?tab:ADVANCEMENT_TABS.find(t=>treeShows(t.id))?.id??null;
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
    b.hidden=!available(t.id);
    b.addEventListener('click',()=>select(t.id),{signal});
    tablist.append(b);tabs.push({id:t.id,button:b,count});
  }
  tablist.addEventListener('keydown',e=>{
    const list=tabs.filter(t=>!t.button.hidden),n=list.length,i=list.findIndex(t=>t.id===shown);let next=-1;
    if(e.key==='ArrowRight')next=(i+1)%n;else if(e.key==='ArrowLeft')next=i<0?n-1:(i+n-1)%n;
    else if(e.key==='Home')next=0;else if(e.key==='End')next=n-1;
    if(next<0||!n)return;
    e.preventDefault();e.stopPropagation();select(list[next].id);list[next].button.focus();
  },{signal});

  // ---- Views ----------------------------------------------------------------------------------------
  let tree:TreeView|null=null,stats:StatsView|null=null;
  function show(next:ScreenTab|null){
    shown=next;if(next){tab=next;o.onTab(next);}
    for(const t of tabs){const on=t.id===next;t.button.setAttribute('aria-selected',String(on));t.button.tabIndex=on?0:-1;}
    if(next){panel.setAttribute('aria-labelledby',`bc-adv-tab-${id}-${next}`);panel.removeAttribute('aria-label');}
    else{
      panel.removeAttribute('aria-labelledby');panel.setAttribute('aria-label','Advancements');
      const first=tabs.find(t=>!t.button.hidden);if(first)first.button.tabIndex=0;
    }
    tree?.dispose();stats?.dispose();tree=stats=null;panel.textContent='';
    if(next==='statistics')stats=new StatsView(panel,tracker);
    else if(next)tree=new TreeView(panel,tracker,next,visible);
    else{const empty=el('div','bc-adv-empty');for(const line of EMPTY_LINES)empty.append(el('p','bc-adv-empty-line',line));panel.append(empty);}
  }
  function select(next:ScreenTab){show(next);counts();}
  /** After advancements change: show newly visible nodes and tabs (rebuilding the open tree), or just restyle it. */
  function reveal(){
    const next=visibleIds(a=>tracker.has(a)),changed=next.size!==visible.size||[...next].some(a=>!visible.has(a));
    visible=next;
    for(const t of tabs)t.button.hidden=!available(t.id);
    const want=pick();
    if(want!==shown)show(want);
    else if(changed&&tree&&!tree.matches(visible)){const view=tree.view();show(shown);tree?.restoreView(view);}
    else{tree?.refresh();stats?.refresh();}
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
  show(pick());counts();
  return{
    refresh(what){
      if(what==='tree')reveal();
      else stats?.refresh();
    },
    unmount(){abort.abort();tree?.dispose();stats?.dispose();root.remove();}
  };
}

class TreeView{
  /** scroller (overflow) > canvas (background, at least the scroller's size) > stage (the tree, centred like vanilla). */
  private readonly scroller:HTMLElement;private readonly stage:HTMLElement;private readonly tip:HTMLElement;
  private readonly cells:TreeCell[];private readonly nodes=new Map<string,HTMLButtonElement>();
  private readonly abort=new AbortController();
  /** Ids laid out, in layout order (to tell whether a new visible set changes this tree). */
  private readonly ids:string;
  private tipFor:string|null=null;private drag:{id:number;x:number;y:number;moved:boolean}|null=null;
  constructor(panel:HTMLElement,private readonly tracker:AdvancementTracker,private readonly tabId:AdvancementTabId,visible:ReadonlySet<string>){
    const signal=this.abort.signal,tabDef=ADVANCEMENT_TABS.find(t=>t.id===tabId)!;
    this.cells=layoutTab(tabId,visible);this.ids=this.cells.map(c=>c.def.id).join();
    const cols=Math.max(0,...this.cells.map(c=>c.x))+1,rows=Math.max(0,...this.cells.map(c=>c.y))+1;
    const w=MARGIN*2+(cols-1)*COLUMN+NODE,h=MARGIN*2+(rows-1)*ROW+NODE;
    this.scroller=el('div','bc-adv-tree');this.scroller.dataset.tab=tabId;
    const canvas=el('div','bc-adv-canvas');
    this.stage=el('div','bc-adv-stage');this.stage.style.width=`${w}px`;this.stage.style.height=`${h}px`;
    const bg=tileUrl(tabDef.background);if(bg)this.scroller.style.setProperty('--bc-adv-bg',`url("${bg}")`);
    this.stage.append(this.lines(w,h));
    for(const c of this.cells){
      const b=el('button',`bc-adv-node is-${c.def.frame}`);b.type='button';b.dataset.id=c.def.id;
      b.style.left=`${this.px(c.x,COLUMN)}px`;b.style.top=`${this.px(c.y,ROW)}px`;
      b.append(icon(c.def.icon,'bc-adv-node-icon'),el('span','bc-adv-check'));
      b.addEventListener('focus',()=>this.showTip(c.def.id),{signal});
      b.addEventListener('blur',()=>{if(this.tipFor===c.def.id)this.hideTip();},{signal});
      b.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse')this.showTip(c.def.id);},{signal});
      b.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse'&&document.activeElement!==b)this.hideTip();},{signal});
      b.addEventListener('click',()=>this.showTip(c.def.id),{signal});
      this.nodes.set(c.def.id,b);this.stage.append(b);
    }
    this.tip=el('div','bc-adv-tip');this.tip.id=`bc-adv-tip-${++uid}`;this.tip.setAttribute('role','tooltip');this.tip.hidden=true;
    this.stage.append(this.tip);canvas.append(this.stage);this.scroller.append(canvas);panel.append(this.scroller);
    this.stage.addEventListener('keydown',e=>this.key(e),{signal});
    this.scroller.addEventListener('pointerdown',e=>this.pointerDown(e),{signal});
    this.scroller.addEventListener('pointermove',e=>this.pointerMove(e),{signal});
    for(const type of ['pointerup','pointercancel'] as const)this.scroller.addEventListener(type,e=>{
      if(this.drag?.id===e.pointerId){this.drag=null;this.scroller.classList.remove('is-panning');}
    },{signal});
    this.refresh();
  }
  private px(v:number,pitch:number){return Math.round(MARGIN+v*pitch);}
  /** True when this tree already shows exactly the visible part of its tab. */
  matches(visible:ReadonlySet<string>){return layoutTab(this.tabId,visible).map(c=>c.def.id).join()===this.ids;}
  /** Focused node and scroll position, carried over when the tree is rebuilt with more nodes. */
  view(){
    const a=document.activeElement as HTMLElement|null;
    return{focus:a&&this.stage.contains(a)?a.dataset.id??null:null,left:this.scroller.scrollLeft,top:this.scroller.scrollTop};
  }
  restoreView(v:{focus:string|null;left:number;top:number}){
    this.scroller.scrollLeft=v.left;this.scroller.scrollTop=v.top;
    if(v.focus)this.nodes.get(v.focus)?.focus({preventScroll:true});
  }
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
    // Beside the node, kept inside the visible part of the tree (stage coordinates).
    const nx=node.offsetLeft,ny=node.offsetTop,tw=tip.offsetWidth,th=tip.offsetHeight,s=this.scroller;
    const left=s.scrollLeft-this.stage.offsetLeft,top=s.scrollTop-this.stage.offsetTop;
    const minX=left+4,maxX=left+s.clientWidth-tw-4,minY=top+4,maxY=top+s.clientHeight-th-4;
    let x=nx+NODE+6,y=ny-2;
    if(x>maxX){
      x=nx-tw-6;
      // No room on either side (narrow screens): below the node, or above it near the bottom edge.
      if(x<minX){x=nx+NODE/2-tw/2;y=ny+NODE+6;if(y>maxY)y=ny-th-6;}
    }
    x=Math.max(minX,Math.min(maxX,x));y=Math.max(minY,Math.min(maxY,y));
    tip.style.left=`${x}px`;tip.style.top=`${y}px`;
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
