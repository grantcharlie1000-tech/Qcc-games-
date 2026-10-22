// Inventory-like screens (inventory & screens area): the UI service. ui/screen-controller.ts holds the logic
// (open/close, slot menu, cursor, creative tabs, recipe book, keys); this module is its DOM view:
//  - one layer (z-index 20) with the panel, an optional recipe book beside it, the carried stack and tooltips;
//  - vanilla Java mouse input (press/release timing, drags, double clicks, middle click) through SlotPointer, plus
//    touch (tap, long press for half, drag to spread or move, quick-move toggle) and keyboard (focusable slots,
//    arrows, Enter/Space, Shift for quick move, Ctrl for a right click, 1-9 / F / Q on the focused slot);
//  - the action-bar toast (z-index 25).
// Slots redraw by diffing each frame (stack identity, drag preview), so nothing is rebuilt while the world runs.
// Looks: the vanilla Java container GUI, drawn by screens.css from the pixel art in ui/screen-art.ts at a whole number
// of screen pixels per GUI pixel where the game area allows (--bc-u); stack counts and text use the GUI pixel font.
import './screens.css';
import {iconUrl} from '../art/items';
import type {ItemStack} from '../data/items';
import type {Game,UIService} from '../engine/contracts';
import {ScreenController,type ScreenView} from './screen-controller';
import {esc,type ScreenBuild} from './screen-common';
import {GUI_COLOURS,figureSvg,guiArtProperties,knobOffset,pixelTextHtml,scrollForKnob} from './screen-art';
import {CREATIVE_LAYOUT,searchDrawable,searchFieldHtml,searchIndexAt,searchScroll} from './screen-creative';
import {ARROW_COLUMNS,FLAME_ROWS,furnaceGauges} from './screen-furnace';
import {durabilityBar,itemName,slotLabel,tooltipColour,tooltipLines} from './screen-tooltip';
import {digitsUrl,textWidth} from './hud-art';
import {LONG_PRESS_MS,type PointerKind,type SlotHit} from './slots-input';
import type {CreativeTabId} from './screen-catalog';

export function createUI(game:Game):UIService{
  const view=new DomScreens(game);
  const controller=new ScreenController(game,view);
  view.attach(controller);
  return controller;
}

/** Pixels a finger may move before a touch stops being a tap. */
const TOUCH_SLOP=10;
/** Mouse events right after a touch are the browser's emulation of it. */
const TOUCH_MOUSE_GUARD_MS=800;
/** How long a touch tooltip stays up. */
const TOUCH_TIP_MS=1600;
const TOAST_MS=2500;
/** The screen layer's touch-mode class. Not `.bc-touch`: that is the player's touch-controls layer (touch.css styles it
 *  as a click-through layer under the screens). Screen markup also avoids the HUD's class names (.bc-armor, .bc-offhand). */
export const SCREEN_TOUCH='bc-screen-touch';

interface SlotEl{
  btn:HTMLButtonElement;img:HTMLImageElement;n:HTMLElement;bar:HTMLElement;fill:HTMLElement;
  /** Last drawn state. */
  stack:ItemStack|null;preview:number;ghost:string|null;carried:boolean;icon:string;drawn:boolean;
  /** Creative picker icons load when scrolled into view. */
  lazy:boolean;visible:boolean;
  /** Index in the crafting grid for 'grid' slots, else -1. */
  cell:number;
}
/** Pixel-art icon of a tool button (screen-art TOOL_ICON_GRIDS, drawn by screens.css). */
const icon=(name:'book'|'quick'|'close')=>`<i class="bc-glyph" data-icon="${name}" aria-hidden="true"></i>`;
/** Recipe book panel width in GUI pixels (vanilla's is 147), and the gap beside the inventory. */
export const BOOK_WIDTH=147,BOOK_GAP=4;
/** GUI size the layer fits when a screen has no fixed geometry (the advancements window). */
const FLOW_GUI={width:252,height:210};
/** Sets a stack count drawn in the pixel font (white with the vanilla shadow), bottom right of its slot. */
export function setCount(el:HTMLElement,count:number){
  const text=count>1?String(Math.floor(count)):'';
  if(el.textContent===text)return;
  el.textContent=text;
  if(text){el.style.setProperty('--n',String(text.length));el.style.backgroundImage=`url("${digitsUrl(text,'count')}")`;}
  else{el.style.removeProperty('--n');el.style.backgroundImage='';}
}

class DomScreens implements ScreenView{
  private c!:ScreenController;
  private readonly abort=new AbortController();
  private readonly layer:HTMLDivElement;
  private readonly wrap:HTMLDivElement;
  private readonly panel:HTMLElement;
  private readonly title:HTMLHeadingElement;
  private readonly tools:HTMLDivElement;
  private readonly body:HTMLDivElement;
  private readonly bookEl:HTMLElement;
  private readonly cursorEl:HTMLDivElement;
  private readonly cursorImg:HTMLImageElement;
  private readonly cursorN:HTMLElement;
  /** Durability bar of the carried stack (vanilla draws item decorations on it too). */
  private readonly cursorBar:HTMLElement;
  private readonly cursorFill:HTMLElement;
  private readonly tip:HTMLDivElement;
  private readonly toastEl:HTMLDivElement;
  private slots:(SlotEl|undefined)[]=[];
  private build:ScreenBuild|null=null;
  private unmount:(()=>void)|null=null;
  private observer:IntersectionObserver|null=null;
  /** Pointer position relative to the layer, and whether the last input was the keyboard. */
  private px=0;private py=0;private keyboard=false;private mouseX=NaN;private mouseY=NaN;
  private mousePressed=false;private lastTouch=-Infinity;
  private touchId:number|null=null;private touchX=0;private touchY=0;private longTimer=0;
  private toastTimer=0;private tipTimer=0;private tipFor:ItemStack|null=null;private tipTouch=false;
  private tipSlot=-1;private tipX=NaN;private tipY=NaN;
  private flame=-1;private arrow=-1;
  private figureArmor:readonly (ItemStack|null)[]|null=null;
  private bookEntries:readonly unknown[]|null=null;private bookOpen=false;
  private lastCursor:ItemStack|null=null;private lastCursorCount=-1;
  /** The creative picker, its scrollbar knob, and a knob drag in progress (pointer id). */
  private catalog:HTMLElement|null=null;private knob:HTMLElement|null=null;private knobDrag:number|null=null;
  /** The creative search field, its pixel-font view, what the view last drew, and its text window's scroll (GUI px). */
  private search:HTMLInputElement|null=null;private searchView:HTMLElement|null=null;private searchScrollX=0;
  private drawnQuery:string|null=null;private drawnStart=-1;private drawnEnd=-1;private drawnCaret=-1;private drawnFocus=false;
  /** Listeners that belong to the shown screen. */
  private screenAbort:AbortController|null=null;

  constructor(private game:Game){
    const layer=document.createElement('div');layer.className='bc-screen';layer.hidden=true;
    layer.innerHTML=`<div class="bc-wrap"><aside class="bc-book" aria-label="Recipe book" hidden></aside>
      <section class="bc-panel" role="dialog" aria-modal="true" tabindex="-1"><h2 class="bc-title"></h2><div class="bc-tools"></div><div class="bc-body"></div></section></div>
      <div class="bc-cursor" aria-hidden="true" hidden><img alt="" draggable="false"><span class="bc-n"></span><span class="bc-d" hidden><i></i></span></div>
      <div class="bc-tip" role="tooltip" hidden></div>`;
    for(const [name,value] of Object.entries(guiArtProperties()))layer.style.setProperty(name,value);
    this.layer=layer;
    const q=<T extends Element>(s:string)=>layer.querySelector<T>(s)! as T;
    this.wrap=q('.bc-wrap');this.panel=q('.bc-panel');this.title=q('.bc-title');this.tools=q('.bc-tools');this.body=q('.bc-body');
    this.bookEl=q('.bc-book');this.cursorEl=q('.bc-cursor');this.cursorImg=q('.bc-cursor img');this.cursorN=q('.bc-cursor .bc-n');this.tip=q('.bc-tip');
    this.cursorBar=q('.bc-cursor .bc-d');this.cursorFill=q('.bc-cursor .bc-d i');
    const toast=document.createElement('div');toast.className='bc-toast';toast.setAttribute('role','status');toast.setAttribute('aria-live','polite');
    this.toastEl=toast;
    game.root.append(layer,toast);
  }

  attach(c:ScreenController){
    this.c=c;
    const signal=this.abort.signal,layer=this.layer;
    layer.addEventListener('mousedown',e=>this.mouseDown(e),{signal});
    window.addEventListener('mousemove',e=>this.mouseMove(e),{signal});
    window.addEventListener('mouseup',e=>this.mouseUp(e),{signal});
    layer.addEventListener('pointerdown',e=>this.touchDown(e),{signal});
    window.addEventListener('pointermove',e=>this.touchMove(e),{signal});
    window.addEventListener('pointerup',e=>this.touchUp(e,false),{signal});
    window.addEventListener('pointercancel',e=>this.touchUp(e,true),{signal});
    layer.addEventListener('contextmenu',e=>{if(!(e.target instanceof HTMLInputElement))e.preventDefault();},{signal});
    layer.addEventListener('dragstart',e=>e.preventDefault(),{signal});
    layer.addEventListener('click',e=>this.clicked(e),{signal});
    layer.addEventListener('input',e=>{
      const t=e.target;if(t instanceof HTMLInputElement&&t.classList.contains('bc-search-input'))c.setQuery(t.value);
    },{signal});
    layer.addEventListener('focusin',e=>{
      const btn=(e.target as Element).closest?.<HTMLElement>('[data-slot]');
      c.hovered=btn&&this.panel.contains(btn)?Number(btn.dataset.slot):null;
      if(btn&&this.keyboard)this.draw(0);
    },{signal});
    window.addEventListener('keydown',e=>this.keyDown(e),{signal});
    layer.addEventListener('scroll',()=>{if(this.tip.hidden===false&&!this.keyboard)this.hideTip();},{signal,capture:true});
    // The creative scrollbar: drag the knob or press the track (mouse and touch); the wheel scrolls the picker from
    // anywhere on the screen like vanilla.
    layer.addEventListener('pointerdown',e=>this.knobDown(e),{signal});
    window.addEventListener('pointermove',e=>{if(e.pointerId===this.knobDrag)this.knobTo(e.clientY);},{signal});
    const knobEnd=(e:PointerEvent)=>{if(e.pointerId===this.knobDrag)this.knobDrag=null;};
    window.addEventListener('pointerup',knobEnd,{signal});window.addEventListener('pointercancel',knobEnd,{signal});
    layer.addEventListener('wheel',e=>this.wheel(e),{signal,passive:false});
    // A screen needs a free cursor: a mouse capture the game requested just before the screen opened (closing one screen
    // and opening another in the same moment) can be granted afterwards, so it is let go again.
    document.addEventListener('pointerlockchange',()=>{
      if(this.open()&&document.pointerLockElement&&typeof document.exitPointerLock==='function')document.exitPointerLock();
    },{signal});
    // The book's place (beside or over the panel) follows the size of the game area.
    if(typeof ResizeObserver==='function'){
      const ro=new ResizeObserver(()=>{if(this.open())this.fitBook();});
      ro.observe(layer);signal.addEventListener('abort',()=>ro.disconnect());
    }
  }

  // ---- ScreenView -------------------------------------------------------------------------------
  show(build:ScreenBuild){
    const c=this.c,active=document.activeElement;
    // Keep the search field (focus and caret) while the creative list refilters.
    const search=active instanceof HTMLInputElement&&active.classList.contains('bc-search-input')&&this.layer.contains(active)?active:null;
    const caret=search?[search.selectionStart,search.selectionEnd]:null;
    this.release();
    this.build=build;
    this.layout(build);
    const touch=this.touchUI();
    this.tools.innerHTML=(c.screen!=='advancements'?`<button type="button" class="bc-tool bc-quick" data-quick aria-pressed="${c.pointer.quickMove}" aria-label="Quick move: taps move stacks between sections" title="Quick move">${icon('quick')}</button>`:'')+
      `<button type="button" class="bc-tool" data-close aria-label="Close (E)" title="Close (E)">${icon('close')}</button>`;
    const book=c.hasBook&&build.book?`<button type="button" class="bc-tool bc-book-btn bc-at" data-book-toggle style="--x:${build.book.x};--y:${build.book.y}" `+
      `aria-pressed="${c.book.open}" aria-label="Recipe book" title="Recipe book">${icon('book')}</button>`:'';
    this.body.innerHTML=build.html+book;
    if(search){
      const fresh=this.body.querySelector('.bc-search-input');
      if(fresh){fresh.replaceWith(search);search.focus({preventScroll:true});if(caret)search.setSelectionRange(caret[0],caret[1]);}
    }
    for(const img of this.layer.querySelectorAll<HTMLImageElement>('img[data-icon]'))img.src=iconUrl(img.dataset.icon!);
    this.bindSlots();
    const mount=this.body.querySelector<HTMLElement>('[data-mount]');
    if(build.mount&&mount)this.unmount=build.mount(mount);
    this.layer.classList.toggle('bc-reduced',this.game.reducedMotion);
    this.layer.classList.toggle(SCREEN_TOUCH,touch);
    this.layer.hidden=false;
    this.fitBook();
    this.renderBook(true);
    if(!search){
      const field=this.body.querySelector<HTMLInputElement>('.bc-search-input');
      if(field&&!touch)field.focus({preventScroll:true});
      else if(!this.layer.contains(document.activeElement))this.panel.focus({preventScroll:true});
    }
    this.figureArmor=null;this.flame=this.arrow=-1;this.lastCursor=null;this.lastCursorCount=-1;
    this.draw(0);
    this.updateKnob();
  }
  /** Panel geometry and title for a build: the GUI size the layer fits (--gw/--gh; the recipe book does not change
   *  it), the panel's own size (--pw/--ph) and where its pixel-font title goes. */
  private layout(build:ScreenBuild){
    const gui=build.gui,ls=this.layer.style;
    this.panel.className=`bc-panel bc-panel-${build.kind}${gui?' bc-fixed':''}`;
    this.panel.setAttribute('aria-label',build.title);
    ls.setProperty('--gw',String(gui?.width??FLOW_GUI.width));
    ls.setProperty('--gh',String(gui?gui.height+(gui.above??0)+(gui.below??0):FLOW_GUI.height));
    // The panel's own size, also read by the recipe book beside it.
    if(gui){ls.setProperty('--pw',String(gui.width));ls.setProperty('--ph',String(gui.height));}
    else{ls.removeProperty('--pw');ls.removeProperty('--ph');}
    const at=build.titleAt??{x:8,y:6};
    this.title.innerHTML=pixelTextHtml(build.title,GUI_COLOURS.title);
    this.title.className=at==='hidden'?'bc-title bc-sr':'bc-title';
    const x=at==='center'?Math.floor(((gui?.width??FLOW_GUI.width)-textWidth(build.title))/2):at==='hidden'?0:at.x;
    this.title.style.setProperty('--x',String(x));this.title.style.setProperty('--y',String(at==='center'||at==='hidden'?6:at.y));
  }
  /** Vanilla keeps the GUI scale when the recipe book opens and, when the screen is too narrow for it beside the panel
   *  (widthTooNarrow), draws it over the panel. Tall areas (portrait, height >= width) always overlay it in screens.css. */
  private fitBook(){
    const c=this.c,gui=this.build?.gui;
    let over=false;
    if(gui&&c.book.open&&c.hasBook&&!this.layer.hidden){
      const cs=getComputedStyle(this.layer);
      const w=this.layer.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight),h=this.layer.clientHeight-parseFloat(cs.paddingTop)-parseFloat(cs.paddingBottom);
      const u=parseFloat(getComputedStyle(this.wrap).getPropertyValue('--bc-u'))||1;
      // The width the scale fits in screens.css (panel and tools) plus the book and its gap.
      over=w>h&&(gui.width+24+BOOK_WIDTH+BOOK_GAP)*u>w-8+.5;
    }
    this.layer.classList.toggle('bc-book-over',over);
  }
  hide(){
    const hadFocus=this.layer.contains(document.activeElement);
    this.release();
    this.build=null;
    this.layer.hidden=true;this.bookEl.hidden=true;this.bookEl.innerHTML='';this.bookEntries=null;this.bookOpen=false;this.searchScrollX=0;
    this.body.innerHTML='';this.tools.innerHTML='';
    this.cursorEl.hidden=true;this.hideTip();
    if(hadFocus)this.game.canvas.focus?.({preventScroll:true});
  }
  draw(_dt:number){
    if(!this.build)return;
    this.drawSlots();
    this.drawCursor();
    this.drawTip();
    this.drawProgress();
    this.drawFigure();
    this.drawSearch();
    this.renderBook(false);
  }
  toast(message:string){
    const t=this.toastEl;clearTimeout(this.toastTimer);
    t.textContent=message;t.classList.toggle('show',!!message);t.classList.toggle('bc-reduced',this.game.reducedMotion);
    if(message)this.toastTimer=window.setTimeout(()=>t.classList.remove('show'),TOAST_MS);
  }
  dispose(){
    this.abort.abort();this.release();clearTimeout(this.toastTimer);
    this.layer.remove();this.toastEl.remove();
  }

  // ---- Drawing ------------------------------------------------------------------------------------
  /** Frees what belongs to the shown screen (mounted body, observers, timers, presses). */
  private release(){
    if(this.unmount){const u=this.unmount;this.unmount=null;try{u();}catch{/* the mounted body is gone anyway */}}
    this.observer?.disconnect();this.observer=null;
    this.screenAbort?.abort();this.screenAbort=null;
    clearTimeout(this.longTimer);clearTimeout(this.tipTimer);
    this.touchId=null;this.mousePressed=false;this.knobDrag=null;
    this.slots=[];this.catalog=null;this.knob=null;this.search=null;this.searchView=null;this.drawnQuery=null;
  }
  private touchUI(){
    return this.game.input.touch||(typeof matchMedia==='function'&&matchMedia('(pointer: coarse)').matches)||this.performanceNow()-this.lastTouch<60000;
  }
  private performanceNow(){return typeof performance!=='undefined'?performance.now():Date.now();}
  private bindSlots(){
    const menu=this.c.menu,grid=menu.indexes('grid');
    const catalog=this.body.querySelector<HTMLElement>('.bc-catalog');
    this.catalog=catalog;this.knob=this.body.querySelector<HTMLElement>('[data-scroll] .bc-knob');
    this.search=this.body.querySelector<HTMLInputElement>('.bc-search-input');this.searchView=this.body.querySelector<HTMLElement>('.bc-search-view');
    if(catalog){
      this.screenAbort=new AbortController();
      catalog.addEventListener('scroll',()=>this.updateKnob(),{signal:this.screenAbort.signal,passive:true});
    }
    if(catalog&&typeof IntersectionObserver==='function'){
      this.observer=new IntersectionObserver(entries=>{
        for(const entry of entries){
          if(!entry.isIntersecting)continue;
          const i=Number((entry.target as HTMLElement).dataset.slot),el=this.slots[i];
          if(el&&!el.visible){el.visible=true;el.drawn=false;this.observer?.unobserve(entry.target);}
        }
        this.drawSlots();
      },{root:catalog,rootMargin:'64px'});
    }
    for(const btn of this.body.querySelectorAll<HTMLButtonElement>('button[data-slot]')){
      const i=Number(btn.dataset.slot),slot=menu.slots[i];if(!slot)continue;
      const lazy=slot.section==='catalog'&&!!this.observer;
      this.slots[i]={btn,img:btn.querySelector('img')!,n:btn.querySelector('.bc-n')!,bar:btn.querySelector('.bc-d')!,fill:btn.querySelector('.bc-d i')!,
        stack:null,preview:-1,ghost:null,carried:false,icon:'',drawn:false,lazy,visible:!lazy,cell:slot.section==='grid'?grid.indexOf(i):-1};
      if(lazy)this.observer!.observe(btn);
    }
  }
  private drawSlots(){
    const c=this.c,m=c.menu,drag=c.pointer.dragging,carrying=c.pointer.carrying,ghost=c.ghost;
    const plan=drag&&m.cursor?m.dragPlan(drag.slots,drag.type):null;
    for(let i=0;i<this.slots.length;i++){
      const el=this.slots[i],slot=m.slots[i];if(!el||!slot)continue;
      const s=slot.get();
      let preview=-1;if(plan){const k=plan.slots.indexOf(i);if(k>=0)preview=plan.counts[k];}
      const ghostId=!s&&ghost?el.cell>=0?ghost.cells[el.cell]??null:slot.section==='result'?ghost.result.id:null:null;
      const carried=carrying===i;
      if(el.drawn&&s===el.stack&&preview===el.preview&&ghostId===el.ghost&&carried===el.carried)continue;
      el.drawn=true;el.stack=s;el.preview=preview;el.ghost=ghostId;el.carried=carried;
      const shown:ItemStack|null=preview>=0&&m.cursor?{id:m.cursor.id,count:preview,...(m.cursor.damage?{damage:m.cursor.damage}:{})}:s;
      const iconId=shown?.id??ghostId??'';
      if(iconId&&(el.visible||!el.lazy)){if(el.icon!==iconId){el.img.src=iconUrl(iconId);el.icon=iconId;}el.img.hidden=false;}
      else if(!iconId)el.img.hidden=true;
      el.btn.classList.toggle('is-ghost',!shown&&!!ghostId);
      el.btn.classList.toggle('is-drag',preview>=0);
      el.btn.classList.toggle('is-carried',carried);
      el.btn.classList.toggle('is-filled',!!shown);
      setCount(el.n,shown?.count??0);
      const bar=durabilityBar(shown);
      el.bar.hidden=!bar;
      if(bar){el.fill.style.width=`${(bar.width*100).toFixed(1)}%`;el.fill.style.background=bar.color;}
      el.btn.setAttribute('aria-label',slot.section==='catalog'?itemName(s):slotLabel(slot.label,s)+(ghostId&&!s?` (recipe needs ${itemName({id:ghostId,count:1})})`:''));
    }
  }
  private drawCursor(){
    const c=this.c,m=c.menu,el=this.cursorEl;
    const drag=c.pointer.dragging,carrying=c.pointer.carrying;
    let stack=m.cursor,count=stack?.count??0;
    if(stack&&drag){const plan=m.dragPlan(drag.slots,drag.type);if(plan.slots.length)count=plan.left;}
    if(!stack&&carrying!==null){stack=m.slots[carrying]?.get()??null;count=stack?.count??0;}
    if(!stack||count<=0){el.hidden=true;this.lastCursor=null;return;}
    if(stack!==this.lastCursor||count!==this.lastCursorCount){
      if(stack!==this.lastCursor){
        const bar=durabilityBar(stack);
        this.cursorBar.hidden=!bar;
        if(bar){this.cursorFill.style.width=`${(bar.width*100).toFixed(1)}%`;this.cursorFill.style.background=bar.color;}
      }
      this.lastCursor=stack;this.lastCursorCount=count;
      this.cursorImg.src=iconUrl(stack.id);setCount(this.cursorN,count);
    }
    el.hidden=false;
    let x=this.px,y=this.py;
    if(this.keyboard){
      const focus=c.hovered!==null?this.slots[c.hovered]?.btn:null;
      if(focus){const r=focus.getBoundingClientRect(),l=this.layer.getBoundingClientRect();x=r.left-l.left+r.width*.75;y=r.top-l.top+r.height*.25;}
    }
    el.style.transform=`translate(${Math.round(x)}px,${Math.round(y)}px) translate(-50%,-50%)`;
  }
  private drawTip(){
    const c=this.c,m=c.menu;
    if(this.tipTouch)return;
    const i=c.hovered,s=i!==null&&!m.cursor&&!c.pointer.dragging&&c.pointer.carrying===null?m.slots[i]?.get()??null:null;
    if(!s){this.hideTip();return;}
    this.showTip(s,i!);
  }
  private showTip(s:ItemStack,index:number){
    const tip=this.tip;
    // Only lay the tooltip out again when its item, slot or the pointer changed.
    if(s===this.tipFor&&index===this.tipSlot&&this.px===this.tipX&&this.py===this.tipY&&!tip.hidden)return;
    this.tipSlot=index;this.tipX=this.px;this.tipY=this.py;
    if(s!==this.tipFor){
      this.tipFor=s;
      // Vanilla tooltip text: the name in white, modifiers in blue or dark green, the rest grey, each with its shadow.
      tip.innerHTML=tooltipLines(s).map((line,k)=>{const t=tooltipColour(line,k);return`<div class="bc-tip-line ${t.cls}">${pixelTextHtml(line,t.colour,true)}</div>`;}).join('');
    }
    tip.hidden=false;
    const l=this.layer.getBoundingClientRect();
    let x=this.px+14,y=this.py-10;
    const btn=this.slots[index]?.btn;
    if((this.keyboard||this.tipTouch)&&btn){const r=btn.getBoundingClientRect();x=r.right-l.left+4;y=r.top-l.top;}
    const w=tip.offsetWidth,h=tip.offsetHeight;
    if(x+w>l.width-4)x=Math.max(4,x-w-28);
    y=Math.max(4,Math.min(y,l.height-h-4));
    tip.style.transform=`translate(${Math.round(x)}px,${Math.round(y)}px)`;
  }
  private hideTip(){if(!this.tip.hidden)this.tip.hidden=true;this.tipFor=null;this.tipSlot=-1;}
  private drawProgress(){
    const p=this.build?.progress?.();if(!p)return;
    const g=furnaceGauges(p.flame,p.arrow);
    if(g.flameRows!==this.flame){
      this.flame=g.flameRows;const f=this.body.querySelector<HTMLElement>('.bc-flame i');
      if(f)f.style.height=`${(g.flameRows/FLAME_ROWS*100).toFixed(2)}%`;
      this.body.querySelector('.bc-flame')?.classList.toggle('is-lit',g.flameRows>0);
    }
    if(g.arrowColumns!==this.arrow){
      this.arrow=g.arrowColumns;const a=this.body.querySelector<HTMLElement>('.bc-progress i');
      if(a)a.style.width=`${(g.arrowColumns/ARROW_COLUMNS*100).toFixed(2)}%`;
    }
  }
  /** Moves the creative scrollbar knob to the picker's scroll position (dimmed when everything fits). */
  private updateKnob(){
    const cat=this.catalog,knob=this.knob;if(!cat||!knob)return;
    const travel=CREATIVE_LAYOUT.scroll.travel,scrollable=cat.scrollHeight>cat.clientHeight+1;
    knob.classList.toggle('is-off',!scrollable);
    knob.style.setProperty('--k',String(Math.round(knobOffset(cat.scrollTop,cat.scrollHeight,cat.clientHeight,travel))));
  }
  private knobDown(e:PointerEvent){
    const track=(e.target as Element).closest?.<HTMLElement>('[data-scroll]');
    if(!track||!this.open()||!this.catalog||e.button>0)return;
    e.preventDefault();
    this.knobDrag=e.pointerId;
    try{track.setPointerCapture?.(e.pointerId);}catch{/* not capturable */}
    this.knobTo(e.clientY);
  }
  /** Scrolls the picker so the knob's middle follows the pointer, a row at a time (the picker snaps to rows). */
  private knobTo(clientY:number){
    const cat=this.catalog,track=this.knob?.parentElement;if(!cat||!track)return;
    const r=track.getBoundingClientRect(),gui=r.height/(CREATIVE_LAYOUT.scroll.travel+17);
    const offset=(clientY-r.top)/gui-1-7.5;
    cat.scrollTop=scrollForKnob(offset,cat.scrollHeight,cat.clientHeight,CREATIVE_LAYOUT.scroll.travel);
    this.updateKnob();
  }
  /** The wheel scrolls the creative picker a row per notch wherever the pointer is over the screen. */
  private wheel(e:WheelEvent){
    const cat=this.catalog;
    if(!cat||!this.open()||!e.deltaY||cat.contains(e.target as Node))return;
    e.preventDefault();
    const row=cat.querySelector<HTMLElement>('[data-slot]')?.offsetHeight||18;
    cat.scrollBy({top:Math.sign(e.deltaY)*row});
  }
  /** Draws the search query in the pixel font (with the selection and cursor) whenever the field's text, selection or
   *  focus changes; text the font cannot draw is left to the field itself. */
  private drawSearch(){
    const input=this.search,view=this.searchView;if(!input||!view)return;
    const value=input.value,focused=document.activeElement===input;
    const start=input.selectionStart??value.length,end=input.selectionEnd??start;
    const caret=input.selectionDirection==='backward'?start:end;
    if(value===this.drawnQuery&&start===this.drawnStart&&end===this.drawnEnd&&caret===this.drawnCaret&&focused===this.drawnFocus)return;
    this.drawnQuery=value;this.drawnStart=start;this.drawnEnd=end;this.drawnCaret=caret;this.drawnFocus=focused;
    const native=!searchDrawable(value);
    view.parentElement?.classList.toggle('is-native',native);
    if(native){view.innerHTML='';return;}
    this.searchScrollX=searchScroll(value,caret,this.searchScrollX);
    view.innerHTML=searchFieldHtml(value,start,end,caret,focused,this.searchScrollX);
  }
  /** A click in the search field puts the cursor between the drawn characters (the field's own text is invisible). */
  private placeSearchCaret(e:MouseEvent){
    const input=this.search,view=this.searchView;
    if(!input||!view||input.selectionStart!==input.selectionEnd||!searchDrawable(input.value))return;
    const u=parseFloat(getComputedStyle(view).getPropertyValue('--bc-u'))||1,r=view.getBoundingClientRect();
    const i=searchIndexAt(input.value,(e.clientX-r.left)/u-1+this.searchScrollX);
    input.setSelectionRange(i,i);
    this.drawSearch();
  }
  private drawFigure(){
    const armor=this.game.inventory.armor;
    if(armor===this.figureArmor)return;
    this.figureArmor=armor;
    const fig=this.body.querySelector('[data-figure]');if(fig)fig.innerHTML=figureSvg(armor);
  }
  private renderBook(force:boolean){
    const c=this.c,open=c.book.open&&c.hasBook,el=this.bookEl;
    if(!open){if(!el.hidden){el.hidden=true;el.innerHTML='';}this.bookEntries=null;this.bookOpen=false;return;}
    const entries=c.bookList();
    if(!force&&this.bookOpen&&entries===this.bookEntries)return;
    this.bookEntries=entries;this.bookOpen=true;
    const list=entries.map((e,i)=>{
      const name=itemName(e.result),n=e.result.count;
      return`<button type="button" class="bc-recipe${e.craftable?' is-craftable':''}" data-recipe="${i}" aria-label="${esc(name)}${n>1?`, makes ${n}`:''}${e.craftable?'':', missing ingredients'}" title="${esc(name)}">`+
        `<img alt="" draggable="false" src="${iconUrl(e.result.id)}"><span class="bc-n"${n>1?` style="--n:${String(n).length};background-image:url('${digitsUrl(String(n),'count')}')"`:''}>${n>1?n:''}</span></button>`;
    }).join('');
    el.innerHTML=`<div class="bc-book-head"><h3 class="bc-book-title">${pixelTextHtml('Recipe Book',GUI_COLOURS.title)}</h3>`+
      `<button type="button" class="bc-tool bc-book-close" data-book-toggle aria-label="Close recipe book">${icon('close')}</button></div>`+
      `<button type="button" class="bc-wbtn bc-book-filter" data-book-filter aria-pressed="${c.book.craftableOnly}">${pixelTextHtml('Craftable only',GUI_COLOURS.white,true)}</button>`+
      `<p class="bc-book-hint bc-sr" id="bc-book-hint">Choose a recipe to fill the grid; Shift fills as many as you can.</p>`+
      `<div class="bc-book-list" role="group" aria-label="Recipes" aria-describedby="bc-book-hint">${list||`<p class="bc-empty">${pixelTextHtml('No recipes yet.',GUI_COLOURS.title)}</p>`}</div>`;
    el.hidden=false;
  }

  // ---- Input ----------------------------------------------------------------------------------------
  private local(clientX:number,clientY:number){const l=this.layer.getBoundingClientRect();this.px=clientX-l.left;this.py=clientY-l.top;}
  private hitFor(target:Element|null):SlotHit{
    const btn=target?.closest?.<HTMLElement>('[data-slot]');
    if(btn&&this.panel.contains(btn))return{slot:Number(btn.dataset.slot),outside:false};
    const inside=!!target&&(this.panel.contains(target)||this.bookEl.contains(target));
    return{slot:null,outside:!inside};
  }
  private hitAt(x:number,y:number):SlotHit{return this.hitFor(document.elementFromPoint(x,y));}
  /** Controls that keep their native click (tabs, tool buttons, the search field, recipes). */
  private isControl(target:EventTarget|null):boolean{
    if(!(target instanceof Element))return false;
    if(target.closest('[data-slot]'))return false;
    return !!target.closest('button,input,a,select,textarea,label,.bc-book,[data-mount],[data-scroll]');
  }
  private open(){return !!this.build&&!this.layer.hidden;}
  private mouseDown(e:MouseEvent){
    if(!this.open()||this.performanceNow()-this.lastTouch<TOUCH_MOUSE_GUARD_MS)return;
    if(this.isControl(e.target))return;
    if(this.c.screen==='advancements')return;
    e.preventDefault();
    this.keyboard=false;this.local(e.clientX,e.clientY);
    this.tipTouch=false;
    this.mousePressed=true;
    this.c.pointer.down(this.hitFor(e.target as Element),e.button,e.shiftKey,'mouse',e.timeStamp);
    this.c.afterChange();
    this.draw(0);
  }
  private mouseMove(e:MouseEvent){
    if(!this.open()||this.performanceNow()-this.lastTouch<TOUCH_MOUSE_GUARD_MS)return;
    // Layout changes can fire a move without motion: keep keyboard focus as the hover then.
    if(e.clientX===this.mouseX&&e.clientY===this.mouseY)return;
    this.mouseX=e.clientX;this.mouseY=e.clientY;
    this.local(e.clientX,e.clientY);
    const target=e.target instanceof Element?e.target:null;
    const hit=this.layer.contains(target)?this.hitFor(target):{slot:null,outside:true};
    this.keyboard=false;this.tipTouch=false;
    this.c.hovered=hit.slot;
    if(this.c.pointer.active)this.c.pointer.move(hit);
    this.drawSlots();this.drawCursor();this.drawTip();
  }
  private mouseUp(e:MouseEvent){
    if(!this.open()||!this.mousePressed||this.performanceNow()-this.lastTouch<TOUCH_MOUSE_GUARD_MS)return;
    if(e.buttons===0)this.mousePressed=false;
    this.local(e.clientX,e.clientY);
    const target=e.target instanceof Element?e.target:null;
    this.c.pointer.up(this.layer.contains(target)?this.hitFor(target):{slot:null,outside:true},e.button,e.shiftKey,e.timeStamp);
    this.c.afterChange();
    this.draw(0);
  }
  private touchDown(e:PointerEvent){
    if(e.pointerType==='mouse'||!this.open())return;
    this.lastTouch=this.performanceNow();
    this.layer.classList.add(SCREEN_TOUCH);
    if(this.isControl(e.target)||this.c.screen==='advancements'||this.touchId!==null)return;
    this.keyboard=false;this.hideTip();this.tipTouch=false;
    this.touchId=e.pointerId;this.touchX=e.clientX;this.touchY=e.clientY;this.local(e.clientX,e.clientY);
    // Let pointermove report the element under the finger, not the one first touched.
    try{(e.target as Element).releasePointerCapture?.(e.pointerId);}catch{/* not captured */}
    const kind:PointerKind=e.pointerType==='pen'?'pen':'touch';
    const hit=this.hitFor(e.target as Element);
    this.c.hovered=hit.slot;
    this.c.pointer.down(hit,0,false,kind,e.timeStamp);
    clearTimeout(this.longTimer);
    this.longTimer=window.setTimeout(()=>{
      if(this.touchId!==e.pointerId)return;
      this.c.pointer.longPress();this.c.afterChange();this.draw(0);
      try{navigator.vibrate?.(15);}catch{/* not allowed */}
    },LONG_PRESS_MS);
    this.draw(0);
  }
  private touchMove(e:PointerEvent){
    if(e.pointerId!==this.touchId||!this.open())return;
    this.local(e.clientX,e.clientY);
    const far=Math.hypot(e.clientX-this.touchX,e.clientY-this.touchY)>TOUCH_SLOP;
    if(far)clearTimeout(this.longTimer);
    const hit=this.hitAt(e.clientX,e.clientY);
    this.c.pointer.move(hit,far);
    if(far)e.preventDefault();
    this.drawSlots();this.drawCursor();
  }
  private touchUp(e:PointerEvent,cancel:boolean){
    if(e.pointerId!==this.touchId)return;
    this.touchId=null;clearTimeout(this.longTimer);this.lastTouch=this.performanceNow();
    if(!this.open())return;
    if(cancel){this.c.pointer.cancel();this.draw(0);return;}
    this.local(e.clientX,e.clientY);
    const hit=this.hitAt(e.clientX,e.clientY);
    this.c.pointer.up(hit,0,false,e.timeStamp);
    this.c.afterChange();
    this.draw(0);
    // Touch has no hover: name the item that was just picked up or tapped.
    const s=this.c.menu.cursor??(hit.slot!==null?this.c.menu.slots[hit.slot]?.get()??null:null);
    if(s&&hit.slot!==null){
      this.tipTouch=true;this.tipFor=null;this.showTip(s,hit.slot);
      clearTimeout(this.tipTimer);this.tipTimer=window.setTimeout(()=>{this.tipTouch=false;this.hideTip();},TOUCH_TIP_MS);
    }
  }
  private clicked(e:MouseEvent){
    const t=e.target instanceof Element?e.target:null;if(!t||!this.open())return;
    const c=this.c;
    if(t===this.search){this.placeSearchCaret(e);return;}
    const tab=t.closest<HTMLElement>('[data-tab]');
    if(tab){c.setTab(tab.dataset.tab as CreativeTabId);return;}
    if(t.closest('[data-close]')){c.close();return;}
    if(t.closest('[data-book-toggle]')){c.toggleBook();return;}
    const filter=t.closest<HTMLElement>('[data-book-filter]');
    if(filter){c.toggleCraftable();filter.setAttribute('aria-pressed',String(c.book.craftableOnly));this.renderBook(true);return;}
    const recipe=t.closest<HTMLElement>('[data-recipe]');
    if(recipe){
      const ok=c.chooseRecipe(Number(recipe.dataset.recipe),e.shiftKey);
      if(!ok)this.toast('Missing ingredients: the recipe is shown in the grid');
      this.draw(0);return;
    }
    const quick=t.closest<HTMLElement>('[data-quick]');
    if(quick){c.pointer.quickMove=!c.pointer.quickMove;quick.setAttribute('aria-pressed',String(c.pointer.quickMove));}
  }
  private keyDown(e:KeyboardEvent){
    if(!this.open()||e.defaultPrevented||e.altKey||e.metaKey)return;
    const t=e.target;
    if(e.key==='Tab'){this.trapFocus(e);return;}
    if(t instanceof HTMLElement&&(t.isContentEditable||t.closest('input,textarea,select')))return;
    if(t instanceof Element&&t!==document.body&&!this.game.root.contains(t)&&t!==document.documentElement)return;
    const c=this.c;
    const slotBtn=t instanceof Element?t.closest<HTMLElement>('[data-slot]'):null;
    const index=slotBtn&&this.panel.contains(slotBtn)?Number(slotBtn.dataset.slot):null;
    if(index!==null&&(e.key==='Enter'||e.key===' '||e.key==='ContextMenu')){
      e.preventDefault();this.keyboard=true;this.hideTip();
      c.hovered=index;c.activate(index,e.shiftKey,e.ctrlKey||e.key==='ContextMenu');this.draw(0);return;
    }
    if(e.key.startsWith('Arrow')&&(index!==null||t===this.panel)){
      e.preventDefault();this.keyboard=true;this.moveFocus(slotBtn,e.key.slice(5).toLowerCase() as 'up'|'down'|'left'|'right');return;
    }
    if(/^Digit[1-9]$/.test(e.code)&&e.ctrlKey)return;// browser tab switching
    if(c.key(e.code,e.ctrlKey)){e.preventDefault();this.draw(0);}
  }
  /** Tab cycles through the screen's controls only (the dialog is modal). */
  private trapFocus(e:KeyboardEvent){
    const all=[...this.wrap.querySelectorAll<HTMLElement>('button,input,select,textarea,a[href],[tabindex]:not([tabindex="-1"])')]
      .filter(el=>!(el as HTMLButtonElement).disabled&&el.getClientRects().length>0);
    if(!all.length)return;
    const i=all.indexOf(document.activeElement as HTMLElement);
    if(e.shiftKey?i<=0:i===-1||i===all.length-1){e.preventDefault();(e.shiftKey?all[all.length-1]:all[0]).focus();}
  }
  /** Arrow keys: focus the nearest slot in that direction. */
  private moveFocus(from:HTMLElement|null,dir:'up'|'down'|'left'|'right'){
    const buttons=[...this.body.querySelectorAll<HTMLElement>('button[data-slot]')];
    if(!from){buttons[0]?.focus();return;}
    const a=from.getBoundingClientRect(),ax=a.left+a.width/2,ay=a.top+a.height/2;
    let best:HTMLElement|null=null,score=Infinity;
    for(const b of buttons){
      if(b===from)continue;
      const r=b.getBoundingClientRect();if(!r.width)continue;
      const dx=r.left+r.width/2-ax,dy=r.top+r.height/2-ay;
      const main=dir==='right'?dx:dir==='left'?-dx:dir==='down'?dy:-dy,cross=dir==='left'||dir==='right'?Math.abs(dy):Math.abs(dx);
      if(main<2)continue;
      const s=main+cross*3;if(s<score){score=s;best=b;}
    }
    if(best){best.focus();best.scrollIntoView?.({block:'nearest',inline:'nearest'});}
  }
}
