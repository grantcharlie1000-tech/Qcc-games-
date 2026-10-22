// DOM-free input state shared by every device (keyboard, mouse, touch, gamepad). Each held action
// remembers which sources hold it (two keys, a key and a touch button...), so releasing one source
// never cancels another. pressed() edges follow the single-consumer rule: true once per press, each read consuming one.
// Presses are counted like vanilla KeyMapping.clickCount, so two presses between two frames (a fast double tap
// when frames are slow) still read as two; up to MAX_PENDING_PRESSES unread presses are kept, and a consumer that
// discards presses (interaction while an item is in use) reads until pressed() is false.
import {KEY_ACTIONS,SCREEN_ACTIONS} from './controls-bindings';
import type {InputAction} from '../engine/contracts';

/** What the game is doing, as far as input is concerned. */
export type InputPhase='playing'|'screen'|'other';
export interface KeyInput{code:string;ctrlKey?:boolean;metaKey?:boolean;altKey?:boolean;repeat?:boolean}
export interface KeyOutcome{
  /** The event belongs to the game (the DOM layer calls preventDefault). */
  handled:boolean;
  /** Hotbar slot 0..8 to select (digit keys). */
  hotbar?:number;
  /** Root dataset flag to toggle (F1 hides the HUD and hand, F3 shows the debug overlay). */
  flag?:'hudHidden'|'debug';
}
/** Second forward press within this many milliseconds starts sprinting (vanilla: 7 ticks). */
export const DOUBLE_TAP_MS=350;
/** The touch stick sprints when pushed this far (Bedrock: fully pushed). */
export const STICK_SPRINT=.95;
const WHEEL_STEP_PX=50,WHEEL_IDLE_MS=250;
const NOT_HANDLED:KeyOutcome=Object.freeze({handled:false}),HANDLED:KeyOutcome=Object.freeze({handled:true});
/** Unread presses kept per action: enough for a double tap (creative flight) within one frame, while a backlog of
 *  key repeats (holding Q) cannot build up behind a consumer that reads once per tick. */
export const MAX_PENDING_PRESSES=2;
const FLAGS:Readonly<Record<string,'hudHidden'|'debug'>>={F1:'hudHidden',F3:'debug'};

export class ControlState{
  private readonly sources=new Map<InputAction,Set<string>>();
  /** Unread presses per action (1..MAX_PENDING_PRESSES; absent = none). */
  private readonly edges=new Map<InputAction,number>();
  private lastForward=-Infinity;
  private stickX=0;private stickY=0;private padX=0;private padY=0;
  private wheelAcc=0;private wheelAt=-Infinity;
  private readonly moveOut={forward:0,strafe:0};

  /** Held by any source. */
  down(action:InputAction):boolean{const s=this.sources.get(action);return!!s&&s.size>0;}
  /** One edge per press; reading consumes one. */
  pressed(action:InputAction):boolean{
    const n=this.edges.get(action);if(!n)return false;
    if(n>1)this.edges.set(action,n-1);else this.edges.delete(action);
    return true;
  }
  private edge(action:InputAction){this.edges.set(action,Math.min(MAX_PENDING_PRESSES,(this.edges.get(action)??0)+1));}
  /** Hold an action from a source; the first source to hold it creates the edge. */
  press(action:InputAction,source:string,edge=true){
    let s=this.sources.get(action);if(!s){s=new Set();this.sources.set(action,s);}
    if(s.size===0&&edge)this.edge(action);
    s.add(source);
  }
  release(action:InputAction,source:string){this.sources.get(action)?.delete(source);}
  /** Is this source holding the action? */
  holds(action:InputAction,source:string):boolean{return!!this.sources.get(action)?.has(source);}
  /** Releases everything held by sources starting with `prefix` (e.g. 'pad:' when the gamepad disconnects). */
  releaseAll(prefix:string){for(const s of this.sources.values())for(const id of s)if(id.startsWith(prefix))s.delete(id);}
  /** An edge without holding (taps). */
  tap(action:InputAction){this.edge(action);}

  keyDown(e:KeyInput,phase:InputPhase,now:number):KeyOutcome{
    if(phase==='other'||e.metaKey||e.altKey)return NOT_HANDLED;
    const code=e.code,flag=FLAGS[code];
    if(flag)return e.repeat?HANDLED:{handled:true,flag};
    if(phase==='playing'&&/^Digit[1-9]$/.test(code)){
      if(e.ctrlKey)return NOT_HANDLED;// Ctrl+digit switches browser tabs
      return{handled:true,hotbar:Number(code.slice(5))-1};
    }
    let action=KEY_ACTIONS[code];if(!action)return NOT_HANDLED;
    if(action==='drop'&&e.ctrlKey)action='dropStack';
    if(phase==='screen'&&!SCREEN_ACTIONS.includes(action))return NOT_HANDLED;
    const source='key:'+code;
    if(e.repeat){
      // Auto-repeat restores a hold lost to clear() (a screen closed while the key stayed down) without an edge, except
      // for dropping: vanilla clicks the drop key on every repeat, so holding Q throws items one after another.
      if(!this.sources.get(action)?.has(source))this.press(action,source,false);
      if(phase==='playing'&&(action==='drop'||action==='dropStack'))this.tap(action);
      return HANDLED;
    }
    if(action==='forward'&&!this.down('forward')){
      if(now-this.lastForward<DOUBLE_TAP_MS)this.press('sprint','tap:forward');
      this.lastForward=now;
    }
    this.press(action,source);
    return HANDLED;
  }
  /** Returns true when the key was bound (the DOM layer may preventDefault). */
  keyUp(code:string):boolean{
    const action=KEY_ACTIONS[code];if(!action)return false;
    const source='key:'+code;
    this.release(action,source);
    if(action==='drop')this.release('dropStack',source);
    if(action==='forward'&&!this.down('forward'))this.release('sprint','tap:forward');
    return true;
  }
  /** Touch stick, x right and y forward, each -1..1 (length ≤ 1). Fully pushed holds sprint. */
  setStick(x:number,y:number){
    this.stickX=x;this.stickY=y;
    if(Math.hypot(x,y)>=STICK_SPRINT)this.press('sprint','stick',false);else this.release('sprint','stick');
  }
  /** Gamepad left stick, x right and y forward. */
  setPadMove(x:number,y:number){this.padX=x;this.padY=y;}
  /** Movement axes -1..1 from keys, the touch stick and the gamepad. The returned object is reused. */
  move():{forward:number;strafe:number}{
    const f=(+this.down('forward'))-(+this.down('back'))+this.stickY+this.padY,s=(+this.down('right'))-(+this.down('left'))+this.stickX+this.padX;
    this.moveOut.forward=Math.max(-1,Math.min(1,f))+0;this.moveOut.strafe=Math.max(-1,Math.min(1,s))+0;
    return this.moveOut;
  }
  /** Hotbar steps (-1, 0 or 1) for a wheel event: one slot per notch, small trackpad deltas accumulate. */
  wheel(deltaY:number,deltaMode:number,now:number):number{
    if(!deltaY)return 0;
    if(deltaMode!==0){this.wheelAcc=0;return Math.sign(deltaY);}
    if(now-this.wheelAt>WHEEL_IDLE_MS||Math.sign(deltaY)!==Math.sign(this.wheelAcc))this.wheelAcc=0;
    this.wheelAt=now;this.wheelAcc+=deltaY;
    if(Math.abs(this.wheelAcc)<WHEEL_STEP_PX)return 0;
    const step=Math.sign(this.wheelAcc);this.wheelAcc=0;return step;
  }
  /** Drops every held action, edge, stick and wheel state (pause, blur, screen changes). */
  clear(){
    for(const s of this.sources.values())s.clear();
    this.edges.clear();this.stickX=this.stickY=this.padX=this.padY=0;this.wheelAcc=0;this.lastForward=-Infinity;
  }
}
