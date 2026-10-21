// Pointer state machine for container screens (inventory & screens area), DOM-free. ui/screens.ts feeds it
// pointer presses, moves and releases already resolved to the slot under the pointer; it turns them into
// SlotMenu operations with vanilla Java AbstractContainerScreen timing:
//  - mouse, empty cursor: the click happens on press (pick up, shift quick-move, middle clone) and the release is skipped;
//  - mouse, carried stack: the press starts a drag; the release either distributes over the slots passed
//    (left: split evenly, right: one each, middle: full stacks in creative) or, without a drag, clicks there;
//  - a second left press on the same slot within 250 ms is a double click: collect (with shift: move every match);
//  - pressing the other button mid-drag cancels the drag;
//  - releasing outside the panel throws the cursor (left all, right one).
// Touch (Bedrock-like, after vanilla's touchscreen mode): a tap is a left click on release, a long press a right
// click (half / place one), a double tap collects, a finger dragged with a carried stack spreads it, and dragging a
// stack with an empty cursor moves it to the slot where the finger lifts (swapping, or snapping back when refused;
// lifting outside the panel throws it). The quick-move toggle turns taps into shift-clicks.
import {maxStack,type ItemStack} from '../data/items';
import {withCount} from '../items/inventory';
import {canDragTo,canPickAll,type DragType,type SlotMenu} from './slots';

export type PointerKind='mouse'|'touch'|'pen';
/** What is under the pointer: a menu slot index, or nothing (inside the panel, or outside it on the backdrop). */
export interface SlotHit{slot:number|null;outside:boolean}
/** DOM MouseEvent.button values. */
export const MOUSE_LEFT=0,MOUSE_MIDDLE=1,MOUSE_RIGHT=2;
/** Vanilla AbstractContainerScreen double-click window. */
export const DOUBLE_CLICK_MS=250;
export const DOUBLE_TAP_MS=300;
/** Hold time of a touch long press (right click). */
export const LONG_PRESS_MS=450;

interface Drag{button:number;type:DragType;slots:number[];
  /** Slot pressed on: it joins the drag with the first movement (a press without movement stays a click). */
  start:number|null;moved:boolean}
interface Touch{hit:SlotHit;long:boolean;moved:boolean;
  /** Drag-and-drop of the start slot's stack (empty cursor when the finger started moving). */
  carry:boolean}

export class SlotPointer{
  /** Touch quick-move mode: taps act as shift-clicks. */
  quickMove=false;
  private drag:Drag|null=null;
  private touch:Touch|null=null;
  private skipRelease=false;
  private doubleClick=false;
  private lastSlot:number|null=null;private lastTime=-Infinity;private lastButton=-1;
  private lastQuickMoved:ItemStack|null=null;
  private lastTapSlot:number|null=null;private lastTapTime=-Infinity;
  constructor(public menu:SlotMenu){}

  /** The drag in progress (for the preview), or null. */
  get dragging():{type:DragType;slots:readonly number[]}|null{return this.drag?{type:this.drag.type,slots:this.drag.slots}:null;}
  /** Start slot of a touch drag-and-drop in progress, or null. */
  get carrying():number|null{return this.touch?.carry?this.touch.hit.slot:null;}
  /** A press is in progress. */
  get active():boolean{return !!this.touch||!!this.drag||this.skipRelease;}

  /** Forget the press in progress (pointer cancelled, screen rebuilt). */
  cancel(){this.drag=null;this.touch=null;this.skipRelease=false;this.doubleClick=false;this.lastTime=-Infinity;this.lastTapTime=-Infinity;}

  down(hit:SlotHit,button:number,shift:boolean,kind:PointerKind,time:number){
    if(kind!=='mouse'){
      this.drag=null;
      this.touch={hit,long:false,moved:false,carry:false};
      return;
    }
    const m=this.menu,slot=hit.slot;
    this.doubleClick=slot!==null&&slot===this.lastSlot&&time-this.lastTime<DOUBLE_CLICK_MS&&button===this.lastButton;
    this.skipRelease=false;
    if(slot!==null||hit.outside){
      if(!m.cursor){
        if(button===MOUSE_MIDDLE){if(slot!==null)m.middle(slot);}
        else if(shift&&slot!==null){
          // Remember what the first shift-click moved, so a shift double-click can move every stack like it.
          const item=m.slots[slot]?.get();
          if(item)this.lastQuickMoved=withCount(item,item.count);else if(!this.doubleClick)this.lastQuickMoved=null;
          m.shiftClick(slot);
        }
        else if(slot!==null)m.click(slot,button===MOUSE_RIGHT?1:0);
        this.skipRelease=true;
      }else{
        this.drag={button,type:button===MOUSE_LEFT?0:button===MOUSE_RIGHT?1:2,slots:[],start:slot,moved:false};
      }
    }
    this.lastSlot=slot;this.lastTime=time;this.lastButton=button;
  }

  /** Pointer moved over `hit`. For touch, `far` says the finger has left the tap threshold. */
  move(hit:SlotHit,far=false){
    const t=this.touch;
    if(t){
      if(!far&&!t.moved)return;
      if(!t.moved){
        t.moved=true;
        const start=t.hit.slot,c=this.menu.cursor;
        if(c){
          this.drag={button:MOUSE_LEFT,type:t.long?1:0,slots:[],start:null,moved:true};
          // A long press already placed one item in the start slot.
          if(!t.long&&start!==null)this.addDragSlot(start);
        }else if(start!==null&&!t.long&&this.menu.slots[start]?.get())t.carry=true;
      }
    }
    const d=this.drag;
    if(d&&hit.slot!==null){
      // A real mouse reports the start slot as it leaves it; a jump straight to another slot must not skip it.
      if(!d.moved){d.moved=true;if(d.start!==null)this.addDragSlot(d.start);}
      this.addDragSlot(hit.slot);
    }
  }

  private addDragSlot(index:number){
    const d=this.drag!,c=this.menu.cursor,slot=this.menu.slots[index];
    if(!c||!slot||d.slots.includes(index))return;
    if(d.type===2&&!this.menu.host.creative)return;
    if(c.count>d.slots.length||d.type===2){if(canDragTo(slot,c))d.slots.push(index);}
  }

  /** Touch hold timer fired while the finger is still down and has not moved: a right click. */
  longPress(){
    const t=this.touch;if(!t||t.moved||t.long)return;
    t.long=true;
    const m=this.menu;
    if(t.hit.slot!==null)m.click(t.hit.slot,1);
    else if(t.hit.outside)m.outside(1);
  }

  up(hit:SlotHit,button:number,shift:boolean,time:number){
    if(this.touch){this.touchUp(hit,time);return;}
    const m=this.menu,slot=hit.slot,drag=this.drag;
    if(this.doubleClick&&slot!==null&&button===MOUSE_LEFT&&m.slots[slot]&&canPickAll(m.slots[slot])){
      if(shift){if(this.lastQuickMoved)m.shiftCollect(slot,this.lastQuickMoved);}
      else m.collect(slot);
      this.doubleClick=false;this.lastTime=-Infinity;this.drag=null;this.skipRelease=false;
      return;
    }
    if(drag&&drag.button!==button){this.drag=null;this.skipRelease=true;return;}
    if(this.skipRelease){this.skipRelease=false;return;}
    if(drag&&drag.slots.length)m.drag(drag.slots,drag.type);
    else if(m.cursor&&button!==MOUSE_MIDDLE){
      const b=button===MOUSE_RIGHT?1:0;
      if(hit.outside)m.outside(b);
      else if(slot!==null){
        if(shift){const item=m.slots[slot]?.get();this.lastQuickMoved=item?withCount(item,item.count):null;m.shiftClick(slot);}
        else m.click(slot,b);
      }
    }
    if(!m.cursor)this.lastTime=-Infinity;
    this.drag=null;
  }

  private touchUp(hit:SlotHit,time:number){
    const t=this.touch!,m=this.menu,drag=this.drag;
    this.touch=null;this.drag=null;
    if(drag){if(drag.slots.length)m.drag(drag.slots,drag.type);return;}
    if(t.carry){this.dropCarried(t.hit.slot!,hit);return;}
    if(t.long||t.moved)return;
    const slot=t.hit.slot;
    if(slot===null){if(t.hit.outside&&m.cursor)m.outside(0);return;}
    const double=slot===this.lastTapSlot&&time-this.lastTapTime<DOUBLE_TAP_MS;
    this.lastTapSlot=slot;this.lastTapTime=time;
    const s=m.slots[slot];if(!s)return;
    if(double&&m.cursor&&!s.get()&&canPickAll(s)){m.collect(slot);this.lastTapTime=-Infinity;return;}
    if(this.quickMove)m.shiftClick(slot);
    else m.click(slot,0);
  }

  /** Touch drag-and-drop: moves the start slot's stack to where the finger lifted. */
  private dropCarried(start:number,hit:SlotHit){
    const m=this.menu,from=m.slots[start];if(!from)return;
    if(hit.slot===start)return;
    if(hit.slot===null&&!hit.outside)return;
    const item=from.get();if(!item)return;
    // Pick the stack up as a click would (the creative picker hands out a full stack).
    if(from.section==='catalog')m.cursor=withCount(item,maxStack(item.id));
    else m.click(start,0);
    if(!m.cursor)return;
    if(hit.outside){m.outside(0);return;}
    m.click(hit.slot!,0);
    if(!m.cursor)return;
    // Swapped or refused: whatever is carried goes back to the start slot when it can.
    if(from.section==='catalog'){m.cursor=null;return;}
    if(!from.take&&(!from.get()||from.get()!.id===m.cursor.id))m.click(start,0);
  }
}
