// One pointer on the canvas without pointer lock (touch, or a mouse when pointer lock is unavailable):
// a quick tap acts once, a drag looks around, a still hold turns into a held action (mining) and keeps
// looking while the finger moves. DOM-free: callers pass coordinates and timestamps.
import type {InputAction} from '../engine/contracts';
import {MOUSE_ACTIONS} from './controls-bindings';

export type PointerKind='touch'|'mouse';
/** Milliseconds a still pointer must stay down before it becomes a hold (Bedrock-like for touch). */
export const HOLD_MS:Readonly<Record<PointerKind,number>>={touch:300,mouse:200};
/** Pixels a pointer may wander before a press counts as a drag instead of a tap or hold. */
export const SLOP_PX:Readonly<Record<PointerKind,number>>={touch:10,mouse:5};

type Mode='idle'|'pending'|'look'|'hold';
export class LookGesture{
  private mode:Mode='idle';
  private id=-1;private kind:PointerKind='touch';private button=0;
  private x=0;private y=0;private sx=0;private sy=0;private start=0;
  private holding:InputAction|null=null;
  private readonly delta={dx:0,dy:0};

  get active(){return this.mode!=='idle';}
  get pointerId(){return this.id;}
  /** 'hold' while the hold action is held, 'pending' before it is decided. */
  get state():Mode{return this.mode;}
  get position(){return{x:this.x,y:this.y};}
  begin(id:number,x:number,y:number,now:number,kind:PointerKind,button:number){
    this.mode='pending';this.id=id;this.kind=kind;this.button=button;this.x=this.sx=x;this.y=this.sy=y;this.start=now;this.holding=null;
  }
  /** Pixel deltas to turn the view by, or null for another pointer. The returned object is reused. */
  move(id:number,x:number,y:number):{dx:number;dy:number}|null{
    if(this.mode==='idle'||id!==this.id)return null;
    this.delta.dx=x-this.x;this.delta.dy=y-this.y;this.x=x;this.y=y;
    if(this.mode==='pending'&&Math.hypot(x-this.sx,y-this.sy)>SLOP_PX[this.kind])this.mode='look';
    return this.delta;
  }
  /** Advances time: returns the action to hold when a still press becomes a hold. */
  update(now:number):InputAction|null{
    if(this.mode!=='pending'||now-this.start<HOLD_MS[this.kind])return null;
    this.mode='hold';this.holding=this.kind==='touch'?'attack':MOUSE_ACTIONS[this.button]??'attack';
    return this.holding;
  }
  /** 0..1 of the way to a hold while pending (the touch progress ring), else 0. */
  progress(now:number):number{return this.mode==='pending'?Math.min(1,Math.max(0,(now-this.start)/HOLD_MS[this.kind])):0;}
  /** Ends the gesture: `tap` is the action to fire once (touch: use; mouse: by button), `release` the hold to let go. */
  end(id:number,now:number,cancel:boolean):{tap:InputAction|null;release:InputAction|null}{
    if(this.mode==='idle'||id!==this.id)return{tap:null,release:null};
    const wasPending=this.mode==='pending',release=this.holding;
    this.mode='idle';this.id=-1;this.holding=null;
    const tap=!cancel&&wasPending&&now-this.start<HOLD_MS[this.kind]?(this.kind==='touch'?'use':MOUSE_ACTIONS[this.button]??'attack'):null;
    return{tap,release};
  }
  reset(){this.mode='idle';this.id=-1;this.holding=null;}
}
