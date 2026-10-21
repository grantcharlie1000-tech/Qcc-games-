// Advancement toasts in the top-right zone, like the vanilla ToastComponent: each toast slides in from the right
// (600 ms), is fully shown for 5 s from the end of the slide-in, slides out (600 ms, gone 6.2 s after it appeared) and
// frees its slot; waiting toasts take the lowest free slot, so on-screen toasts never jump. With reduced motion a toast
// shows in place for the same 5.6 s. ToastQueue is DOM-free (timing, slots); ToastLayer draws it.
import {iconUrl} from '../art/items';
import type {AdvancementDef,AdvancementFrame} from './advancements-data';

export const TOAST_LIFE_MS=5000,TOAST_SLIDE_MS=600,TOAST_SLOTS=5;
export const TOAST_HEADINGS:Record<AdvancementFrame,string>={task:'Advancement Made!',goal:'Goal Reached!',challenge:'Challenge Complete!'};
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

/** Layout shared with advancements.css: the top 56 px belong to the arcade toolbar, the bottom right to the shell buttons. */
const TOP=64,BOTTOM=160,PITCH=78;
const safeIcon=(id:string)=>{try{return iconUrl(id);}catch{return'';}};
/** DOM toasts inside game.root (layer z-index 25, top-right zone). Screen readers hear the shell announcement instead. */
export class ToastLayer implements ToastView{
  private el:HTMLElement|null=null;
  private readonly nodes=new Map<ToastEntry,{el:HTMLElement;slide:number}>();
  constructor(private readonly root:HTMLElement){}
  capacity(){
    const h=this.root.clientHeight;
    return h>0?Math.max(1,Math.min(TOAST_SLOTS,Math.floor((h-TOP-BOTTOM)/PITCH))):TOAST_SLOTS;
  }
  show(t:ToastEntry){
    if(!this.el){this.el=document.createElement('div');this.el.className='bc-adv-toasts';this.el.setAttribute('aria-hidden','true');this.root.append(this.el);}
    const el=document.createElement('div'),icon=document.createElement('img'),text=document.createElement('div');
    el.className=`bc-adv-toast is-${t.def.frame}`;el.style.setProperty('--slot',String(t.slot));
    icon.className='bc-adv-toast-icon';icon.alt='';icon.draggable=false;const src=safeIcon(t.def.icon);if(src)icon.src=src;
    text.className='bc-adv-toast-text';
    for(const [cls,copy] of [['head',TOAST_HEADINGS[t.def.frame]],['title',t.def.title],['desc',t.def.description]]){
      const p=document.createElement('p');p.className=`bc-adv-toast-${cls}`;p.textContent=copy;text.append(p);
    }
    el.append(icon,text);this.el.append(el);
    this.nodes.set(t,{el,slide:-1});
  }
  place(t:ToastEntry,slide:number){
    const n=this.nodes.get(t);if(!n||n.slide===slide)return;
    n.slide=slide;n.el.style.transform=slide>=1?'':`translateX(${((1-slide)*110).toFixed(2)}%)`;
  }
  hide(t:ToastEntry){const n=this.nodes.get(t);if(n){n.el.remove();this.nodes.delete(t);}}
  dispose(){this.nodes.clear();this.el?.remove();this.el=null;}
}
