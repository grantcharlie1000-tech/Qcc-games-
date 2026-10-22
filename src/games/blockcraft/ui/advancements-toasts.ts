// Advancement toasts in the top-right zone, like the vanilla ToastComponent: each toast slides in from the right
// (600 ms), is fully shown for 5 s from the end of the slide-in, slides out (600 ms, gone 6.2 s after it appeared) and
// frees its slot; waiting toasts take the lowest free slot, so on-screen toasts never jump. With reduced motion a toast
// shows in place for the same 5.6 s. ToastQueue is DOM-free (timing, slots); ToastLayer draws it.
import {iconUrl} from '../art/items';
import type {AdvancementDef,AdvancementFrame} from './advancements-data';
import {hasGlyphs,textWidth} from './hud-art';
import {pixelTextUrl} from './screen-art';

export const TOAST_LIFE_MS=5000,TOAST_SLIDE_MS=600,TOAST_SLOTS=5;
export const TOAST_HEADINGS:Record<AdvancementFrame,string>={task:'Advancement Made!',goal:'Goal Reached!',challenge:'Challenge Complete!'};
/** Vanilla AdvancementToast: a 160x32 GUI px frame, the icon at (8, 8), the heading at (30, 7) in yellow (purple for
 *  challenges) and the title at (30, 18) in white, in the GUI font without a shadow. A title wider than TOAST_TEXT_WIDTH
 *  wraps (toastLines): the heading then shows alone at (30, 11) and cross-fades to the title lines (toastFade). */
export const TOAST_WIDTH=160,TOAST_HEIGHT=32,TOAST_TEXT_WIDTH=125;
export const TOAST_COLOURS:Record<AdvancementFrame,string>={task:'#ffff00',goal:'#ffff00',challenge:'#ff88ff'};
/** GUI pixel size of the toasts in CSS px: the HUD's GUI scale, smaller (in halves) when the screen is too narrow. */
export function toastUnit(width:number,guiScale:number){
  const fit=Math.floor((width-16)/TOAST_WIDTH*2)/2;
  return Math.max(1,Math.min(guiScale>0?guiScale:2,fit));
}
/** The title in lines of at most TOAST_TEXT_WIDTH GUI px, broken at spaces (vanilla Font.split); a word too wide for a
 *  line breaks inside it. */
export function toastLines(title:string):string[]{
  const lines:string[]=[];let line='';
  for(const word of title.split(' ')){
    const next=line?`${line} ${word}`:word;
    if(textWidth(next)<=TOAST_TEXT_WIDTH){line=next;continue;}
    if(line)lines.push(line);
    line='';
    for(const ch of word){if(line&&textWidth(line+ch)>TOAST_TEXT_WIDTH){lines.push(line);line='';}line+=ch;}
  }
  if(line||!lines.length)lines.push(line);
  return lines;
}
/** Opacity of the heading and the title at this age. A one-line toast shows both throughout; a wrapped title shows the
 *  heading alone, which fades out from 1.2 s to 1.5 s, then the title lines fade in until 1.8 s (vanilla). */
export function toastFade(age:number,wrapped:boolean):{head:number;title:number}{
  return wrapped?{head:headAlpha(age),title:titleAlpha(age)}:{head:1,title:1};
}
const clamp01=(v:number)=>v<0?0:v>1?1:v;
const headAlpha=(age:number)=>clamp01((1500-age)/300),titleAlpha=(age:number)=>clamp01((age-1500)/300);
export interface ToastEntry{readonly def:AdvancementDef;
  /** Vertical slot from the top (0 = first). */
  readonly slot:number;
  /** Milliseconds since it appeared. */
  age:number}
/** Draws toasts; a missing view (no DOM) still runs the timing. */
export interface ToastView{
  /** Slots that fit the screen (1..TOAST_SLOTS). */
  capacity():number;
  show(toast:ToastEntry):void;
  /** 0 = off-screen to the right, 1 = fully in. */
  place(toast:ToastEntry,slide:number):void;
  hide(toast:ToastEntry):void;
}
const easeOut=(t:number)=>1-(1-t)**3,easeIn=(t:number)=>t*t*t;
/** Age at which the slide-out starts: the 5 s display timer runs from the end of the slide-in (vanilla). */
const TOAST_HOLD_MS=TOAST_SLIDE_MS+TOAST_LIFE_MS;
/** Milliseconds from appearing to leaving the screen. */
export const toastDuration=(reducedMotion:boolean)=>TOAST_HOLD_MS+(reducedMotion?0:TOAST_SLIDE_MS);
/** Slide position of a toast of this age; reduced motion shows it in place for its whole life. */
export function toastSlide(age:number,reducedMotion:boolean){
  if(reducedMotion)return 1;
  if(age<TOAST_SLIDE_MS)return easeOut(Math.max(0,age)/TOAST_SLIDE_MS);
  if(age>TOAST_HOLD_MS)return 1-easeIn(Math.min(1,(age-TOAST_HOLD_MS)/TOAST_SLIDE_MS));
  return 1;
}
export class ToastQueue{
  readonly waiting:AdvancementDef[]=[];readonly visible:ToastEntry[]=[];
  /** `onShow` runs once per update with every toast that appeared (sound and screen-reader announcement). */
  constructor(private readonly onShow:(defs:readonly AdvancementDef[])=>void){}
  get idle(){return!this.waiting.length&&!this.visible.length;}
  push(def:AdvancementDef){this.waiting.push(def);}
  update(dtMs:number,view:ToastView|null,reducedMotion:boolean){
    const end=toastDuration(reducedMotion);
    for(let i=this.visible.length-1;i>=0;i--){
      const t=this.visible[i];t.age+=dtMs;
      if(t.age>=end){this.visible.splice(i,1);view?.hide(t);}
    }
    // The layer's capacity reads layout (clientHeight), so only ask while a toast waits for a slot.
    if(this.waiting.length){
      const cap=Math.max(1,Math.min(TOAST_SLOTS,view?view.capacity():TOAST_SLOTS));
      let shown:AdvancementDef[]|null=null;
      while(this.waiting.length&&this.visible.length<cap){
        const slot=this.freeSlot();if(slot>=cap)break;
        const t:ToastEntry={def:this.waiting.shift()!,slot,age:0};
        this.visible.push(t);view?.show(t);(shown??=[]).push(t.def);
      }
      if(shown)this.onShow(shown);
    }
    if(view)for(const t of this.visible)view.place(t,toastSlide(t.age,reducedMotion));
  }
  clear(view:ToastView|null){for(const t of this.visible)view?.hide(t);this.visible.length=0;this.waiting.length=0;}
  private freeSlot(){let s=0;while(this.visible.some(t=>t.slot===s))s++;return s;}
}

/** Layout shared with advancements.css: the top 56 px belong to the arcade toolbar, the bottom right to the shell buttons.
 *  Toasts are TOAST_HEIGHT + 2 GUI px apart. */
const TOP=64,BOTTOM=160,PITCH=TOAST_HEIGHT+2;
const safeIcon=(id:string)=>{try{return iconUrl(id);}catch{return'';}};
/** One toast line: the text drawn in the GUI font (characters outside the font fall back to a CSS font), `y` GUI px down. */
function line(cls:string,text:string,colour:string,y:number){
  const p=document.createElement('p');p.className=`bc-adv-toast-${cls}`;p.textContent=text;p.style.color=colour;
  p.style.top=`calc(${y} * var(--u))`;
  if(hasGlyphs(text)){p.classList.add('is-art');p.style.setProperty('--tw',String(textWidth(text)));p.style.backgroundImage=`url("${pixelTextUrl(text,colour,false)}")`;}
  return p;
}
/** DOM toasts inside game.root (layer z-index 25, top-right zone). Screen readers hear the shell announcement instead. */
export class ToastLayer implements ToastView{
  private el:HTMLElement|null=null;
  private readonly nodes=new Map<ToastEntry,{el:HTMLElement;slide:number;
    /** Wrapped titles only: the heading and the title lines, and the opacities last set. */
    head:HTMLElement|null;title:HTMLElement[];headAlpha:number;titleAlpha:number}>();
  constructor(private readonly root:HTMLElement){}
  private unit(){
    const gui=parseFloat(getComputedStyle(this.root).getPropertyValue('--bc-gui'));
    return toastUnit(this.root.clientWidth||innerWidth,gui);
  }
  capacity(){
    const h=this.root.clientHeight;
    return h>0?Math.max(1,Math.min(TOAST_SLOTS,Math.floor((h-TOP-BOTTOM)/(PITCH*this.unit())))):TOAST_SLOTS;
  }
  show(t:ToastEntry){
    if(!this.el){this.el=document.createElement('div');this.el.className='bc-adv-toasts';this.el.setAttribute('aria-hidden','true');this.root.append(this.el);}
    this.el.style.setProperty('--u',`${this.unit()}px`);
    const el=document.createElement('div'),icon=document.createElement('img');
    el.className=`bc-adv-toast is-${t.def.frame}`;el.style.setProperty('--slot',String(t.slot));
    icon.className='bc-adv-toast-icon';icon.alt='';icon.draggable=false;const src=safeIcon(t.def.icon);if(src)icon.src=src;
    const lines=toastLines(t.def.title),wrapped=lines.length>1,heading=TOAST_HEADINGS[t.def.frame];
    if(!wrapped){
      el.append(icon,line('head',heading,TOAST_COLOURS[t.def.frame],7),line('title',lines[0],'#ffffff',18));
      this.nodes.set(t,{el,slide:-1,head:null,title:[],headAlpha:1,titleAlpha:1});
    }else{
      // Vanilla centres the lines: the first at 16 - lines * 9 / 2.
      const head=line('head',heading,TOAST_COLOURS[t.def.frame],11),top=TOAST_HEIGHT/2-lines.length*9/2;
      const title=lines.map((text,i)=>line('title',text,'#ffffff',top+i*9));
      el.append(icon,head,...title);
      this.nodes.set(t,{el,slide:-1,head,title,headAlpha:-1,titleAlpha:-1});
    }
    this.el.append(el);
  }
  place(t:ToastEntry,slide:number){
    const n=this.nodes.get(t);if(!n)return;
    if(n.head){
      // Per frame: numbers only, and a style write only when an opacity changes.
      const head=headAlpha(t.age),title=titleAlpha(t.age);
      if(head!==n.headAlpha){n.headAlpha=head;n.head.style.opacity=String(head);}
      if(title!==n.titleAlpha){n.titleAlpha=title;for(const p of n.title)p.style.opacity=String(title);}
    }
    if(n.slide===slide)return;
    n.slide=slide;n.el.style.transform=slide>=1?'':`translateX(${((1-slide)*110).toFixed(2)}%)`;
  }
  hide(t:ToastEntry){const n=this.nodes.get(t);if(n){n.el.remove();this.nodes.delete(t);}}
  dispose(){this.nodes.clear();this.el?.remove();this.el=null;}
}
